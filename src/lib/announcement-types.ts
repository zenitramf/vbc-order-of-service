/** Canvas dimensions for announcement outputs (16:9 Full HD). */
export const ANNOUNCEMENT_WIDTH = 1920;
export const ANNOUNCEMENT_HEIGHT = 1080;
export const ANNOUNCEMENT_ASPECT_RATIO = "16:9" as const;

export type AnnouncementStatus = "draft" | "approved";

export interface AnnouncementContent {
  heading: string;
  subtitle: string;
  tertiary: string;
  title: string;
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
  approvedAt: string | null;
  backgroundPrompt: string;
  content: AnnouncementContent;
  createdAt: string;
  exportObjectKey: string | null;
  height: number;
  html: string;
  id: string;
  name: string;
  selectedVariationId: string | null;
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
  status: AnnouncementStatus;
  updatedAt: string;
  variationCount: number;
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
  backgroundPrompt?: string;
  content?: Partial<AnnouncementContent>;
  html?: string;
  id: string;
  name?: string;
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
