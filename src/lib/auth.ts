import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { createDb } from "~/db/client";
import { account, session, user, verification } from "~/db/schema/auth";

/**
 * Better Auth on Drizzle + Cloudflare D1.
 *
 * This replaces the previous `better-sqlite3` (in-memory) stub. The instance is
 * request/env-scoped because D1 is only reachable through a Worker binding.
 *
 * Secrets (set with `wrangler secret put`):
 *   - BETTER_AUTH_SECRET  (>= 32 chars; `openssl rand -base64 32`)
 *   - BETTER_AUTH_URL     (deployment base URL, e.g. https://…)
 *
 * Scope: email/password, no OAuth, no plugins, no sign-in UI (mounted at
 * `/api/auth/*` in src/worker.ts). Re-run the Better Auth CLI generate and add
 * a migration whenever plugins change — see src/db/schema/auth.ts.
 */
type AuthEnv = Env & {
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
};

export const createAuth = (env: AuthEnv) =>
  betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    database: drizzleAdapter(createDb(env.DB), {
      provider: "sqlite",
      schema: { account, session, user, verification },
    }),
    emailAndPassword: { enabled: true },
    plugins: [],
    secret: env.BETTER_AUTH_SECRET,
  });

export type Auth = ReturnType<typeof createAuth>;
