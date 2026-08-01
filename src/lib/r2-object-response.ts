interface R2ResponseOptions {
  /** Required when `supportRange` is true and a Range header is present. */
  bucket?: R2Bucket;
  cacheControl?: string;
  downloadFilename?: string | null;
  objectKey?: string;
  supportRange?: boolean;
}

interface ByteRange {
  end: number;
  start: number;
}

const buildAssetHeaders = (
  contentType: string,
  cacheControl: string,
  etag: string | undefined,
  downloadFilename: string | null | undefined
): Headers => {
  const headers = new Headers();
  headers.set("Content-Type", contentType);
  headers.set("Cache-Control", cacheControl);
  headers.set("Accept-Ranges", "bytes");

  if (etag) {
    headers.set("ETag", etag);
  }

  const downloadName = downloadFilename?.trim();

  if (downloadName) {
    const safeName = downloadName.replaceAll(/[^\w.\- ()[\]]+/gu, "_");
    headers.set(
      "Content-Disposition",
      `attachment; filename="${safeName || "download"}"`
    );
  } else {
    headers.set("Content-Disposition", "inline");
  }

  return headers;
};

const parseOpenEndedStart = (startRaw: string, endRaw: string): ByteRange => {
  const start = Number.parseInt(startRaw, 10);
  // bytes=N- → through end of object (caller clamps against totalSize)
  if (endRaw === "") {
    return { end: Number.POSITIVE_INFINITY, start };
  }

  return { end: Number.parseInt(endRaw, 10), start };
};

/**
 * Parse `Range: bytes=start-end` into inclusive offsets, or null if invalid.
 */
const parseByteRange = (
  rangeHeader: string,
  totalSize: number
): ByteRange | "unsatisfiable" | null => {
  const match =
    /^bytes=(?<start>\d*)-(?<end>\d*)$/u.exec(rangeHeader.trim()) ?? null;
  const groups = match?.groups;

  if (!groups) {
    return null;
  }

  const startRaw = groups.start ?? "";
  const endRaw = groups.end ?? "";

  // suffix form: bytes=-N (last N bytes)
  if (startRaw === "" && endRaw !== "") {
    const suffix = Number.parseInt(endRaw, 10);
    return {
      end: totalSize - 1,
      start: Math.max(0, totalSize - suffix),
    };
  }

  if (startRaw === "") {
    return "unsatisfiable";
  }

  const { end, start } = parseOpenEndedStart(startRaw, endRaw);

  if (start < 0 || start >= totalSize) {
    return "unsatisfiable";
  }

  const clampedEnd =
    end === Number.POSITIVE_INFINITY
      ? totalSize - 1
      : Math.min(end, totalSize - 1);

  if (clampedEnd < start) {
    return "unsatisfiable";
  }

  return { end: clampedEnd, start };
};

const fullObjectResponse = (
  object: R2ObjectBody,
  headers: Headers
): Response => {
  if (object.size !== undefined) {
    headers.set("Content-Length", String(object.size));
  }

  return new Response(object.body, {
    headers,
    status: 200,
  });
};

const rangedObjectResponse = async (
  bucket: R2Bucket,
  objectKey: string,
  totalSize: number,
  rangeHeader: string,
  headers: Headers,
  fullObject: R2ObjectBody
): Promise<Response> => {
  const parsed = parseByteRange(rangeHeader, totalSize);

  if (parsed === null) {
    return fullObjectResponse(fullObject, headers);
  }

  if (parsed === "unsatisfiable") {
    headers.set("Content-Range", `bytes */${totalSize}`);
    return new Response(null, {
      headers,
      status: 416,
    });
  }

  const { end, start } = parsed;
  const length = end - start + 1;
  const partial = await bucket.get(objectKey, {
    range: { length, offset: start },
  });

  if (!partial) {
    return new Response("Not found.", { status: 404 });
  }

  headers.set("Content-Length", String(length));
  headers.set("Content-Range", `bytes ${start}-${end}/${totalSize}`);

  return new Response(partial.body, {
    headers,
    status: 206,
  });
};

const resolveContentType = (object: R2ObjectBody): string =>
  object.httpMetadata?.contentType ||
  object.customMetadata?.contentType ||
  "application/octet-stream";

/**
 * Build an HTTP response that streams an R2 object body with caching headers.
 * Shared by authenticated and public asset proxies.
 *
 * When `supportRange` is true, honors `Range: bytes=` for progressive video
 * playback by re-fetching a ranged object from the provided bucket.
 */
export const responseFromR2Object = (
  object: R2ObjectBody,
  request: Request,
  options?: R2ResponseOptions
): Promise<Response> => {
  const contentType = resolveContentType(object);
  const cacheControl = options?.cacheControl ?? "private, max-age=3600";
  const etag = object.httpEtag;
  const ifNoneMatch = request.headers.get("If-None-Match");

  if (ifNoneMatch && etag && ifNoneMatch === etag) {
    return Promise.resolve(
      new Response(null, {
        headers: {
          "Accept-Ranges": "bytes",
          "Cache-Control": cacheControl,
          ETag: etag,
        },
        status: 304,
      })
    );
  }

  const headers = buildAssetHeaders(
    contentType,
    cacheControl,
    etag,
    options?.downloadFilename
  );

  const rangeHeader = options?.supportRange
    ? request.headers.get("Range")
    : null;
  const { bucket, objectKey } = options ?? {};
  const totalSize = object.size;

  if (
    rangeHeader &&
    bucket &&
    objectKey &&
    totalSize !== undefined &&
    totalSize > 0
  ) {
    return rangedObjectResponse(
      bucket,
      objectKey,
      totalSize,
      rangeHeader,
      headers,
      object
    );
  }

  return Promise.resolve(fullObjectResponse(object, headers));
};
