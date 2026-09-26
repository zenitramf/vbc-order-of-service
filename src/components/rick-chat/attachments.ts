import type { FileUIPart } from "ai";

export const MAX_FILES_PER_MESSAGE = 4;
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
export const MAX_PDF_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_EDGE = 1568;
export const JPEG_QUALITY = 0.85;
export const ATTACHMENT_ACCEPT = ".jpg,.jpeg,.png,.webp,.pdf";
export const CAMERA_ACCEPT = "image/*";

export type AttachmentKind = "image" | "pdf";

export interface AttachmentMeta {
  name: string;
  size: number;
  type: string;
}

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const EXTENSION_KINDS: Record<string, AttachmentKind> = {
  jpeg: "image",
  jpg: "image",
  pdf: "pdf",
  png: "image",
  webp: "image",
};

export const attachmentKind = (
  meta: Pick<AttachmentMeta, "name" | "type">
): AttachmentKind | null => {
  const type = meta.type.trim().toLowerCase();

  if (IMAGE_TYPES.has(type)) {
    return "image";
  }

  if (type === "application/pdf") {
    return "pdf";
  }

  const extension = meta.name.split(".").pop()?.toLowerCase() ?? "";

  return EXTENSION_KINDS[extension] ?? null;
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const validateAttachment = (meta: AttachmentMeta): AttachmentKind => {
  const kind = attachmentKind(meta);

  if (kind === null) {
    throw new Error(
      `"${meta.name}" isn't supported. Attach a JPG, PNG, WebP, or PDF.`
    );
  }

  const limit = kind === "pdf" ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;

  if (meta.size > limit) {
    throw new Error(
      `"${meta.name}" is ${formatBytes(meta.size)}. The limit is ${formatBytes(limit)}.`
    );
  }

  return kind;
};

const toJpegName = (name: string): string => {
  const base = name.replace(/\.[^.]+$/u, "").trim();

  return `${base || "image"}.jpg`;
};

const BASE64_CHUNK_SIZE = 32_768;

const toDataUrl = (bytes: Uint8Array, mediaType: string): string => {
  let binary = "";

  for (let index = 0; index < bytes.length; index += BASE64_CHUNK_SIZE) {
    binary += String.fromCodePoint(
      ...bytes.subarray(index, index + BASE64_CHUNK_SIZE)
    );
  }

  return `data:${mediaType};base64,${btoa(binary)}`;
};

export const fileToFileUIPart = async (file: File): Promise<FileUIPart> => {
  const mediaType = file.type || "application/octet-stream";
  const bytes = new Uint8Array(await file.arrayBuffer());

  return {
    filename: file.name,
    mediaType,
    type: "file",
    url: toDataUrl(bytes, mediaType),
  };
};

const downscaleImage = async (file: File): Promise<File> => {
  let bitmap: ImageBitmap;

  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`Couldn't read "${file.name}". Try a JPG or PNG version.`);
  }

  try {
    const scale = Math.min(
      1,
      MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height)
    );
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error(`Couldn't process "${file.name}".`);
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);

    const response = await fetch(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
    const blob = await response.blob();

    return new File([blob], toJpegName(file.name), {
      lastModified: file.lastModified,
      type: "image/jpeg",
    });
  } finally {
    bitmap.close();
  }
};

export const prepareAttachment = (file: File): Promise<File> => {
  const kind = validateAttachment(file);

  if (kind === "pdf") {
    return Promise.resolve(file);
  }

  return downscaleImage(file);
};
