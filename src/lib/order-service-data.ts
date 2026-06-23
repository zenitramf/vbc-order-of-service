import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { Buffer } from "node:buffer";
import { v4 as uuidv4 } from "uuid";

import type {
  CraftMyPdfOrderPayload,
  CraftMyPdfOrderPayloadActivity,
  CreateOrderInput,
  DashboardData,
  EmailSettingsRecord,
  HymnOption,
  HymnRecord,
  OrderEmailDeliveryRecord,
  OrderEmailQueueMessage,
  OrderEmailStatus,
  OrderRecord,
  OrderServiceTemplateJson,
  OrderSummary,
  ReferenceData,
  ReferenceOption,
  SaveEmailSettingsInput,
  SaveHymnInput,
  SaveOrderInput,
  SaveTemplateInput,
  SendOrderToCraftMyPdfInput,
  ServiceStatus,
  TemplateRecord,
  TemplateSummary,
} from "~/lib/order-service-types";

const DEFAULT_TEMPLATE: OrderServiceTemplateJson = {
  name: "Sunday Service",
  service_type: [
    {
      activities: [
        {
          activityName: "Sunday School Hymn",
          activityType: "hymn",
          id: "sunday-school-hymn",
        },
        {
          activityName: "Bible Study",
          activityType: "bible_preaching",
          id: "bible-study",
        },
      ],
      id: "sunday-school",
      typeName: "Sunday School",
    },
    {
      activities: [
        { activityName: "Opening Hymn", activityType: "hymn", id: "opening-hymn" },
        { activityName: "Prayer", activityType: "prayer", id: "prayer" },
        {
          activityName: "Scripture Reading",
          activityType: "scripture_reading",
          id: "scripture-reading",
        },
        { activityName: "Offertory", activityType: "offertory", id: "offertory" },
        { activityName: "Preaching", activityType: "preaching", id: "preaching" },
        { activityName: "Invitation", activityType: "invitation", id: "invitation" },
      ],
      id: "sunday-main-service",
      typeName: "Sunday Main Service",
    },
    {
      activities: [
        { activityName: "Congregational Hymn", activityType: "hymn", id: "evening-hymn" },
        { activityName: "Special Music", activityType: "special_music", id: "special-music" },
        { activityName: "Preaching", activityType: "preaching", id: "evening-preaching" },
      ],
      id: "sunday-evening-service",
      typeName: "Sunday Evening Service",
    },
  ],
};

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS service_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS service_statuses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS activity_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS hymn_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS hymns (
  id TEXT PRIMARY KEY,
  hymn_number TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  lyrics_markdown TEXT NOT NULL DEFAULT '',
  music_key TEXT NOT NULL DEFAULT '',
  last_played TEXT NOT NULL DEFAULT '',
  times_played_last_6_months INTEGER NOT NULL DEFAULT 0,
  source_id TEXT NOT NULL REFERENCES hymn_sources(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS hymns_name_idx ON hymns(name);
CREATE INDEX IF NOT EXISTS hymns_number_idx ON hymns(hymn_number);

CREATE TABLE IF NOT EXISTS order_service_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  service_type_id TEXT NOT NULL REFERENCES service_types(id),
  template_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS order_service_templates_service_type_idx
  ON order_service_templates(service_type_id);

CREATE TABLE IF NOT EXISTS orders_of_service (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  service_type_id TEXT NOT NULL REFERENCES service_types(id),
  service_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Planning' REFERENCES service_statuses(id),
  template_id TEXT REFERENCES order_service_templates(id),
  order_json TEXT NOT NULL,
  published_at TEXT,
  pdf_object_key TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS orders_of_service_date_idx ON orders_of_service(service_date);
CREATE UNIQUE INDEX IF NOT EXISTS orders_of_service_service_date_unique_idx
  ON orders_of_service(service_date);
CREATE INDEX IF NOT EXISTS orders_of_service_status_idx ON orders_of_service(status);

ALTER TABLE orders_of_service ADD COLUMN pdf_object_key TEXT;

CREATE TABLE IF NOT EXISTS hymn_plays (
  id TEXT PRIMARY KEY,
  hymn_id TEXT NOT NULL REFERENCES hymns(id),
  order_id TEXT NOT NULL REFERENCES orders_of_service(id),
  played_on TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS hymn_plays_hymn_date_idx ON hymn_plays(hymn_id, played_on);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS email_recipients (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_email_deliveries (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE REFERENCES orders_of_service(id),
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Queued',
  queued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT,
  error_message TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS order_email_deliveries_order_idx
  ON order_email_deliveries(order_id);
`;

let databaseInitialized = false;

const getDatabase = (): D1Database => {
  if (!env.DB) {
    throw new Error("Cloudflare D1 binding DB is not configured.");
  }

  return env.DB;
};

const getPdfBucket = (): R2Bucket => {
  if (!env.SERVICE_PDFS) {
    throw new Error("Cloudflare R2 binding SERVICE_PDFS is not configured.");
  }

  return env.SERVICE_PDFS;
};

const getEmailQueue = (): Queue<OrderEmailQueueMessage> => {
  const queue = (env as unknown as { OOS_EMAIL_SENDER?: Queue<OrderEmailQueueMessage> }).OOS_EMAIL_SENDER;

  if (!queue) {
    throw new Error("Cloudflare Queue binding OOS_EMAIL_SENDER is not configured.");
  }

  return queue;
};

const nowIso = () => new Date().toISOString();

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-+|-+$/gu, "") || uuidv4();

const normalizeTemplate = (
  template: OrderServiceTemplateJson,
  fallbackName: string
): OrderServiceTemplateJson => ({
  name: template.name?.trim() || fallbackName,
  service_type: (template.service_type ?? []).map((segment) => ({
    activities: (segment.activities ?? []).map((activity) => ({
      activityName: activity.activityName?.trim() || "Activity",
      activityType: activity.activityType?.trim() || "custom",
      id: activity.id || uuidv4(),
      ...(activity.hymnId ? { hymnId: activity.hymnId } : {}),
      ...(activity.notes ? { notes: activity.notes } : {}),
    })),
    id: segment.id || uuidv4(),
    typeName: segment.typeName?.trim() || "Service Segment",
  })),
});

const countActivities = (template: OrderServiceTemplateJson) =>
  template.service_type.reduce(
    (total, segment) => total + segment.activities.length,
    0
  );

const parseTemplateJson = (value: string, fallbackName: string) =>
  normalizeTemplate(JSON.parse(value) as OrderServiceTemplateJson, fallbackName);

const asString = (value: unknown) => (typeof value === "string" ? value : "");

const asNumber = (value: unknown) =>
  typeof value === "number" ? value : Number.parseInt(String(value ?? "0"), 10) || 0;

const getErrorMessage = (error: unknown, fallbackMessage: string) =>
  error instanceof Error && error.message ? error.message : fallbackMessage;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const EMAIL_SETTINGS_KEY = "email.smtp";
const SERVICE_PDFS_BUCKET_NAME = "vbc-order-of-service-pdfs";

const getRequiredSecret = (key: string) => {
  const value = (env as unknown as Record<string, string | undefined>)[key]?.trim();

  if (!value) {
    throw new Error(`${key} is not configured. Add it as a Cloudflare Worker secret before saving email settings.`);
  }

  return value;
};

const getEmailEncryptionKey = async () => {
  const secret = getRequiredSecret("EMAIL_SETTINGS_ENCRYPTION_KEY");
  const secretBytes = new TextEncoder().encode(secret);
  const hash = await crypto.subtle.digest("SHA-256", secretBytes);

  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
};

const encryptSetting = async (value: string) => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encodedValue = new TextEncoder().encode(value);
  const encrypted = await crypto.subtle.encrypt({ iv, name: "AES-GCM" }, await getEmailEncryptionKey(), encodedValue);

  return `${Buffer.from(iv).toString("base64")}.${Buffer.from(encrypted).toString("base64")}`;
};

const isValidEmail = (email: string) => EMAIL_REGEX.test(email.trim());

const assertValidEmail = (email: string, fieldName: string) => {
  if (!isValidEmail(email)) {
    throw new Error(`${fieldName} must be a valid email address.`);
  }
};

const assertValidEmailSettings = (settings: SaveEmailSettingsInput) => {
  if (!settings.smtpAddress.trim()) {
    throw new Error("SMTP address is required.");
  }

  if (!Number.isInteger(settings.smtpPort) || settings.smtpPort < 1 || settings.smtpPort > 65_535) {
    throw new Error("SMTP port must be between 1 and 65535.");
  }

  if (!settings.smtpSenderName.trim()) {
    throw new Error("Sender name is required.");
  }

  if (settings.smtpUser !== undefined && settings.smtpUser.trim().length > 0) {
    assertValidEmail(settings.smtpUser, "SMTP user");
  }

  if (settings.smtpToken !== undefined && settings.smtpToken.trim().length === 0) {
    throw new Error("SMTP token cannot be blank.");
  }

  for (const email of settings.recipients) {
    assertValidEmail(email, "Recipient");
  }
};

const ensureDatabase = async () => {
  if (databaseInitialized) {
    return;
  }

  const db = getDatabase();
  const schemaStatements = SCHEMA_SQL.split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

  for (const statement of schemaStatements) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- schema must be applied in order.
      await db.prepare(statement).run();
    } catch (error) {
      if (!String(error).includes("duplicate column name")) {
        throw error;
      }
    }
  }

  await db.batch([
    db.prepare("INSERT OR IGNORE INTO service_statuses (id, name) VALUES (?, ?)").bind("Planning", "Planning"),
    db.prepare("INSERT OR IGNORE INTO service_statuses (id, name) VALUES (?, ?)").bind("Published", "Published"),
    db.prepare("INSERT OR IGNORE INTO hymn_sources (id, name) VALUES (?, ?)").bind("living-hymns", "Living Hymns"),
    db.prepare("INSERT OR IGNORE INTO hymn_sources (id, name) VALUES (?, ?)").bind("other-hymn", "Other Hymn"),
    db.prepare("INSERT OR IGNORE INTO hymn_sources (id, name) VALUES (?, ?)").bind("song", "Song"),
    db.prepare("INSERT OR IGNORE INTO hymn_sources (id, name) VALUES (?, ?)").bind("majesty-hymns", "Majesty Hymns"),
    db.prepare("INSERT OR IGNORE INTO activity_types (id, name, description) VALUES (?, ?, ?)").bind("hymn", "Hymn", "Congregational hymn selected from the hymn library."),
    db.prepare("INSERT OR IGNORE INTO activity_types (id, name, description) VALUES (?, ?, ?)").bind("prayer", "Prayer", "Prayer led by a selected person."),
    db.prepare("INSERT OR IGNORE INTO activity_types (id, name, description) VALUES (?, ?, ?)").bind("scripture_reading", "Scripture Reading", "Bible passage read during service."),
    db.prepare("INSERT OR IGNORE INTO activity_types (id, name, description) VALUES (?, ?, ?)").bind("hand_shaking", "Hand Shaking", "Fellowship greeting time."),
    db.prepare("INSERT OR IGNORE INTO activity_types (id, name, description) VALUES (?, ?, ?)").bind("offertory", "Offertory", "Offering and offertory music."),
    db.prepare("INSERT OR IGNORE INTO activity_types (id, name, description) VALUES (?, ?, ?)").bind("preaching", "Preaching", "Main preaching time."),
    db.prepare("INSERT OR IGNORE INTO activity_types (id, name, description) VALUES (?, ?, ?)").bind("invitation", "Invitation", "Invitation following the message."),
    db.prepare("INSERT OR IGNORE INTO activity_types (id, name, description) VALUES (?, ?, ?)").bind("special_music", "Special Music", "Special music selection."),
    db.prepare("INSERT OR IGNORE INTO activity_types (id, name, description) VALUES (?, ?, ?)").bind("bible_preaching", "Bible Preaching", "Bible study or teaching time."),
    db.prepare("INSERT OR IGNORE INTO activity_types (id, name, description) VALUES (?, ?, ?)").bind("custom", "Custom", "Custom activity."),
  ]);

  const defaultServiceTypeId = "sunday-service";
  const templateId = "default-sunday-service";
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO service_types (id, name, description) VALUES (?, ?, ?)").bind(
      defaultServiceTypeId,
      "Sunday Service",
      "Default Sunday service type."
    ),
    db.prepare(
      "INSERT OR IGNORE INTO order_service_templates (id, name, service_type_id, template_json) VALUES (?, ?, ?, ?)"
    ).bind(
      templateId,
      DEFAULT_TEMPLATE.name,
      defaultServiceTypeId,
      JSON.stringify(DEFAULT_TEMPLATE)
    ),
  ]);
  databaseInitialized = true;
};

const loadReferenceOptions = async (
  tableName: "activity_types" | "hymn_sources" | "service_types"
): Promise<ReferenceOption[]> => {
  const db = getDatabase();
  const { results } = await db
    .prepare(`SELECT id, name FROM ${tableName} ORDER BY name`)
    .all<{ id: string; name: string }>();

  return results.map((row) => ({ id: row.id, name: row.name }));
};

const mapTemplateRow = (row: Record<string, unknown>): TemplateRecord => {
  const name = asString(row.name);
  const template = parseTemplateJson(asString(row.template_json), name);

  return {
    activityCount: countActivities(template),
    id: asString(row.id),
    name,
    segmentCount: template.service_type.length,
    serviceTypeId: asString(row.service_type_id),
    serviceTypeName: asString(row.service_type_name),
    template,
    updatedAt: asString(row.updated_at),
  };
};

const mapOrderRow = (row: Record<string, unknown>): OrderRecord => {
  const title = asString(row.title);
  const order = parseTemplateJson(asString(row.order_json), title);

  return {
    activityCount: countActivities(order),
    id: asString(row.id),
    order,
    pdfObjectKey: asString(row.pdf_object_key) || undefined,
    publishedAt: asString(row.published_at) || undefined,
    segmentCount: order.service_type.length,
    serviceDate: asString(row.service_date),
    serviceTypeId: asString(row.service_type_id),
    serviceTypeName: asString(row.service_type_name),
    status: asString(row.status) as ServiceStatus,
    templateId: asString(row.template_id) || undefined,
    title,
    updatedAt: asString(row.updated_at),
  };
};

const buildServiceDateConflictMessage = (serviceDate: string) =>
  `An order of service already exists for ${serviceDate}.`;

const formatEmailServiceDate = (serviceDate: string) =>
  new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    weekday: "short",
  }).format(new Date(`${serviceDate}T00:00:00.000Z`));

const getOrderEmailSubject = (order: OrderRecord) =>
  `${order.title} - ${formatEmailServiceDate(order.serviceDate)}`;

const mapOrderEmailDeliveryRow = (
  row: Record<string, unknown>
): OrderEmailDeliveryRecord => ({
  errorMessage: asString(row.error_message) || undefined,
  id: asString(row.id),
  orderId: asString(row.order_id),
  queuedAt: asString(row.queued_at),
  sentAt: asString(row.sent_at) || undefined,
  status: asString(row.status) as OrderEmailStatus,
  subject: asString(row.subject),
});

const isServiceDateUniqueConstraintError = (error: unknown): boolean =>
  error instanceof Error &&
  error.message.includes("UNIQUE constraint failed") &&
  error.message.includes("orders_of_service.service_date");

const assertServiceDateAvailable = async ({
  db,
  excludeOrderId,
  serviceDate,
}: {
  db: D1Database;
  excludeOrderId?: string;
  serviceDate: string;
}): Promise<void> => {
  const existingOrder = excludeOrderId
    ? await db
        .prepare(
          "SELECT id FROM orders_of_service WHERE service_date = ? AND id != ? LIMIT 1"
        )
        .bind(serviceDate, excludeOrderId)
        .first<{ id: string }>()
    : await db
        .prepare("SELECT id FROM orders_of_service WHERE service_date = ? LIMIT 1")
        .bind(serviceDate)
        .first<{ id: string }>();

  if (existingOrder) {
    throw new Error(buildServiceDateConflictMessage(serviceDate));
  }
};

const mapHymnRow = (row: Record<string, unknown>): HymnRecord => ({
  hymnNumber: asString(row.hymn_number),
  id: asString(row.id),
  lastPlayed: asString(row.last_played),
  lyricsMarkdown: asString(row.lyrics_markdown),
  musicKey: asString(row.music_key),
  name: asString(row.name),
  sourceId: asString(row.source_id),
  sourceName: asString(row.source_name),
  timesPlayedLastSixMonths: asNumber(row.times_played_last_6_months),
});

const RECENT_HYMN_PLAY_COUNT_SQL = `
  COALESCE((
    SELECT COUNT(DISTINCT hymn_plays.order_id)
    FROM hymn_plays
    JOIN orders_of_service
      ON orders_of_service.id = hymn_plays.order_id
    WHERE hymn_plays.hymn_id = hymns.id
      AND orders_of_service.status = 'Published'
      AND hymn_plays.played_on >= date('now', '-6 months')
  ), 0) AS times_played_last_6_months
`;

const CRAFTMYPDF_DEFAULT_API_URL = "https://api.craftmypdf.com/v1/create";

const getPdfObjectKey = (order: Pick<OrderRecord, "serviceDate" | "title">): string => {
  const serviceName = order.title.trim().replaceAll(/[\\/:*?"<>|]+/gu, "-") || "Order of Service";

  return `${order.serviceDate} - ${serviceName}.pdf`;
};

const getCraftMyPdfFileUrl = (responseBody: string): string => {
  const parsed = JSON.parse(responseBody) as Record<string, unknown>;
  const candidates = [
    parsed.file,
    parsed.file_url,
    parsed.download_url,
    parsed.url,
    parsed.pdf,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.startsWith("http")) {
      return candidate;
    }
  }

  throw new Error("CraftMyPDF response did not include a PDF download URL.");
};

const getEnvValue = (key: string): string | undefined => {
  const value = (env as unknown as Record<string, unknown>)[key];

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();

  return trimmedValue.length > 0 ? trimmedValue : undefined;
};

const loadHymnsById = async (
  db: D1Database,
  hymnIds: string[]
): Promise<Map<string, HymnRecord>> => {
  if (hymnIds.length === 0) {
    return new Map<string, HymnRecord>();
  }

  const placeholders = hymnIds.map(() => "?").join(", ");
  const { results } = await db
    .prepare(
      `SELECT hymns.*, hymn_sources.name AS source_name, ${RECENT_HYMN_PLAY_COUNT_SQL}
      FROM hymns
      JOIN hymn_sources ON hymn_sources.id = hymns.source_id
      WHERE hymns.id IN (${placeholders})`
    )
    .bind(...hymnIds)
    .all<Record<string, unknown>>();

  return new Map(
    results.map((row) => {
      const hymn = mapHymnRow(row);

      return [hymn.id, hymn] as const;
    })
  );
};

const hasHymnActivityWithoutSelection = (order: OrderRecord): boolean =>
  order.order.service_type.some((segment) =>
    segment.activities.some(
      (activity) => activity.activityType === "hymn" && !activity.hymnId
    )
  );

const assertHymnActivitiesHaveSelections = (order: OrderRecord): void => {
  if (hasHymnActivityWithoutSelection(order)) {
    throw new Error(
      "Select a hymn for every hymn activity before publishing or sending."
    );
  }
};

const buildCraftMyPdfOrderPayload = async (
  db: D1Database,
  order: OrderRecord
): Promise<CraftMyPdfOrderPayload> => {
  const hymnIds = new Set<string>();

  for (const segment of order.order.service_type) {
    for (const activity of segment.activities) {
      if (activity.hymnId) {
        hymnIds.add(activity.hymnId);
      }
    }
  }

  const hymnsById = await loadHymnsById(db, [...hymnIds]);

  return {
    generatedAt: nowIso(),
    order: {
      name: order.order.name,
      service_type: order.order.service_type.map((segment) => ({
        activities: segment.activities.map((activity) => {
          const payloadActivity: CraftMyPdfOrderPayloadActivity = {
            ...activity,
          };
          const hymn = activity.hymnId ? hymnsById.get(activity.hymnId) : undefined;

          if (hymn) {
            payloadActivity.hymn = hymn;
          }

          return payloadActivity;
        }),
        id: segment.id,
        typeName: segment.typeName,
      })),
    },
    orderId: order.id,
    publishedAt: order.publishedAt,
    serviceDate: order.serviceDate,
    serviceTypeId: order.serviceTypeId,
    serviceTypeName: order.serviceTypeName,
    status: order.status,
    templateId: order.templateId,
    title: order.title,
    updatedAt: order.updatedAt,
  };
};

export const getReferenceData = createServerFn({ method: "GET" }).handler(
  async (): Promise<ReferenceData> => {
    await ensureDatabase();

    const [serviceTypes, activityTypes, hymnSources] = await Promise.all([
      loadReferenceOptions("service_types"),
      loadReferenceOptions("activity_types"),
      loadReferenceOptions("hymn_sources"),
    ]);

    return { activityTypes, hymnSources, serviceTypes };
  }
);

export const getDashboardData = createServerFn({ method: "GET" }).handler(
  async (): Promise<DashboardData> => {
    await ensureDatabase();
    const db = getDatabase();
    const today = new Date().toISOString().slice(0, 10);
    const orderSelect = `
      SELECT orders_of_service.*, service_types.name AS service_type_name
      FROM orders_of_service
      JOIN service_types ON service_types.id = orders_of_service.service_type_id
    `;

    const [upcoming, previous, counts] = await Promise.all([
      db
        .prepare(`${orderSelect} WHERE service_date >= ? ORDER BY service_date ASC LIMIT 8`)
        .bind(today)
        .all<Record<string, unknown>>(),
      db
        .prepare(`${orderSelect} WHERE service_date < ? ORDER BY service_date DESC LIMIT 8`)
        .bind(today)
        .all<Record<string, unknown>>(),
      db
        .prepare(
          `SELECT
            (SELECT COUNT(*) FROM orders_of_service WHERE status = 'Planning') AS planning_count,
            (SELECT COUNT(*) FROM orders_of_service WHERE status = 'Published') AS published_count,
            (SELECT COUNT(*) FROM order_service_templates) AS template_count,
            (SELECT COUNT(*) FROM hymns) AS hymn_count`
        )
        .first<Record<string, unknown>>(),
    ]);

    return {
      hymnCount: asNumber(counts?.hymn_count),
      planningCount: asNumber(counts?.planning_count),
      previousOrders: previous.results.map(mapOrderRow),
      publishedCount: asNumber(counts?.published_count),
      templateCount: asNumber(counts?.template_count),
      upcomingOrders: upcoming.results.map(mapOrderRow),
    };
  }
);

export const getTemplates = createServerFn({ method: "GET" }).handler(
  async (): Promise<TemplateSummary[]> => {
    await ensureDatabase();
    const db = getDatabase();
    const { results } = await db
      .prepare(
        `SELECT order_service_templates.*, service_types.name AS service_type_name
        FROM order_service_templates
        JOIN service_types ON service_types.id = order_service_templates.service_type_id
        ORDER BY order_service_templates.updated_at DESC, order_service_templates.name ASC`
      )
      .all<Record<string, unknown>>();

    return results.map(mapTemplateRow);
  }
);

export const getTemplate = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .handler(async ({ data }): Promise<TemplateRecord | null> => {
    await ensureDatabase();
    const db = getDatabase();
    const row = await db
      .prepare(
        `SELECT order_service_templates.*, service_types.name AS service_type_name
        FROM order_service_templates
        JOIN service_types ON service_types.id = order_service_templates.service_type_id
        WHERE order_service_templates.id = ?`
      )
      .bind(data)
      .first<Record<string, unknown>>();

    return row ? mapTemplateRow(row) : null;
  });

export const saveTemplate = createServerFn({ method: "POST" })
  .validator((data: SaveTemplateInput) => data)
  .handler(async ({ data }): Promise<{ id: string }> => {
    await ensureDatabase();
    const db = getDatabase();
    const name = data.name.trim() || "Untitled Template";
    const id = data.id || uuidv4();
    const serviceTypeId = slugify(name);
    const template = normalizeTemplate({ ...data.template, name }, name);
    const timestamp = nowIso();

    await db.batch([
      db.prepare(
        `INSERT INTO service_types (id, name, description, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at`
      ).bind(serviceTypeId, name, `${name} order of service template.`, timestamp),
      db.prepare(
        `INSERT INTO order_service_templates (id, name, service_type_id, template_json, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          service_type_id = excluded.service_type_id,
          template_json = excluded.template_json,
          updated_at = excluded.updated_at`
      ).bind(id, name, serviceTypeId, JSON.stringify(template), timestamp),
    ]);

    return { id };
  });

export const deleteTemplate = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(async ({ data }): Promise<{ success: true }> => {
    await ensureDatabase();
    const db = getDatabase();
    await db.prepare("DELETE FROM order_service_templates WHERE id = ?").bind(data).run();

    return { success: true };
  });

export const getOrders = createServerFn({ method: "GET" }).handler(
  async (): Promise<OrderSummary[]> => {
    await ensureDatabase();
    const db = getDatabase();
    const { results } = await db
      .prepare(
        `SELECT orders_of_service.*, service_types.name AS service_type_name
        FROM orders_of_service
        JOIN service_types ON service_types.id = orders_of_service.service_type_id
        ORDER BY service_date DESC, updated_at DESC`
      )
      .all<Record<string, unknown>>();

    return results.map(mapOrderRow);
  }
);

export const deleteOrder = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(async ({ data }): Promise<{ success: true }> => {
    await ensureDatabase();
    const db = getDatabase();

    await db.batch([
      db.prepare("DELETE FROM hymn_plays WHERE order_id = ?").bind(data),
      db.prepare("DELETE FROM orders_of_service WHERE id = ?").bind(data),
    ]);

    return { success: true };
  });

export const getOrder = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .handler(async ({ data }): Promise<OrderRecord | null> => {
    await ensureDatabase();
    const db = getDatabase();
    const row = await db
      .prepare(
        `SELECT orders_of_service.*, service_types.name AS service_type_name
        FROM orders_of_service
        JOIN service_types ON service_types.id = orders_of_service.service_type_id
        WHERE orders_of_service.id = ?`
      )
      .bind(data)
      .first<Record<string, unknown>>();

    return row ? mapOrderRow(row) : null;
  });

export const postOrderToCraftMyPdf = createServerFn({ method: "POST" })
  .validator((data: SendOrderToCraftMyPdfInput) => data)
  .handler(
    async ({ data }): Promise<{
      craftMyPdfResponseBody?: string;
      craftMyPdfStatus?: number;
      dryRun: boolean;
      requestBody: {
        data: CraftMyPdfOrderPayload;
        template_id: string;
      };
    }> => {
      await ensureDatabase();
      const db = getDatabase();
      const order = await getOrder({ data: data.orderId });

      if (!order) {
        throw new Error("Order of service not found.");
      }

      const templateId =
        data.templateId?.trim() || getEnvValue("CRAFT_PDF_ID") || getEnvValue("CRAFTMYPDF_TEMPLATE_ID");

      if (!templateId) {
        throw new Error(
          "CraftMyPDF template id is required. Set the CRAFT_PDF_ID secret."
        );
      }

      const payload = await buildCraftMyPdfOrderPayload(db, order);
      const requestBody = {
        data: payload,
        template_id: templateId,
      };

      if (data.dryRun === true) {
        return {
          dryRun: true,
          requestBody,
        };
      }

      const apiKey = getEnvValue("CRAFTMYPDF_API_KEY") || getEnvValue("CRAFTPDF_API_KEY");

      if (!apiKey) {
        throw new Error("CRAFTMYPDF_API_KEY secret is not configured.");
      }

      const apiUrl = getEnvValue("CRAFTMYPDF_API_URL") ?? CRAFTMYPDF_DEFAULT_API_URL;
      const response = await fetch(apiUrl, {
        body: JSON.stringify(requestBody),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "X-API-KEY": apiKey,
        },
        method: "POST",
      });

      const responseText = await response.text();

      if (!response.ok) {
        throw new Error(
          `CraftMyPDF request failed (${response.status} ${response.statusText}): ${responseText}`
        );
      }

      return {
        craftMyPdfResponseBody: responseText,
        craftMyPdfStatus: response.status,
        dryRun: false,
        requestBody,
      };
    }
  );

export const createOrder = createServerFn({ method: "POST" })
  .validator((data: CreateOrderInput) => data)
  .handler(async ({ data }): Promise<{ id: string }> => {
    await ensureDatabase();
    const db = getDatabase();
    const template = await getTemplate({ data: data.templateId });
    const serviceDate = data.serviceDate.trim();

    if (!template) {
      throw new Error("Template not found.");
    }

    if (!serviceDate) {
      throw new Error("Order of service date is required.");
    }

    await assertServiceDateAvailable({ db, serviceDate });

    const id = uuidv4();
    const order = normalizeTemplate(template.template, template.name);

    try {
      await db
        .prepare(
          `INSERT INTO orders_of_service
            (id, title, service_type_id, service_date, status, template_id, order_json, updated_at)
          VALUES (?, ?, ?, ?, 'Planning', ?, ?, ?)`
        )
        .bind(
          id,
          data.title.trim() || `${template.name} Order of Service`,
          template.serviceTypeId,
          serviceDate,
          template.id,
          JSON.stringify(order),
          nowIso()
        )
        .run();
    } catch (error) {
      if (isServiceDateUniqueConstraintError(error)) {
        throw new Error(buildServiceDateConflictMessage(serviceDate), {
          cause: error,
        });
      }

      throw error;
    }

    return { id };
  });

export const saveOrder = createServerFn({ method: "POST" })
  .validator((data: SaveOrderInput) => data)
  .handler(async ({ data }): Promise<{ id: string }> => {
    await ensureDatabase();
    const db = getDatabase();
    const serviceDate = data.serviceDate.trim();

    if (!serviceDate) {
      throw new Error("Order of service date is required.");
    }

    await assertServiceDateAvailable({
      db,
      excludeOrderId: data.id,
      serviceDate,
    });

    const timestamp = nowIso();
    const order = normalizeTemplate(data.order, data.title);

    try {
      await db
        .prepare(
          `UPDATE orders_of_service
          SET title = ?, service_type_id = ?, service_date = ?, order_json = ?, updated_at = ?
          WHERE id = ?`
        )
        .bind(
          data.title.trim() || "Untitled Order of Service",
          data.serviceTypeId,
          serviceDate,
          JSON.stringify(order),
          timestamp,
          data.id
        )
        .run();
    } catch (error) {
      if (isServiceDateUniqueConstraintError(error)) {
        throw new Error(buildServiceDateConflictMessage(serviceDate), {
          cause: error,
        });
      }

      throw error;
    }

    return { id: data.id };
  });

export const publishOrder = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(async ({ data }): Promise<{ id: string; pdfObjectKey?: string }> => {
    await ensureDatabase();
    const db = getDatabase();
    const order = await getOrder({ data });

    if (!order) {
      throw new Error("Order of service not found.");
    }

    assertHymnActivitiesHaveSelections(order);

    if (order.status === "Published") {
      return { id: data, pdfObjectKey: order.pdfObjectKey };
    }

    const craftMyPdfResult = await postOrderToCraftMyPdf({ data: { orderId: data } });
    const pdfUrl = getCraftMyPdfFileUrl(craftMyPdfResult.craftMyPdfResponseBody ?? "{}");
    const pdfResponse = await fetch(pdfUrl);

    if (!pdfResponse.ok) {
      throw new Error(
        `Unable to download generated PDF (${pdfResponse.status} ${pdfResponse.statusText}).`
      );
    }

    const pdfObjectKey = getPdfObjectKey(order);
    await getPdfBucket().put(pdfObjectKey, pdfResponse.body, {
      httpMetadata: {
        contentDisposition: `attachment; filename="${pdfObjectKey.replaceAll('"', "'")}"`,
        contentType: "application/pdf",
      },
    });

    const hymnIds = new Set<string>();

    for (const segment of order.order.service_type) {
      for (const activity of segment.activities) {
        if (activity.activityType === "hymn" && activity.hymnId) {
          hymnIds.add(activity.hymnId);
        }
      }
    }
    const timestamp = nowIso();
    const statements = [
      db
        .prepare(
          `UPDATE orders_of_service
          SET status = 'Published', published_at = ?, pdf_object_key = ?, updated_at = ?
          WHERE id = ?`
        )
        .bind(timestamp, pdfObjectKey, timestamp, data),
    ];

    for (const hymnId of hymnIds) {
      statements.push(
        db
          .prepare("INSERT INTO hymn_plays (id, hymn_id, order_id, played_on) VALUES (?, ?, ?, ?)")
          .bind(uuidv4(), hymnId, data, order.serviceDate),
        db
          .prepare(
            `UPDATE hymns
            SET last_played = ?, updated_at = ?
            WHERE id = ?`
          )
          .bind(order.serviceDate, timestamp, hymnId)
      );
    }

    await db.batch(statements);

    return { id: data, pdfObjectKey };
  });

export const getPublishedOrderPdf = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .handler(async ({ data }): Promise<{ base64: string; filename: string }> => {
    await ensureDatabase();
    const order = await getOrder({ data });

    if (!order || !order.pdfObjectKey) {
      throw new Error("Published PDF was not found for this order of service.");
    }

    const object = await getPdfBucket().get(order.pdfObjectKey);

    if (!object) {
      throw new Error("Published PDF was not found in R2 storage.");
    }

    const buffer = Buffer.from(await object.arrayBuffer());

    return {
      base64: buffer.toString("base64"),
      filename: order.pdfObjectKey,
    };
  });

export const getOrderEmailDelivery = createServerFn({ method: "GET" })
  .validator((orderId: string) => orderId)
  .handler(async ({ data }): Promise<OrderEmailDeliveryRecord | null> => {
    await ensureDatabase();
    const delivery = await getDatabase()
      .prepare("SELECT * FROM order_email_deliveries WHERE order_id = ?")
      .bind(data)
      .first<Record<string, unknown>>();

    return delivery ? mapOrderEmailDeliveryRow(delivery) : null;
  });

export const sendOrderEmail = createServerFn({ method: "POST" })
  .validator((orderId: string) => orderId)
  .handler(async ({ data }): Promise<OrderEmailDeliveryRecord> => {
    await ensureDatabase();
    const db = getDatabase();
    const order = await getOrder({ data });

    if (!order || order.status !== "Published" || !order.pdfObjectKey) {
      throw new Error("Publish and save the order PDF before sending email.");
    }

    assertHymnActivitiesHaveSelections(order);

    const existingDelivery = await db
      .prepare("SELECT * FROM order_email_deliveries WHERE order_id = ?")
      .bind(data)
      .first<Record<string, unknown>>();

    if (existingDelivery) {
      throw new Error("Email has already been queued for this order of service.");
    }

    const settingsRow = await db
      .prepare("SELECT value FROM app_settings WHERE key = ?")
      .bind(EMAIL_SETTINGS_KEY)
      .first<{ value: string }>();
    const { results } = await db
      .prepare("SELECT email FROM email_recipients ORDER BY email")
      .all<{ email: string }>();
    const storedSettings = settingsRow
      ? (JSON.parse(settingsRow.value) as Partial<EmailSettingsRecord>)
      : {};

    if (!(storedSettings.smtpTokenConfigured && storedSettings.smtpUserConfigured)) {
      throw new Error("SMTP settings are not fully configured.");
    }

    const recipients = results.map((row) => row.email);

    if (recipients.length === 0) {
      throw new Error("At least one email recipient must be configured.");
    }

    const object = await getPdfBucket().head(order.pdfObjectKey);

    if (!object) {
      throw new Error("Published PDF was not found in R2 storage.");
    }

    const deliveryId = uuidv4();
    const subject = getOrderEmailSubject(order);
    const timestamp = nowIso();
    const message: OrderEmailQueueMessage = {
      attachment: {
        bucket: SERVICE_PDFS_BUCKET_NAME,
        contentType: "application/pdf",
        filename: order.pdfObjectKey,
        objectKey: order.pdfObjectKey,
      },
      body: "See attachment",
      deliveryId,
      orderId: data,
      recipients,
      smtpSettingsKey: EMAIL_SETTINGS_KEY,
      subject,
    };

    await db
      .prepare(
        `INSERT INTO order_email_deliveries (id, order_id, subject, status, queued_at, updated_at)
        VALUES (?, ?, ?, 'Queued', ?, ?)`
      )
      .bind(deliveryId, data, subject, timestamp, timestamp)
      .run();

    try {
      await getEmailQueue().send(message, { contentType: "json" });
    } catch (error) {
      await db
        .prepare(
          `UPDATE order_email_deliveries
          SET status = 'Failed', error_message = ?, updated_at = ?
          WHERE id = ?`
        )
        .bind(getErrorMessage(error, "Unable to queue email."), nowIso(), deliveryId)
        .run();
      throw error;
    }

    const delivery = await db
      .prepare("SELECT * FROM order_email_deliveries WHERE id = ?")
      .bind(deliveryId)
      .first<Record<string, unknown>>();

    if (!delivery) {
      throw new Error("Email delivery record could not be loaded.");
    }

    return mapOrderEmailDeliveryRow(delivery);
  });

export const getEmailSettings = createServerFn({ method: "GET" }).handler(
  async (): Promise<EmailSettingsRecord> => {
    await ensureDatabase();
    const db = getDatabase();
    const settingsRow = await db
      .prepare("SELECT value FROM app_settings WHERE key = ?")
      .bind(EMAIL_SETTINGS_KEY)
      .first<{ value: string }>();
    const { results } = await db
      .prepare("SELECT email FROM email_recipients ORDER BY email")
      .all<{ email: string }>();
    const storedSettings = settingsRow
      ? (JSON.parse(settingsRow.value) as Partial<EmailSettingsRecord>)
      : {};

    return {
      recipients: results.map((row) => row.email),
      smtpAddress: typeof storedSettings.smtpAddress === "string" ? storedSettings.smtpAddress : "",
      smtpPort: typeof storedSettings.smtpPort === "number" ? storedSettings.smtpPort : "",
      smtpSenderName: typeof storedSettings.smtpSenderName === "string" ? storedSettings.smtpSenderName : "",
      smtpTokenConfigured: Boolean(storedSettings.smtpTokenConfigured),
      smtpUserConfigured: Boolean(storedSettings.smtpUserConfigured),
    };
  }
);

export const saveEmailSettings = createServerFn({ method: "POST" })
  .validator((data: SaveEmailSettingsInput) => data)
  .handler(async ({ data }): Promise<{ success: true }> => {
    await ensureDatabase();
    assertValidEmailSettings(data);

    const db = getDatabase();
    const trimmedRecipients = [...new Set(data.recipients.map((email) => email.trim().toLowerCase()))];
    const currentRow = await db
      .prepare("SELECT value FROM app_settings WHERE key = ?")
      .bind(EMAIL_SETTINGS_KEY)
      .first<{ value: string }>();
    const currentSettings = currentRow ? (JSON.parse(currentRow.value) as Record<string, unknown>) : {};
    const encryptedToken = data.smtpToken
      ? await encryptSetting(data.smtpToken.trim())
      : asString(currentSettings.smtpTokenEncrypted);
    const encryptedUser = data.smtpUser
      ? await encryptSetting(data.smtpUser.trim().toLowerCase())
      : asString(currentSettings.smtpUserEncrypted);

    if (!encryptedToken) {
      throw new Error("SMTP token is required before email settings can be saved.");
    }

    if (!encryptedUser) {
      throw new Error("SMTP user is required before email settings can be saved.");
    }

    const settingsToStore = {
      smtpAddress: data.smtpAddress.trim(),
      smtpPort: data.smtpPort,
      smtpSenderName: data.smtpSenderName.trim(),
      smtpTokenConfigured: true,
      smtpTokenEncrypted: encryptedToken,
      smtpUserConfigured: true,
      smtpUserEncrypted: encryptedUser,
    };

    await db.batch([
      db.prepare(
        `INSERT INTO app_settings (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at`
      ).bind(EMAIL_SETTINGS_KEY, JSON.stringify(settingsToStore), nowIso()),
      db.prepare("DELETE FROM email_recipients"),
      ...trimmedRecipients.map((email) =>
        db.prepare("INSERT INTO email_recipients (id, email) VALUES (?, ?)").bind(uuidv4(), email)
      ),
    ]);

    return { success: true };
  });

export const addEmailRecipient = createServerFn({ method: "POST" })
  .validator((email: string) => email)
  .handler(async ({ data }): Promise<{ email: string }> => {
    await ensureDatabase();
    const db = getDatabase();
    const email = data.trim().toLowerCase();
    assertValidEmail(email, "Recipient");
    await db
      .prepare("INSERT OR IGNORE INTO email_recipients (id, email) VALUES (?, ?)")
      .bind(uuidv4(), email)
      .run();

    return { email };
  });

export const deleteEmailRecipient = createServerFn({ method: "POST" })
  .validator((email: string) => email)
  .handler(async ({ data }): Promise<{ success: true }> => {
    await ensureDatabase();
    const db = getDatabase();
    await db.prepare("DELETE FROM email_recipients WHERE email = ?").bind(data.trim().toLowerCase()).run();

    return { success: true };
  });

export const getHymns = createServerFn({ method: "GET" }).handler(
  async (): Promise<HymnRecord[]> => {
    await ensureDatabase();
    const db = getDatabase();
    const { results } = await db
      .prepare(
        `SELECT hymns.*, hymn_sources.name AS source_name, ${RECENT_HYMN_PLAY_COUNT_SQL}
        FROM hymns
        JOIN hymn_sources ON hymn_sources.id = hymns.source_id
        ORDER BY CAST(NULLIF(hymn_number, '') AS INTEGER), name`
      )
      .all<Record<string, unknown>>();

    return results.map(mapHymnRow);
  }
);

export const getHymnOptions = createServerFn({ method: "GET" }).handler(
  async (): Promise<HymnOption[]> => {
    await ensureDatabase();
    const db = getDatabase();
    const { results } = await db
      .prepare(
        `SELECT hymns.id, hymns.hymn_number, hymns.name, hymns.lyrics_markdown, hymns.last_played, hymns.music_key, hymn_sources.name AS source_name
        FROM hymns
        JOIN hymn_sources ON hymn_sources.id = hymns.source_id
        ORDER BY hymn_sources.name, CAST(NULLIF(hymns.hymn_number, '') AS INTEGER), hymns.name`
      )
      .all<Record<string, unknown>>();

    return results.map((row) => ({
      hasLyrics: Boolean(asString(row.lyrics_markdown).trim()),
      id: asString(row.id),
      label: [asString(row.hymn_number), asString(row.name)].filter(Boolean).join(" — "),
      lastPlayed: asString(row.last_played),
      musicKey: asString(row.music_key),
      sourceName: asString(row.source_name),
    }));
  }
);

export const getHymn = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .handler(async ({ data }): Promise<HymnRecord | null> => {
    await ensureDatabase();
    const db = getDatabase();
    const row = await db
      .prepare(
        `SELECT hymns.*, hymn_sources.name AS source_name, ${RECENT_HYMN_PLAY_COUNT_SQL}
        FROM hymns
        JOIN hymn_sources ON hymn_sources.id = hymns.source_id
        WHERE hymns.id = ?`
      )
      .bind(data)
      .first<Record<string, unknown>>();

    return row ? mapHymnRow(row) : null;
  });

export const saveHymn = createServerFn({ method: "POST" })
  .validator((data: SaveHymnInput) => data)
  .handler(async ({ data }): Promise<{ id: string }> => {
    await ensureDatabase();
    const db = getDatabase();
    const id = data.id || uuidv4();
    const timestamp = nowIso();
    await db
      .prepare(
        `INSERT INTO hymns
          (id, hymn_number, name, lyrics_markdown, music_key, last_played,
            source_id, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          hymn_number = excluded.hymn_number,
          name = excluded.name,
          lyrics_markdown = excluded.lyrics_markdown,
          music_key = excluded.music_key,
          last_played = excluded.last_played,
          source_id = excluded.source_id,
          updated_at = excluded.updated_at`
      )
      .bind(
        id,
        data.hymnNumber.trim(),
        data.name.trim() || "Untitled Hymn",
        data.lyricsMarkdown,
        data.musicKey.trim(),
        data.lastPlayed.trim(),
        data.sourceId,
        timestamp
      )
      .run();

    return { id };
  });

export const deleteHymn = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(async ({ data }): Promise<{ success: true }> => {
    await ensureDatabase();
    const db = getDatabase();
    await db.prepare("DELETE FROM hymns WHERE id = ?").bind(data).run();

    return { success: true };
  });
