import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

import { createAuth } from "~/lib/auth";
import { isAllowedR2AssetKey } from "~/lib/r2-asset-url";
import { responseFromR2Object } from "~/lib/r2-object-response";

/**
 * Authenticated binary proxy for R2 announcement / library images.
 *
 * Browsers load these via normal `<img src>` / CSS `background-image` requests
 * (session cookie), avoiding multi-megabyte base64 JSON over server functions.
 */
const handleGet = async ({
  request,
}: {
  request: Request;
}): Promise<Response> => {
  const session = await createAuth(env).api.getSession({
    headers: request.headers,
  });

  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const objectKey = url.searchParams.get("key")?.trim() ?? "";

  if (!isAllowedR2AssetKey(objectKey)) {
    return new Response("Invalid object key.", { status: 400 });
  }

  const bucket = env.SERVICE_PDFS;

  if (!bucket) {
    return new Response("R2 binding is not configured.", { status: 500 });
  }

  const object = await bucket.get(objectKey);

  if (!object) {
    return new Response("Not found.", { status: 404 });
  }

  return responseFromR2Object(object, request, {
    cacheControl: "private, max-age=3600",
    downloadFilename: url.searchParams.get("download"),
  });
};

export const Route = createFileRoute("/api/r2-asset")({
  server: {
    handlers: {
      GET: handleGet,
    },
  },
});
