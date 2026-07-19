import { Buffer } from "node:buffer";

import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { and, eq, ne, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { v4 as uuidv4 } from "uuid";

import { getAppDb } from "~/db/client";
import type { AppDatabase } from "~/db/client";
import {
  activityTypes,
  appSettings,
  emailRecipients,
  hymnFiles,
  hymnPlays,
  hymns,
  hymnSources,
  orderEmailDeliveries,
  orderServiceTemplates,
  ordersOfService,
  serviceTypes,
  teamMembers,
  teamMemberTeams,
  teams,
} from "~/db/schema";
import type {
  CraftMyPdfOrderPayload,
  CraftMyPdfOrderPayloadActivity,
  CreateOrderInput,
  DashboardData,
  EmailSettingsRecord,
  GetMonthPlanInput,
  HymnFileDownload,
  HymnFileRecord,
  HymnOption,
  HymnRecord,
  MonthPlanData,
  MonthPlanningDayConfig,
  MonthPlanningSettings,
  MonthPlanServiceDate,
  MonthScheduleCard,
  MonthScheduleTarget,
  OrderEmailDeliveryRecord,
  OrderEmailQueueMessage,
  OrderEmailStatus,
  OrderRecord,
  OrderServiceTemplateJson,
  OrderSummary,
  PlanMonthInput,
  PublishReadinessResult,
  ReferenceData,
  ReferenceOption,
  RenameHymnFileInput,
  SaveEmailSettingsInput,
  SaveHymnInput,
  SaveMonthScheduleInput,
  SaveOrderInput,
  SaveTemplateInput,
  SaveTeamInput,
  SaveTeamMemberInput,
  SendOrderToCraftMyPdfInput,
  Team,
  TeamMember,
  TeamMembershipInput,
  TeamMemberSummary,
  TeamRecord,
  TeamSummary,
  TemplateOption,
  UploadHymnFileInput,
  ServiceStatus,
  TemplateRecord,
  TemplateSummary,
} from "~/lib/order-service-types";
import { findMissingHymnActivities } from "~/lib/publish-readiness";
import {
  findMissingRequiredTeams,
  getAssignmentMemberIds,
  getRequiredTeamCount,
  isTeamOptional,
  isTeamRequired,
  memberTeamNames,
  normalizeServiceCardTeams,
  pruneStaleAssignments,
  setAssignmentMemberIds,
  syncOrderTeamsFromTemplate,
  teamsById as toTeamsById,
  validateTeamMember,
  validateTeamParent,
} from "~/lib/teams-logic";

const getPdfBucket = (): R2Bucket => {
  if (!env.SERVICE_PDFS) {
    throw new Error("Cloudflare R2 binding SERVICE_PDFS is not configured.");
  }

  return env.SERVICE_PDFS;
};

const getEmailQueue = (): Queue<OrderEmailQueueMessage> => {
  const queue = (
    env as unknown as { OOS_EMAIL_SENDER?: Queue<OrderEmailQueueMessage> }
  ).OOS_EMAIL_SENDER;

  if (!queue) {
    throw new Error(
      "Cloudflare Queue binding OOS_EMAIL_SENDER is not configured."
    );
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
    ...normalizeServiceCardTeams(segment),
  })),
});

const countActivities = (template: OrderServiceTemplateJson) =>
  template.service_type.reduce(
    (total, segment) => total + segment.activities.length,
    0
  );

const parseTemplateJson = (value: string, fallbackName: string) =>
  normalizeTemplate(
    JSON.parse(value) as OrderServiceTemplateJson,
    fallbackName
  );

const asString = (value: unknown) => (typeof value === "string" ? value : "");

const asNumber = (value: unknown) =>
  typeof value === "number"
    ? value
    : Number.parseInt(String(value ?? "0"), 10) || 0;

const getErrorMessage = (error: unknown, fallbackMessage: string) =>
  error instanceof Error && error.message ? error.message : fallbackMessage;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const EMAIL_SETTINGS_KEY = "email.smtp";
const MONTH_PLANNING_KEY = "monthPlanning";
const DEFAULT_SUNDAY_TEMPLATE_ID = "default-sunday-service";
const SERVICE_PDFS_BUCKET_NAME = "vbc-order-of-service-pdfs";

/** Sunday is pre-selected and assigned the seeded Sunday template by default. */
const DEFAULT_MONTH_PLANNING_SETTINGS: MonthPlanningSettings = {
  prepopulateDays: [
    {
      defaultTitle: "Sunday Order of Service",
      templateId: DEFAULT_SUNDAY_TEMPLATE_ID,
      weekday: 0,
    },
  ],
};

const getRequiredSecret = (key: string) => {
  const value = (env as unknown as Record<string, string | undefined>)[
    key
  ]?.trim();

  if (!value) {
    throw new Error(
      `${key} is not configured. Add it as a Cloudflare Worker secret before saving email settings.`
    );
  }

  return value;
};

const getEmailEncryptionKey = async () => {
  const secret = getRequiredSecret("EMAIL_SETTINGS_ENCRYPTION_KEY");
  const secretBytes = new TextEncoder().encode(secret);
  const hash = await crypto.subtle.digest("SHA-256", secretBytes);

  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
};

const encryptSetting = async (value: string) => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encodedValue = new TextEncoder().encode(value);
  const encrypted = await crypto.subtle.encrypt(
    { iv, name: "AES-GCM" },
    await getEmailEncryptionKey(),
    encodedValue
  );

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

  if (
    !Number.isInteger(settings.smtpPort) ||
    settings.smtpPort < 1 ||
    settings.smtpPort > 65_535
  ) {
    throw new Error("SMTP port must be between 1 and 65535.");
  }

  if (!settings.smtpSenderName.trim()) {
    throw new Error("Sender name is required.");
  }

  if (settings.smtpUser !== undefined && settings.smtpUser.trim().length > 0) {
    assertValidEmail(settings.smtpUser, "SMTP user");
  }

  if (
    settings.smtpToken !== undefined &&
    settings.smtpToken.trim().length === 0
  ) {
    throw new Error("SMTP token cannot be blank.");
  }

  for (const email of settings.recipients) {
    assertValidEmail(email, "Recipient");
  }
};

const loadReferenceOptions = async (
  table: typeof activityTypes | typeof hymnSources | typeof serviceTypes
): Promise<ReferenceOption[]> => {
  const rows = await getAppDb()
    .select({ id: table.id, name: table.name })
    .from(table)
    .orderBy(table.name);

  return rows.map((row) => ({ id: row.id, name: row.name }));
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

const isServiceDateUniqueConstraintError = (error: unknown): boolean => {
  // Drizzle wraps the driver error, so the D1 "UNIQUE constraint failed"
  // message lives on `.cause`; walk the chain to stay robust either way.
  let current: unknown = error;

  while (current instanceof Error) {
    if (
      current.message.includes("UNIQUE constraint failed") &&
      current.message.includes("orders_of_service.service_date")
    ) {
      return true;
    }

    current = current.cause;
  }

  return false;
};

const assertServiceDateAvailable = async ({
  db,
  excludeOrderId,
  serviceDate,
}: {
  db: AppDatabase;
  excludeOrderId?: string;
  serviceDate: string;
}): Promise<void> => {
  const existingOrder = await db
    .select({ id: ordersOfService.id })
    .from(ordersOfService)
    .where(
      excludeOrderId
        ? and(
            eq(ordersOfService.serviceDate, serviceDate),
            ne(ordersOfService.id, excludeOrderId)
          )
        : eq(ordersOfService.serviceDate, serviceDate)
    )
    .limit(1)
    .get();

  if (existingOrder) {
    throw new Error(buildServiceDateConflictMessage(serviceDate));
  }
};

const mapTeamRow = (row: Record<string, unknown>): Team => {
  const parentTeamId = asString(row.parent_team_id);

  return {
    id: asString(row.id),
    name: asString(row.name),
    ...(parentTeamId ? { parentTeamId } : {}),
  };
};

const splitTeamIds = (value: unknown): string[] =>
  asString(value)
    .split(",")
    .map((teamId) => teamId.trim())
    .filter(Boolean);

const mapTeamMemberRow = (row: Record<string, unknown>): TeamMember => ({
  email: asString(row.email),
  firstName: asString(row.first_name),
  id: asString(row.id),
  lastName: asString(row.last_name),
  notes: asString(row.notes),
  phone: asString(row.phone),
  teamIds: splitTeamIds(row.team_ids),
});

const loadTeamsById = async (db: AppDatabase) => {
  const results = await db.all<Record<string, unknown>>(
    sql`SELECT id, name, parent_team_id FROM teams`
  );

  return toTeamsById(results.map(mapTeamRow));
};

/** Live team memberships keyed by team id, for validating order assignments. */
const loadTeamMemberIds = async (
  db: AppDatabase
): Promise<Map<string, Set<string>>> => {
  const results = await db.all<Record<string, unknown>>(
    sql`SELECT team_id, member_id FROM team_member_teams`
  );
  const byTeam = new Map<string, Set<string>>();

  for (const row of results) {
    const teamId = asString(row.team_id);
    const memberId = asString(row.member_id);
    const members = byTeam.get(teamId) ?? new Set<string>();
    members.add(memberId);
    byTeam.set(teamId, members);
  }

  return byTeam;
};

const assertRequiredTeamsStaffed = async (
  db: AppDatabase,
  order: OrderRecord
): Promise<void> => {
  const [teamsLookup, membersByTeam] = await Promise.all([
    loadTeamsById(db),
    loadTeamMemberIds(db),
  ]);
  const missing = findMissingRequiredTeams(
    order.order,
    teamsLookup,
    membersByTeam
  );

  if (missing.length > 0) {
    const summary = missing
      .map((entry) => `${entry.teamName} (${entry.cardName})`)
      .join(", ");

    throw new Error(
      `Assign members to every required team before publishing: ${summary}.`
    );
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

const mapHymnFileRow = (row: Record<string, unknown>): HymnFileRecord => ({
  contentType: asString(row.content_type),
  createdAt: asString(row.created_at),
  filename: asString(row.filename),
  hymnId: asString(row.hymn_id),
  id: asString(row.id),
  objectKey: asString(row.object_key),
  sizeBytes: asNumber(row.size_bytes),
  updatedAt: asString(row.updated_at),
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

const getPdfObjectKey = (
  order: Pick<OrderRecord, "id" | "serviceDate" | "title">
): string => {
  const serviceName =
    order.title.trim().replaceAll(/[\\/:*?"<>|]+/gu, "-") || "Order of Service";

  return `oos/${order.id}/${order.serviceDate} - ${serviceName}.pdf`;
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
  db: AppDatabase,
  hymnIds: string[]
): Promise<Map<string, HymnRecord>> => {
  if (hymnIds.length === 0) {
    return new Map<string, HymnRecord>();
  }

  const results = await db.all<Record<string, unknown>>(
    sql`SELECT hymns.*, hymn_sources.name AS source_name, ${sql.raw(RECENT_HYMN_PLAY_COUNT_SQL)}
      FROM hymns
      JOIN hymn_sources ON hymn_sources.id = hymns.source_id
      WHERE hymns.id IN (${sql.join(
        hymnIds.map((id) => sql`${id}`),
        sql`, `
      )})`
  );

  return new Map(
    results.map((row) => {
      const hymn = mapHymnRow(row);

      return [hymn.id, hymn] as const;
    })
  );
};

const hasHymnActivityWithoutSelection = (order: OrderRecord): boolean =>
  findMissingHymnActivities(order.order).length > 0;

const assertHymnActivitiesHaveSelections = (order: OrderRecord): void => {
  if (hasHymnActivityWithoutSelection(order)) {
    throw new Error(
      "Select a hymn for every hymn activity before publishing or sending."
    );
  }
};

const normalizeGetMonthPlanInput = (
  input?: string | GetMonthPlanInput
): { autoCreate?: boolean; month: string } => {
  if (typeof input === "string" || input === undefined) {
    return { month: input ?? "" };
  }

  return {
    autoCreate: input.autoCreate,
    month: input.month ?? "",
  };
};

const buildCraftMyPdfOrderPayload = async (
  db: AppDatabase,
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
          const hymn = activity.hymnId
            ? hymnsById.get(activity.hymnId)
            : undefined;

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
    const [serviceTypeOptions, activityTypeOptions, hymnSourceOptions] =
      await Promise.all([
        loadReferenceOptions(serviceTypes),
        loadReferenceOptions(activityTypes),
        loadReferenceOptions(hymnSources),
      ]);

    return {
      activityTypes: activityTypeOptions,
      hymnSources: hymnSourceOptions,
      serviceTypes: serviceTypeOptions,
    };
  }
);

const TEAM_SUMMARY_SELECT = `
  SELECT teams.*, parent.name AS parent_name,
    (SELECT COUNT(*) FROM team_member_teams WHERE team_id = teams.id) AS member_count
  FROM teams
  LEFT JOIN teams AS parent ON parent.id = teams.parent_team_id
`;

const mapTeamSummaryRow = (row: Record<string, unknown>): TeamSummary => {
  const parentName = asString(row.parent_name);

  return {
    ...mapTeamRow(row),
    memberCount: asNumber(row.member_count),
    ...(parentName ? { parentName } : {}),
  };
};

const getUpcomingSunday = (today: string): string => {
  const date = new Date(`${today}T00:00:00.000Z`);
  const daysUntilSunday = (7 - date.getUTCDay()) % 7;
  date.setUTCDate(date.getUTCDate() + daysUntilSunday);

  return date.toISOString().slice(0, 10);
};

export const getDashboardData = createServerFn({ method: "GET" }).handler(
  async (): Promise<DashboardData> => {
    const db = getAppDb();
    const today = new Date().toISOString().slice(0, 10);
    const nextSundayDate = getUpcomingSunday(today);
    const orderSelect = `
      SELECT orders_of_service.*, service_types.name AS service_type_name
      FROM orders_of_service
      JOIN service_types ON service_types.id = orders_of_service.service_type_id
    `;

    const [upcoming, previous, counts, nextSunday, teamRows] =
      await Promise.all([
        db.all<Record<string, unknown>>(
          sql`${sql.raw(orderSelect)} WHERE service_date >= ${today} ORDER BY service_date ASC LIMIT 8`
        ),
        db.all<Record<string, unknown>>(
          sql`${sql.raw(orderSelect)} WHERE service_date < ${today} ORDER BY service_date DESC LIMIT 8`
        ),
        db.get<Record<string, unknown>>(
          sql`SELECT
            (SELECT COUNT(*) FROM orders_of_service WHERE status = 'Planning') AS planning_count,
            (SELECT COUNT(*) FROM orders_of_service WHERE status = 'Published') AS published_count,
            (SELECT COUNT(*) FROM order_service_templates) AS template_count,
            (SELECT COUNT(*) FROM hymns) AS hymn_count,
            (SELECT COUNT(*) FROM team_members) AS team_member_count,
            (SELECT COUNT(*) FROM teams) AS team_count`
        ),
        db.get<Record<string, unknown>>(
          sql`${sql.raw(orderSelect)} WHERE service_date = ${nextSundayDate} LIMIT 1`
        ),
        db.all<Record<string, unknown>>(
          sql`${sql.raw(TEAM_SUMMARY_SELECT)} ORDER BY member_count DESC, teams.name ASC LIMIT 6`
        ),
      ]);

    return {
      hymnCount: asNumber(counts?.hymn_count),
      nextSundayDate,
      nextSundayOrder: nextSunday ? mapOrderRow(nextSunday) : null,
      planningCount: asNumber(counts?.planning_count),
      previousOrders: previous.map(mapOrderRow),
      publishedCount: asNumber(counts?.published_count),
      teamCount: asNumber(counts?.team_count),
      teamMemberCount: asNumber(counts?.team_member_count),
      teams: teamRows.map(mapTeamSummaryRow),
      templateCount: asNumber(counts?.template_count),
      upcomingOrders: upcoming.map(mapOrderRow),
    };
  }
);

export const getTemplates = createServerFn({ method: "GET" }).handler(
  async (): Promise<TemplateSummary[]> => {
    const db = getAppDb();
    const results = await db.all<Record<string, unknown>>(
      sql`SELECT order_service_templates.*, service_types.name AS service_type_name
        FROM order_service_templates
        JOIN service_types ON service_types.id = order_service_templates.service_type_id
        ORDER BY order_service_templates.updated_at DESC, order_service_templates.name ASC`
    );

    return results.map(mapTemplateRow);
  }
);

export const getTemplate = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .handler(async ({ data }): Promise<TemplateRecord | null> => {
    const db = getAppDb();
    const row = await db.get<Record<string, unknown>>(
      sql`SELECT order_service_templates.*, service_types.name AS service_type_name
        FROM order_service_templates
        JOIN service_types ON service_types.id = order_service_templates.service_type_id
        WHERE order_service_templates.id = ${data}`
    );

    return row ? mapTemplateRow(row) : null;
  });

export const saveTemplate = createServerFn({ method: "POST" })
  .validator((data: SaveTemplateInput) => data)
  .handler(async ({ data }): Promise<{ id: string }> => {
    const db = getAppDb();
    const name = data.name.trim() || "Untitled Template";
    const id = data.id || uuidv4();
    const serviceTypeId = slugify(name);
    const template = normalizeTemplate({ ...data.template, name }, name);
    const timestamp = nowIso();

    const templateJson = JSON.stringify(template);

    await db.batch([
      db
        .insert(serviceTypes)
        .values({
          description: `${name} order of service template.`,
          id: serviceTypeId,
          name,
          updatedAt: timestamp,
        })
        .onConflictDoUpdate({
          set: { name, updatedAt: timestamp },
          target: serviceTypes.id,
        }),
      db
        .insert(orderServiceTemplates)
        .values({
          id,
          name,
          serviceTypeId,
          templateJson,
          updatedAt: timestamp,
        })
        .onConflictDoUpdate({
          set: { name, serviceTypeId, templateJson, updatedAt: timestamp },
          target: orderServiceTemplates.id,
        }),
    ]);

    return { id };
  });

const parseMonthPlanningSettings = (value: string): MonthPlanningSettings => {
  try {
    const parsed = JSON.parse(value) as Partial<MonthPlanningSettings>;
    const prepopulateDays = Array.isArray(parsed.prepopulateDays)
      ? parsed.prepopulateDays
          .map((day) => ({
            defaultTitle: asString(day?.defaultTitle).trim(),
            templateId: asString(day?.templateId).trim(),
            weekday: asNumber(day?.weekday),
          }))
          .filter(
            (day) =>
              Number.isInteger(day.weekday) &&
              day.weekday >= 0 &&
              day.weekday <= 6
          )
      : [];

    return { prepopulateDays };
  } catch {
    return { prepopulateDays: [] };
  }
};

/** Read Month Planner settings, falling back to the Sunday default. */
const loadMonthPlanningSettings = async (
  db: AppDatabase
): Promise<MonthPlanningSettings> => {
  const row = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, MONTH_PLANNING_KEY))
    .get();

  if (!row) {
    return DEFAULT_MONTH_PLANNING_SETTINGS;
  }

  return parseMonthPlanningSettings(row.value);
};

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** Validate a YYYY-MM string and return its numeric year/month. */
const parseMonth = (month: string): { monthNumber: number; year: number } => {
  const match = /^(?<year>\d{4})-(?<month>\d{2})$/u.exec(month.trim());

  if (!match?.groups) {
    throw new Error("Month must be in YYYY-MM format.");
  }

  const year = Number(match.groups.year);
  const monthNumber = Number(match.groups.month);

  if (monthNumber < 1 || monthNumber > 12) {
    throw new Error("Month must be between 01 and 12.");
  }

  return { monthNumber, year };
};

interface MonthDateEntry {
  date: string;
  dayConfig: MonthPlanningDayConfig;
}

/** Every date in the month whose weekday has a configured day, with its config. */
const getMonthDatesForDayConfigs = (
  month: string,
  dayConfigs: MonthPlanningDayConfig[]
): MonthDateEntry[] => {
  const { monthNumber, year } = parseMonth(month);
  const date = new Date(Date.UTC(year, monthNumber - 1, 1));
  const dates: MonthDateEntry[] = [];

  while (date.getUTCMonth() === monthNumber - 1) {
    const dayConfig = dayConfigs.find(
      (config) => config.weekday === date.getUTCDay()
    );

    if (dayConfig) {
      dates.push({ date: date.toISOString().slice(0, 10), dayConfig });
    }

    date.setUTCDate(date.getUTCDate() + 1);
  }

  return dates;
};

/** First day of the month after the given YYYY-MM, as YYYY-MM-DD. */
const getNextMonthStart = (month: string): string => {
  const { monthNumber, year } = parseMonth(month);

  return new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10);
};

/** Templates referenced by a month-planning configuration, keyed by id. */
const findTemplateMonthPlanReferences = (
  settings: MonthPlanningSettings,
  templateId: string
): boolean =>
  settings.prepopulateDays.some((day) => day.templateId === templateId);

export const deleteTemplate = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(async ({ data }): Promise<{ success: true }> => {
    const db = getAppDb();

    const [orderRow, settings] = await Promise.all([
      db.get<{ order_count: number }>(
        sql`SELECT COUNT(*) AS order_count FROM orders_of_service WHERE template_id = ${data}`
      ),
      loadMonthPlanningSettings(db),
    ]);

    const orderCount = asNumber(orderRow?.order_count);
    const monthPlanRef = findTemplateMonthPlanReferences(settings, data);

    if (orderCount > 0 || monthPlanRef) {
      const parts: string[] = [];

      if (monthPlanRef) {
        parts.push("the Month Planner pre-populate settings");
      }

      if (orderCount > 0) {
        parts.push(`${orderCount} order(s)`);
      }

      throw new Error(
        `This template is in use by ${parts.join(" and ")}. Reassign or remove those references before deleting it.`
      );
    }

    await db
      .delete(orderServiceTemplates)
      .where(eq(orderServiceTemplates.id, data));

    return { success: true };
  });

const getCurrentMonth = (): string => new Date().toISOString().slice(0, 7);

const toOrderSummary = (order: OrderRecord): OrderSummary => ({
  activityCount: order.activityCount,
  id: order.id,
  segmentCount: order.segmentCount,
  serviceDate: order.serviceDate,
  serviceTypeName: order.serviceTypeName,
  status: order.status,
  title: order.title,
  updatedAt: order.updatedAt,
});

const loadTemplatesById = async (
  db: AppDatabase,
  ids: string[]
): Promise<Map<string, TemplateRecord>> => {
  const unique = [...new Set(ids.filter(Boolean))];

  if (unique.length === 0) {
    return new Map();
  }

  const results = await db.all<Record<string, unknown>>(
    sql`SELECT order_service_templates.*, service_types.name AS service_type_name
      FROM order_service_templates
      JOIN service_types ON service_types.id = order_service_templates.service_type_id
      WHERE order_service_templates.id IN (${sql.join(
        unique.map((id) => sql`${id}`),
        sql`, `
      )})`
  );

  return new Map(
    results.map((row) => {
      const template = mapTemplateRow(row);

      return [template.id, template] as const;
    })
  );
};

/**
 * Create orders for every configured date in the month that does not already
 * have one. Existing dates are skipped, and configured weekdays whose template
 * is missing are left untouched so a stray config never blocks the whole month.
 */
const planMonthInternal = async (
  db: AppDatabase,
  month: string,
  settings: MonthPlanningSettings,
  { createMissing = true }: { createMissing?: boolean } = {}
): Promise<{ createdIds: string[] }> => {
  const configuredDates = getMonthDatesForDayConfigs(
    month,
    settings.prepopulateDays
  );

  if (configuredDates.length === 0) {
    return { createdIds: [] };
  }

  const templatesById = await loadTemplatesById(
    db,
    settings.prepopulateDays.map((day) => day.templateId)
  );
  const start = `${month}-01`;
  const end = getNextMonthStart(month);
  const results = await db.all<Record<string, unknown>>(
    sql`SELECT id, title, service_date, status, order_json FROM orders_of_service WHERE service_date >= ${start} AND service_date < ${end}`
  );
  const existingByDate = new Map(
    results.map((row) => [asString(row.service_date), row] as const)
  );
  const statements: BatchItem<"sqlite">[] = [];
  const timestamp = nowIso();

  for (const { date, dayConfig } of configuredDates) {
    const template = templatesById.get(dayConfig.templateId);

    if (!template) {
      continue;
    }

    const existing = existingByDate.get(date);

    if (existing) {
      // The order already exists. If it is still in Planning, fold in any teams
      // added to the template after it was created so the scheduler and publish
      // gate see them. Published orders are left untouched.
      if (asString(existing.status) !== "Planning") {
        continue;
      }

      const title = asString(existing.title);
      const current = parseTemplateJson(asString(existing.order_json), title);
      const { changed, order: synced } = syncOrderTeamsFromTemplate(
        current,
        normalizeTemplate(template.template, template.name)
      );

      if (changed) {
        statements.push(
          db
            .update(ordersOfService)
            .set({ orderJson: JSON.stringify(synced), updatedAt: timestamp })
            .where(eq(ordersOfService.id, asString(existing.id)))
        );
      }

      continue;
    }

    if (!createMissing) {
      continue;
    }

    const order = normalizeTemplate(template.template, template.name);
    const title =
      dayConfig.defaultTitle.trim() || `${template.name} Order of Service`;
    statements.push(
      db
        .insert(ordersOfService)
        .values({
          id: uuidv4(),
          orderJson: JSON.stringify(order),
          serviceDate: date,
          serviceTypeId: template.serviceTypeId,
          status: "Planning",
          templateId: template.id,
          title,
          updatedAt: timestamp,
        })
        .onConflictDoNothing({ target: ordersOfService.serviceDate })
        .returning({ id: ordersOfService.id })
    );
  }

  const createdIds: string[] = [];

  if (statements.length > 0) {
    const batchResults = await db.batch(
      statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]
    );

    // INSERT ... RETURNING statements resolve to a rows array; UPDATE statements
    // resolve to a D1 result object. Only the former carry created ids.
    for (const result of batchResults) {
      if (Array.isArray(result)) {
        for (const row of result as { id: string }[]) {
          createdIds.push(row.id);
        }
      }
    }
  }

  return { createdIds };
};

export const getMonthPlanningSettings = createServerFn({
  method: "GET",
}).handler(
  async (): Promise<MonthPlanningSettings> =>
    await loadMonthPlanningSettings(getAppDb())
);

export const saveMonthPlanningSettings = createServerFn({ method: "POST" })
  .validator((data: MonthPlanningSettings) => data)
  .handler(async ({ data }): Promise<{ success: true }> => {
    const db = getAppDb();
    const seen = new Set<number>();
    const prepopulateDays: MonthPlanningDayConfig[] = [];

    for (const day of data.prepopulateDays ?? []) {
      const weekday = asNumber(day.weekday);

      if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
        continue;
      }

      if (seen.has(weekday)) {
        continue;
      }

      seen.add(weekday);
      const templateId = asString(day.templateId).trim();

      if (!templateId) {
        throw new Error(
          `Select a template for ${WEEKDAY_NAMES[weekday]} before saving. Pre-population cannot be finalized without an associated template.`
        );
      }

      prepopulateDays.push({
        defaultTitle:
          asString(day.defaultTitle).trim() ||
          `${WEEKDAY_NAMES[weekday]} Order of Service`,
        templateId,
        weekday,
      });
    }

    const templatesById = await loadTemplatesById(
      db,
      prepopulateDays.map((day) => day.templateId)
    );

    for (const day of prepopulateDays) {
      if (!templatesById.has(day.templateId)) {
        throw new Error(
          `The template for ${WEEKDAY_NAMES[day.weekday]} no longer exists. Choose another template.`
        );
      }
    }

    const value = JSON.stringify({ prepopulateDays });
    const timestamp = nowIso();
    await db
      .insert(appSettings)
      .values({ key: MONTH_PLANNING_KEY, updatedAt: timestamp, value })
      .onConflictDoUpdate({
        set: { updatedAt: timestamp, value },
        target: appSettings.key,
      });

    return { success: true };
  });

export const planMonth = createServerFn({ method: "POST" })
  .validator((data: PlanMonthInput) => data)
  .handler(
    async ({
      data,
    }): Promise<{ createdCount: number; createdIds: string[] }> => {
      const db = getAppDb();
      const month = (data.month ?? "").trim();
      parseMonth(month);
      const settings = await loadMonthPlanningSettings(db);
      const { createdIds } = await planMonthInternal(db, month, settings);

      return { createdCount: createdIds.length, createdIds };
    }
  );

export const getMonthPlan = createServerFn({ method: "GET" })
  .validator((input?: string | GetMonthPlanInput) =>
    normalizeGetMonthPlanInput(input)
  )
  .handler(async ({ data }): Promise<MonthPlanData> => {
    const db = getAppDb();
    const month = data.month.trim() || getCurrentMonth();
    parseMonth(month);
    const settings = await loadMonthPlanningSettings(db);

    // Pre-populate the current month automatically on first visit unless the
    // caller opts out (MCP peek). Other months are not auto-created unless
    // `autoCreate: true`. Planned (unpublished) orders are still synced with
    // the current template so teams added after planning appear in the scheduler.
    const createMissing = data.autoCreate ?? month === getCurrentMonth();
    await planMonthInternal(db, month, settings, {
      createMissing,
    });

    const configTemplateIds = settings.prepopulateDays.map(
      (day) => day.templateId
    );
    const start = `${month}-01`;
    const end = getNextMonthStart(month);
    const [templatesById, orderRows, teamRows, teamMemberSummaries] =
      await Promise.all([
        loadTemplatesById(db, configTemplateIds),
        db.all<Record<string, unknown>>(
          sql`SELECT orders_of_service.*, service_types.name AS service_type_name
          FROM orders_of_service
          JOIN service_types ON service_types.id = orders_of_service.service_type_id
          WHERE service_date >= ${start} AND service_date < ${end}
          ORDER BY service_date`
        ),
        db.all<Record<string, unknown>>(
          sql`${sql.raw(TEAM_SUMMARY_SELECT)} ORDER BY teams.name`
        ),
        // oxlint-disable-next-line no-use-before-define -- getTeamMembers is a server fn defined later in this module.
        getTeamMembers(),
      ]);

    const teamSummaries = teamRows.map(mapTeamSummaryRow);
    const teamNamesById = new Map(
      teamSummaries.map((team) => [team.id, team.name])
    );
    const orders = orderRows.map(mapOrderRow);
    const ordersByDate = new Map(
      orders.map((order) => [order.serviceDate, order])
    );

    const configuredDates = getMonthDatesForDayConfigs(
      month,
      settings.prepopulateDays
    );
    const serviceDates: MonthPlanServiceDate[] = configuredDates.map(
      ({ date, dayConfig }) => {
        const order = ordersByDate.get(date);
        const template = templatesById.get(dayConfig.templateId);

        return {
          date,
          dayConfig,
          ...(order ? { order: toOrderSummary(order) } : {}),
          shouldExist: true,
          templateName: template?.name ?? "",
        };
      }
    );
    const missingCount = serviceDates.filter((entry) => !entry.order).length;
    const unconfiguredWeekdays = settings.prepopulateDays
      .filter((day) => !templatesById.has(day.templateId))
      .map((day) => day.weekday);

    // Schedule cards from existing orders: teams the order's cards staff.
    const scheduleCards: Record<string, MonthScheduleCard[]> = {};
    const targetTeamIds = new Set<string>();

    for (const order of orders) {
      for (const card of order.order.service_type) {
        const teamIds = new Set([
          ...(card.requiredTeamIds ?? []),
          ...(card.optionalTeamIds ?? []),
        ]);

        for (const teamId of teamIds) {
          targetTeamIds.add(teamId);
          const list = scheduleCards[teamId] ?? [];
          list.push({
            cardId: card.id,
            cardName: card.typeName,
            date: order.serviceDate,
            memberIds: getAssignmentMemberIds(card, teamId),
            optional: isTeamOptional(card, teamId),
            orderId: order.id,
            orderTitle: order.title,
            required: isTeamRequired(card, teamId),
            requiredCount: getRequiredTeamCount(card, teamId),
          });
          scheduleCards[teamId] = list;
        }
      }
    }

    // Also surface teams configured on the assigned templates, so the schedule
    // bar lists them even before any order in the month has been planned.
    for (const day of settings.prepopulateDays) {
      const template = templatesById.get(day.templateId);

      if (!template) {
        continue;
      }

      for (const card of template.template.service_type) {
        for (const teamId of [
          ...(card.requiredTeamIds ?? []),
          ...(card.optionalTeamIds ?? []),
        ]) {
          targetTeamIds.add(teamId);
        }
      }
    }

    const scheduleTargets: MonthScheduleTarget[] = [...targetTeamIds]
      .map((teamId) => ({
        teamId,
        teamName: teamNamesById.get(teamId) ?? teamId,
      }))
      // oxlint-disable-next-line unicorn/no-array-sort -- ES2022 target lacks toSorted.
      .sort((first, second) => first.teamName.localeCompare(second.teamName));

    return {
      missingCount,
      month,
      scheduleCards,
      scheduleTargets,
      serviceDates,
      settings,
      teamMembers: teamMemberSummaries,
      teams: teamSummaries,
      unconfiguredWeekdays,
    };
  });

export const saveMonthSchedule = createServerFn({ method: "POST" })
  .validator((data: SaveMonthScheduleInput) => data)
  .handler(async ({ data }): Promise<{ success: true }> => {
    const db = getAppDb();
    const byOrder = new Map<string, Map<string, string[]>>();

    for (const assignment of data.assignments) {
      const cards = byOrder.get(assignment.orderId) ?? new Map();
      cards.set(assignment.cardId, assignment.memberIds);
      byOrder.set(assignment.orderId, cards);
    }

    const orderIds = [...byOrder.keys()];

    if (orderIds.length === 0) {
      return { success: true };
    }

    const [rows, membersByTeam] = await Promise.all([
      db.all<Record<string, unknown>>(
        sql`SELECT id, title, order_json FROM orders_of_service WHERE id IN (${sql.join(
          orderIds.map((id) => sql`${id}`),
          sql`, `
        )})`
      ),
      loadTeamMemberIds(db),
    ]);
    const timestamp = nowIso();
    const statements: BatchItem<"sqlite">[] = [];

    for (const row of rows) {
      const id = asString(row.id);
      const title = asString(row.title);
      const order = parseTemplateJson(asString(row.order_json), title);
      const updatesByCard = byOrder.get(id);

      if (!updatesByCard) {
        continue;
      }

      const service_type = order.service_type.map((card) => {
        if (!updatesByCard.has(card.id)) {
          return card;
        }

        return {
          ...card,
          teamAssignments: setAssignmentMemberIds(
            card.teamAssignments,
            data.teamId,
            updatesByCard.get(card.id) ?? []
          ),
        };
      });
      const normalized = pruneStaleAssignments(
        normalizeTemplate({ ...order, service_type }, title),
        membersByTeam
      );
      statements.push(
        db
          .update(ordersOfService)
          .set({ orderJson: JSON.stringify(normalized), updatedAt: timestamp })
          .where(eq(ordersOfService.id, id))
      );
    }

    if (statements.length > 0) {
      await db.batch(
        statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]
      );
    }

    return { success: true };
  });

export const getOrders = createServerFn({ method: "GET" }).handler(
  async (): Promise<OrderSummary[]> => {
    const db = getAppDb();
    const results = await db.all<Record<string, unknown>>(
      sql`SELECT orders_of_service.*, service_types.name AS service_type_name
        FROM orders_of_service
        JOIN service_types ON service_types.id = orders_of_service.service_type_id
        ORDER BY service_date DESC, updated_at DESC`
    );

    return results.map(mapOrderRow);
  }
);

export const deleteOrder = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(async ({ data }): Promise<{ success: true }> => {
    const db = getAppDb();

    await db.batch([
      db.delete(hymnPlays).where(eq(hymnPlays.orderId, data)),
      db.delete(ordersOfService).where(eq(ordersOfService.id, data)),
    ]);

    return { success: true };
  });

export const getOrder = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .handler(async ({ data }): Promise<OrderRecord | null> => {
    const db = getAppDb();
    const row = await db.get<Record<string, unknown>>(
      sql`SELECT orders_of_service.*, service_types.name AS service_type_name
        FROM orders_of_service
        JOIN service_types ON service_types.id = orders_of_service.service_type_id
        WHERE orders_of_service.id = ${data}`
    );

    return row ? mapOrderRow(row) : null;
  });

/**
 * Inspect whether an order can be published without calling CraftMyPDF or
 * writing to R2. Used by the MCP readiness tool and publish gate diagnostics.
 */
export const getPublishReadiness = createServerFn({ method: "GET" })
  .validator((orderId: string) => orderId)
  .handler(async ({ data }): Promise<PublishReadinessResult> => {
    const db = getAppDb();
    const order = await getOrder({ data });

    if (!order) {
      throw new Error("Order of service not found.");
    }

    const [teamsLookup, membersByTeam] = await Promise.all([
      loadTeamsById(db),
      loadTeamMemberIds(db),
    ]);
    const missingHymnActivities = findMissingHymnActivities(order.order);
    const missingRequiredTeams = findMissingRequiredTeams(
      order.order,
      teamsLookup,
      membersByTeam
    );
    const alreadyPublished = order.status === "Published";
    const hasPdf = Boolean(order.pdfObjectKey);
    const ready =
      missingHymnActivities.length === 0 && missingRequiredTeams.length === 0;

    return {
      alreadyPublished,
      hasPdf,
      missingHymnActivities,
      missingRequiredTeams,
      orderId: order.id,
      ready,
      serviceDate: order.serviceDate,
      status: order.status,
      title: order.title,
    };
  });

export const postOrderToCraftMyPdf = createServerFn({ method: "POST" })
  .validator((data: SendOrderToCraftMyPdfInput) => data)
  .handler(
    async ({
      data,
    }): Promise<{
      craftMyPdfResponseBody?: string;
      craftMyPdfStatus?: number;
      dryRun: boolean;
      requestBody: {
        data: CraftMyPdfOrderPayload;
        template_id: string;
      };
    }> => {
      const db = getAppDb();
      const order = await getOrder({ data: data.orderId });

      if (!order) {
        throw new Error("Order of service not found.");
      }

      const templateId =
        data.templateId?.trim() ||
        getEnvValue("CRAFT_PDF_ID") ||
        getEnvValue("CRAFTMYPDF_TEMPLATE_ID");

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

      const apiKey =
        getEnvValue("CRAFTMYPDF_API_KEY") || getEnvValue("CRAFTPDF_API_KEY");

      if (!apiKey) {
        throw new Error("CRAFTMYPDF_API_KEY secret is not configured.");
      }

      const apiUrl =
        getEnvValue("CRAFTMYPDF_API_URL") ?? CRAFTMYPDF_DEFAULT_API_URL;
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
    const db = getAppDb();
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
      await db.insert(ordersOfService).values({
        id,
        orderJson: JSON.stringify(order),
        serviceDate,
        serviceTypeId: template.serviceTypeId,
        status: "Planning",
        templateId: template.id,
        title: data.title.trim() || `${template.name} Order of Service`,
        updatedAt: nowIso(),
      });
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
    const db = getAppDb();
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
    const membersByTeam = await loadTeamMemberIds(db);
    const order = pruneStaleAssignments(
      normalizeTemplate(data.order, data.title),
      membersByTeam
    );

    try {
      await db
        .update(ordersOfService)
        .set({
          orderJson: JSON.stringify(order),
          serviceDate,
          serviceTypeId: data.serviceTypeId,
          title: data.title.trim() || "Untitled Order of Service",
          updatedAt: timestamp,
        })
        .where(eq(ordersOfService.id, data.id));
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
    const db = getAppDb();
    const order = await getOrder({ data });

    if (!order) {
      throw new Error("Order of service not found.");
    }

    assertHymnActivitiesHaveSelections(order);
    await assertRequiredTeamsStaffed(db, order);

    if (order.status === "Published") {
      return { id: data, pdfObjectKey: order.pdfObjectKey };
    }

    const craftMyPdfResult = await postOrderToCraftMyPdf({
      data: { orderId: data },
    });
    const pdfUrl = getCraftMyPdfFileUrl(
      craftMyPdfResult.craftMyPdfResponseBody ?? "{}"
    );
    const pdfResponse = await fetch(pdfUrl);

    if (!pdfResponse.ok) {
      throw new Error(
        `Unable to download generated PDF (${pdfResponse.status} ${pdfResponse.statusText}).`
      );
    }

    const pdfObjectKey = getPdfObjectKey(order);
    const pdfFilename =
      pdfObjectKey.split("/").at(-1) ?? "Order of Service.pdf";
    await getPdfBucket().put(pdfObjectKey, pdfResponse.body, {
      httpMetadata: {
        contentDisposition: `attachment; filename="${pdfFilename.replaceAll('"', "'")}"`,
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
    const statements: BatchItem<"sqlite">[] = [
      db
        .update(ordersOfService)
        .set({
          pdfObjectKey,
          publishedAt: timestamp,
          status: "Published",
          updatedAt: timestamp,
        })
        .where(eq(ordersOfService.id, data)),
    ];

    for (const hymnId of hymnIds) {
      statements.push(
        db.insert(hymnPlays).values({
          hymnId,
          id: uuidv4(),
          orderId: data,
          playedOn: order.serviceDate,
        }),
        db
          .update(hymns)
          .set({ lastPlayed: order.serviceDate, updatedAt: timestamp })
          .where(eq(hymns.id, hymnId))
      );
    }

    await db.batch(
      statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]
    );

    return { id: data, pdfObjectKey };
  });

export const getPublishedOrderPdf = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .handler(async ({ data }): Promise<{ base64: string; filename: string }> => {
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
    const delivery = await getAppDb().get<Record<string, unknown>>(
      sql`SELECT * FROM order_email_deliveries WHERE order_id = ${data}`
    );

    return delivery ? mapOrderEmailDeliveryRow(delivery) : null;
  });

export const sendOrderEmail = createServerFn({ method: "POST" })
  .validator((orderId: string) => orderId)
  .handler(async ({ data }): Promise<OrderEmailDeliveryRecord> => {
    const db = getAppDb();
    const order = await getOrder({ data });

    if (!order || order.status !== "Published" || !order.pdfObjectKey) {
      throw new Error("Publish and save the order PDF before sending email.");
    }

    assertHymnActivitiesHaveSelections(order);

    const existingDelivery = await db
      .select({ id: orderEmailDeliveries.id })
      .from(orderEmailDeliveries)
      .where(eq(orderEmailDeliveries.orderId, data))
      .get();

    if (existingDelivery) {
      throw new Error(
        "Email has already been queued for this order of service."
      );
    }

    const [settingsRow, recipientRows] = await Promise.all([
      db
        .select({ value: appSettings.value })
        .from(appSettings)
        .where(eq(appSettings.key, EMAIL_SETTINGS_KEY))
        .get(),
      db
        .select({ email: emailRecipients.email })
        .from(emailRecipients)
        .orderBy(emailRecipients.email),
    ]);
    const storedSettings = settingsRow
      ? (JSON.parse(settingsRow.value) as Partial<EmailSettingsRecord>)
      : {};

    if (
      !(storedSettings.smtpTokenConfigured && storedSettings.smtpUserConfigured)
    ) {
      throw new Error("SMTP settings are not fully configured.");
    }

    const recipients = recipientRows.map((row) => row.email);

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

    await db.insert(orderEmailDeliveries).values({
      id: deliveryId,
      orderId: data,
      queuedAt: timestamp,
      status: "Queued",
      subject,
      updatedAt: timestamp,
    });

    try {
      await getEmailQueue().send(message, { contentType: "json" });
    } catch (error) {
      await db
        .update(orderEmailDeliveries)
        .set({
          errorMessage: getErrorMessage(error, "Unable to queue email."),
          status: "Failed",
          updatedAt: nowIso(),
        })
        .where(eq(orderEmailDeliveries.id, deliveryId));
      throw error;
    }

    const delivery = await db.get<Record<string, unknown>>(
      sql`SELECT * FROM order_email_deliveries WHERE id = ${deliveryId}`
    );

    if (!delivery) {
      throw new Error("Email delivery record could not be loaded.");
    }

    return mapOrderEmailDeliveryRow(delivery);
  });

export const getEmailSettings = createServerFn({ method: "GET" }).handler(
  async (): Promise<EmailSettingsRecord> => {
    const db = getAppDb();
    const [settingsRow, recipientRows] = await Promise.all([
      db
        .select({ value: appSettings.value })
        .from(appSettings)
        .where(eq(appSettings.key, EMAIL_SETTINGS_KEY))
        .get(),
      db
        .select({ email: emailRecipients.email })
        .from(emailRecipients)
        .orderBy(emailRecipients.email),
    ]);
    const storedSettings = settingsRow
      ? (JSON.parse(settingsRow.value) as Partial<EmailSettingsRecord>)
      : {};

    return {
      recipients: recipientRows.map((row) => row.email),
      smtpAddress:
        typeof storedSettings.smtpAddress === "string"
          ? storedSettings.smtpAddress
          : "",
      smtpPort:
        typeof storedSettings.smtpPort === "number"
          ? storedSettings.smtpPort
          : "",
      smtpSenderName:
        typeof storedSettings.smtpSenderName === "string"
          ? storedSettings.smtpSenderName
          : "",
      smtpTokenConfigured: Boolean(storedSettings.smtpTokenConfigured),
      smtpUserConfigured: Boolean(storedSettings.smtpUserConfigured),
    };
  }
);

export const saveEmailSettings = createServerFn({ method: "POST" })
  .validator((data: SaveEmailSettingsInput) => data)
  .handler(async ({ data }): Promise<{ success: true }> => {
    assertValidEmailSettings(data);

    const db = getAppDb();
    const trimmedRecipients = [
      ...new Set(data.recipients.map((email) => email.trim().toLowerCase())),
    ];
    const currentRow = await db
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, EMAIL_SETTINGS_KEY))
      .get();
    const currentSettings = currentRow
      ? (JSON.parse(currentRow.value) as Record<string, unknown>)
      : {};
    const encryptedToken = data.smtpToken
      ? await encryptSetting(data.smtpToken.trim())
      : asString(currentSettings.smtpTokenEncrypted);
    const encryptedUser = data.smtpUser
      ? await encryptSetting(data.smtpUser.trim().toLowerCase())
      : asString(currentSettings.smtpUserEncrypted);

    if (!encryptedToken) {
      throw new Error(
        "SMTP token is required before email settings can be saved."
      );
    }

    if (!encryptedUser) {
      throw new Error(
        "SMTP user is required before email settings can be saved."
      );
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

    const settingsValue = JSON.stringify(settingsToStore);
    const timestamp = nowIso();

    await db.batch([
      db
        .insert(appSettings)
        .values({
          key: EMAIL_SETTINGS_KEY,
          updatedAt: timestamp,
          value: settingsValue,
        })
        .onConflictDoUpdate({
          set: { updatedAt: timestamp, value: settingsValue },
          target: appSettings.key,
        }),
      db.delete(emailRecipients),
      ...trimmedRecipients.map((email) =>
        db.insert(emailRecipients).values({ email, id: uuidv4() })
      ),
    ]);

    return { success: true };
  });

export const addEmailRecipient = createServerFn({ method: "POST" })
  .validator((email: string) => email)
  .handler(async ({ data }): Promise<{ email: string }> => {
    const db = getAppDb();
    const email = data.trim().toLowerCase();
    assertValidEmail(email, "Recipient");
    await db
      .insert(emailRecipients)
      .values({ email, id: uuidv4() })
      .onConflictDoNothing();

    return { email };
  });

export const deleteEmailRecipient = createServerFn({ method: "POST" })
  .validator((email: string) => email)
  .handler(async ({ data }): Promise<{ success: true }> => {
    const db = getAppDb();
    await db
      .delete(emailRecipients)
      .where(eq(emailRecipients.email, data.trim().toLowerCase()));

    return { success: true };
  });

export const getHymns = createServerFn({ method: "GET" }).handler(
  async (): Promise<HymnRecord[]> => {
    const db = getAppDb();
    const results = await db.all<Record<string, unknown>>(
      sql`SELECT hymns.*, hymn_sources.name AS source_name, ${sql.raw(RECENT_HYMN_PLAY_COUNT_SQL)}
        FROM hymns
        JOIN hymn_sources ON hymn_sources.id = hymns.source_id
        ORDER BY CAST(NULLIF(hymn_number, '') AS INTEGER), name`
    );

    return results.map(mapHymnRow);
  }
);

export const getHymnOptions = createServerFn({ method: "GET" }).handler(
  async (): Promise<HymnOption[]> => {
    const db = getAppDb();
    const results = await db.all<Record<string, unknown>>(
      sql`SELECT hymns.id, hymns.hymn_number, hymns.name, hymns.lyrics_markdown, hymns.last_played, hymns.music_key, hymn_sources.name AS source_name
        FROM hymns
        JOIN hymn_sources ON hymn_sources.id = hymns.source_id
        ORDER BY hymn_sources.name, CAST(NULLIF(hymns.hymn_number, '') AS INTEGER), hymns.name`
    );

    return results.map((row) => ({
      hasLyrics: Boolean(asString(row.lyrics_markdown).trim()),
      id: asString(row.id),
      label: [asString(row.hymn_number), asString(row.name)]
        .filter(Boolean)
        .join(" — "),
      lastPlayed: asString(row.last_played),
      musicKey: asString(row.music_key),
      sourceName: asString(row.source_name),
    }));
  }
);

export const getHymn = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .handler(async ({ data }): Promise<HymnRecord | null> => {
    const db = getAppDb();
    const row = await db.get<Record<string, unknown>>(
      sql`SELECT hymns.*, hymn_sources.name AS source_name, ${sql.raw(RECENT_HYMN_PLAY_COUNT_SQL)}
        FROM hymns
        JOIN hymn_sources ON hymn_sources.id = hymns.source_id
        WHERE hymns.id = ${data}`
    );

    return row ? mapHymnRow(row) : null;
  });

export const getHymnFiles = createServerFn({ method: "GET" })
  .validator((hymnId: string) => hymnId)
  .handler(async ({ data }): Promise<HymnFileRecord[]> => {
    const db = getAppDb();
    const results = await db.all<Record<string, unknown>>(
      sql`SELECT * FROM hymn_files WHERE hymn_id = ${data} ORDER BY filename`
    );

    return results.map(mapHymnFileRow);
  });

export const uploadHymnFile = createServerFn({ method: "POST" })
  .validator((data: UploadHymnFileInput) => data)
  .handler(async ({ data }): Promise<HymnFileRecord> => {
    const db = getAppDb();
    const bucket = getPdfBucket();
    const id = uuidv4();
    const filename = data.filename.trim();

    if (!filename) {
      throw new Error("File name is required.");
    }

    const hymn = await db
      .select({ id: hymns.id })
      .from(hymns)
      .where(eq(hymns.id, data.hymnId))
      .get();

    if (!hymn) {
      throw new Error("Hymn not found.");
    }

    const bytes = Buffer.from(data.base64, "base64");
    const objectKey = `hymns/${data.hymnId}/${id}-${slugify(filename)}`;

    await bucket.put(objectKey, bytes, {
      httpMetadata: {
        contentDisposition: `inline; filename="${filename.replaceAll('"', "'")}"`,
        contentType: data.contentType || "application/octet-stream",
      },
    });

    await db.insert(hymnFiles).values({
      contentType: data.contentType || "application/octet-stream",
      filename,
      hymnId: data.hymnId,
      id,
      objectKey,
      sizeBytes: bytes.byteLength,
    });

    const row = await db.get<Record<string, unknown>>(
      sql`SELECT * FROM hymn_files WHERE id = ${id}`
    );

    if (!row) {
      throw new Error("Uploaded hymn file could not be loaded.");
    }

    return mapHymnFileRow(row);
  });

export const renameHymnFile = createServerFn({ method: "POST" })
  .validator((data: RenameHymnFileInput) => data)
  .handler(async ({ data }): Promise<HymnFileRecord> => {
    const db = getAppDb();
    const filename = data.filename.trim();

    if (!filename) {
      throw new Error("File name is required.");
    }

    await db
      .update(hymnFiles)
      .set({ filename, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(hymnFiles.id, data.id));

    const row = await db.get<Record<string, unknown>>(
      sql`SELECT * FROM hymn_files WHERE id = ${data.id}`
    );

    if (!row) {
      throw new Error("Hymn file not found.");
    }

    return mapHymnFileRow(row);
  });

export const deleteHymnFile = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(async ({ data }): Promise<void> => {
    const db = getAppDb();
    const bucket = getPdfBucket();
    const row = await db
      .select({ objectKey: hymnFiles.objectKey })
      .from(hymnFiles)
      .where(eq(hymnFiles.id, data))
      .get();

    if (!row) {
      return;
    }

    await bucket.delete(row.objectKey);
    await db.delete(hymnFiles).where(eq(hymnFiles.id, data));
  });

export const getHymnFileDownload = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .handler(async ({ data }): Promise<HymnFileDownload> => {
    const db = getAppDb();
    const bucket = getPdfBucket();
    const row = await db.get<Record<string, unknown>>(
      sql`SELECT * FROM hymn_files WHERE id = ${data}`
    );

    if (!row) {
      throw new Error("Hymn file not found.");
    }

    const file = mapHymnFileRow(row);
    const object = await bucket.get(file.objectKey);

    if (!object) {
      throw new Error("Hymn file was not found in R2 storage.");
    }

    const arrayBuffer = await object.arrayBuffer();

    return {
      base64: Buffer.from(arrayBuffer).toString("base64"),
      contentType: file.contentType,
      filename: file.filename,
    };
  });

export const saveHymn = createServerFn({ method: "POST" })
  .validator((data: SaveHymnInput) => data)
  .handler(async ({ data }): Promise<{ id: string }> => {
    const db = getAppDb();
    const id = data.id || uuidv4();
    const timestamp = nowIso();
    const values = {
      hymnNumber: data.hymnNumber.trim(),
      id,
      lastPlayed: data.lastPlayed.trim(),
      lyricsMarkdown: data.lyricsMarkdown,
      musicKey: data.musicKey.trim(),
      name: data.name.trim() || "Untitled Hymn",
      sourceId: data.sourceId,
      updatedAt: timestamp,
    };
    await db
      .insert(hymns)
      .values(values)
      .onConflictDoUpdate({
        set: {
          hymnNumber: values.hymnNumber,
          lastPlayed: values.lastPlayed,
          lyricsMarkdown: values.lyricsMarkdown,
          musicKey: values.musicKey,
          name: values.name,
          sourceId: values.sourceId,
          updatedAt: timestamp,
        },
        target: hymns.id,
      });

    return { id };
  });

export const deleteHymn = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(async ({ data }): Promise<{ success: true }> => {
    const db = getAppDb();
    await db.delete(hymns).where(eq(hymns.id, data));

    return { success: true };
  });

const TEAM_MEMBER_SELECT = `
  SELECT team_members.*,
    (SELECT GROUP_CONCAT(team_id) FROM team_member_teams WHERE member_id = team_members.id) AS team_ids
  FROM team_members
`;

const attachTeamNames = (
  members: TeamMember[],
  teamsLookup: Map<string, Team>
): TeamMemberSummary[] =>
  members.map((member) => ({
    ...member,
    teamNames: memberTeamNames(member, teamsLookup),
  }));

export const getTeams = createServerFn({ method: "GET" }).handler(
  async (): Promise<TeamSummary[]> => {
    const db = getAppDb();
    const results = await db.all<Record<string, unknown>>(
      sql`${sql.raw(TEAM_SUMMARY_SELECT)} ORDER BY teams.name`
    );

    return results.map(mapTeamSummaryRow);
  }
);

export const getTeam = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .handler(async ({ data }): Promise<TeamRecord | null> => {
    const db = getAppDb();
    const [teamRow, memberRows, teamsLookup] = await Promise.all([
      db.get<Record<string, unknown>>(
        sql`${sql.raw(TEAM_SUMMARY_SELECT)} WHERE teams.id = ${data}`
      ),
      db.all<Record<string, unknown>>(
        sql`${sql.raw(TEAM_MEMBER_SELECT)} WHERE team_members.id IN (SELECT member_id FROM team_member_teams WHERE team_id = ${data}) ORDER BY team_members.last_name, team_members.first_name`
      ),
      loadTeamsById(db),
    ]);

    if (!teamRow) {
      return null;
    }

    return {
      ...mapTeamSummaryRow(teamRow),
      members: attachTeamNames(memberRows.map(mapTeamMemberRow), teamsLookup),
    };
  });

export const saveTeam = createServerFn({ method: "POST" })
  .validator((data: SaveTeamInput) => data)
  .handler(async ({ data }): Promise<{ id: string }> => {
    const db = getAppDb();
    const name = data.name.trim();

    if (!name) {
      throw new Error("Team name is required.");
    }

    const id = data.id || uuidv4();
    const parentTeamId = data.parentTeamId?.trim() || null;

    if (parentTeamId) {
      const teamRows = await db.all<Record<string, unknown>>(
        sql`SELECT id, parent_team_id FROM teams`
      );
      const parentError = validateTeamParent({
        id,
        parentTeamId,
        teams: teamRows.map((row) => ({
          id: asString(row.id),
          parentTeamId: asString(row.parent_team_id) || undefined,
        })),
      });

      if (parentError) {
        throw new Error(parentError);
      }
    }

    const timestamp = nowIso();
    await db
      .insert(teams)
      .values({ id, name, parentTeamId, updatedAt: timestamp })
      .onConflictDoUpdate({
        set: { name, parentTeamId, updatedAt: timestamp },
        target: teams.id,
      });

    return { id };
  });

const cardReferencesTeam = (
  card: {
    optionalTeamIds?: string[];
    requiredTeamIds?: string[];
    teamAssignments?: { teamId: string }[];
  },
  teamId: string
): boolean =>
  (card.requiredTeamIds ?? []).includes(teamId) ||
  (card.optionalTeamIds ?? []).includes(teamId) ||
  (card.teamAssignments ?? []).some(
    (assignment) => assignment.teamId === teamId
  );

/**
 * Find templates and orders whose JSON still references a team. Team ids live
 * inside `template_json`/`order_json`, beyond the reach of D1 foreign keys, so
 * deletion must consult this before removing the team row.
 */
const findTeamReferences = async (
  db: AppDatabase,
  teamId: string
): Promise<{ orders: string[]; templates: string[] }> => {
  const [templateRows, orderRows] = await Promise.all([
    db.all<Record<string, unknown>>(
      sql`SELECT name, template_json FROM order_service_templates`
    ),
    db.all<Record<string, unknown>>(
      sql`SELECT title, service_date, order_json FROM orders_of_service`
    ),
  ]);

  const templates = templateRows
    .filter((row) =>
      parseTemplateJson(
        asString(row.template_json),
        asString(row.name)
      ).service_type.some((card) => cardReferencesTeam(card, teamId))
    )
    .map((row) => asString(row.name));

  const orders = orderRows
    .filter((row) =>
      parseTemplateJson(
        asString(row.order_json),
        asString(row.title)
      ).service_type.some((card) => cardReferencesTeam(card, teamId))
    )
    .map((row) => asString(row.title) || asString(row.service_date));

  return { orders, templates };
};

export const deleteTeam = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(async ({ data }): Promise<{ success: true }> => {
    const db = getAppDb();

    const { orders, templates } = await findTeamReferences(db, data);

    if (templates.length > 0 || orders.length > 0) {
      const parts: string[] = [];

      if (templates.length > 0) {
        parts.push(`${templates.length} template(s): ${templates.join(", ")}`);
      }

      if (orders.length > 0) {
        parts.push(`${orders.length} order(s): ${orders.join(", ")}`);
      }

      throw new Error(
        `Remove this team from ${parts.join(" and ")} before deleting it.`
      );
    }

    await db.batch([
      db
        .update(teams)
        .set({ parentTeamId: null })
        .where(eq(teams.parentTeamId, data)),
      db.delete(teamMemberTeams).where(eq(teamMemberTeams.teamId, data)),
      db.delete(teams).where(eq(teams.id, data)),
    ]);

    return { success: true };
  });

export const getTeamTemplates = createServerFn({ method: "GET" })
  .validator((teamId: string) => teamId)
  .handler(async ({ data }): Promise<TemplateOption[]> => {
    const db = getAppDb();
    const results = await db.all<Record<string, unknown>>(
      sql`SELECT id, name, template_json FROM order_service_templates ORDER BY name`
    );

    return results
      .filter((row) => {
        const template = parseTemplateJson(
          asString(row.template_json),
          asString(row.name)
        );

        return template.service_type.some(
          (card) =>
            (card.requiredTeamIds ?? []).includes(data) ||
            (card.optionalTeamIds ?? []).includes(data)
        );
      })
      .map((row) => ({ id: asString(row.id), name: asString(row.name) }));
  });

export const getTeamMembers = createServerFn({ method: "GET" }).handler(
  async (): Promise<TeamMemberSummary[]> => {
    const db = getAppDb();
    const [memberRows, teamsLookup] = await Promise.all([
      db.all<Record<string, unknown>>(
        sql`${sql.raw(TEAM_MEMBER_SELECT)} ORDER BY team_members.last_name, team_members.first_name`
      ),
      loadTeamsById(db),
    ]);

    return attachTeamNames(memberRows.map(mapTeamMemberRow), teamsLookup);
  }
);

export const getTeamMember = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .handler(async ({ data }): Promise<TeamMember | null> => {
    const db = getAppDb();
    const row = await db.get<Record<string, unknown>>(
      sql`${sql.raw(TEAM_MEMBER_SELECT)} WHERE team_members.id = ${data}`
    );

    return row ? mapTeamMemberRow(row) : null;
  });

export const saveTeamMember = createServerFn({ method: "POST" })
  .validator((data: SaveTeamMemberInput) => data)
  .handler(async ({ data }): Promise<{ id: string }> => {
    const validationErrors = validateTeamMember(data);

    if (validationErrors.length > 0) {
      throw new Error(validationErrors[0]);
    }

    const db = getAppDb();
    const id = data.id || uuidv4();
    const teamIds = [...new Set(data.teamIds.filter(Boolean))];
    const timestamp = nowIso();
    const memberValues = {
      email: data.email.trim(),
      firstName: data.firstName.trim(),
      lastName: data.lastName.trim(),
      notes: data.notes,
      phone: data.phone.trim(),
      updatedAt: timestamp,
    };

    await db.batch([
      db
        .insert(teamMembers)
        .values({ id, ...memberValues })
        .onConflictDoUpdate({ set: memberValues, target: teamMembers.id }),
      db.delete(teamMemberTeams).where(eq(teamMemberTeams.memberId, id)),
      ...teamIds.map((teamId) =>
        db
          .insert(teamMemberTeams)
          .values({ memberId: id, teamId })
          .onConflictDoNothing()
      ),
    ]);

    return { id };
  });

export const deleteTeamMember = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(async ({ data }): Promise<{ success: true }> => {
    const db = getAppDb();

    await db.batch([
      db.delete(teamMemberTeams).where(eq(teamMemberTeams.memberId, data)),
      db.delete(teamMembers).where(eq(teamMembers.id, data)),
    ]);

    return { success: true };
  });

export const addMemberToTeam = createServerFn({ method: "POST" })
  .validator((data: TeamMembershipInput) => data)
  .handler(async ({ data }): Promise<{ success: true }> => {
    const db = getAppDb();
    await db
      .insert(teamMemberTeams)
      .values({ memberId: data.memberId, teamId: data.teamId })
      .onConflictDoNothing();

    return { success: true };
  });

export const removeMemberFromTeam = createServerFn({ method: "POST" })
  .validator((data: TeamMembershipInput) => data)
  .handler(async ({ data }): Promise<{ success: true }> => {
    const db = getAppDb();
    await db
      .delete(teamMemberTeams)
      .where(
        and(
          eq(teamMemberTeams.teamId, data.teamId),
          eq(teamMemberTeams.memberId, data.memberId)
        )
      );

    return { success: true };
  });
