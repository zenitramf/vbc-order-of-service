/** Required canvas size for announcement-ready library images (16:9 Full HD). */
export const LIBRARY_IMAGE_WIDTH = 1920;
export const LIBRARY_IMAGE_HEIGHT = 1080;

export const LIBRARY_R2_PREFIX = "library/images/" as const;

export interface ImageLibraryItem {
  contentType: string;
  createdAt: string;
  filename: string;
  height: number;
  id: string;
  objectKey: string;
  sizeBytes: number;
  width: number;
}

export interface ImageLibraryAsset {
  base64: string;
  contentType: string;
  filename: string;
}

export interface UploadLibraryImageInput {
  base64: string;
  contentType: string;
  filename: string;
  height: number;
  width: number;
}
