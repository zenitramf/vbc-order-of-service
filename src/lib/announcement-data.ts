import { Buffer } from "node:buffer";

import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { v4 as uuidv4 } from "uuid";

import { buildDesignPresetHtml } from "~/lib/announcement-style-library";
import type {
  AddLibraryImageAsVariationInput,
  AnnouncementAsset,
  AnnouncementContent,
  AnnouncementDraft,
  AnnouncementSummary,
  AnnouncementVariation,
  ApproveAnnouncementInput,
  CreateAnnouncementInput,
  GenerateAnnouncementHtmlInput,
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
/** Fast non-reasoning chat model for HTML overlay generation. */
const TEXT_MODEL = "xai/grok-4.20-0309-non-reasoning";
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

const normalizeDraft = (draft: AnnouncementDraft): AnnouncementDraft => ({
  ...draft,
  appliedStyleId:
    typeof draft.appliedStyleId === "string" && draft.appliedStyleId.trim()
      ? draft.appliedStyleId.trim()
      : null,
  showInPresentationDeck: Boolean(draft.showInPresentationDeck),
  variations: draft.variations.map((variation) =>
    normalizeVariation(variation)
  ),
});

const emptyContent = (
  partial?: Partial<AnnouncementContent>
): AnnouncementContent => ({
  heading: partial?.heading?.trim() ?? "",
  subtitle: partial?.subtitle?.trim() ?? "",
  tertiary: partial?.tertiary?.trim() ?? "",
  title: partial?.title?.trim() ?? "",
});

/** Sensible default overlay — classic bottom band design preset. */
const buildDefaultHtml = (content: AnnouncementContent): string =>
  buildDesignPresetHtml("classic-bottom", content) ??
  `<div class="announcement-overlay" style="box-sizing:border-box;width:1920px;height:1080px;position:relative;overflow:hidden;background:transparent;"></div>`;

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
  const draft = await getJson<AnnouncementDraft>(draftKey(id));

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
    updatedAt: nowIso(),
  };

  await putJson(draftKey(next.id), next);
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

const downloadUrlAsBytes = async (url: string): Promise<ArrayBuffer> => {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download generated image (${response.status}).`);
  }

  return await response.arrayBuffer();
};

const resolveImagePayload = async (image: string): Promise<ArrayBuffer> => {
  if (image.startsWith("data:")) {
    const comma = image.indexOf(",");
    const base64 = comma === -1 ? image : image.slice(comma + 1);
    return Buffer.from(base64, "base64").buffer;
  }

  if (image.startsWith("http://") || image.startsWith("https://")) {
    return await downloadUrlAsBytes(image);
  }

  // Assume raw base64
  return Buffer.from(image, "base64").buffer;
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

const generateOneBackgroundImage = async (options: {
  index: number;
  prompt: string;
  referenceContentType?: string;
  referenceImageBase64?: string;
  total: number;
}): Promise<ArrayBuffer> => {
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
    response_format: "b64_json",
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

  return await resolveImagePayload(imagePayload);
};

const generateBackgroundImages = async (options: {
  count: number;
  prompt: string;
  referenceContentType?: string;
  referenceImageBase64?: string;
}): Promise<ArrayBuffer[]> => {
  const tasks = Array.from({ length: options.count }, (_, index) =>
    generateOneBackgroundImage({
      index,
      prompt: options.prompt,
      referenceContentType: options.referenceContentType,
      referenceImageBase64: options.referenceImageBase64,
      total: options.count,
    })
  );

  return await Promise.all(tasks);
};

const stripCodeFences = (value: string): string => {
  const trimmed = value.trim();
  const fenced = /^```(?:html)?\s*(?<body>[\s\S]*?)```$/iu.exec(trimmed);

  if (fenced?.groups?.body) {
    return fenced.groups.body.trim();
  }

  return trimmed;
};

const extractChatContent = (response: unknown): string | null => {
  if (!response || typeof response !== "object") {
    return null;
  }

  const record = response as Record<string, unknown>;

  if (typeof record.response === "string") {
    return record.response;
  }

  const { choices } = record;
  if (Array.isArray(choices) && choices[0]) {
    const choice = choices[0] as Record<string, unknown>;
    const message = choice.message as Record<string, unknown> | undefined;
    if (typeof message?.content === "string") {
      return message.content;
    }
    if (typeof choice.text === "string") {
      return choice.text;
    }
  }

  const { result } = record;
  if (result && typeof result === "object") {
    const resultRecord = result as Record<string, unknown>;
    if (typeof resultRecord.response === "string") {
      return resultRecord.response;
    }
    if (Array.isArray(resultRecord.choices) && resultRecord.choices[0]) {
      const choice = resultRecord.choices[0] as Record<string, unknown>;
      const message = choice.message as Record<string, unknown> | undefined;
      if (typeof message?.content === "string") {
        return message.content;
      }
    }
  }

  return null;
};

const generateHtmlWithAi = async (options: {
  content: AnnouncementContent;
  styleNotes?: string;
}): Promise<string> => {
  const system = [
    "You design HTML overlays for church announcement graphics.",
    "Output ONLY a single HTML fragment (no markdown, no explanation).",
    "The root element MUST be exactly 1920px wide and 1080px tall.",
    "Use only inline styles. Do not load external fonts, scripts, or images.",
    "Do NOT paint a photographic background; the background will be a separate image under this HTML.",
    "CRITICAL: The root and any full-bleed layers MUST use background:transparent (or omit background).",
    "CRITICAL: Any readability scrim or panel background MUST be an alpha linear-gradient using rgba() stops that fade to transparent — NEVER solid background-color, NEVER opaque fills (no #000, black, rgb without alpha).",
    "Example scrim: background:linear-gradient(to top, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.22) 42%, transparent 78%); background-color:transparent;",
    "Text must be highly legible on varied photos (text-shadow + alpha gradient scrims only).",
    "Include semantic structure for title, subtitle, heading, and tertiary info.",
    'Prefer data-ann-role attributes on semantic pieces so style packs can retarget them: data-ann-role="heading", "title", "subtitle", "body", "scrim-bottom", "scrim-top", "scrim-left", "scrim-right", or "panel".',
    "Escape any user content that could break HTML.",
  ].join(" ");

  const user = JSON.stringify(
    {
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

  const response = await runAiGateway(TEXT_MODEL, {
    messages: [
      { content: system, role: "system" },
      { content: user, role: "user" },
    ],
    temperature: 0.6,
  });

  const raw = extractChatContent(response)?.trim();

  if (!raw) {
    throw new Error("AI Gateway returned empty HTML.");
  }

  const html = stripCodeFences(raw);

  if (!html.includes("<")) {
    throw new Error("AI did not return valid HTML markup.");
  }

  return html;
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
    const draft = await getJson<AnnouncementDraft>(draftKey(data));
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
      height: ANNOUNCEMENT_HEIGHT,
      html: buildDefaultHtml(content),
      id,
      name,
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

    if (data.html !== undefined) {
      draft.html = data.html;
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

export const generateBackgrounds = createServerFn({ method: "POST" })
  .middleware([requireSessionMiddleware])
  .validator((data: GenerateBackgroundsInput) => data)
  .handler(async ({ data }): Promise<AnnouncementDraft> => {
    const draft = await loadDraft(data.id);
    const prompt = (data.prompt ?? draft.backgroundPrompt).trim();

    if (!prompt) {
      throw new Error("A background prompt is required to generate images.");
    }

    const count = Math.min(
      MAX_VARIATIONS_PER_REQUEST,
      Math.max(1, data.count ?? DEFAULT_VARIATION_COUNT)
    );

    draft.backgroundPrompt = prompt;

    let referenceImageBase64: string | undefined;
    let referenceContentType: string | undefined;
    let parentVariationId: string | null = null;

    if (data.useSelectedAsContext !== false && draft.selectedVariationId) {
      const selected = draft.variations.find(
        (variation) => variation.id === draft.selectedVariationId
      );

      if (selected) {
        const asset = await readAssetBase64(selected.objectKey);
        referenceImageBase64 = asset.base64;
        referenceContentType = asset.contentType;
        parentVariationId = selected.id;
      }
    }

    const images = await generateBackgroundImages({
      count,
      prompt,
      referenceContentType,
      referenceImageBase64,
    });

    const created = await Promise.all(
      images.map(async (bytes) => {
        const variationId = uuidv4();
        const objectKey = backgroundKey(draft.id, variationId);
        await putImageBytes(objectKey, bytes);
        const variation: AnnouncementVariation = {
          createdAt: nowIso(),
          id: variationId,
          libraryFilename: null,
          libraryImageId: null,
          objectKey,
          parentVariationId,
          prompt,
          source: "generated",
        };
        return variation;
      })
    );

    draft.variations = [...created, ...draft.variations];

    if (!draft.selectedVariationId && created[0]) {
      draft.selectedVariationId = created[0].id;
    }

    markDirtyIfApproved(draft);
    return await saveDraft(draft);
  });

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

export const generateAnnouncementHtml = createServerFn({ method: "POST" })
  .middleware([requireSessionMiddleware])
  .validator((data: GenerateAnnouncementHtmlInput) => data)
  .handler(async ({ data }): Promise<AnnouncementDraft> => {
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

    draft.html = await generateHtmlWithAi({
      content: draft.content,
      styleNotes: data.styleNotes,
    });

    markDirtyIfApproved(draft);
    return await saveDraft(draft);
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
    const draft = await getJson<AnnouncementDraft>(draftKey(data));
    const bucket = getBucket();
    const keys = new Set<string>([draftKey(data)]);

    if (draft) {
      for (const variation of draft.variations) {
        keys.add(variation.objectKey);
      }

      if (draft.exportObjectKey) {
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
