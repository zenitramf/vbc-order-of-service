import { sql } from "drizzle-orm";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Reference/lookup tables. These mirror migrations 0001; they are seeded by the
 * migrations (INSERT OR IGNORE), not by runtime bootstrap.
 */

export const serviceTypes = sqliteTable("service_types", {
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  description: text("description").notNull().default(""),
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const serviceStatuses = sqliteTable("service_statuses", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
});

export const activityTypes = sqliteTable("activity_types", {
  description: text("description").notNull().default(""),
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
});

export const hymnSources = sqliteTable("hymn_sources", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
});
