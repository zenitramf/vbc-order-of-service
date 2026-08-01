import { SILENCE_PHONE_R2_PREFIX } from "~/lib/announcement-types";
import { LIBRARY_R2_PREFIX } from "~/lib/image-library-types";

/** R2 prefixes the authenticated asset proxy is allowed to serve. */
const ALLOWED_R2_PREFIXES = [
  "announcements/",
  LIBRARY_R2_PREFIX,
  SILENCE_PHONE_R2_PREFIX,
] as const;

/**
 * True when `objectKey` is a safe, allow-listed R2 key (no path traversal).
 */
export const isAllowedR2AssetKey = (objectKey: string): boolean => {
  if (!objectKey || objectKey.includes("..") || objectKey.includes("\\")) {
    return false;
  }

  // Reject absolute-looking or protocol-ish keys.
  if (objectKey.startsWith("/") || objectKey.includes("://")) {
    return false;
  }

  return ALLOWED_R2_PREFIXES.some((prefix) => objectKey.startsWith(prefix));
};

export interface R2AssetUrlOptions {
  /** When set, the proxy responds with Content-Disposition: attachment. */
  downloadFilename?: string;
}

/**
 * Session-authenticated binary asset URL for browser-native image loading.
 * Prefer this over base64 server-fn payloads for display and export capture.
 */
export const r2AssetUrl = (
  objectKey: string,
  options?: R2AssetUrlOptions
): string => {
  const params = new URLSearchParams({ key: objectKey });

  if (options?.downloadFilename) {
    params.set("download", options.downloadFilename);
  }

  return `/api/r2-asset?${params.toString()}`;
};

/**
 * Public binary URL for an approved presentation-deck slide (no session).
 * Only announcements currently opted into the deck are served.
 */
export const presentationAssetUrl = (announcementId: string): string => {
  const params = new URLSearchParams({ id: announcementId });
  return `/api/presentation-asset?${params.toString()}`;
};

/**
 * Wait until the browser has decoded `url` (used before html-to-image export).
 * Uses the HTTP cache so a subsequent CSS/background paint is cheap.
 */
export const preloadImage = async (url: string): Promise<string> => {
  const image = new Image();
  image.decoding = "async";
  image.src = url;

  try {
    await image.decode();
  } catch {
    throw new Error("Failed to load image.");
  }

  return url;
};
