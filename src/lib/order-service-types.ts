export type ServiceStatus = "Planning" | "Published";

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

export interface ServiceTypeCard {
  activities: OrderActivity[];
  id: string;
  typeName: string;
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

export interface HymnOption {
  id: string;
  label: string;
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

export interface SaveHymnInput {
  hymnNumber: string;
  id?: string;
  lastPlayed: string;
  lyricsMarkdown: string;
  musicKey: string;
  name: string;
  sourceId: string;
}
