import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";

/**
 * Env-scoped Drizzle client factory. Prefer this over a global singleton so the
 * same code works for TanStack Start server functions (global `env`), Durable
 * Objects (`this.env.DB`) and tests (any D1 binding).
 *
 * We use the core query builder with explicitly-passed tables (from
 * `~/db/schema`) plus typed `sql` fragments for aggregate/date queries, so the
 * drizzle-orm v1 relational (`db.query`) API and its `relations` config are not
 * needed here.
 */
export const createDb = (binding: D1Database) => drizzle(binding);

export type AppDatabase = ReturnType<typeof createDb>;

/** Drizzle client bound to the Worker's global D1 binding. */
export const getAppDb = (): AppDatabase => {
  if (!env.DB) {
    throw new Error("Cloudflare D1 binding DB is not configured.");
  }

  return createDb(env.DB);
};
