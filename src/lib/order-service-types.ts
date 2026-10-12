export type ServiceStatus = "Planning" | "Published";
export type OrderEmailStatus = "Queued" | "Sending" | "Sent" | "Failed";

export type ActivityTypeId =
  | "hymn"
  | "prayer"
  | "scripture_reading"
  | "hand_shaking"
  | "offertory"
  | "preaching"
  | "invitation"
  | "special_music"
  | "bible_preaching"
  | "custom";

export interface OrderActivity {
  activityName: string;
  activityType: string;
  hymnId?: string;
  id: string;
  notes?: string;
}

export interface TeamAssignment {
  memberIds: string[];
  teamId: string;
}

export interface ServiceTypeCard {
  activities: OrderActivity[];
  id: string;
  /** Order-level: members assigned to teams for this service card. */
  teamAssignments?: TeamAssignment[];
  typeName: string;
  /** Template-level: teams that may optionally be staffed for this card. */
  optionalTeamIds?: string[];
  /** Template-level: teams that must be staffed before publishing. */
  requiredTeamIds?: string[];
  /**
   * Template-level: how many members each required team needs before an order
   * can be published, keyed by team id (1-10). Teams without an entry fall back
   * to the minimum of one.
   */
  requiredTeamCounts?: Record<string, number>;
}

export interface OrderServiceTemplateJson {
  name: string;
  service_type: ServiceTypeCard[];
}

export interface ReferenceOption {
  id: string;
  name: string;
}

export interface TemplateSummary {
  activityCount: number;
  id: string;
  name: string;
  segmentCount: number;
  serviceTypeName: string;
  updatedAt: string;
}

export interface TemplateRecord extends TemplateSummary {
  serviceTypeId: string;
  template: OrderServiceTemplateJson;
}

export interface OrderSummary {
  activityCount: number;
  id: string;
  segmentCount: number;
  serviceDate: string;
  serviceTypeName: string;
  status: ServiceStatus;
  title: string;
  updatedAt: string;
}

export interface OrderRecord extends OrderSummary {
  order: OrderServiceTemplateJson;
  pdfObjectKey?: string;
  publishedAt?: string;
  serviceTypeId: string;
  templateId?: string;
}

export interface OrderEmailDeliveryRecord {
  errorMessage?: string;
  id: string;
  orderId: string;
  queuedAt: string;
  sentAt?: string;
  status: OrderEmailStatus;
  subject: string;
}

export interface OrderEmailQueueMessage {
  attachment: {
    bucket: string;
    contentType: "application/pdf";
    filename: string;
    objectKey: string;
  };
  body: "See attachment";
  deliveryId: string;
  orderId: string;
  recipients: string[];
  /** Resend-era field name; accepted on consume for in-flight messages. */
  settingsKey?: "email.smtp";
  smtpSettingsKey: "email.smtp";
  subject: string;
}

/**
 * Queue message for a plain-text email that is not tied to an order (for
 * example auth emails such as new-user onboarding and password resets).
 */
export interface PlainEmailQueueMessage {
  subject: string;
  text: string;
  to: string[];
  type: "plain";
}

/**
 * Queue message that posts a published order PDF to the Microsoft Teams
 * channel. It is delivered as an email to the channel's email address, which
 * Teams renders as a channel post with the PDF attached.
 */
export interface TeamsChannelQueueMessage {
  attachment: {
    bucket: string;
    contentType: "application/pdf";
    filename: string;
    objectKey: string;
  };
  orderId: string;
  subject: string;
  text: string;
  to: string;
  type: "teams-channel";
}

export type EmailQueueMessage =
  | OrderEmailQueueMessage
  | PlainEmailQueueMessage
  | TeamsChannelQueueMessage;

export type HymnLanguage = "english" | "spanish";

export interface HymnRecord {
  hymnNumber: string;
  id: string;
  language: HymnLanguage;
  lastPlayed: string;
  lyricsMarkdown: string;
  musicKey: string;
  name: string;
  sourceId: string;
  sourceName: string;
  timesPlayedLastSixMonths: number;
}

export interface HymnFileRecord {
  contentType: string;
  createdAt: string;
  filename: string;
  hymnId: string;
  id: string;
  objectKey: string;
  sizeBytes: number;
  updatedAt: string;
}

export interface UploadHymnFileInput {
  base64: string;
  contentType: string;
  filename: string;
  hymnId: string;
}

export interface RenameHymnFileInput {
  filename: string;
  id: string;
}

export interface HymnFileDownload {
  base64: string;
  contentType: string;
  filename: string;
}

export interface HymnOption {
  hasLyrics: boolean;
  id: string;
  label: string;
  lastPlayed: string;
  musicKey: string;
  sourceName: string;
}

/** A member as named on an at-a-glance roster. */
export interface RosterMember {
  firstName: string;
  id: string;
  lastName: string;
}

/** One team's staffing on one service card, ready for display. */
export interface RosterTeam {
  assignedCount: number;
  members: RosterMember[];
  /** Required members still missing; 0 when staffed or optional. */
  missingCount: number;
  parentName?: string;
  required: boolean;
  requiredCount: number;
  teamId: string;
  teamName: string;
}

/** The staffed teams of a single service card (timeblock). */
export interface RosterCard {
  cardId: string;
  cardName: string;
  teams: RosterTeam[];
}

/** Who serves where on an order, plus what still needs attention. */
export interface OrderRoster {
  cards: RosterCard[];
  hasTeams: boolean;
  /** Hymn activities with no hymn selected yet. */
  missingHymnCount: number;
  /** (Card, team) pairs whose required team is understaffed. */
  missingRequiredCount: number;
}

/** An order summary together with its at-a-glance roster. */
export interface OrderOverview extends OrderSummary {
  roster: OrderRoster;
}

export interface DashboardData {
  hymnCount: number;
  /** Current month as YYYY-MM, for planner links. */
  month: string;
  /** Every order in the current month, earliest first. */
  monthOrders: OrderOverview[];
  /** The next service on or after today, whatever weekday it falls on. */
  nextOrder: OrderOverview | null;
  nextSundayDate: string;
  nextSundayOrder: OrderOverview | null;
  planningCount: number;
  previousOrders: OrderOverview[];
  publishedCount: number;
  teamCount: number;
  teamMemberCount: number;
  teams: TeamSummary[];
  templateCount: number;
  upcomingOrders: OrderOverview[];
}

export interface ReferenceData {
  activityTypes: ReferenceOption[];
  hymnSources: ReferenceOption[];
  serviceTypes: ReferenceOption[];
}

export interface SaveTemplateInput {
  id?: string;
  name: string;
  template: OrderServiceTemplateJson;
}

export interface SaveOrderInput {
  id: string;
  order: OrderServiceTemplateJson;
  serviceDate: string;
  serviceTypeId: string;
  title: string;
}

export interface CreateOrderInput {
  serviceDate: string;
  templateId: string;
  title: string;
}

export interface CraftMyPdfOrderPayloadHymn {
  hymnNumber: string;
  id: string;
  language: HymnLanguage;
  lastPlayed: string;
  musicKey: string;
  name: string;
  sourceId: string;
  sourceName: string;
  timesPlayedLastSixMonths: number;
}

export interface CraftMyPdfOrderPayloadActivity extends OrderActivity {
  hymn?: CraftMyPdfOrderPayloadHymn;
}

export interface CraftMyPdfOrderPayloadTeamMember {
  email: string;
  fullName: string;
  id: string;
  phone: string;
}

export interface CraftMyPdfOrderPayloadTeamAssignment {
  members: CraftMyPdfOrderPayloadTeamMember[];
  teamId: string;
}

export interface CraftMyPdfOrderPayloadSegment {
  activities: CraftMyPdfOrderPayloadActivity[];
  id: string;
  teamAssignments: CraftMyPdfOrderPayloadTeamAssignment[];
  typeName: string;
}

export interface CraftMyPdfOrderPayload {
  generatedAt: string;
  order: {
    name: string;
    service_type: CraftMyPdfOrderPayloadSegment[];
  };
  orderId: string;
  publishedAt?: string;
  serviceDate: string;
  serviceTypeId: string;
  serviceTypeName: string;
  status: ServiceStatus;
  templateId?: string;
  title: string;
  updatedAt: string;
}

export interface SendOrderToCraftMyPdfInput {
  dryRun?: boolean;
  orderId: string;
  templateId?: string;
}

/** SMTP credential flavor: mailbox password/app password, or Entra OAuth2. */
export type SmtpAuthType = "oauth2" | "password";

export interface EmailSettingsRecord {
  oauthClientId: string;
  oauthClientSecretConfigured: boolean;
  oauthTenantId: string;
  recipients: string[];
  smtpAddress: string;
  smtpAuthType: SmtpAuthType;
  smtpPort: number | "";
  smtpSenderName: string;
  smtpTokenConfigured: boolean;
  smtpUserConfigured: boolean;
}

export interface TeamsSettingsRecord {
  channelEmail: string;
}

export interface SaveTeamsSettingsInput {
  channelEmail: string;
}

export type TeamsPostSkipReason =
  | "invalid-email"
  | "not-configured"
  | "queue-failed"
  | "smtp-not-configured";

export interface TeamsPostResult {
  channelEmail?: string;
  queued: boolean;
  reason?: TeamsPostSkipReason;
}

export interface PublishOrderResult {
  dryRun?: boolean;
  id: string;
  pdfObjectKey?: string;
  teamsPost?: TeamsPostResult;
}

export interface SaveEmailSettingsInput {
  /** Omit to keep the currently stored Entra application (client) ID. */
  oauthClientId?: string;
  /** Omit to keep the currently stored Entra client secret. */
  oauthClientSecret?: string;
  /** Omit to keep the currently stored Entra directory (tenant) ID. */
  oauthTenantId?: string;
  recipients: string[];
  smtpAddress: string;
  smtpAuthType: SmtpAuthType;
  smtpPort: number;
  smtpSenderName: string;
  smtpToken?: string;
  smtpUser?: string;
}

export interface SaveHymnInput {
  hymnNumber: string;
  id?: string;
  language?: HymnLanguage;
  lastPlayed: string;
  lyricsMarkdown: string;
  musicKey: string;
  name: string;
  sourceId: string;
}

export interface Team {
  id: string;
  name: string;
  parentTeamId?: string;
}

export interface TeamSummary extends Team {
  memberCount: number;
  parentName?: string;
}

export interface TeamMember {
  email: string;
  firstName: string;
  id: string;
  lastName: string;
  notes: string;
  phone: string;
  teamIds: string[];
}

export interface TeamMemberSummary extends TeamMember {
  teamNames: string[];
}

/** A team together with the members currently assigned to it. */
export interface TeamRecord extends TeamSummary {
  members: TeamMemberSummary[];
}

/** A node in the team hierarchy (top-level teams hold their sub-teams). */
export interface TeamTreeNode extends TeamSummary {
  children: TeamTreeNode[];
}

export interface SaveTeamInput {
  id?: string;
  name: string;
  parentTeamId?: string;
}

export interface SaveTeamMemberInput {
  email: string;
  firstName: string;
  id?: string;
  lastName: string;
  notes: string;
  phone: string;
  teamIds: string[];
}

export interface TeamMembershipInput {
  memberId: string;
  teamId: string;
}

export interface TemplateOption {
  id: string;
  name: string;
}

/** A pre-populatable weekday and the template used to create its orders. */
export interface MonthPlanningDayConfig {
  /** Title applied to orders generated for this weekday. */
  defaultTitle: string;
  /** Template used to create orders for this weekday. */
  templateId: string;
  /** Day of week, Sunday = 0 ... Saturday = 6. */
  weekday: number;
}

/** Month Planner configuration stored under the `monthPlanning` settings key. */
export interface MonthPlanningSettings {
  prepopulateDays: MonthPlanningDayConfig[];
}

/** A configured service date within a month and its planning state. */
export interface MonthPlanServiceDate {
  /** ISO date (YYYY-MM-DD). */
  date: string;
  dayConfig: MonthPlanningDayConfig;
  /** The existing order for this date, when one has been created. */
  order?: OrderOverview;
  /** Whether an order should exist for this date per the configuration. */
  shouldExist: boolean;
  /** The template assigned to this date's weekday, when it still exists. */
  templateName: string;
}

/** A service card in the month that can be staffed for a given team. */
export interface MonthScheduleTarget {
  teamId: string;
  teamName: string;
}

/** A single staffable card on a planned order for the schedule dialog. */
export interface MonthScheduleCard {
  cardId: string;
  cardName: string;
  date: string;
  memberIds: string[];
  optional: boolean;
  orderId: string;
  orderTitle: string;
  required: boolean;
  requiredCount: number;
}

/** Everything the month planner route needs to render a month. */
export interface MonthPlanData {
  /** Selected month as YYYY-MM. */
  month: string;
  /** Number of configured dates still missing an order. */
  missingCount: number;
  /** Staffable cards for existing orders, keyed by team id. */
  scheduleCards: Record<string, MonthScheduleCard[]>;
  scheduleTargets: MonthScheduleTarget[];
  serviceDates: MonthPlanServiceDate[];
  settings: MonthPlanningSettings;
  /** Settings weekdays enabled but missing a valid template. */
  unconfiguredWeekdays: number[];
  teamMembers: TeamMemberSummary[];
  teams: TeamSummary[];
}

export interface PlanMonthInput {
  month: string;
}

/** One card's new member ids for a team, used by the monthly scheduler. */
export interface MonthScheduleAssignmentInput {
  cardId: string;
  memberIds: string[];
  orderId: string;
}

export interface SaveMonthScheduleInput {
  assignments: MonthScheduleAssignmentInput[];
  teamId: string;
}
