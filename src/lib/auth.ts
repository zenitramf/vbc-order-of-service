import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins/admin";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { drizzle } from "drizzle-orm/d1";
import type { DrizzleD1Database } from "drizzle-orm/d1";

import { account, session, user, verification } from "../db/schema/auth";

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

interface AuthSettings {
  baseURL?: string;
  database: DrizzleD1Database;
  secret?: string;
}

const authSchema = { account, session, user, verification };

const createAuthWithDatabase = ({ baseURL, database, secret }: AuthSettings) =>
  betterAuth({
    baseURL,
    database: drizzleAdapter(database, {
      provider: "sqlite",
      schema: authSchema,
    }),
    emailAndPassword: { enabled: true },
    plugins: [admin(), tanstackStartCookies()],
    secret,
  });

export const createAuth = (env: AuthEnv) =>
  createAuthWithDatabase({
    baseURL: env.BETTER_AUTH_URL,
    database: drizzle(env.DB),
    secret: env.BETTER_AUTH_SECRET,
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
