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

/** Well-known system slide always appended at the end of the public deck. */
export const SILENCE_PHONE_SLIDE_ID = "silence-phone" as const;

/**
 * Temporary Unsplash stand-in when no silence-phone media is uploaded.
 * Dark, quiet interior — text is overlaid by the presentation player.
 */
export const SILENCE_PHONE_PLACEHOLDER_URL =
  "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1920&h=1080&q=80";

/** R2 prefix for the silence-phone system slide media (image or short video). */
export const SILENCE_PHONE_R2_PREFIX = "presentation/silence-phone/" as const;

/** Max upload size for silence-phone media (images or short loop videos). */
export const SILENCE_PHONE_MAX_BYTES = 40 * 1024 * 1024;

export type PresentationSlideKind = "announcement" | "silence_phone";

/** How the slide media is rendered and timed on the public player. */
export type PresentationMediaKind = "image" | "video";

/**
 * Slide metadata for the unauthenticated presentation deck.
 * Announcement (and uploaded silence-phone) bytes load via
 * `/api/presentation-asset` (binary). Placeholder silence-phone uses `imageUrl`.
 */
export interface PresentationSlide {
  /** R2 object key for the approved JPG export (null for system slides). */
  exportObjectKey: string | null;
  id: string;
  /**
   * Absolute image URL for external/placeholder slides (Unsplash fallback).
   * Uploaded silence-phone media leaves this undefined and uses
   * `presentationAssetUrl(SILENCE_PHONE_SLIDE_ID)`.
   */
  imageUrl?: string;
  kind: PresentationSlideKind;
  /** Defaults to `"image"` when omitted (all announcement exports are JPEGs). */
  mediaKind?: PresentationMediaKind;
  name: string;
}

/** D1 `app_settings` payload for presentation deck slide order. */
export interface PresentationDeckOrderSettings {
  /** Announcement ids in display order (silence-phone is never stored). */
  orderedIds: string[];
}

/** D1 `app_settings` payload for the silence-phone system slide media. */
export interface SilencePhoneMediaSettings {
  contentType: string;
  filename: string;
  mediaKind: PresentationMediaKind;
  objectKey: string;
  sizeBytes: number;
  updatedAt: string;
}

export interface UploadSilencePhoneMediaInput {
  base64: string;
  contentType: string;
  filename: string;
}

/** Deck-editor view of the silence-phone system slide (fixed last row). */
export interface SilencePhoneEditorState {
  /** Absolute or proxy URL for the thumbnail / preview. */
  mediaUrl: string;
  settings: SilencePhoneMediaSettings | null;
}

/** One announcement row in the deck editor (reorderable). */
export interface PresentationDeckEditorSlide {
  approvedAt: string | null;
  exportObjectKey: string;
  id: string;
  name: string;
  updatedAt: string;
}

export interface SavePresentationDeckOrderInput {
  orderedIds: string[];
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
