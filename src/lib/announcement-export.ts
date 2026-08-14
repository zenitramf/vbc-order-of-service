import {
  ANNOUNCEMENT_HEIGHT,
  ANNOUNCEMENT_WIDTH,
} from "~/lib/announcement-types";

/**
 * html-to-image options for announcement JPG capture.
 *
 * `includeQueryParams` must stay true. Backgrounds are `/api/r2-asset?key=…`;
 * the library's default cache key strips query strings, so every variation
 * and announcement would reuse the first image fetched in the session.
 */
export const announcementJpegCaptureOptions = {
  backgroundColor: "#000000",
  cacheBust: true,
  height: ANNOUNCEMENT_HEIGHT,
  includeQueryParams: true,
  pixelRatio: 1,
  quality: 0.92,
  width: ANNOUNCEMENT_WIDTH,
} as const;

/**
 * Mirror of html-to-image's `getCacheKey` (dataurl.js): unless
 * `includeQueryParams` is set, `?key=` is dropped and every R2 asset collides.
 */
export const htmlToImageResourceCacheKey = (
  url: string,
  includeQueryParams: boolean = announcementJpegCaptureOptions.includeQueryParams
): string => (includeQueryParams ? url : url.replace(/\?.*/u, ""));
