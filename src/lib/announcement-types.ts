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

/**
 * nano-banana-2 resolution. Prefer `1K` to stay under the Workers 128MB isolate
 * limit; backgrounds are soft plates under text, not hero stills.
 * @see https://developers.cloudflare.com/ai/models/google/nano-banana-2/
 */
export const ANNOUNCEMENT_IMAGE_RESOLUTION = "1K" as const;

/**
 * Max R2 object size (bytes) for style-reference images loaded into the isolate
 * as base64 data URIs. Larger refs are skipped so `ai.run` input stays lean.
 */
export const ANNOUNCEMENT_IMAGE_REF_MAX_BYTES = 400 * 1024;

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

/** Lifecycle of an async AI job (Queue consumer). */
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
 * Async AI layout (CanvasPlan) job. Plan is produced on the slim worker;
 * the client applies it via GrapesJS when status is completed.
 */
export interface AnnouncementLayoutJob {
  error: string | null;
  id: string;
  /** Validated plan when completed; null while queued/running/failed. */
  plan: CanvasPlan | null;
  startedAt: string | null;
  status: AnnouncementGenerationStatus;
  styleNotes: string;
  updatedAt: string;
}

/**
 * Queue message for AI background image generation.
 * Keep under 128 KB — pass R2 keys, never image bytes.
 * `type` is optional for backward compatibility (missing ⇒ background).
 */
export interface AnnouncementBackgroundGenQueueMessage {
  announcementId: string;
  count: number;
  jobId: string;
  parentVariationId: string | null;
  prompt: string;
  /** R2 object key for reference context; never base64. */
  referenceObjectKey: string | null;
  type?: "background";
}

/** Queue message for AI layout (CanvasPlan) generation. */
export interface AnnouncementLayoutGenQueueMessage {
  announcementId: string;
  jobId: string;
  styleNotes: string;
  type: "layout";
}

/** Discriminated union for the announcement AI queue. */
export type AnnouncementAiQueueMessage =
  | AnnouncementBackgroundGenQueueMessage
  | AnnouncementLayoutGenQueueMessage;

/**
 * @deprecated Prefer AnnouncementBackgroundGenQueueMessage /
 * AnnouncementAiQueueMessage. Alias kept for existing imports.
 */
export type AnnouncementImageGenQueueMessage =
  AnnouncementBackgroundGenQueueMessage;

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
   * Async AI layout job (CanvasPlan). Null when never started.
   * Client applies `plan` when status is completed.
   */
  layoutJob: AnnouncementLayoutJob | null;
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

/**
 * Slide metadata for the unauthenticated presentation deck.
 * Image bytes are loaded by the browser via `/api/presentation-asset` (binary).
 */
export interface PresentationSlide {
  /** R2 object key for the approved JPG export (served publicly when on the deck). */
  exportObjectKey: string;
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
 * AI layout generation enqueue result.
 * Plan is applied client-side after `layoutJob` completes (poll draft).
 */
export interface GenerateAnnouncementLayoutResult {
  draft: AnnouncementDraft;
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

/** Approve sets status only — does not capture or store a JPG. */
export interface ApproveAnnouncementInput {
  id: string;
}

/** Export stores a client-captured JPG without changing approval status. */
export interface ExportAnnouncementInput {
  base64: string;
  id: string;
}

export interface AnnouncementAsset {
  base64: string;
  contentType: string;
}
