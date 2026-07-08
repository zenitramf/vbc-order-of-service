import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Better Auth schema (v1.6.x): email/password + admin plugin, no OAuth, no
 * secondary storage. Field/property names match Better Auth's default model
 * field names exactly — the Drizzle adapter resolves columns by the JS property
 * key, so these MUST stay in sync with Better Auth. Dates are stored as SQLite
 * integer timestamps and booleans as integers, per the Drizzle sqlite provider.
 *
 * Regenerate/reconcile whenever auth plugins change:
 *   pnpm dlx auth@latest generate --config auth.ts --yes
 * See migrations 0009_add_auth_tables.sql and 0010_add_admin_auth_fields.sql.
 */

export const user = sqliteTable("user", {
  banExpires: integer("ban_expires", { mode: "timestamp" }),
  banReason: text("ban_reason"),
  banned: integer("banned", { mode: "boolean" }).default(false),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .notNull()
    .default(false),
  firstName: text("first_name").notNull().default(""),
  id: text("id").primaryKey(),
  image: text("image"),
  lastName: text("last_name").notNull().default(""),
  name: text("name").notNull(),
  role: text("role"),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const session = sqliteTable(
  "session",
  {
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    id: text("id").primaryKey(),
    impersonatedBy: text("impersonated_by"),
    ipAddress: text("ip_address"),
    token: text("token").notNull().unique(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_user_id_idx").on(table.userId)]
);

export const account = sqliteTable(
  "account",
  {
    accessToken: text("access_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", {
      mode: "timestamp",
    }),
    accountId: text("account_id").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    id: text("id").primaryKey(),
    idToken: text("id_token"),
    password: text("password"),
    providerId: text("provider_id").notNull(),
    refreshToken: text("refresh_token"),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", {
      mode: "timestamp",
    }),
    scope: text("scope"),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("account_user_id_idx").on(table.userId)]
);

export const verification = sqliteTable(
  "verification",
  {
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
    value: text("value").notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)]
);

export const passkey = sqliteTable("passkey", {
  aaguid: text("aaguid"),
  backedUp: integer("backedUp", { mode: "boolean" }).notNull(),
  counter: integer("counter").notNull(),
  createdAt: text("createdAt"),
  credentialID: text("credentialID").notNull(),
  deviceType: text("deviceType").notNull(),
  id: text("id").primaryKey(),
  name: text("name"),
  publicKey: text("publicKey").notNull(),
  transports: text("transports"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});
