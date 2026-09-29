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
  secret?: string;
  sendResetPassword?: (params: ResetPasswordEmailParams) => Promise<void>;
}

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
  secret,
  sendResetPassword,
}: AuthSettings) =>
  betterAuth({
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
    plugins: [admin(), passkey(), tanstackStartCookies()],
    rateLimit: {
      customRules: {
        // Admins onboarding a batch of users would otherwise hit the default
        // 3-per-minute limit on password emails; 10 keeps reset spam bounded.
        "/request-password-reset": { max: 10, window: 60 },
      },
    },
    secret,
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
