import { Buffer } from "node:buffer";

import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

import { getAppDb } from "~/db/client";
import type { AppDatabase } from "~/db/client";
import { appSettings } from "~/db/schema";
import type { CanvasPlan } from "~/lib/announcement-ai-plan";
import { isMaterialSave } from "~/lib/announcement-material";
import type {
  AddLibraryImageAsVariationInput,
  AnnouncementAiQueueMessage,
  AnnouncementAsset,
  AnnouncementContent,
  AnnouncementDraft,
  AnnouncementGenerationJob,
  AnnouncementLayoutJob,
  AnnouncementSummary,
  AnnouncementVariation,
  ApproveAnnouncementInput,
  CreateAnnouncementInput,
  ExportAnnouncementInput,
  GenerateAnnouncementLayoutInput,
  GenerateAnnouncementLayoutResult,
  GenerateBackgroundsInput,
  PresentationDeckEditorSlide,
  PresentationDeckOrderSettings,
  PresentationSlide,
  SaveAnnouncementInput,
  SavePresentationDeckOrderInput,
  ClearVariationContextInput,
  RemoveAllVariationsInput,
  RemoveVariationInput,
  SelectVariationInput,
  SetShowInPresentationDeckInput,
} from "~/lib/announcement-types";
import {
  ANNOUNCEMENT_HEIGHT,
  ANNOUNCEMENT_WIDTH,
  SILENCE_PHONE_PLACEHOLDER_URL,
  SILENCE_PHONE_SLIDE_ID,
} from "~/lib/announcement-types";
import { requireSessionMiddleware } from "~/lib/auth.functions";
import { LIBRARY_R2_PREFIX } from "~/lib/image-library-types";

export { isMaterialSave } from "~/lib/announcement-material";

const INDEX_KEY = "announcements/index.json";
/** D1 `app_settings` key for presentation deck announcement order. */
const PRESENTATION_DECK_ORDER_KEY = "presentationDeckOrder";
/** Always generate a single background per request (UI no longer exposes count). */
const VARIATIONS_PER_REQUEST = 1;

const SILENCE_PHONE_SLIDE: PresentationSlide = {
  exportObjectKey: null,
  id: SILENCE_PHONE_SLIDE_ID,
  imageUrl: SILENCE_PHONE_PLACEHOLDER_URL,
  kind: "silence_phone",
  name: "Please silence your phone",
};

const getBucket = (): R2Bucket => {
  if (!env.SERVICE_PDFS) {
    throw new Error("Cloudflare R2 binding SERVICE_PDFS is not configured.");
  }

  return env.SERVICE_PDFS;
};

const getAnnouncementAiQueue = (): Queue<AnnouncementAiQueueMessage> => {
  const queue = (
    env as unknown as {
      OOS_ANNOUNCEMENT_IMAGE_GEN?: Queue<AnnouncementAiQueueMessage>;
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

const isLayoutJobActive = (
  job: AnnouncementLayoutJob | null | undefined
): boolean => job?.status === "queued" || job?.status === "running";

const formatQueueError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
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
  layoutJob?: unknown;
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

const isLayoutPlan = (value: unknown): value is CanvasPlan => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const raw = value as Record<string, unknown>;
  return raw.version === 1 && raw.mode === "rebuild" && Array.isArray(raw.ops);
};

/** Backfill for drafts saved before async layout jobs existed. */
const normalizeLayoutJob = (value: unknown): AnnouncementLayoutJob | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const raw = value as Partial<AnnouncementLayoutJob> & { plan?: unknown };
  const status = isGenerationStatus(raw.status) ? raw.status : "idle";
  const id = typeof raw.id === "string" ? raw.id.trim() : "";

  if (!id) {
    return null;
  }

  return {
    error: asNullableString(raw.error),
    id,
    plan: isLayoutPlan(raw.plan) ? raw.plan : null,
    startedAt: asNullableString(raw.startedAt),
    status,
    styleNotes: asString(raw.styleNotes),
    updatedAt: asString(raw.updatedAt, nowIso()),
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
    layoutJob: normalizeLayoutJob(raw.layoutJob),
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
  layoutJob: draft.layoutJob,
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
      layoutJob: null,
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
    // Compare against stored draft *before* applying mutations.
    const material = isMaterialSave(draft, data);

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

    if (material) {
      markDirtyIfApproved(draft);
    }

    return await saveDraft(draft);
  });

/**
 * Enqueue async AI background generation (HTTP path stays thin).
 * Consumer: slim Worker `vbc-oos-announcement-image-gen` (deploy:image-gen).
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

    // Ignore client-supplied count — always one variation per generate.
    const count = VARIATIONS_PER_REQUEST;

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

    const message: AnnouncementAiQueueMessage = {
      announcementId: draft.id,
      count,
      jobId,
      parentVariationId,
      prompt,
      referenceObjectKey,
      type: "background",
    };

    try {
      await getAnnouncementAiQueue().send(message, { contentType: "json" });
    } catch (error) {
      saved.generationJob = {
        completedCount: 0,
        error: formatQueueError(error),
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
        `Could not enqueue background generation: ${formatQueueError(error)}`,
        { cause: error }
      );
    }

    return saved;
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

    if (
      libraryImageId &&
      draft.variations.some(
        (variation) =>
          variation.source === "library" &&
          variation.libraryImageId === libraryImageId
      )
    ) {
      throw new Error(
        "This library image is already in the announcement variation library."
      );
    }

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
 * Enqueue async AI layout generation (CanvasPlan) on the slim worker.
 * Client polls `layoutJob` and applies the plan with GrapesJS — never HTML seed.
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

    if (isLayoutJobActive(draft.layoutJob)) {
      throw new Error(
        "Layout generation is already in progress for this announcement."
      );
    }

    const jobId = uuidv4();
    const timestamp = nowIso();
    const styleNotes = data.styleNotes?.trim() || "";

    draft.layoutJob = {
      error: null,
      id: jobId,
      plan: null,
      startedAt: null,
      status: "queued",
      styleNotes,
      updatedAt: timestamp,
    };
    // Enqueue alone does not change the canvas — demote only when plan is applied.
    const saved = await saveDraft(draft);

    const message: AnnouncementAiQueueMessage = {
      announcementId: draft.id,
      jobId,
      styleNotes,
      type: "layout",
    };

    try {
      await getAnnouncementAiQueue().send(message, { contentType: "json" });
    } catch (error) {
      saved.layoutJob = {
        error: formatQueueError(error),
        id: jobId,
        plan: null,
        startedAt: null,
        status: "failed",
        styleNotes,
        updatedAt: nowIso(),
      };
      await saveDraft(saved);
      throw new Error(
        `Could not enqueue layout generation: ${formatQueueError(error)}`,
        { cause: error }
      );
    }

    return { draft: saved };
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

/**
 * Store a client-captured JPG export. Does not change approval status.
 */
export const exportAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSessionMiddleware])
  .validator((data: ExportAnnouncementInput) => data)
  .handler(async ({ data }): Promise<AnnouncementDraft> => {
    const draft = await loadDraft(data.id);

    if (!draft.selectedVariationId) {
      throw new Error("Select a background variation before exporting.");
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
    return await saveDraft(draft);
  });

/**
 * Mark announcement approved. Does not capture or store a JPG — use export.
 */
export const approveAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSessionMiddleware])
  .validator((data: ApproveAnnouncementInput) => data)
  .handler(async ({ data }): Promise<AnnouncementDraft> => {
    const draft = await loadDraft(data.id);

    if (!draft.selectedVariationId) {
      throw new Error("Select a background variation before approving.");
    }

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

const parsePresentationDeckOrder = (
  value: string | null | undefined
): PresentationDeckOrderSettings => {
  if (!value) {
    return { orderedIds: [] };
  }

  try {
    const parsed: unknown = JSON.parse(value);

    if (!parsed || typeof parsed !== "object") {
      return { orderedIds: [] };
    }

    const { orderedIds } = parsed as { orderedIds?: unknown };

    if (!Array.isArray(orderedIds)) {
      return { orderedIds: [] };
    }

    return {
      orderedIds: orderedIds.filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0
      ),
    };
  } catch {
    return { orderedIds: [] };
  }
};

const loadPresentationDeckOrder = async (
  db: AppDatabase
): Promise<PresentationDeckOrderSettings> => {
  const row = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, PRESENTATION_DECK_ORDER_KEY))
    .get();

  return parsePresentationDeckOrder(row?.value);
};

/**
 * Order eligible deck announcements by saved D1 order. Ids present in the
 * saved list come first (in that order); any new deck members not yet saved
 * append after, oldest-approved first. Silence-phone is never stored here.
 */
const orderEligibleDeckItems = (
  eligible: AnnouncementSummary[],
  orderedIds: string[]
): AnnouncementSummary[] => {
  const byId = new Map(eligible.map((item) => [item.id, item]));
  const ordered: AnnouncementSummary[] = [];
  const seen = new Set<string>();

  for (const id of orderedIds) {
    const item = byId.get(id);

    if (!item || seen.has(id)) {
      continue;
    }

    ordered.push(item);
    seen.add(id);
  }

  // oxlint-disable-next-line unicorn/no-array-sort -- ES2022 target lacks toSorted.
  const remainder = eligible
    .filter((item) => !seen.has(item.id))
    .sort(
      (a, b) =>
        (Date.parse(a.approvedAt ?? a.createdAt) || 0) -
        (Date.parse(b.approvedAt ?? b.createdAt) || 0)
    );

  return [...ordered, ...remainder];
};

const eligibleDeckSummaries = (
  index: AnnouncementSummary[]
): AnnouncementSummary[] =>
  index.filter(
    (item) =>
      item.status === "approved" &&
      item.showInPresentationDeck &&
      Boolean(item.exportObjectKey)
  );

const summaryToEditorSlide = (
  item: AnnouncementSummary
): PresentationDeckEditorSlide | null => {
  const { exportObjectKey } = item;

  if (!exportObjectKey) {
    return null;
  }

  return {
    approvedAt: item.approvedAt,
    exportObjectKey,
    id: item.id,
    name: item.name,
    updatedAt: item.updatedAt,
  };
};

const summaryToPresentationSlide = (
  item: AnnouncementSummary
): PresentationSlide | null => {
  const { exportObjectKey } = item;

  if (!exportObjectKey) {
    return null;
  }

  return {
    exportObjectKey,
    id: item.id,
    kind: "announcement",
    name: item.name,
  };
};

/**
 * Authenticated deck editor payload: ordered announcement slides currently on
 * the deck (silence-phone is fixed at the end of the public player, not here).
 */
export const getPresentationDeckEditor = createServerFn({ method: "GET" })
  .middleware([requireSessionMiddleware])
  .handler(async (): Promise<PresentationDeckEditorSlide[]> => {
    const [index, order] = await Promise.all([
      readIndex(),
      loadPresentationDeckOrder(getAppDb()),
    ]);
    const ordered = orderEligibleDeckItems(
      eligibleDeckSummaries(index),
      order.orderedIds
    );

    return ordered.flatMap((item) => {
      const slide = summaryToEditorSlide(item);
      return slide ? [slide] : [];
    });
  });

/**
 * Persist deck order explicitly (no autosave). Only announcement ids that are
 * currently approved and opted into the deck are stored; unknown ids are dropped.
 */
export const savePresentationDeckOrder = createServerFn({ method: "POST" })
  .middleware([requireSessionMiddleware])
  .validator((data: SavePresentationDeckOrderInput) => data)
  .handler(async ({ data }): Promise<{ orderedIds: string[] }> => {
    const db = getAppDb();
    const index = await readIndex();
    const eligibleIds = new Set(
      eligibleDeckSummaries(index).map((item) => item.id)
    );

    const seen = new Set<string>();
    const orderedIds: string[] = [];

    for (const rawId of data.orderedIds) {
      const id = typeof rawId === "string" ? rawId.trim() : "";

      if (
        !id ||
        id === SILENCE_PHONE_SLIDE_ID ||
        seen.has(id) ||
        !eligibleIds.has(id)
      ) {
        continue;
      }

      orderedIds.push(id);
      seen.add(id);
    }

    // Keep any currently-on-deck ids that the client omitted (e.g. added while
    // editing) so they stay in the deck after save, appended at the end.
    for (const id of eligibleIds) {
      if (!seen.has(id)) {
        orderedIds.push(id);
        seen.add(id);
      }
    }

    const value = JSON.stringify({
      orderedIds,
    } satisfies PresentationDeckOrderSettings);
    const timestamp = nowIso();

    await db
      .insert(appSettings)
      .values({
        key: PRESENTATION_DECK_ORDER_KEY,
        updatedAt: timestamp,
        value,
      })
      .onConflictDoUpdate({
        set: { updatedAt: timestamp, value },
        target: appSettings.key,
      });

    return { orderedIds };
  });

/**
 * Public (unauthenticated) list of approved announcements opted into the
 * presentation deck, ordered by D1 settings, with the silence-phone system
 * slide always last. Returns metadata only — browsers load announcement JPEGs
 * via `/api/presentation-asset` (binary), not base64 over this server function.
 */
export const listPresentationDeck = createServerFn({ method: "GET" }).handler(
  async (): Promise<PresentationSlide[]> => {
    const [index, order] = await Promise.all([
      readIndex(),
      loadPresentationDeckOrder(getAppDb()),
    ]);
    const ordered = orderEligibleDeckItems(
      eligibleDeckSummaries(index),
      order.orderedIds
    );

    const slides = ordered.flatMap((item): PresentationSlide[] => {
      const slide = summaryToPresentationSlide(item);
      return slide ? [slide] : [];
    });

    // Always last — never stored in deck order settings.
    slides.push(SILENCE_PHONE_SLIDE);

    return slides;
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
