import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";

import { getAppDb } from "~/db/client";
import { appSettings } from "~/db/schema";
import {
  SILENCE_PHONE_R2_PREFIX,
  SILENCE_PHONE_SLIDE_ID,
} from "~/lib/announcement-types";
import { responseFromR2Object } from "~/lib/r2-object-response";

const INDEX_KEY = "announcements/index.json";
const SILENCE_PHONE_MEDIA_KEY = "silencePhoneMedia";

interface PresentationIndexRow {
  exportObjectKey?: string | null;
  id?: string;
  showInPresentationDeck?: boolean;
  status?: string;
}

interface SilencePhoneMediaRow {
  objectKey?: string;
}

/**
 * Resolve the R2 export key for a public presentation slide.
 *
 * Kept local to this API route so the client route graph never imports
 * `announcement-data` (which pulls in `cloudflare:workers` + createServerFn).
 */
const resolvePresentationExportKey = async (
  announcementId: string
): Promise<string | null> => {
  const id = announcementId.trim();

  if (!id) {
    return null;
  }

  const bucket = env.SERVICE_PDFS;

  if (!bucket) {
    return null;
  }

  const object = await bucket.get(INDEX_KEY);

  if (!object) {
    return null;
  }

  let rows: PresentationIndexRow[] = [];

  try {
    const parsed: unknown = await object.json();
    rows = Array.isArray(parsed) ? (parsed as PresentationIndexRow[]) : [];
  } catch {
    return null;
  }

  const item = rows.find((entry) => entry.id === id);

  if (
    !item ||
    item.status !== "approved" ||
    !item.showInPresentationDeck ||
    typeof item.exportObjectKey !== "string" ||
    !item.exportObjectKey
  ) {
    return null;
  }

  return item.exportObjectKey;
};

/**
 * Resolve uploaded silence-phone media from D1 settings (R2 object key).
 */
const resolveSilencePhoneObjectKey = async (): Promise<string | null> => {
  const row = await getAppDb()
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, SILENCE_PHONE_MEDIA_KEY))
    .get();

  const raw = row?.value?.trim();

  if (!raw) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const objectKey = (parsed as SilencePhoneMediaRow).objectKey?.trim() ?? "";

    if (!objectKey || !objectKey.startsWith(SILENCE_PHONE_R2_PREFIX)) {
      return null;
    }

    return objectKey;
  } catch {
    return null;
  }
};

/**
 * Public binary proxy for presentation-deck export JPEGs and silence-phone media.
 *
 * Unauthenticated by design (church screens / kiosks). Only serves:
 * - exports for announcements that are currently approved and opted into the deck
 * - the configured silence-phone system slide media (when uploaded)
 */
const handleGet = async ({
  request,
}: {
  request: Request;
}): Promise<Response> => {
  const url = new URL(request.url);
  const announcementId = url.searchParams.get("id")?.trim() ?? "";

  if (!announcementId) {
    return new Response("Missing id.", { status: 400 });
  }

  const objectKey =
    announcementId === SILENCE_PHONE_SLIDE_ID
      ? await resolveSilencePhoneObjectKey()
      : await resolvePresentationExportKey(announcementId);

  if (!objectKey) {
    return new Response("Not found.", { status: 404 });
  }

  const bucket = env.SERVICE_PDFS;

  if (!bucket) {
    return new Response("R2 binding is not configured.", { status: 500 });
  }

  const object = await bucket.get(objectKey);

  if (!object) {
    return new Response("Not found.", { status: 404 });
  }

  // Public deck media: short browser cache; ETag still revalidates.
  // Range support helps HTML5 video progressive playback.
  return responseFromR2Object(object, request, {
    bucket,
    cacheControl: "public, max-age=300",
    objectKey,
    supportRange: true,
  });
};

export const Route = createFileRoute("/api/presentation-asset")({
  server: {
    handlers: {
      GET: handleGet,
    },
  },
});
