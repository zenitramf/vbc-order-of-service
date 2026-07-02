import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit is used only to AUTHOR migration SQL (`drizzle-kit generate`) and
 * to validate the schema (`drizzle-kit check`). Wrangler remains the single
 * migration executor for D1 — see README "Database & migrations".
 *
 * `dbCredentials` are only consulted by network commands (`pull`, `studio`).
 * `generate`/`check` work offline from `schema` + the snapshot in `out`.
 */
export default defineConfig({
  dbCredentials: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? "",
    databaseId: process.env.CLOUDFLARE_DATABASE_ID ?? "",
    token: process.env.CLOUDFLARE_D1_TOKEN ?? "",
  },
  dialect: "sqlite",
  driver: "d1-http",
  out: "./drizzle",
  schema: "./src/db/schema/index.ts",
});
