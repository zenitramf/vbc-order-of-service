import { Buffer } from "node:buffer";

import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { v4 as uuidv4 } from "uuid";

import { requireSessionMiddleware } from "~/lib/auth.functions";
import { readImageDimensions } from "~/lib/image-library-dimensions";
import type {
  ImageLibraryAsset,
  ImageLibraryItem,
  UploadLibraryImageInput,
} from "~/lib/image-library-types";
import {
  LIBRARY_IMAGE_HEIGHT,
  LIBRARY_IMAGE_WIDTH,
  LIBRARY_R2_PREFIX,
} from "~/lib/image-library-types";

const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const getBucket = (): R2Bucket => {
  if (!env.SERVICE_PDFS) {
    throw new Error("Cloudflare R2 binding SERVICE_PDFS is not configured.");
  }

  return env.SERVICE_PDFS;
};

const slugify = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-+|-+$/gu, "") || "image";

const normalizeContentType = (contentType: string): string => {
  const normalized = contentType.trim().toLowerCase() || "image/jpeg";

  if (normalized === "image/jpg") {
    return "image/jpeg";
  }

  return normalized;
};

const extensionForContentType = (contentType: string): string => {
  switch (normalizeContentType(contentType)) {
    case "image/png": {
      return "png";
    }
    case "image/webp": {
      return "webp";
    }
    default: {
      return "jpg";
    }
  }
};

const assertAnnouncementDimensions = (width: number, height: number): void => {
  if (width !== LIBRARY_IMAGE_WIDTH || height !== LIBRARY_IMAGE_HEIGHT) {
    throw new Error(
      `Images must be exactly ${LIBRARY_IMAGE_WIDTH}×${LIBRARY_IMAGE_HEIGHT} pixels (received ${width}×${height}).`
    );
  }
};

const objectKeyFor = (
  id: string,
  filename: string,
  contentType: string
): string => {
  const baseName = filename.replace(/\.[^.]+$/u, "");
  const slug = slugify(baseName);
  const extension = extensionForContentType(contentType);
  return `${LIBRARY_R2_PREFIX}${id}-${slug}.${extension}`;
};

const itemFromObject = (object: R2Object): ImageLibraryItem | null => {
  if (!object.key.startsWith(LIBRARY_R2_PREFIX)) {
    return null;
  }

  const custom = object.customMetadata ?? {};
  const id = custom.id?.trim();
  const filename = custom.filename?.trim();

  if (!id || !filename) {
    return null;
  }

  const width = Number.parseInt(custom.width ?? "", 10);
  const height = Number.parseInt(custom.height ?? "", 10);
  const createdAt =
    custom.createdAt?.trim() ||
    (object.uploaded instanceof Date
      ? object.uploaded.toISOString()
      : new Date().toISOString());

  return {
    contentType:
      object.httpMetadata?.contentType ||
      normalizeContentType(custom.contentType || "image/jpeg"),
    createdAt,
    filename,
    height: Number.isFinite(height) ? height : LIBRARY_IMAGE_HEIGHT,
    id,
    objectKey: object.key,
    sizeBytes: object.size,
    width: Number.isFinite(width) ? width : LIBRARY_IMAGE_WIDTH,
  };
};

const listLibraryPage = async (
  cursor: string | undefined,
  acc: R2Object[]
): Promise<R2Object[]> => {
  const page = await getBucket().list({
    cursor,
    include: ["customMetadata", "httpMetadata"],
    prefix: LIBRARY_R2_PREFIX,
  });
  const next = [...acc, ...page.objects];

  if (page.truncated) {
    return listLibraryPage(page.cursor, next);
  }

  return next;
};

const listAllLibraryObjects = (): Promise<R2Object[]> =>
  listLibraryPage(undefined, []);

export const listLibraryImages = createServerFn({ method: "GET" })
  .middleware([requireSessionMiddleware])
  .handler(async (): Promise<ImageLibraryItem[]> => {
    const objects = await listAllLibraryObjects();
    const items = objects
      .map((object) => itemFromObject(object))
      .filter((item): item is ImageLibraryItem => item !== null);

    items.sort(
      (a, b) =>
        Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
        a.filename.localeCompare(b.filename)
    );

    return items;
  });

export const uploadLibraryImage = createServerFn({ method: "POST" })
  .middleware([requireSessionMiddleware])
  .validator((data: UploadLibraryImageInput) => data)
  .handler(async ({ data }): Promise<ImageLibraryItem> => {
    const filename = data.filename.trim();
    const contentType = normalizeContentType(data.contentType);

    if (!filename) {
      throw new Error("File name is required.");
    }

    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      throw new Error("Only JPEG, PNG, and WebP images are supported.");
    }

    if (!data.base64.trim()) {
      throw new Error("Image data is required.");
    }

    assertAnnouncementDimensions(data.width, data.height);

    const bytes = Buffer.from(data.base64, "base64");
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    );
    const dimensions = readImageDimensions(buffer);

    // PNG/JPEG headers are verified server-side. WebP relies on the client-reported
    // size (already asserted) because binary parsing needs format-specific bitfields.
    if (dimensions) {
      assertAnnouncementDimensions(dimensions.width, dimensions.height);
    } else if (contentType !== "image/webp") {
      throw new Error(
        "Could not read image dimensions. Upload a valid JPEG or PNG file."
      );
    }

    const id = uuidv4();
    const objectKey = objectKeyFor(id, filename, contentType);
    const createdAt = new Date().toISOString();
    const bucket = getBucket();

    await bucket.put(objectKey, bytes, {
      customMetadata: {
        contentType,
        createdAt,
        filename,
        height: String(LIBRARY_IMAGE_HEIGHT),
        id,
        width: String(LIBRARY_IMAGE_WIDTH),
      },
      httpMetadata: {
        contentDisposition: `inline; filename="${filename.replaceAll('"', "'")}"`,
        contentType,
      },
    });

    return {
      contentType,
      createdAt,
      filename,
      height: LIBRARY_IMAGE_HEIGHT,
      id,
      objectKey,
      sizeBytes: bytes.byteLength,
      width: LIBRARY_IMAGE_WIDTH,
    };
  });

export const getLibraryImage = createServerFn({ method: "GET" })
  .middleware([requireSessionMiddleware])
  .validator((objectKey: string) => objectKey)
  .handler(async ({ data }): Promise<ImageLibraryAsset> => {
    if (!data.startsWith(LIBRARY_R2_PREFIX)) {
      throw new Error("Invalid library object key.");
    }

    const object = await getBucket().get(data);

    if (!object) {
      throw new Error("Library image was not found in R2 storage.");
    }

    const arrayBuffer = await object.arrayBuffer();
    const custom = object.customMetadata ?? {};

    return {
      base64: Buffer.from(arrayBuffer).toString("base64"),
      contentType:
        object.httpMetadata?.contentType ||
        normalizeContentType(custom.contentType || "image/jpeg"),
      filename: custom.filename?.trim() || data.split("/").pop() || "image.jpg",
    };
  });

export const deleteLibraryImage = createServerFn({ method: "POST" })
  .middleware([requireSessionMiddleware])
  .validator((objectKey: string) => objectKey)
  .handler(async ({ data }): Promise<void> => {
    if (!data.startsWith(LIBRARY_R2_PREFIX)) {
      throw new Error("Invalid library object key.");
    }

    await getBucket().delete(data);
  });
