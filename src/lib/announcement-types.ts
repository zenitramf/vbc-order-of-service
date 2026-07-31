/** Canvas dimensions for announcement outputs (16:9 Full HD). */
export const ANNOUNCEMENT_WIDTH = 1920;
export const ANNOUNCEMENT_HEIGHT = 1080;
export const ANNOUNCEMENT_ASPECT_RATIO = "16:9" as const;

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

/** Canvas document snapshot: JSON project + derived HTML for export/code view. */
export interface AnnouncementDocument {
  html: string;
  projectData: GrapesProjectData | null;
}

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

export interface AnnouncementDraft {
  /** Last-applied style library pack id (informational; styles bake into project). */
  appliedStyleId: string | null;
  approvedAt: string | null;
  backgroundPrompt: string;
  content: AnnouncementContent;
  createdAt: string;
  exportObjectKey: string | null;
  height: number;
  /**
   * Derived overlay HTML for JPG export, code view, and legacy drafts.
   * Prefer `projectData` when loading into GrapesJS.
   */
  html: string;
  id: string;
  name: string;
  /**
   * GrapesJS project JSON — source of truth for the visual editor.
   * Null for legacy drafts that only have HTML (migrated on first canvas save).
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
  /** Derived export/code-view HTML (kept in sync with projectData on canvas save). */
  html?: string;
  id: string;
  name?: string;
  /** GrapesJS project JSON. Pass null to clear (e.g. after AI HTML replaces layout). */
  projectData?: GrapesProjectData | null;
}

export interface GenerateBackgroundsInput {
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

export interface ApproveAnnouncementInput {
  base64: string;
  id: string;
}

export interface AnnouncementAsset {
  base64: string;
  contentType: string;
}
