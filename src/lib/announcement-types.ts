import type { CanvasPlan } from "~/lib/announcement-ai-plan";

/** Canvas dimensions for announcement outputs (16:9 Full HD). */
export const ANNOUNCEMENT_WIDTH = 1920;
export const ANNOUNCEMENT_HEIGHT = 1080;
export const ANNOUNCEMENT_ASPECT_RATIO = "16:9" as const;

/**
 * Default AI Gateway model for announcement background image generation.
 * Used by the queue consumer to call `env.AI.run`, and by the editor UI as the
 * display label for which model will produce the image.
 */
export const ANNOUNCEMENT_IMAGE_MODEL = "google/nano-banana-2" as const;

export type AnnouncementStatus = "draft" | "approved";

/** JSON-serializable object map (TanStack server-fn compatible). */
export interface JsonObject {
  [key: string]: JsonValue;
}

/** JSON-serializable values (TanStack server-fn compatible). */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | JsonObject;

/**
 * GrapesJS project JSON (`editor.getProjectData()` / `loadProjectData()`).
 * Canonical editor persistence — do not reconstruct from HTML alone.
 * @see https://grapesjs.com/docs/modules/Storage.html
 */
export type GrapesProjectData = JsonObject;

export interface AnnouncementContent {
  heading: string;
  subtitle: string;
  tertiary: string;
  title: string;
}

/**
 * Live canvas snapshot from GrapesJS.
 * `projectData` is what we persist; `exportHtml` is ephemeral (export / code view only).
 */
export interface AnnouncementCanvasSnapshot {
  /** Derived overlay HTML for JPG export and advanced code view — never persisted. */
  exportHtml: string;
  projectData: GrapesProjectData;
}

/** @deprecated Use AnnouncementCanvasSnapshot */
export type AnnouncementDocument = AnnouncementCanvasSnapshot;

/** Where a background variation originated. */
export type AnnouncementVariationSource = "generated" | "library";

export interface AnnouncementVariation {
  createdAt: string;
  id: string;
  /** Original library image filename when `source` is `"library"`. */
  libraryFilename: string | null;
  /** Original library image id when `source` is `"library"`. */
  libraryImageId: string | null;
  objectKey: string;
  parentVariationId: string | null;
  prompt: string;
  /** `"library"` for template images copied from the image library. */
  source: AnnouncementVariationSource;
}

/** Lifecycle of an async background image generation job (Queue consumer). */
export type AnnouncementGenerationStatus =
  | "idle"
  | "queued"
  | "running"
  | "completed"
  | "failed";

/** In-flight / last-finished AI background generation job stored on the draft. */
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

/**
 * Queue message for announcement image generation.
 * Keep under 128 KB — pass R2 keys, never image bytes.
 */
export interface AnnouncementImageGenQueueMessage {
  announcementId: string;
  count: number;
  jobId: string;
  parentVariationId: string | null;
  prompt: string;
  /** R2 object key for reference context; never base64. */
  referenceObjectKey: string | null;
}

export interface AnnouncementDraft {
  /** Last-applied style library pack id (informational; styles bake into project). */
  appliedStyleId: string | null;
  approvedAt: string | null;
  backgroundPrompt: string;
  content: AnnouncementContent;
  createdAt: string;
  exportObjectKey: string | null;
  /** Async AI background generation job state (null when never started). */
  generationJob: AnnouncementGenerationJob | null;
  height: number;
  id: string;
  /**
   * One-shot seed from R2 drafts that still store a legacy `html` field.
   * Populated on read only when `projectData` is missing; never written back.
   * Client migrates: load HTML → getProjectData → save projectData (html dropped).
   */
  legacyHtml: string | null;
  name: string;
  /**
   * GrapesJS project JSON — sole persistence format for the visual editor.
   * Null until the first canvas save / client migration from legacyHtml.
   */
  projectData: GrapesProjectData | null;
  selectedVariationId: string | null;
  /**
   * When true and status is `approved`, include this announcement in the
   * public presentation deck slideshow.
   */
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

/** Slide payload for the unauthenticated presentation deck. */
export interface PresentationSlide {
  base64: string;
  contentType: string;
  id: string;
  name: string;
}

export interface SetShowInPresentationDeckInput {
  id: string;
  showInPresentationDeck: boolean;
}

export interface CreateAnnouncementInput {
  backgroundPrompt?: string;
  heading?: string;
  name: string;
  subtitle?: string;
  tertiary?: string;
  title?: string;
}

export interface SaveAnnouncementInput {
  /** Last-applied style library pack id. Pass null to clear. */
  appliedStyleId?: string | null;
  backgroundPrompt?: string;
  content?: Partial<AnnouncementContent>;
  id: string;
  name?: string;
  /** GrapesJS project JSON — sole canvas persistence field. */
  projectData?: GrapesProjectData | null;
}

/**
 * AI layout generation: structured CanvasPlan applied client-side via GrapesJS API.
 * Never HTML or full project JSON from the model.
 */
export interface GenerateAnnouncementLayoutResult {
  draft: AnnouncementDraft;
  /** Validated op plan; client executes with editor.applyAiPlan. */
  plan: CanvasPlan;
}

export interface GenerateBackgroundsInput {
  /** @deprecated Always generates 1 variation; ignored if provided. */
  count?: number;
  id: string;
  prompt?: string;
  useSelectedAsContext?: boolean;
}

/** Add a shared image-library template as an announcement background variation. */
export interface AddLibraryImageAsVariationInput {
  id: string;
  libraryObjectKey: string;
  /** When true (default), select the new variation as active context. */
  select?: boolean;
}

export interface SelectVariationInput {
  id: string;
  variationId: string;
}

export interface RemoveVariationInput {
  id: string;
  variationId: string;
}

export interface ClearVariationContextInput {
  id: string;
}

export interface RemoveAllVariationsInput {
  id: string;
}

export interface GenerateAnnouncementHtmlInput {
  id: string;
  styleNotes?: string;
}

/** Same payload as the old HTML generator; renamed for clarity. */
export type GenerateAnnouncementLayoutInput = GenerateAnnouncementHtmlInput;

export interface ApproveAnnouncementInput {
  base64: string;
  id: string;
}

export interface AnnouncementAsset {
  base64: string;
  contentType: string;
}
