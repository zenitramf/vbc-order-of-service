import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

import { responseFromR2Object } from "~/lib/r2-object-response";

const INDEX_KEY = "announcements/index.json";

interface PresentationIndexRow {
  exportObjectKey?: string | null;
  id?: string;
  showInPresentationDeck?: boolean;
  status?: string;
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
 * Public binary proxy for presentation-deck export JPEGs.
 *
 * Unauthenticated by design (church screens / kiosks). Only serves exports for
 * announcements that are currently approved and opted into the deck.
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

  const objectKey = await resolvePresentationExportKey(announcementId);

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

  // Public deck images: short browser cache; ETag still revalidates.
  return responseFromR2Object(object, request, {
    cacheControl: "public, max-age=300",
  });
};

export const Route = createFileRoute("/api/presentation-asset")({
  server: {
    handlers: {
      GET: handleGet,
    },
  },
});
