/**
 * Queue consumer for announcement AI background generation.
 *
 * Kept separate from `announcement-data.ts` (createServerFn module) so the
 * Vite client graph never pulls a plain async export that breaks
 * `cloudflare:workers` resolution during `vite build`.
 */
import { Buffer } from "node:buffer";

import { env } from "cloudflare:workers";
import { v4 as uuidv4 } from "uuid";

import type {
  AnnouncementAsset,
  AnnouncementDraft,
  AnnouncementGenerationJob,
  AnnouncementImageGenQueueMessage,
  AnnouncementSummary,
  AnnouncementVariation,
} from "~/lib/announcement-types";
import {
  ANNOUNCEMENT_ASPECT_RATIO,
  ANNOUNCEMENT_HEIGHT,
  ANNOUNCEMENT_WIDTH,
} from "~/lib/announcement-types";

const INDEX_KEY = "announcements/index.json";
const IMAGE_MODEL = "xai/grok-imagine-image-quality";

const getBucket = (): R2Bucket => {
  if (!env.SERVICE_PDFS) {
    throw new Error("Cloudflare R2 binding SERVICE_PDFS is not configured.");
  }

  return env.SERVICE_PDFS;
};

const getAi = (): Ai => {
  if (!env.AI) {
    throw new Error(
      "Workers AI binding AI is missing. Check wrangler.jsonc ai.binding."
    );
  }

  return env.AI;
};

const getAiGatewayId = (): string => {
  const fromEnv = (
    env as unknown as { AI_GATEWAY_ID?: string }
  ).AI_GATEWAY_ID?.trim();
  return fromEnv || "default";
};

const safeJsonStringify = (value: unknown): string => {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

/**
 * Pull nested detail from AI Gateway / Workers AI error shapes so UI toasts
 * show more than `7003: User Input Error — {"name":"AiGatewayError"}`.
 */
const formatAiError = (error: unknown): string => {
  if (error instanceof Error) {
    const withExtras = error as Error & {
      cause?: unknown;
      code?: number | string;
      error?: unknown;
      errors?: unknown;
      details?: unknown;
    };
    const parts = [withExtras.message];

    if (withExtras.code !== undefined && withExtras.code !== null) {
      parts.push(`code=${withExtras.code}`);
    }

    for (const key of ["error", "errors", "details"] as const) {
      const value = withExtras[key];
      if (value !== undefined && value !== null) {
        parts.push(
          typeof value === "string" ? value : safeJsonStringify(value)
        );
      }
    }

    if (withExtras.cause !== undefined && withExtras.cause !== null) {
      if (withExtras.cause instanceof Error) {
        parts.push(formatAiError(withExtras.cause));
      } else {
        parts.push(
          typeof withExtras.cause === "string"
            ? withExtras.cause
            : safeJsonStringify(withExtras.cause)
        );
      }
    }

    return parts.filter(Boolean).join(" — ");
  }

  if (error && typeof error === "object") {
    return safeJsonStringify(error);
  }

  return String(error);
};

const runAiGateway = async (
  model: string,
  input: Record<string, unknown>
): Promise<unknown> => {
  const ai = getAi();
  const gatewayId = getAiGatewayId();

  try {
    return await ai.run(model as Parameters<Ai["run"]>[0], input, {
      gateway: { id: gatewayId },
    });
  } catch (error) {
    throw new Error(`[AI Gateway:${gatewayId}] ${formatAiError(error)}`, {
      cause: error,
    });
  }
};

const nowIso = () => new Date().toISOString();

const draftKey = (id: string) => `announcements/${id}/draft.json`;
const backgroundKey = (
  id: string,
  variationId: string,
  extension = "jpg"
): string => `announcements/${id}/backgrounds/${variationId}.${extension}`;

const extensionForContentType = (contentType: string): string => {
  const normalized = contentType.trim().toLowerCase();

  if (normalized === "image/png") {
    return "png";
  }

  if (normalized === "image/webp") {
    return "webp";
  }

  return "jpg";
};

const normalizeVariation = (
  variation: Partial<AnnouncementVariation> &
    Pick<AnnouncementVariation, "createdAt" | "id" | "objectKey" | "prompt">
): AnnouncementVariation => ({
  createdAt: variation.createdAt,
  id: variation.id,
  libraryFilename: variation.libraryFilename ?? null,
  libraryImageId: variation.libraryImageId ?? null,
  objectKey: variation.objectKey,
  parentVariationId: variation.parentVariationId ?? null,
  prompt: variation.prompt,
  source: variation.source === "library" ? "library" : "generated",
});

const normalizeProjectData = (
  value: unknown
): AnnouncementDraft["projectData"] => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as AnnouncementDraft["projectData"];
};

const emptyContent = (
  partial?: Partial<AnnouncementDraft["content"]>
): AnnouncementDraft["content"] => ({
  heading: partial?.heading?.trim() ?? "",
  subtitle: partial?.subtitle?.trim() ?? "",
  tertiary: partial?.tertiary?.trim() ?? "",
  title: partial?.title?.trim() ?? "",
});

type AnnouncementDraftRecord = Omit<AnnouncementDraft, "legacyHtml">;

type AnnouncementDraftRaw = Partial<AnnouncementDraftRecord> & {
  html?: unknown;
  projectData?: unknown;
  variations?: AnnouncementDraft["variations"];
};

const asNullableString = (value: unknown): string | null => {
  if (typeof value === "string" || value === null) {
    return value;
  }

  return null;
};

const asString = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

const asNonNegativeInt = (value: unknown, fallback = 0): number => {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }

  return fallback;
};

const isGenerationStatus = (
  value: unknown
): value is AnnouncementGenerationJob["status"] =>
  value === "idle" ||
  value === "queued" ||
  value === "running" ||
  value === "completed" ||
  value === "failed";

const normalizeGenerationJob = (
  value: unknown
): AnnouncementGenerationJob | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const raw = value as Partial<AnnouncementGenerationJob>;
  const status = isGenerationStatus(raw.status) ? raw.status : "idle";
  const id = typeof raw.id === "string" ? raw.id.trim() : "";

  if (!id) {
    return null;
  }

  return {
    completedCount: asNonNegativeInt(raw.completedCount),
    error: asNullableString(raw.error),
    id,
    prompt: asString(raw.prompt),
    requestedCount: Math.max(1, asNonNegativeInt(raw.requestedCount, 1)),
    startedAt: asNullableString(raw.startedAt),
    status,
    updatedAt: asString(raw.updatedAt, nowIso()),
    useSelectedAsContext: Boolean(raw.useSelectedAsContext),
  };
};

const normalizeDraft = (raw: AnnouncementDraftRaw): AnnouncementDraft => {
  const projectData = normalizeProjectData(raw.projectData);
  const legacyHtmlFromFile =
    typeof raw.html === "string" && raw.html.trim().length > 0
      ? raw.html
      : null;
  const legacyHtml = projectData ? null : legacyHtmlFromFile;
  const contentPartial =
    raw.content && typeof raw.content === "object"
      ? (raw.content as Partial<AnnouncementDraft["content"]>)
      : undefined;

  return {
    appliedStyleId:
      typeof raw.appliedStyleId === "string" && raw.appliedStyleId.trim()
        ? raw.appliedStyleId.trim()
        : null,
    approvedAt: asNullableString(raw.approvedAt),
    backgroundPrompt: asString(raw.backgroundPrompt),
    content: emptyContent(contentPartial),
    createdAt: asString(raw.createdAt, nowIso()),
    exportObjectKey: asNullableString(raw.exportObjectKey),
    generationJob: normalizeGenerationJob(raw.generationJob),
    height: typeof raw.height === "number" ? raw.height : ANNOUNCEMENT_HEIGHT,
    id: asString(raw.id),
    legacyHtml,
    name: asString(raw.name),
    projectData,
    selectedVariationId: asNullableString(raw.selectedVariationId),
    showInPresentationDeck: Boolean(raw.showInPresentationDeck),
    status: raw.status === "approved" ? "approved" : "draft",
    updatedAt: asString(raw.updatedAt, nowIso()),
    variations: Array.isArray(raw.variations)
      ? raw.variations.map((variation) => normalizeVariation(variation))
      : [],
    width: typeof raw.width === "number" ? raw.width : ANNOUNCEMENT_WIDTH,
  };
};

const toDraftRecord = (draft: AnnouncementDraft): AnnouncementDraftRecord => ({
  appliedStyleId: draft.appliedStyleId,
  approvedAt: draft.approvedAt,
  backgroundPrompt: draft.backgroundPrompt,
  content: draft.content,
  createdAt: draft.createdAt,
  exportObjectKey: draft.exportObjectKey,
  generationJob: draft.generationJob,
  height: draft.height,
  id: draft.id,
  name: draft.name,
  projectData: draft.projectData,
  selectedVariationId: draft.selectedVariationId,
  showInPresentationDeck: draft.showInPresentationDeck,
  status: draft.status,
  updatedAt: draft.updatedAt,
  variations: draft.variations,
  width: draft.width,
});

const putJson = async (key: string, value: unknown): Promise<void> => {
  await getBucket().put(key, JSON.stringify(value, null, 2), {
    httpMetadata: { contentType: "application/json" },
  });
};

const getJson = async <T>(key: string): Promise<T | null> => {
  const object = await getBucket().get(key);

  if (!object) {
    return null;
  }

  return (await object.json()) as T;
};

const normalizeSummary = (
  summary: AnnouncementSummary
): AnnouncementSummary => ({
  ...summary,
  showInPresentationDeck: Boolean(summary.showInPresentationDeck),
});

const readIndex = async (): Promise<AnnouncementSummary[]> => {
  const items = (await getJson<AnnouncementSummary[]>(INDEX_KEY)) ?? [];
  return items.map((item) => normalizeSummary(item));
};

const writeIndex = async (items: AnnouncementSummary[]): Promise<void> => {
  await putJson(INDEX_KEY, items);
};

const toSummary = (draft: AnnouncementDraft): AnnouncementSummary => {
  const selected = draft.variations.find(
    (variation) => variation.id === draft.selectedVariationId
  );

  return {
    approvedAt: draft.approvedAt,
    createdAt: draft.createdAt,
    exportObjectKey: draft.exportObjectKey,
    id: draft.id,
    name: draft.name,
    previewObjectKey: selected?.objectKey ?? null,
    selectedVariationId: draft.selectedVariationId,
    showInPresentationDeck: Boolean(draft.showInPresentationDeck),
    status: draft.status,
    updatedAt: draft.updatedAt,
    variationCount: draft.variations.length,
  };
};

const upsertIndexEntry = async (draft: AnnouncementDraft): Promise<void> => {
  const index = await readIndex();
  const summary = toSummary(draft);
  const next = index.filter((item) => item.id !== draft.id);
  next.unshift(summary);
  next.sort(
    (a, b) =>
      Date.parse(b.updatedAt) - Date.parse(a.updatedAt) ||
      a.name.localeCompare(b.name)
  );
  await writeIndex(next);
};

const loadDraft = async (id: string): Promise<AnnouncementDraft> => {
  const draft = await getJson<AnnouncementDraftRaw>(draftKey(id));

  if (!draft) {
    throw new Error("Announcement not found.");
  }

  return normalizeDraft(draft);
};

const saveDraft = async (
  draft: AnnouncementDraft
): Promise<AnnouncementDraft> => {
  const next: AnnouncementDraft = {
    ...draft,
    legacyHtml: null,
    updatedAt: nowIso(),
  };

  await putJson(draftKey(next.id), toDraftRecord(next));
  await upsertIndexEntry(next);
  return next;
};

const markDirtyIfApproved = (draft: AnnouncementDraft): void => {
  if (draft.status === "approved") {
    draft.status = "draft";
    draft.approvedAt = null;
  }
};

type ImageBody = ReadableStream | ArrayBuffer | ArrayBufferView | Blob;

const putImageBody = async (
  key: string,
  body: ImageBody,
  contentType = "image/jpeg"
): Promise<void> => {
  await getBucket().put(key, body, {
    httpMetadata: { contentType },
  });
};

const contentTypeFromHeaders = (headers: Headers): string => {
  const raw = headers.get("content-type")?.split(";")[0]?.trim();
  return raw && raw.length > 0 ? raw : "image/jpeg";
};

/**
 * Stream a remote image into R2 without buffering the full body in the isolate.
 */
const streamImageUrlToR2 = async (
  draftId: string,
  variationId: string,
  url: string
): Promise<{ contentType: string; objectKey: string }> => {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download generated image (${response.status}).`);
  }

  if (!response.body) {
    throw new Error("Generated image response had no body to stream.");
  }

  const contentType = contentTypeFromHeaders(response.headers);
  const objectKey = backgroundKey(
    draftId,
    variationId,
    extensionForContentType(contentType)
  );

  await putImageBody(objectKey, response.body, contentType);
  return { contentType, objectKey };
};

const putBase64ImageToR2 = async (
  draftId: string,
  variationId: string,
  image: string
): Promise<{ contentType: string; objectKey: string }> => {
  let contentType = "image/jpeg";
  let base64 = image;

  if (image.startsWith("data:")) {
    const match =
      /^data:(?<type>[^;,]+)?(?:;[^,]*)?;base64,(?<data>[\s\S]*)$/iu.exec(
        image
      );

    if (match?.groups?.data) {
      contentType = match.groups.type?.trim() || contentType;
      base64 = match.groups.data;
    } else {
      const comma = image.indexOf(",");
      base64 = comma === -1 ? image : image.slice(comma + 1);
    }
  }

  const objectKey = backgroundKey(
    draftId,
    variationId,
    extensionForContentType(contentType)
  );
  await putImageBody(objectKey, Buffer.from(base64, "base64"), contentType);
  return { contentType, objectKey };
};

const storeImagePayloadToR2 = async (
  draftId: string,
  variationId: string,
  image: string
): Promise<{ contentType: string; objectKey: string }> => {
  if (image.startsWith("http://") || image.startsWith("https://")) {
    return await streamImageUrlToR2(draftId, variationId, image);
  }

  return await putBase64ImageToR2(draftId, variationId, image);
};

const extractImageFromAiResponse = (response: unknown): string | null => {
  if (!response || typeof response !== "object") {
    return null;
  }

  const record = response as Record<string, unknown>;

  if (typeof record.image === "string") {
    return record.image;
  }

  const { result } = record;
  if (result && typeof result === "object") {
    const resultRecord = result as Record<string, unknown>;
    if (typeof resultRecord.image === "string") {
      return resultRecord.image;
    }
    if (Array.isArray(resultRecord.data) && resultRecord.data[0]) {
      const first = resultRecord.data[0] as Record<string, unknown>;
      if (typeof first.b64_json === "string") {
        return first.b64_json;
      }
      if (typeof first.url === "string") {
        return first.url;
      }
      if (typeof first.image === "string") {
        return first.image;
      }
    }
  }

  if (Array.isArray(record.data) && record.data[0]) {
    const first = record.data[0] as Record<string, unknown>;
    if (typeof first.b64_json === "string") {
      return first.b64_json;
    }
    if (typeof first.url === "string") {
      return first.url;
    }
  }

  return null;
};

const generateAndStoreBackgroundImage = async (options: {
  draftId: string;
  index: number;
  prompt: string;
  referenceContentType?: string;
  referenceImageBase64?: string;
  total: number;
  variationId: string;
}): Promise<{ contentType: string; objectKey: string }> => {
  const basePrompt = [
    options.prompt.trim(),
    "Subtle atmospheric background for an announcement graphic — understated, soft, and unobtrusive so overlaid text can read clearly.",
    "No text, letters, words, logos, watermarks, captions, or UI elements anywhere in the image.",
    "Avoid busy detail, harsh contrast, and dominant focal subjects; favor calm negative space and gentle depth.",
    "High quality, 16:9 composition.",
  ].join(" ");

  const variationHint =
    options.total > 1
      ? ` Variation ${options.index + 1}: a subtle alternative with the same quiet mood and palette direction.`
      : "";

  // Use b64_json, not url. Zero Data Retention (ZDR) xAI teams reject
  // response_format "url" with AI Gateway 7003 ("do not have access to URL
  // format as it requires to store the generated images"). Gateway may still
  // return a short temporary https URL in result.image; storeImagePayloadToR2
  // handles both URL and base64.
  const input: Record<string, unknown> = {
    aspect_ratio: ANNOUNCEMENT_ASPECT_RATIO,
    n: 1,
    prompt: `${basePrompt}${variationHint}`,
    quality: "high",
    resolution: "2k",
    response_format: "b64_json",
  };

  if (options.referenceImageBase64) {
    // Schema expects image: { url, type? } — bare strings trigger 7003.
    const dataUri = `data:${options.referenceContentType || "image/jpeg"};base64,${options.referenceImageBase64}`;
    input.image = {
      type: "image_url",
      url: dataUri,
    };
    input.prompt = `${basePrompt} Use the reference image as style and subject context.${variationHint}`;
  }

  const response = await runAiGateway(IMAGE_MODEL, input);
  const imagePayload = extractImageFromAiResponse(response);

  if (!imagePayload) {
    throw new Error("AI Gateway image generation returned no image payload.");
  }

  return await storeImagePayloadToR2(
    options.draftId,
    options.variationId,
    imagePayload
  );
};

const readAssetBase64 = async (
  objectKey: string
): Promise<AnnouncementAsset> => {
  const object = await getBucket().get(objectKey);

  if (!object) {
    throw new Error("Asset not found in R2.");
  }

  const arrayBuffer = await object.arrayBuffer();

  return {
    base64: Buffer.from(arrayBuffer).toString("base64"),
    contentType: object.httpMetadata?.contentType || "image/jpeg",
  };
};

const markJob = (
  draft: AnnouncementDraft,
  message: AnnouncementImageGenQueueMessage,
  patch: Partial<AnnouncementGenerationJob> &
    Pick<AnnouncementGenerationJob, "status">
): void => {
  draft.generationJob = {
    completedCount:
      patch.completedCount ?? draft.generationJob?.completedCount ?? 0,
    error:
      patch.error === undefined
        ? (draft.generationJob?.error ?? null)
        : patch.error,
    id: message.jobId,
    prompt: message.prompt,
    requestedCount: message.count,
    startedAt:
      patch.startedAt === undefined
        ? (draft.generationJob?.startedAt ?? nowIso())
        : patch.startedAt,
    status: patch.status,
    updatedAt: nowIso(),
    useSelectedAsContext: Boolean(message.referenceObjectKey),
  };
};

const persistGeneratedVariation = async (options: {
  draft: AnnouncementDraft;
  index: number;
  message: AnnouncementImageGenQueueMessage;
  referenceContentType?: string;
  referenceImageBase64?: string;
}): Promise<void> => {
  const { draft, index, message } = options;
  const variationId = uuidv4();
  const stored = await generateAndStoreBackgroundImage({
    draftId: draft.id,
    index,
    prompt: message.prompt,
    referenceContentType: options.referenceContentType,
    referenceImageBase64: options.referenceImageBase64,
    total: message.count,
    variationId,
  });

  const variation: AnnouncementVariation = {
    createdAt: nowIso(),
    id: variationId,
    libraryFilename: null,
    libraryImageId: null,
    objectKey: stored.objectKey,
    parentVariationId: message.parentVariationId,
    prompt: message.prompt,
    source: "generated",
  };

  draft.variations = [variation, ...draft.variations];

  if (!draft.selectedVariationId) {
    draft.selectedVariationId = variation.id;
  }

  markJob(draft, message, {
    completedCount: index + 1,
    error: null,
    status: "running",
  });
  markDirtyIfApproved(draft);
  await saveDraft(draft);
};

const generateVariationsSequentially = async (options: {
  draft: AnnouncementDraft;
  index: number;
  message: AnnouncementImageGenQueueMessage;
  referenceContentType?: string;
  referenceImageBase64?: string;
}): Promise<void> => {
  if (options.index >= options.message.count) {
    return;
  }

  await persistGeneratedVariation(options);
  await generateVariationsSequentially({
    ...options,
    index: options.index + 1,
  });
};

const markJobFailed = async (
  message: AnnouncementImageGenQueueMessage,
  fallback: AnnouncementDraft,
  error: unknown
): Promise<void> => {
  const latest = await loadDraft(message.announcementId).catch(() => fallback);
  const currentJob = latest.generationJob;

  if (currentJob?.id !== message.jobId) {
    return;
  }

  markJob(latest, message, {
    completedCount: currentJob.completedCount,
    error: formatAiError(error),
    startedAt: currentJob.startedAt,
    status: "failed",
  });
  await saveDraft(latest);
};

/**
 * Queue consumer: generate variations sequentially, one image at a time.
 * Resumes from generationJob.completedCount for safe retries.
 */
export const processAnnouncementImageGen = async (
  message: AnnouncementImageGenQueueMessage
): Promise<void> => {
  const draft = await loadDraft(message.announcementId);
  const job = draft.generationJob;

  if (!job || job.id !== message.jobId || job.status === "completed") {
    return;
  }

  if (job.status === "failed" && job.completedCount >= message.count) {
    return;
  }

  const startIndex = Math.min(
    Math.max(0, job.completedCount),
    Math.max(0, message.count)
  );

  if (startIndex >= message.count) {
    markJob(draft, message, {
      completedCount: message.count,
      error: null,
      startedAt: job.startedAt,
      status: "completed",
    });
    await saveDraft(draft);
    return;
  }

  markJob(draft, message, {
    completedCount: job.completedCount,
    error: null,
    startedAt: job.startedAt ?? nowIso(),
    status: "running",
  });
  await saveDraft(draft);

  let referenceImageBase64: string | undefined;
  let referenceContentType: string | undefined;

  if (message.referenceObjectKey) {
    const asset = await readAssetBase64(message.referenceObjectKey);
    referenceImageBase64 = asset.base64;
    referenceContentType = asset.contentType;
  }

  try {
    await generateVariationsSequentially({
      draft,
      index: startIndex,
      message,
      referenceContentType,
      referenceImageBase64,
    });

    markJob(draft, message, {
      completedCount: message.count,
      error: null,
      status: "completed",
    });
    await saveDraft(draft);
  } catch (error) {
    await markJobFailed(message, draft, error);
    throw error;
  }
};
