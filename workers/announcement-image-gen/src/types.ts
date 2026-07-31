/**
 * Minimal types for the image-gen Worker.
 * Kept self-contained so the consumer bundle never pulls TanStack / GrapesJS.
 * Message shape must stay in sync with `AnnouncementImageGenQueueMessage` in
 * `src/lib/announcement-types.ts` (main app enqueue path).
 */

export const ANNOUNCEMENT_WIDTH = 1920;
export const ANNOUNCEMENT_HEIGHT = 1080;
export const ANNOUNCEMENT_ASPECT_RATIO = "16:9" as const;

export const ANNOUNCEMENT_IMAGE_MODEL = "google/nano-banana-2" as const;
export const ANNOUNCEMENT_IMAGE_RESOLUTION = "1K" as const;
export const ANNOUNCEMENT_IMAGE_REF_MAX_BYTES = 400 * 1024;

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

/** Queue message — keep under 128 KB; R2 keys only, never image bytes. */
export interface AnnouncementImageGenQueueMessage {
  announcementId: string;
  count: number;
  jobId: string;
  parentVariationId: string | null;
  prompt: string;
  referenceObjectKey: string | null;
}

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
