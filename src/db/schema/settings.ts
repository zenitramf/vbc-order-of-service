import { sql } from "drizzle-orm";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Mirrors migration 0005 (app_settings, email_recipients). */

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  value: text("value").notNull(),
});

export const emailRecipients = sqliteTable("email_recipients", {
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  email: text("email").notNull().unique(),
  id: text("id").primaryKey(),
});
