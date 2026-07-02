import { sql } from "drizzle-orm";
import { index, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

/** Mirrors migration 0008 (teams, team_members, team_member_teams). */

export const teams = sqliteTable(
  "teams",
  {
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    // Self-reference: explicit return type is required by Drizzle.
    parentTeamId: text("parent_team_id").references(
      (): AnySQLiteColumn => teams.id
    ),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("teams_parent_idx").on(table.parentTeamId)]
);

export const teamMembers = sqliteTable(
  "team_members",
  {
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    email: text("email").notNull().default(""),
    firstName: text("first_name").notNull(),
    id: text("id").primaryKey(),
    lastName: text("last_name").notNull().default(""),
    notes: text("notes").notNull().default(""),
    phone: text("phone").notNull().default(""),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("team_members_name_idx").on(table.lastName, table.firstName),
  ]
);

export const teamMemberTeams = sqliteTable(
  "team_member_teams",
  {
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    memberId: text("member_id")
      .notNull()
      .references(() => teamMembers.id, { onDelete: "cascade" }),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.teamId, table.memberId] }),
    index("team_member_teams_member_idx").on(table.memberId),
  ]
);
