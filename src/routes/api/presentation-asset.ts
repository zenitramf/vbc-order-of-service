import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

import { resolvePresentationExportKey } from "~/lib/announcement-data";
import { responseFromR2Object } from "~/lib/r2-object-response";

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
