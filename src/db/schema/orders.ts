import { sql } from "drizzle-orm";
import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { hymns } from "./hymns";
import { serviceStatuses, serviceTypes } from "./reference";

/**
 * Mirrors migrations 0001 (templates, orders, hymn_plays), 0003 (unique
 * service_date), 0004 (pdf_object_key) and 0006 (order_email_deliveries).
 *
 * `templateJson` / `orderJson` stay physical TEXT — the app parses/normalizes
 * them with helpers in order-service-data.ts, so there is no data-move.
 */

export const orderServiceTemplates = sqliteTable(
  "order_service_templates",
  {
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    serviceTypeId: text("service_type_id")
      .notNull()
      .references(() => serviceTypes.id),
    templateJson: text("template_json").notNull(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("order_service_templates_service_type_idx").on(table.serviceTypeId),
  ]
);

export const ordersOfService = sqliteTable(
  "orders_of_service",
  {
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    id: text("id").primaryKey(),
    orderJson: text("order_json").notNull(),
    pdfObjectKey: text("pdf_object_key"),
    publishedAt: text("published_at"),
    serviceDate: text("service_date").notNull(),
    serviceTypeId: text("service_type_id")
      .notNull()
      .references(() => serviceTypes.id),
    status: text("status")
      .notNull()
      .default("Planning")
      .references(() => serviceStatuses.id),
    templateId: text("template_id").references(() => orderServiceTemplates.id),
    title: text("title").notNull(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("orders_of_service_date_idx").on(table.serviceDate),
    uniqueIndex("orders_of_service_service_date_unique_idx").on(
      table.serviceDate
    ),
    index("orders_of_service_status_idx").on(table.status),
  ]
);

export const hymnPlays = sqliteTable(
  "hymn_plays",
  {
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    hymnId: text("hymn_id")
      .notNull()
      .references(() => hymns.id),
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => ordersOfService.id),
    playedOn: text("played_on").notNull(),
  },
  (table) => [
    index("hymn_plays_hymn_date_idx").on(table.hymnId, table.playedOn),
  ]
);

export const orderEmailDeliveries = sqliteTable(
  "order_email_deliveries",
  {
    errorMessage: text("error_message"),
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .unique()
      .references(() => ordersOfService.id),
    queuedAt: text("queued_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    sentAt: text("sent_at"),
    status: text("status").notNull().default("Queued"),
    subject: text("subject").notNull(),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("order_email_deliveries_order_idx").on(table.orderId)]
);
