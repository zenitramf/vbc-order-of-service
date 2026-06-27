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
  smtpSettingsKey: "email.smtp";
  subject: string;
}

export interface HymnRecord {
  hymnNumber: string;
  id: string;
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

export interface DashboardData {
  hymnCount: number;
  planningCount: number;
  previousOrders: OrderSummary[];
  publishedCount: number;
  templateCount: number;
  upcomingOrders: OrderSummary[];
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
  lastPlayed: string;
  lyricsMarkdown: string;
  musicKey: string;
  name: string;
  sourceId: string;
  sourceName: string;
  timesPlayedLastSixMonths: number;
}

export interface CraftMyPdfOrderPayloadActivity extends OrderActivity {
  hymn?: CraftMyPdfOrderPayloadHymn;
}

export interface CraftMyPdfOrderPayloadSegment {
  activities: CraftMyPdfOrderPayloadActivity[];
  id: string;
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

export interface EmailSettingsRecord {
  recipients: string[];
  smtpAddress: string;
  smtpPort: number | "";
  smtpSenderName: string;
  smtpTokenConfigured: boolean;
  smtpUserConfigured: boolean;
}

export interface SaveEmailSettingsInput {
  recipients: string[];
  smtpAddress: string;
  smtpPort: number;
  smtpSenderName: string;
  smtpToken?: string;
  smtpUser?: string;
}

export interface SaveHymnInput {
  hymnNumber: string;
  id?: string;
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
