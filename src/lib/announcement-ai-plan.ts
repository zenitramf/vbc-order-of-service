/**
 * CanvasPlan: structured AI layout ops applied via the GrapesJS Editor API.
 * Never HTML, never full GrapesJS project JSON from the model.
 */

import { z } from "zod";

import {
  ANNOUNCEMENT_BLOCK_IDS,
  isAnnouncementBlockId,
} from "~/lib/announcement-block-templates";
import type { AnnouncementBlockId } from "~/lib/announcement-block-templates";
import { coerceBackgroundToAlphaGradient } from "~/lib/announcement-overlay-html";
import type { AnnouncementStyleRole } from "~/lib/announcement-style-library";

export const CANVAS_PLAN_VERSION = 1 as const;
export const MAX_CANVAS_OPS = 40;

export const ANNOUNCEMENT_STYLE_ROLES = [
  "heading",
  "title",
  "subtitle",
  "body",
  "link",
  "scrim-bottom",
  "scrim-top",
  "scrim-left",
  "scrim-right",
  "panel",
] as const satisfies readonly AnnouncementStyleRole[];

export const STYLE_PACK_IDS = [
  "classic-bottom",
  "lower-left",
  "centered-hero",
  "top-banner",
  "left-panel",
  "right-panel",
  "two-panel",
  "corner-card",
] as const;

/** CSS properties the AI may set on components. */
const ALLOWED_STYLE_KEYS = new Set([
  "align-items",
  "background",
  "background-color",
  "border",
  "border-radius",
  "bottom",
  "box-sizing",
  "box-shadow",
  "color",
  "display",
  "flex-direction",
  "font-family",
  "font-size",
  "font-weight",
  "gap",
  "height",
  "justify-content",
  "left",
  "letter-spacing",
  "line-height",
  "margin",
  "max-height",
  "max-width",
  "min-height",
  "min-width",
  "opacity",
  "padding",
  "pointer-events",
  "position",
  "right",
  "text-align",
  "text-decoration",
  "text-shadow",
  "text-transform",
  "top",
  "width",
  "z-index",
]);

const FORBIDDEN_PHOTO_STYLE_KEYS = new Set([
  "background-image",
  "background-size",
  "background-position",
  "background-repeat",
]);

const URL_IN_VALUE_RE = /url\s*\(/iu;
const TAG_RE = /<\/?[a-z][\s\S]*>/iu;
const GRADIENT_RE = /gradient\s*\(/iu;

/**
 * Normalize a CSS property name to kebab-case. Models frequently emit
 * camelCase (fontSize, whiteSpace) which browsers ignore as inline styles and
 * which would otherwise fail the kebab-case allow-list.
 */
const normalizeStyleKey = (key: string): string =>
  key
    .trim()
    .replaceAll(/(?<lower>[a-z0-9])(?<upper>[A-Z])/gu, "$<lower>-$<upper>")
    .toLowerCase();

const styleMapSchema = z.record(z.string(), z.string());

const STYLE_ROLE_SET = new Set<string>(ANNOUNCEMENT_STYLE_ROLES);

/** Common off-spec role names models emit, mapped to a valid role. */
const ROLE_ALIASES: Record<string, AnnouncementStyleRole> = {
  caption: "body",
  overlay: "scrim-bottom",
  scrim: "scrim-bottom",
  tertiary: "body",
  text: "body",
};

/**
 * Coerce a model-supplied role string to a valid AnnouncementStyleRole (via
 * kebab-normalization + aliases), or null when it cannot be mapped.
 */
const coerceRole = (role: string | undefined): AnnouncementStyleRole | null => {
  if (!role) {
    return null;
  }

  const normalized = normalizeStyleKey(role);

  if (STYLE_ROLE_SET.has(normalized)) {
    return normalized as AnnouncementStyleRole;
  }

  return ROLE_ALIASES[normalized] ?? null;
};

const coerceParentRole = (
  role: string | undefined
): AnnouncementStyleRole | "wrapper" | null => {
  if (!role) {
    return null;
  }

  if (normalizeStyleKey(role) === "wrapper") {
    return "wrapper";
  }

  return coerceRole(role);
};

const clearOpSchema = z.object({
  op: z.literal("clear"),
});

const applyPresetOpSchema = z.object({
  op: z.literal("applyPreset"),
  packId: z.enum(STYLE_PACK_IDS),
});

const addBlockOpSchema = z.object({
  blockId: z.enum(
    ANNOUNCEMENT_BLOCK_IDS as unknown as [
      AnnouncementBlockId,
      ...AnnouncementBlockId[],
    ]
  ),
  content: z.string().max(2000).optional(),
  op: z.literal("addBlock"),
  // Roles are validated/coerced in the normalizer, not the schema, so one
  // off-spec role (e.g. "scrim") does not reject the whole plan.
  parentRole: z.string().optional(),
  role: z.string().optional(),
  style: styleMapSchema.optional(),
});

const updateRoleOpSchema = z.object({
  content: z.string().max(2000).optional(),
  index: z.number().int().min(0).max(20).optional(),
  op: z.literal("updateRole"),
  remove: z.boolean().optional(),
  role: z.string(),
  style: styleMapSchema.optional(),
});

const setStageStyleOpSchema = z.object({
  op: z.literal("setStageStyle"),
  style: styleMapSchema,
});

export const canvasOpSchema = z.discriminatedUnion("op", [
  clearOpSchema,
  applyPresetOpSchema,
  addBlockOpSchema,
  updateRoleOpSchema,
  setStageStyleOpSchema,
]);

export const canvasPlanSchema = z.object({
  basePresetId: z.enum(STYLE_PACK_IDS).nullable().optional(),
  mode: z.literal("rebuild"),
  ops: z.array(canvasOpSchema).max(MAX_CANVAS_OPS),
  version: z.literal(CANVAS_PLAN_VERSION),
});

export type CanvasOp = z.infer<typeof canvasOpSchema>;
export type CanvasPlan = z.infer<typeof canvasPlanSchema>;

/** JSON Schema for xAI / Workers AI `response_format.json_schema`. */
export const canvasPlanJsonSchema = z.toJSONSchema(canvasPlanSchema, {
  target: "draft-07",
});

const isClearPaint = (value: string): boolean =>
  value === "transparent" || value === "none";

/**
 * Per-role minimum font-size (px on the 1920×1080 canvas). Announcement
 * overlays are shown full-screen and read from 20–50 feet away, so the AI is
 * not allowed to shrink text below these floors even if its prompt slips.
 * Keep these in sync with the "LARGE FONTS" rule in the layout system prompt
 * (workers/announcement-image-gen/src/layout-ai.ts).
 */
const MIN_FONT_SIZE_PX: Partial<Record<AnnouncementStyleRole, number>> = {
  body: 40,
  heading: 34,
  link: 40,
  subtitle: 48,
  title: 110,
};

const FONT_SIZE_PX_RE = /^(?<num>\d+(?:\.\d+)?)px$/iu;

/**
 * Inherent role of each text-bearing block template, so an addBlock op with no
 * explicit role still gets floored (e.g. an `ann-title` block is a title).
 * Non-text blocks (scrims, spacer, div) are absent — they carry no font-size.
 */
const BLOCK_DEFAULT_ROLE: Partial<
  Record<AnnouncementBlockId, AnnouncementStyleRole>
> = {
  "ann-body": "body",
  "ann-heading": "heading",
  "ann-link": "link",
  "ann-subtitle": "subtitle",
  "ann-title": "title",
};

/**
 * Clamp a role's `font-size` up to its minimum. Only px values are floored;
 * relative units (em/%/vw) and clamp()/calc() are left untouched. Mutates
 * `style` in place and is a no-op when the role has no floor or no font-size.
 */
const enforceFontFloor = (
  style: Record<string, string>,
  role: AnnouncementStyleRole | undefined
): void => {
  if (!role) {
    return;
  }

  const floor = MIN_FONT_SIZE_PX[role];
  const raw = style["font-size"];

  if (floor === undefined || raw === undefined) {
    return;
  }

  const match = FONT_SIZE_PX_RE.exec(raw.trim());

  if (!match?.groups) {
    return;
  }

  if (Number.parseFloat(match.groups.num) < floor) {
    style["font-size"] = `${floor}px`;
  }
};

const isPlainText = (value: string): boolean => !TAG_RE.test(value);

const shouldSkipStyleKey = (
  key: string,
  value: string,
  stage: boolean
): boolean => {
  if (!key || !value) {
    return true;
  }

  if (FORBIDDEN_PHOTO_STYLE_KEYS.has(key)) {
    return true;
  }

  if (stage && FORBIDDEN_PHOTO_STYLE_KEYS.has(key)) {
    return true;
  }

  if (!ALLOWED_STYLE_KEYS.has(key)) {
    return true;
  }

  if (URL_IN_VALUE_RE.test(value)) {
    return true;
  }

  return key === "position" && value.toLowerCase() === "fixed";
};

const coerceBackgroundEntry = (
  key: string,
  value: string,
  result: Record<string, string>
): boolean => {
  if (key === "background-color") {
    if (isClearPaint(value) || GRADIENT_RE.test(value)) {
      result[key] = value;
      return true;
    }

    result[key] = "transparent";
    result.background ??= coerceBackgroundToAlphaGradient(value, "panel");
    return true;
  }

  if (key === "background") {
    if (isClearPaint(value) || GRADIENT_RE.test(value)) {
      result[key] = value;
      return true;
    }

    result[key] = coerceBackgroundToAlphaGradient(value, "panel");
    result["background-color"] = "transparent";
    return true;
  }

  return false;
};

const sanitizeStyleMap = (
  style: Record<string, string> | undefined,
  options: {
    coerceBackgrounds?: boolean;
    stage?: boolean;
    role?: AnnouncementStyleRole;
  } = {}
): Record<string, string> | undefined => {
  if (!style) {
    return undefined;
  }

  const result: Record<string, string> = {};
  const stage = options.stage === true;
  const coerceBackgrounds = options.coerceBackgrounds === true;

  for (const [rawKey, rawValue] of Object.entries(style)) {
    const key = normalizeStyleKey(rawKey);
    const value = rawValue.trim();

    if (shouldSkipStyleKey(key, value, stage)) {
      continue;
    }

    if (coerceBackgrounds && coerceBackgroundEntry(key, value, result)) {
      continue;
    }

    result[key] = value;
  }

  enforceFontFloor(result, options.role);

  return Object.keys(result).length > 0 ? result : undefined;
};

const sanitizeContent = (content: string | undefined): string | undefined => {
  if (content === undefined) {
    return undefined;
  }

  const trimmed = content.trim();

  if (!trimmed) {
    return undefined;
  }

  if (isPlainText(trimmed)) {
    return trimmed;
  }

  // Strip tags conservatively.
  return trimmed.replaceAll(/<[^>]*>/gu, "").trim() || undefined;
};

const normalizeAddBlockOp = (
  op: Extract<CanvasOp, { op: "addBlock" }>
): CanvasOp | null => {
  if (!isAnnouncementBlockId(op.blockId)) {
    return null;
  }

  const parentRole = coerceParentRole(op.parentRole);
  const role = coerceRole(op.role);
  // Floor by the explicit role when given, else the block's inherent role
  // (e.g. an ann-title block is a title even with no role override).
  const effectiveRole = role ?? BLOCK_DEFAULT_ROLE[op.blockId];
  const style = sanitizeStyleMap(op.style, {
    coerceBackgrounds: true,
    role: effectiveRole,
  });
  const content = sanitizeContent(op.content);
  const next: Extract<CanvasOp, { op: "addBlock" }> = {
    blockId: op.blockId,
    op: "addBlock",
  };

  if (content !== undefined) {
    next.content = content;
  }

  if (parentRole) {
    next.parentRole = parentRole;
  }

  if (role) {
    next.role = role;
  }

  if (style) {
    next.style = style;
  }

  return next;
};

const normalizeUpdateRoleOp = (
  op: Extract<CanvasOp, { op: "updateRole" }>
): CanvasOp | null => {
  const role = coerceRole(op.role);

  // Drop ops targeting a role we cannot map — better than rejecting the plan.
  if (!role) {
    return null;
  }

  const style = sanitizeStyleMap(op.style, {
    coerceBackgrounds: true,
    role,
  });
  const content = sanitizeContent(op.content);

  if (!op.remove && content === undefined && !style) {
    return null;
  }

  const next: Extract<CanvasOp, { op: "updateRole" }> = {
    op: "updateRole",
    role,
  };

  if (content !== undefined) {
    next.content = content;
  }

  if (op.index !== undefined) {
    next.index = op.index;
  }

  if (op.remove) {
    next.remove = true;
  }

  if (style) {
    next.style = style;
  }

  return next;
};

const normalizeSetStageStyleOp = (
  op: Extract<CanvasOp, { op: "setStageStyle" }>
): CanvasOp | null => {
  const style = sanitizeStyleMap(op.style, {
    coerceBackgrounds: false,
    stage: true,
  });

  if (!style) {
    return null;
  }

  return { op: "setStageStyle", style };
};

const normalizeOneOp = (op: CanvasOp): CanvasOp | null => {
  switch (op.op) {
    case "clear":
    case "applyPreset": {
      return op;
    }
    case "addBlock": {
      return normalizeAddBlockOp(op);
    }
    case "updateRole": {
      return normalizeUpdateRoleOp(op);
    }
    case "setStageStyle": {
      return normalizeSetStageStyleOp(op);
    }
    default: {
      return null;
    }
  }
};

/**
 * Strip unsafe styles, coerce scrim paints, drop empty ops noise.
 */
export const normalizeCanvasPlan = (plan: CanvasPlan): CanvasPlan => {
  const ops: CanvasOp[] = [];

  for (const op of plan.ops) {
    const next = normalizeOneOp(op);

    if (next) {
      ops.push(next);
    }
  }

  let basePresetId = plan.basePresetId ?? null;
  const hasApplyPreset = ops.some((op) => op.op === "applyPreset");
  const hasClear = ops.some((op) => op.op === "clear");

  // If basePresetId set but ops never apply it, inject at front for executor.
  if (basePresetId && !hasApplyPreset) {
    ops.unshift({ op: "applyPreset", packId: basePresetId });
  }

  // Rebuild mode should start from a known base when neither clear nor preset.
  const stillMissingBase =
    !hasClear && !ops.some((op) => op.op === "applyPreset");

  if (stillMissingBase) {
    basePresetId ??= "classic-bottom";
    ops.unshift({ op: "applyPreset", packId: basePresetId });
  }

  return {
    basePresetId,
    mode: "rebuild",
    ops: ops.slice(0, MAX_CANVAS_OPS),
    version: CANVAS_PLAN_VERSION,
  };
};

/**
 * Parse unknown model output into a CanvasPlan.
 * Throws Error with a readable message on failure.
 */
export const parseCanvasPlan = (raw: unknown): CanvasPlan => {
  const parsed = canvasPlanSchema.safeParse(raw);

  if (!parsed.success) {
    const detail = parsed.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join(".") || "plan"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid canvas plan from AI: ${detail}`);
  }

  return normalizeCanvasPlan(parsed.data);
};

const parseJsonLoose = (raw: string): unknown => {
  const trimmed = raw.trim();
  const fenced =
    /^```(?:json)?\s*(?<body>[\s\S]*?)```$/iu.exec(trimmed)?.groups?.body ??
    trimmed;

  try {
    return JSON.parse(fenced.trim()) as unknown;
  } catch {
    // Try to find first { … } blob.
    const start = fenced.indexOf("{");
    const end = fenced.lastIndexOf("}");

    if (start !== -1 && end > start) {
      return JSON.parse(fenced.slice(start, end + 1)) as unknown;
    }

    throw new Error("AI did not return valid JSON for canvas plan.");
  }
};

/**
 * Extract a JSON value from AI Gateway / chat completion response shapes.
 */
export const extractStructuredJson = (response: unknown): unknown => {
  if (response === null || response === undefined) {
    return null;
  }

  if (typeof response === "string") {
    return parseJsonLoose(response);
  }

  if (typeof response !== "object" || Array.isArray(response)) {
    return null;
  }

  const record = response as Record<string, unknown>;

  // Already-parsed object under common keys.
  if (record.response && typeof record.response === "object") {
    return record.response;
  }

  if (typeof record.response === "string") {
    return parseJsonLoose(record.response);
  }

  const { choices } = record;
  if (Array.isArray(choices) && choices[0]) {
    const choice = choices[0] as Record<string, unknown>;
    const message = choice.message as Record<string, unknown> | undefined;
    const content = message?.content ?? choice.text;

    if (typeof content === "string") {
      return parseJsonLoose(content);
    }

    if (content && typeof content === "object") {
      return content;
    }
  }

  // Some gateways return the schema object at the top level.
  if ("version" in record && "ops" in record) {
    return record;
  }

  return null;
};
