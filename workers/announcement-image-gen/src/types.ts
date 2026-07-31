/**
 * Minimal types for the announcement AI Worker (background + layout).
 * Kept self-contained so the consumer bundle never pulls TanStack / GrapesJS.
 * Message shapes must stay in sync with `src/lib/announcement-types.ts`.
 */

export const ANNOUNCEMENT_WIDTH = 1920;
export const ANNOUNCEMENT_HEIGHT = 1080;
export const ANNOUNCEMENT_ASPECT_RATIO = "16:9" as const;

export const ANNOUNCEMENT_IMAGE_MODEL = "google/nano-banana-2" as const;
export const ANNOUNCEMENT_IMAGE_RESOLUTION = "1K" as const;
export const ANNOUNCEMENT_IMAGE_REF_MAX_BYTES = 400 * 1024;

/** Layout ops (CanvasPlan) via structured JSON schema output. */
export const LAYOUT_MODEL = "xai/grok-4.5" as const;
export const LAYOUT_MODEL_FALLBACK = "xai/grok-4.3" as const;

export type AnnouncementStatus = "draft" | "approved";

export type AnnouncementVariationSource = "generated" | "library";

export interface AnnouncementVariation {
  createdAt: string;
  id: string;
  libraryFilename: string | null;
  libraryImageId: string | null;
  objectKey: string;
  parentVariationId: string | null;
  prompt: string;
  source: AnnouncementVariationSource;
}

export type AnnouncementGenerationStatus =
  | "idle"
  | "queued"
  | "running"
  | "completed"
  | "failed";

export interface AnnouncementGenerationJob {
  completedCount: number;
  error: string | null;
  id: string;
  prompt: string;
  requestedCount: number;
  startedAt: string | null;
  status: AnnouncementGenerationStatus;
  updatedAt: string;
  useSelectedAsContext: boolean;
}

/** Structured CanvasPlan stored on layout jobs (opaque to draft helpers). */
export interface CanvasPlanJson {
  basePresetId?: string | null;
  mode: "rebuild";
  ops: unknown[];
  version: 1;
}

export interface AnnouncementLayoutJob {
  error: string | null;
  id: string;
  plan: CanvasPlanJson | null;
  startedAt: string | null;
  status: AnnouncementGenerationStatus;
  styleNotes: string;
  updatedAt: string;
}

/** Queue message — keep under 128 KB; R2 keys only, never image bytes. */
export interface AnnouncementBackgroundGenQueueMessage {
  announcementId: string;
  count: number;
  jobId: string;
  parentVariationId: string | null;
  prompt: string;
  referenceObjectKey: string | null;
  type?: "background";
}

export interface AnnouncementLayoutGenQueueMessage {
  announcementId: string;
  jobId: string;
  styleNotes: string;
  type: "layout";
}

export type AnnouncementAiQueueMessage =
  | AnnouncementBackgroundGenQueueMessage
  | AnnouncementLayoutGenQueueMessage;

/** @deprecated Prefer AnnouncementBackgroundGenQueueMessage */
export type AnnouncementImageGenQueueMessage =
  AnnouncementBackgroundGenQueueMessage;

export interface AnnouncementContent {
  heading: string;
  subtitle: string;
  tertiary: string;
  title: string;
}

/** GrapesJS project JSON — opaque to this Worker; round-tripped via R2. */
export type GrapesProjectData = Record<string, unknown>;

export interface AnnouncementDraft {
  appliedStyleId: string | null;
  approvedAt: string | null;
  backgroundPrompt: string;
  content: AnnouncementContent;
  createdAt: string;
  exportObjectKey: string | null;
  generationJob: AnnouncementGenerationJob | null;
  height: number;
  id: string;
  layoutJob: AnnouncementLayoutJob | null;
  legacyHtml: string | null;
  name: string;
  projectData: GrapesProjectData | null;
  selectedVariationId: string | null;
  showInPresentationDeck: boolean;
  status: AnnouncementStatus;
  updatedAt: string;
  variations: AnnouncementVariation[];
  width: number;
}

export interface AnnouncementSummary {
  approvedAt: string | null;
  createdAt: string;
  exportObjectKey: string | null;
  id: string;
  name: string;
  previewObjectKey: string | null;
  selectedVariationId: string | null;
  showInPresentationDeck: boolean;
  status: AnnouncementStatus;
  updatedAt: string;
  variationCount: number;
}

export interface AnnouncementAsset {
  base64: string;
  contentType: string;
}

export const isLayoutQueueMessage = (
  body: unknown
): body is AnnouncementLayoutGenQueueMessage =>
  typeof body === "object" &&
  body !== null &&
  (body as AnnouncementLayoutGenQueueMessage).type === "layout" &&
  typeof (body as AnnouncementLayoutGenQueueMessage).announcementId ===
    "string" &&
  typeof (body as AnnouncementLayoutGenQueueMessage).jobId === "string";

export const isBackgroundQueueMessage = (
  body: unknown
): body is AnnouncementBackgroundGenQueueMessage => {
  if (typeof body !== "object" || body === null) {
    return false;
  }

  const record = body as Record<string, unknown>;

  if (record.type === "layout") {
    return false;
  }

  return (
    typeof record.announcementId === "string" &&
    typeof record.jobId === "string" &&
    typeof record.prompt === "string"
  );
};
