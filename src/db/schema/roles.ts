import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Application roles managed by the User Admin page. Better Auth stores the
 * assigned role name on `user.role` (see ./auth.ts); this table is the source
 * of truth for which roles exist, their human description, and the permissions
 * granted to each. The built-in `admin` and `user` roles are seeded by
 * migration 0011 with `is_system = 1` and cannot be edited or removed.
 *
 * `permissions` is a JSON object of `{ [resource]: string[] }` (see
 * ~/lib/admin-permissions). The `admin` role uses the wildcard `{ "*": ["*"] }`.
 */
export const roles = sqliteTable("roles", {
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  description: text("description").notNull().default(""),
  id: text("id").primaryKey(),
  isSystem: integer("is_system", { mode: "boolean" }).notNull().default(false),
  name: text("name").notNull(),
  permissions: text("permissions").notNull().default("{}"),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
