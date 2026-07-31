/**
 * Build an HTTP response that streams an R2 object body with caching headers.
 * Shared by authenticated and public asset proxies.
 */
export const responseFromR2Object = (
  object: R2ObjectBody,
  request: Request,
  options?: {
    cacheControl?: string;
    downloadFilename?: string | null;
  }
): Response => {
  const contentType =
    object.httpMetadata?.contentType ||
    object.customMetadata?.contentType ||
    "application/octet-stream";

  const cacheControl = options?.cacheControl ?? "private, max-age=3600";
  const etag = object.httpEtag;
  const ifNoneMatch = request.headers.get("If-None-Match");

  if (ifNoneMatch && etag && ifNoneMatch === etag) {
    return new Response(null, {
      headers: {
        "Cache-Control": cacheControl,
        ETag: etag,
      },
      status: 304,
    });
  }

  const headers = new Headers();
  headers.set("Content-Type", contentType);
  headers.set("Cache-Control", cacheControl);

  if (etag) {
    headers.set("ETag", etag);
  }

  if (object.size !== undefined) {
    headers.set("Content-Length", String(object.size));
  }

  const downloadName = options?.downloadFilename?.trim();

  if (downloadName) {
    const safeName = downloadName.replaceAll(/[^\w.\- ()[\]]+/gu, "_");
    headers.set(
      "Content-Disposition",
      `attachment; filename="${safeName || "download"}"`
    );
  } else {
    headers.set("Content-Disposition", "inline");
  }

  return new Response(object.body, {
    headers,
    status: 200,
  });
};
