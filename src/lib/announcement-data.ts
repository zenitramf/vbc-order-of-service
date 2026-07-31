import { Buffer } from "node:buffer";

import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { v4 as uuidv4 } from "uuid";

import {
  canvasPlanJsonSchema,
  extractStructuredJson,
  parseCanvasPlan,
} from "~/lib/announcement-ai-plan";
import type { CanvasPlan } from "~/lib/announcement-ai-plan";
import { ANNOUNCEMENT_BLOCK_IDS } from "~/lib/announcement-block-templates";
import { listStylePacks } from "~/lib/announcement-style-library";
import type {
  AddLibraryImageAsVariationInput,
  AnnouncementAsset,
  AnnouncementContent,
  AnnouncementDraft,
  AnnouncementGenerationJob,
  AnnouncementImageGenQueueMessage,
  AnnouncementSummary,
  AnnouncementVariation,
  ApproveAnnouncementInput,
  CreateAnnouncementInput,
  GenerateAnnouncementLayoutInput,
  GenerateAnnouncementLayoutResult,
  GenerateBackgroundsInput,
  PresentationSlide,
  SaveAnnouncementInput,
  ClearVariationContextInput,
  RemoveAllVariationsInput,
  RemoveVariationInput,
  SelectVariationInput,
  SetShowInPresentationDeckInput,
} from "~/lib/announcement-types";
import {
  ANNOUNCEMENT_ASPECT_RATIO,
  ANNOUNCEMENT_HEIGHT,
  ANNOUNCEMENT_WIDTH,
} from "~/lib/announcement-types";
import { requireSessionMiddleware } from "~/lib/auth.functions";
import { LIBRARY_R2_PREFIX } from "~/lib/image-library-types";

const INDEX_KEY = "announcements/index.json";
/** xAI image model via Cloudflare AI Gateway — backgrounds only, no baked text. */
const IMAGE_MODEL = "xai/grok-imagine-image-quality";
/**
 * Layout ops (CanvasPlan) via structured JSON schema output.
 * @see https://docs.x.ai/developers/model-capabilities/text/structured-outputs
 */
const LAYOUT_MODEL = "xai/grok-4.5";
/** Fallback if 4.5 rejects schema path provider-side. */
const LAYOUT_MODEL_FALLBACK = "xai/grok-4.3";
const MAX_VARIATIONS_PER_REQUEST = 4;
const DEFAULT_VARIATION_COUNT = 2;

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

const getImageGenQueue = (): Queue<AnnouncementImageGenQueueMessage> => {
  const queue = (
    env as unknown as {
      OOS_ANNOUNCEMENT_IMAGE_GEN?: Queue<AnnouncementImageGenQueueMessage>;
    }
  ).OOS_ANNOUNCEMENT_IMAGE_GEN;

  if (!queue) {
    throw new Error(
      "Cloudflare Queue binding OOS_ANNOUNCEMENT_IMAGE_GEN is not configured."
    );
  }

  return queue;
};

const isGenerationJobActive = (
  job: AnnouncementGenerationJob | null | undefined
): boolean => job?.status === "queued" || job?.status === "running";

/** Gateway id from wrangler vars / .env (default auto-created gateway). */
const getAiGatewayId = (): string => {
  const fromEnv = (
    env as unknown as { AI_GATEWAY_ID?: string }
  ).AI_GATEWAY_ID?.trim();
  return fromEnv || "default";
};

/**
 * Inference via Workers AI binding, routed through AI Gateway
 * (same pattern as product-gen-portal: env.AI.run + gateway.id).
 */
const formatAiError = (error: unknown): string => {
  if (error instanceof Error) {
    const withExtras = error as Error & {
      cause?: unknown;
      code?: number | string;
    };
    const parts = [withExtras.message];

    if (withExtras.code !== undefined && withExtras.code !== null) {
      parts.push(`code=${withExtras.code}`);
    }

    if (withExtras.cause !== undefined && withExtras.cause !== null) {
      parts.push(
        typeof withExtras.cause === "string"
          ? withExtras.cause
          : JSON.stringify(withExtras.cause)
      );
    }

    return parts.filter(Boolean).join(" — ");
  }

  if (error && typeof error === "object") {
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
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
const exportKey = (id: string) => `announcements/${id}/exports/approved.jpg`;

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

/** Backfill fields for drafts saved before library-source variations existed. */
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
  partial?: Partial<AnnouncementContent>
): AnnouncementContent => ({
  heading: partial?.heading?.trim() ?? "",
  subtitle: partial?.subtitle?.trim() ?? "",
  tertiary: partial?.tertiary?.trim() ?? "",
  title: partial?.title?.trim() ?? "",
});

/**
 * Shape stored on R2. Deliberately omits `html` / `legacyHtml` so old HTML is
 * stripped on the next save after client migration.
 */
type AnnouncementDraftRecord = Omit<AnnouncementDraft, "legacyHtml">;

/** Raw R2 payload may still include a legacy `html` string. */
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

/** Backfill for drafts saved before async generation jobs existed. */
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

  // Only surface legacy HTML when we still need it to migrate into projectData.
  const legacyHtml = projectData ? null : legacyHtmlFromFile;
  const contentPartial =
    raw.content && typeof raw.content === "object"
      ? (raw.content as Partial<AnnouncementContent>)
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

/** Persistable fields only — never write `html` or `legacyHtml` to R2. */
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

/** Normalize index rows saved before `showInPresentationDeck` existed. */
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

const removeIndexEntry = async (id: string): Promise<void> => {
  const index = await readIndex();
  await writeIndex(index.filter((item) => item.id !== id));
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
    // After any write, legacy HTML is gone from disk — do not re-surface it.
    legacyHtml: null,
    updatedAt: nowIso(),
  };

  // Drop legacy `html` permanently: only projectData is stored for the canvas.
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

const putImageBytes = async (
  key: string,
  bytes: ArrayBuffer | Buffer,
  contentType = "image/jpeg"
): Promise<void> => {
  await getBucket().put(key, bytes, {
    httpMetadata: { contentType },
  });
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
 * R2 accepts ReadableStream; this is the low-memory path for AI `url` responses.
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

/** Decode data-URI / raw base64 and put (fallback when AI does not return a URL). */
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

/**
 * Store an AI image payload in R2. Prefers streaming HTTPS URLs; falls back to
 * base64 only when the provider returns encoded bytes.
 */
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

/**
 * Generate one background and stream/store it to R2.
 * Uses response_format "url" so the happy path never materializes multi-MB
 * base64 JSON or a full ArrayBuffer of the image in the isolate.
 */
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

  const input: Record<string, unknown> = {
    aspect_ratio: ANNOUNCEMENT_ASPECT_RATIO,
    n: 1,
    prompt: `${basePrompt}${variationHint}`,
    quality: "high",
    resolution: "2k",
    // Prefer URL over b64_json to keep isolate memory under the 128 MB limit.
    response_format: "url",
  };

  if (options.referenceImageBase64) {
    // Cloudflare schema for xai/grok-imagine-image-quality expects
    // image: { url, type? } (or images: [{ url, type? }]) — not bare strings.
    // Bare strings trigger AI Gateway 7003 "User Input Error".
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

const layoutSystemPrompt = [
  "You design church announcement overlays for a 1920×1080 GrapesJS canvas.",
  "Your output is constrained to the canvas_plan JSON schema.",
  "Prefer: applyPreset with a known packId from the provided list, then optional updateRole style tweaks.",
  "Never paint photographic backgrounds (the variation photo is applied separately on the Body).",
  "Scrims/panels must use alpha linear-gradients fading to transparent (never solid opaque fills).",
  "Use content fields exactly as provided for text (no copy rewrite unless style notes request polish).",
  "Do not emit HTML. Do not emit GrapesJS project JSON. Only CanvasPlan ops.",
].join(" ");

const buildLayoutUserPayload = (options: {
  content: AnnouncementContent;
  styleNotes?: string;
}): string =>
  JSON.stringify(
    {
      availableBlocks: ANNOUNCEMENT_BLOCK_IDS,
      availablePresets: listStylePacks().map((pack) => ({
        composition: pack.composition,
        description: pack.description,
        id: pack.id,
        name: pack.name,
      })),
      canvas: {
        height: ANNOUNCEMENT_HEIGHT,
        width: ANNOUNCEMENT_WIDTH,
      },
      content: options.content,
      styleNotes:
        options.styleNotes?.trim() ||
        "Warm, reverent, modern church graphic. Bottom-weighted text with elegant serif title.",
    },
    null,
    2
  );

const layoutRequestInput = (userPayload: string): Record<string, unknown> => ({
  messages: [
    { content: layoutSystemPrompt, role: "system" },
    { content: userPayload, role: "user" },
  ],
  response_format: {
    json_schema: {
      name: "canvas_plan",
      schema: canvasPlanJsonSchema,
      strict: true,
    },
    type: "json_schema",
  },
  temperature: 0.4,
});

const generateLayoutPlanWithAi = async (options: {
  content: AnnouncementContent;
  styleNotes?: string;
}): Promise<CanvasPlan> => {
  const userPayload = buildLayoutUserPayload(options);
  const input = layoutRequestInput(userPayload);

  let response: unknown;
  try {
    response = await runAiGateway(LAYOUT_MODEL, input);
  } catch (primaryError) {
    try {
      response = await runAiGateway(LAYOUT_MODEL_FALLBACK, input);
    } catch {
      throw primaryError instanceof Error
        ? primaryError
        : new Error(String(primaryError));
    }
  }

  const structured = extractStructuredJson(response);

  if (structured === null) {
    throw new Error("AI Gateway returned empty layout plan.");
  }

  try {
    return parseCanvasPlan(structured);
  } catch (firstError) {
    // One repair attempt: ask the same model to fix schema issues.
    const repairPayload = JSON.stringify(
      {
        error:
          firstError instanceof Error
            ? firstError.message
            : "Invalid canvas plan",
        previous: structured,
        task: "Return a corrected canvas_plan that satisfies the schema.",
      },
      null,
      2
    );

    try {
      const repaired = await runAiGateway(LAYOUT_MODEL, {
        ...layoutRequestInput(repairPayload),
        temperature: 0.2,
      });
      return parseCanvasPlan(extractStructuredJson(repaired));
    } catch {
      throw firstError instanceof Error
        ? firstError
        : new Error(String(firstError));
    }
  }
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

export const listAnnouncements = createServerFn({ method: "GET" })
  .middleware([requireSessionMiddleware])
  .handler((): Promise<AnnouncementSummary[]> => readIndex());

export const getAnnouncement = createServerFn({ method: "GET" })
  .middleware([requireSessionMiddleware])
  .validator((id: string) => id)
  .handler(async ({ data }): Promise<AnnouncementDraft | null> => {
    const draft = await getJson<AnnouncementDraftRaw>(draftKey(data));
    return draft ? normalizeDraft(draft) : null;
  });

export const createAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSessionMiddleware])
  .validator((data: CreateAnnouncementInput) => data)
  .handler(async ({ data }): Promise<{ id: string }> => {
    const name = data.name.trim();

    if (!name) {
      throw new Error("Name is required.");
    }

    const id = uuidv4();
    const timestamp = nowIso();
    const content = emptyContent({
      heading: data.heading,
      subtitle: data.subtitle,
      tertiary: data.tertiary,
      title: data.title || name,
    });

    await saveDraft({
      appliedStyleId: "classic-bottom",
      approvedAt: null,
      backgroundPrompt: data.backgroundPrompt?.trim() || "",
      content,
      createdAt: timestamp,
      exportObjectKey: null,
      generationJob: null,
      height: ANNOUNCEMENT_HEIGHT,
      id,
      legacyHtml: null,
      name,
      // Canvas is project JSON only — client applies default preset and saves.
      projectData: null,
      selectedVariationId: null,
      showInPresentationDeck: false,
      status: "draft",
      updatedAt: timestamp,
      variations: [],
      width: ANNOUNCEMENT_WIDTH,
    });

    return { id };
  });

export const saveAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSessionMiddleware])
  .validator((data: SaveAnnouncementInput) => data)
  .handler(async ({ data }): Promise<AnnouncementDraft> => {
    const draft = await loadDraft(data.id);

    if (data.name !== undefined) {
      const name = data.name.trim();

      if (!name) {
        throw new Error("Name is required.");
      }

      draft.name = name;
    }

    if (data.content) {
      draft.content = emptyContent(data.content);
    }

    if (data.projectData !== undefined) {
      draft.projectData = normalizeProjectData(data.projectData);
    }

    if (data.backgroundPrompt !== undefined) {
      draft.backgroundPrompt = data.backgroundPrompt.trim();
    }

    if (data.appliedStyleId !== undefined) {
      draft.appliedStyleId =
        typeof data.appliedStyleId === "string" && data.appliedStyleId.trim()
          ? data.appliedStyleId.trim()
          : null;
    }

    markDirtyIfApproved(draft);
    return await saveDraft(draft);
  });

/**
 * Enqueue async AI background generation (HTTP path stays thin).
 * Consumer: `processAnnouncementImageGen` via OOS_ANNOUNCEMENT_IMAGE_GEN.
 */
export const generateBackgrounds = createServerFn({ method: "POST" })
  .middleware([requireSessionMiddleware])
  .validator((data: GenerateBackgroundsInput) => data)
  .handler(async ({ data }): Promise<AnnouncementDraft> => {
    const draft = await loadDraft(data.id);
    const prompt = (data.prompt ?? draft.backgroundPrompt).trim();

    if (!prompt) {
      throw new Error("A background prompt is required to generate images.");
    }

    if (isGenerationJobActive(draft.generationJob)) {
      throw new Error(
        "Background generation is already in progress for this announcement."
      );
    }

    const count = Math.min(
      MAX_VARIATIONS_PER_REQUEST,
      Math.max(1, data.count ?? DEFAULT_VARIATION_COUNT)
    );

    const useSelectedAsContext = data.useSelectedAsContext !== false;
    let parentVariationId: string | null = null;
    let referenceObjectKey: string | null = null;

    if (useSelectedAsContext && draft.selectedVariationId) {
      const selected = draft.variations.find(
        (variation) => variation.id === draft.selectedVariationId
      );

      if (selected) {
        parentVariationId = selected.id;
        referenceObjectKey = selected.objectKey;
      }
    }

    const jobId = uuidv4();
    const timestamp = nowIso();
    draft.backgroundPrompt = prompt;
    draft.generationJob = {
      completedCount: 0,
      error: null,
      id: jobId,
      prompt,
      requestedCount: count,
      startedAt: null,
      status: "queued",
      updatedAt: timestamp,
      useSelectedAsContext: Boolean(referenceObjectKey),
    };
    markDirtyIfApproved(draft);
    const saved = await saveDraft(draft);

    const message: AnnouncementImageGenQueueMessage = {
      announcementId: draft.id,
      count,
      jobId,
      parentVariationId,
      prompt,
      referenceObjectKey,
    };

    try {
      await getImageGenQueue().send(message, { contentType: "json" });
    } catch (error) {
      saved.generationJob = {
        completedCount: 0,
        error: formatAiError(error),
        id: jobId,
        prompt,
        requestedCount: count,
        startedAt: null,
        status: "failed",
        updatedAt: nowIso(),
        useSelectedAsContext: Boolean(referenceObjectKey),
      };
      await saveDraft(saved);
      throw new Error(
        `Could not enqueue background generation: ${formatAiError(error)}`,
        { cause: error }
      );
    }

    return saved;
  });

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

/**
 * Generate remaining variations one-by-one (recursive) so peak memory stays
 * low — never Promise.all. URL responses stream into R2.
 */
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

export const addLibraryImageAsVariation = createServerFn({ method: "POST" })
  .middleware([requireSessionMiddleware])
  .validator((data: AddLibraryImageAsVariationInput) => data)
  .handler(async ({ data }): Promise<AnnouncementDraft> => {
    const libraryObjectKey = data.libraryObjectKey.trim();

    if (!libraryObjectKey.startsWith(LIBRARY_R2_PREFIX)) {
      throw new Error("Invalid library object key.");
    }

    const draft = await loadDraft(data.id);
    const libraryObject = await getBucket().get(libraryObjectKey);

    if (!libraryObject) {
      throw new Error("Library image was not found in R2 storage.");
    }

    const custom = libraryObject.customMetadata ?? {};
    const libraryImageId = custom.id?.trim() || null;
    const libraryFilename =
      custom.filename?.trim() ||
      libraryObjectKey.split("/").pop() ||
      "library-image";
    const contentType =
      libraryObject.httpMetadata?.contentType ||
      custom.contentType ||
      "image/jpeg";
    const extension = extensionForContentType(contentType);
    const bytes = await libraryObject.arrayBuffer();
    const variationId = uuidv4();
    const objectKey = backgroundKey(draft.id, variationId, extension);

    // Copy into the announcement's own storage so library deletes cannot break
    // this draft, and removeVariation only deletes the announcement copy.
    await putImageBytes(objectKey, bytes, contentType);

    const variation: AnnouncementVariation = {
      createdAt: nowIso(),
      id: variationId,
      libraryFilename,
      libraryImageId,
      objectKey,
      parentVariationId: null,
      prompt: `Library image: ${libraryFilename}`,
      source: "library",
    };

    draft.variations = [variation, ...draft.variations];

    if (data.select !== false) {
      draft.selectedVariationId = variation.id;
    } else if (!draft.selectedVariationId) {
      draft.selectedVariationId = variation.id;
    }

    markDirtyIfApproved(draft);
    return await saveDraft(draft);
  });

export const selectVariation = createServerFn({ method: "POST" })
  .middleware([requireSessionMiddleware])
  .validator((data: SelectVariationInput) => data)
  .handler(async ({ data }): Promise<AnnouncementDraft> => {
    const draft = await loadDraft(data.id);
    const variation = draft.variations.find(
      (item) => item.id === data.variationId
    );

    if (!variation) {
      throw new Error("Variation not found.");
    }

    draft.selectedVariationId = variation.id;
    markDirtyIfApproved(draft);
    return await saveDraft(draft);
  });

export const clearVariationContext = createServerFn({ method: "POST" })
  .middleware([requireSessionMiddleware])
  .validator((data: ClearVariationContextInput) => data)
  .handler(async ({ data }): Promise<AnnouncementDraft> => {
    const draft = await loadDraft(data.id);

    if (!draft.selectedVariationId) {
      return draft;
    }

    draft.selectedVariationId = null;
    markDirtyIfApproved(draft);
    return await saveDraft(draft);
  });

export const removeVariation = createServerFn({ method: "POST" })
  .middleware([requireSessionMiddleware])
  .validator((data: RemoveVariationInput) => data)
  .handler(async ({ data }): Promise<AnnouncementDraft> => {
    const draft = await loadDraft(data.id);
    const variation = draft.variations.find(
      (item) => item.id === data.variationId
    );

    if (!variation) {
      throw new Error("Variation not found.");
    }

    await getBucket().delete(variation.objectKey);

    draft.variations = draft.variations.filter(
      (item) => item.id !== data.variationId
    );

    if (draft.selectedVariationId === data.variationId) {
      draft.selectedVariationId = null;
    }

    markDirtyIfApproved(draft);
    return await saveDraft(draft);
  });

export const removeAllVariations = createServerFn({ method: "POST" })
  .middleware([requireSessionMiddleware])
  .validator((data: RemoveAllVariationsInput) => data)
  .handler(async ({ data }): Promise<AnnouncementDraft> => {
    const draft = await loadDraft(data.id);

    if (draft.variations.length === 0) {
      return draft;
    }

    const bucket = getBucket();
    await Promise.all(
      draft.variations.map((variation) => bucket.delete(variation.objectKey))
    );

    draft.variations = [];
    draft.selectedVariationId = null;
    markDirtyIfApproved(draft);
    return await saveDraft(draft);
  });

/**
 * Generate a CanvasPlan via AI (structured JSON schema).
 * Client applies the plan with GrapesJS Editor APIs — never HTML seed.
 */
export const generateAnnouncementLayout = createServerFn({ method: "POST" })
  .middleware([requireSessionMiddleware])
  .validator((data: GenerateAnnouncementLayoutInput) => data)
  .handler(async ({ data }): Promise<GenerateAnnouncementLayoutResult> => {
    const draft = await loadDraft(data.id);

    if (
      !(
        draft.content.title ||
        draft.content.subtitle ||
        draft.content.heading ||
        draft.content.tertiary
      )
    ) {
      throw new Error("Add title, subtitle, heading, or tertiary text first.");
    }

    const plan = await generateLayoutPlanWithAi({
      content: draft.content,
      styleNotes: data.styleNotes,
    });

    markDirtyIfApproved(draft);
    const saved = await saveDraft(draft);

    // Plan is ephemeral — not stored on the draft.
    return { draft: saved, plan };
  });

export const getAnnouncementAsset = createServerFn({ method: "GET" })
  .middleware([requireSessionMiddleware])
  .validator((objectKey: string) => objectKey)
  .handler(async ({ data }): Promise<AnnouncementAsset> => {
    if (!data.startsWith("announcements/")) {
      throw new Error("Invalid object key.");
    }

    return await readAssetBase64(data);
  });

export const approveAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSessionMiddleware])
  .validator((data: ApproveAnnouncementInput) => data)
  .handler(async ({ data }): Promise<AnnouncementDraft> => {
    const draft = await loadDraft(data.id);

    if (!draft.selectedVariationId) {
      throw new Error("Select a background variation before approving.");
    }

    if (!data.base64.trim()) {
      throw new Error("Exported JPEG data is required.");
    }

    const objectKey = exportKey(draft.id);
    await putImageBytes(
      objectKey,
      Buffer.from(data.base64, "base64"),
      "image/jpeg"
    );

    draft.exportObjectKey = objectKey;
    draft.status = "approved";
    draft.approvedAt = nowIso();
    return await saveDraft(draft);
  });

export const setShowInPresentationDeck = createServerFn({ method: "POST" })
  .middleware([requireSessionMiddleware])
  .validator((data: SetShowInPresentationDeckInput) => data)
  .handler(async ({ data }): Promise<AnnouncementDraft> => {
    const draft = await loadDraft(data.id);

    if (draft.status !== "approved" || !draft.exportObjectKey) {
      throw new Error(
        "Only approved announcements can be shown in the presentation deck."
      );
    }

    draft.showInPresentationDeck = Boolean(data.showInPresentationDeck);
    return await saveDraft(draft);
  });

/**
 * Public (unauthenticated) list of approved announcements opted into the
 * presentation deck, with JPEG export payloads for the slideshow.
 */
export const listPresentationDeck = createServerFn({ method: "GET" }).handler(
  async (): Promise<PresentationSlide[]> => {
    const index = await readIndex();
    const eligible = index.filter(
      (item) =>
        item.status === "approved" &&
        item.showInPresentationDeck &&
        Boolean(item.exportObjectKey)
    );

    // Stable order: oldest approved first so the deck order is predictable.
    eligible.sort(
      (a, b) =>
        (Date.parse(a.approvedAt ?? a.createdAt) || 0) -
        (Date.parse(b.approvedAt ?? b.createdAt) || 0)
    );

    const results = await Promise.all(
      eligible.map(async (item): Promise<PresentationSlide | null> => {
        const objectKey = item.exportObjectKey;

        if (!objectKey) {
          return null;
        }

        try {
          const asset = await readAssetBase64(objectKey);
          return {
            base64: asset.base64,
            contentType: asset.contentType,
            id: item.id,
            name: item.name,
          };
        } catch {
          // Skip missing exports rather than failing the whole deck.
          return null;
        }
      })
    );

    return results.filter(
      (slide): slide is PresentationSlide => slide !== null
    );
  }
);

export const deleteAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSessionMiddleware])
  .validator((id: string) => id)
  .handler(async ({ data }): Promise<void> => {
    const draft = await getJson<AnnouncementDraftRaw>(draftKey(data));
    const bucket = getBucket();
    const keys = new Set<string>([draftKey(data)]);

    if (draft) {
      for (const variation of draft.variations ?? []) {
        keys.add(variation.objectKey);
      }

      if (typeof draft.exportObjectKey === "string") {
        keys.add(draft.exportObjectKey);
      }
    }

    const listed = await bucket.list({ prefix: `announcements/${data}/` });

    for (const object of listed.objects) {
      keys.add(object.key);
    }

    await Promise.all([...keys].map((key) => bucket.delete(key)));
    await removeIndexEntry(data);
  });
