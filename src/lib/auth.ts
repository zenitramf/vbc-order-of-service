import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins/admin";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { drizzle } from "drizzle-orm/d1";
import type { DrizzleD1Database } from "drizzle-orm/d1";

import {
  account,
  passkey as passkeyTable,
  session,
  user,
  verification,
} from "../db/schema/auth";
import type { ExchangeOAuthCredentials } from "./exchange-oauth";
import { isValidEmail } from "./teams-logic";
import { buildPasswordResetEmail } from "./user-onboarding";

/**
 * Better Auth on Drizzle + Cloudflare D1.
 *
 * Runtime auth is request/env-scoped because D1 is only reachable through a
 * Worker binding. The Better Auth CLI, however, needs an exported singleton
 * named `auth`, so this file also exports a CLI-only instance backed by a D1
 * stub. Keep all shared Better Auth options in `createAuthWithDatabase` so the
 * runtime and CLI schemas cannot drift.
 *
 * Secrets (set with `wrangler secret put`):
 *   - BETTER_AUTH_SECRET  (>= 32 chars; `openssl rand -base64 32`)
 *   - BETTER_AUTH_URL     (deployment base URL, e.g. https://…)
 *
 * Re-run the Better Auth CLI generate and add a migration whenever plugins
 * change — see src/db/schema/auth.ts.
 */
type AuthEnv = Env & {
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
};

interface ResetPasswordEmailParams {
  url: string;
  user: {
    email: string;
    firstName?: string;
    name: string;
  };
}

interface AuthSettings {
  baseURL?: string;
  database: DrizzleD1Database;
  getMicrosoftCredentials?: () => Promise<ExchangeOAuthCredentials | null>;
  secret?: string;
  sendResetPassword?: (params: ResetPasswordEmailParams) => Promise<void>;
}

export interface MicrosoftProfileInput {
  email?: string;
  email_verified?: boolean;
  family_name?: string;
  given_name?: string;
  name?: string;
  picture?: string;
  preferred_username?: string;
  upn?: string;
  verified_primary_email?: string[];
  verified_secondary_email?: string[];
}

export interface MappedMicrosoftUser {
  email?: string;
  emailVerified: boolean;
  firstName: string;
  image: undefined;
  lastName: string;
  name: string;
}

const resolveMicrosoftEmail = (
  profile: MicrosoftProfileInput
): string | undefined => {
  const candidates = [profile.email, profile.preferred_username, profile.upn];

  for (const candidate of candidates) {
    const trimmed = typeof candidate === "string" ? candidate.trim() : "";

    if (trimmed && isValidEmail(trimmed)) {
      return trimmed.toLowerCase();
    }
  }

  return undefined;
};

const resolveMicrosoftNames = (
  profile: MicrosoftProfileInput,
  email: string | undefined
): { firstName: string; lastName: string; name: string } => {
  const givenName =
    typeof profile.given_name === "string" ? profile.given_name.trim() : "";
  const familyName =
    typeof profile.family_name === "string" ? profile.family_name.trim() : "";
  const displayName =
    typeof profile.name === "string" ? profile.name.trim() : "";

  if (givenName || familyName) {
    const firstName = givenName || familyName;
    const lastName = givenName ? familyName : "";
    const name = `${firstName} ${lastName}`.trim() || displayName || firstName;

    return { firstName, lastName, name };
  }

  if (displayName) {
    const [firstPart = "", ...restParts] = displayName.split(/\s+/u);
    const firstName = firstPart || "User";
    const lastName = restParts.join(" ");

    return { firstName, lastName, name: displayName };
  }

  const emailLocalPart = email?.split("@")[0]?.trim() || "User";

  return {
    firstName: emailLocalPart,
    lastName: "",
    name: emailLocalPart,
  };
};

/**
 * Map a Microsoft Entra ID token profile onto Better Auth's user fields.
 *
 * - Populates required `firstName` / `lastName` additional fields so tenant
 *   auto sign-up succeeds even when Entra omits `given_name` / `family_name`.
 * - Falls back to `preferred_username` / `upn` when Entra does not emit the
 *   optional `email` claim for managed accounts.
 * - Drops `image` because Microsoft returns base64-encoded profile photos that
 *   can exceed HTTP header / cookie size limits.
 */
export const mapMicrosoftProfileToUser = (
  profile: MicrosoftProfileInput
): MappedMicrosoftUser => {
  const email = resolveMicrosoftEmail(profile);
  const { firstName, lastName, name } = resolveMicrosoftNames(profile, email);

  return {
    ...(email ? { email } : {}),
    emailVerified: Boolean(email),
    firstName,
    image: undefined,
    lastName,
    name,
  };
};

export const buildMicrosoftSocialProviderConfig = (
  credentials: ExchangeOAuthCredentials | null
) => {
  if (!credentials) {
    return {
      clientId: "",
      enabled: false as const,
    };
  }

  return {
    authority: "https://login.microsoftonline.com",
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
    disableProfilePhoto: true,
    enabled: true as const,
    mapProfileToUser: mapMicrosoftProfileToUser,
    prompt: "select_account" as const,
    tenantId: credentials.tenantId,
  };
};

const authSchema = {
  account,
  passkey: passkeyTable,
  session,
  user,
  verification,
};

const createAuthWithDatabase = ({
  baseURL,
  database,
  getMicrosoftCredentials,
  secret,
  sendResetPassword,
}: AuthSettings) =>
  betterAuth({
    account: {
      accountLinking: {
        enabled: true,
        requireLocalEmailVerified: false,
        trustedProviders: ["microsoft"],
      },
    },
    baseURL,
    database: drizzleAdapter(database, {
      provider: "sqlite",
      schema: authSchema,
    }),
    emailAndPassword: {
      enabled: true,
      sendResetPassword: sendResetPassword
        ? async ({ user: resetUser, url }) => {
            await sendResetPassword({ url, user: resetUser });
          }
        : undefined,
    },
    onAPIError: {
      errorURL: "/login",
    },
    plugins: [admin(), passkey(), tanstackStartCookies()],
    rateLimit: {
      customRules: {
        // Admins onboarding a batch of users would otherwise hit the default
        // 3-per-minute limit on password emails; 10 keeps reset spam bounded.
        "/request-password-reset": { max: 10, window: 60 },
      },
    },
    secret,
    socialProviders: {
      microsoft: async () => {
        const credentials = await getMicrosoftCredentials?.();

        return buildMicrosoftSocialProviderConfig(credentials ?? null);
      },
    },
    user: {
      additionalFields: {
        firstName: {
          required: true,
          type: "string",
        },
        lastName: {
          required: true,
          type: "string",
        },
      },
    },
  });

export const createAuth = (env: AuthEnv) =>
  createAuthWithDatabase({
    baseURL: env.BETTER_AUTH_URL,
    database: drizzle(env.DB),
    getMicrosoftCredentials: async () => {
      try {
        const { getMicrosoftGraphCredentials } = await import("./email-sender");
        return await getMicrosoftGraphCredentials(env);
      } catch {
        return null;
      }
    },
    secret: env.BETTER_AUTH_SECRET,
    sendResetPassword: async ({ user: resetUser, url }) => {
      const queue = env.OOS_EMAIL_SENDER;

      if (!queue) {
        throw new Error("The email queue is not configured.");
      }

      const email = buildPasswordResetEmail(resetUser, url);

      await queue.send({ ...email, to: [resetUser.email], type: "plain" });
    },
  });

const noopD1 = {
  batch() {
    throw new Error("CLI schema generation should not batch database queries.");
  },
  dump() {
    throw new Error("CLI schema generation should not dump the database.");
  },
  exec() {
    throw new Error("CLI schema generation should not execute SQL.");
  },
  prepare() {
    throw new Error(
      "CLI schema generation should not execute database queries."
    );
  },
} as unknown as D1Database;

const getProcessEnv = (key: string): string | undefined => {
  if (typeof process === "undefined") {
    return;
  }

  return process.env[key];
};

export const auth = createAuthWithDatabase({
  baseURL: getProcessEnv("BETTER_AUTH_URL") ?? "http://localhost:3000",
  database: drizzle(noopD1),
  secret:
    getProcessEnv("BETTER_AUTH_SECRET") ?? "0123456789abcdef0123456789abcdef",
});

export default auth;

export type Auth = ReturnType<typeof createAuth>;
