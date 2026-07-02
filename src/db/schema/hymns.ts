import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { hymnSources } from "./reference";

/** Mirrors migrations 0001 (hymns) and 0007 (hymn_files). */

export const hymns = sqliteTable(
  "hymns",
  {
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    hymnNumber: text("hymn_number").notNull().default(""),
    id: text("id").primaryKey(),
    lastPlayed: text("last_played").notNull().default(""),
    lyricsMarkdown: text("lyrics_markdown").notNull().default(""),
    musicKey: text("music_key").notNull().default(""),
    name: text("name").notNull(),
    sourceId: text("source_id")
      .notNull()
      .references(() => hymnSources.id),
    timesPlayedLast6Months: integer("times_played_last_6_months")
      .notNull()
      .default(0),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("hymns_name_idx").on(table.name),
    index("hymns_number_idx").on(table.hymnNumber),
  ]
);

export const hymnFiles = sqliteTable(
  "hymn_files",
  {
    contentType: text("content_type").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    filename: text("filename").notNull(),
    hymnId: text("hymn_id")
      .notNull()
      .references(() => hymns.id, { onDelete: "cascade" }),
    id: text("id").primaryKey(),
    objectKey: text("object_key").notNull().unique(),
    sizeBytes: integer("size_bytes").notNull(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("hymn_files_hymn_idx").on(table.hymnId)]
);
