import {
  ANNOUNCEMENT_HEIGHT,
  ANNOUNCEMENT_WIDTH,
} from "~/lib/announcement-types";
import type { GrapesProjectData, JsonValue } from "~/lib/announcement-types";

const OVERLAY_ROOT_STYLE = [
  "box-sizing:border-box",
  `width:${ANNOUNCEMENT_WIDTH}px`,
  `height:${ANNOUNCEMENT_HEIGHT}px`,
  "position:relative",
  "overflow:hidden",
  "background:transparent",
].join(";");

const STYLE_TAG_RE = /<style\b[^>]*>(?<cssBody>[\s\S]*?)<\/style>/giu;
const OVERLAY_OPEN_RE =
  /<div\b[^>]*\bclass\s*=\s*["'][^"']*\bannouncement-overlay\b[^"']*["'][^>]*>/iu;

/** Marker for the locked GrapesJS background image component (not persisted). */
export const ANNOUNCEMENT_BG_ATTR = "data-announcement-bg";
export const ANNOUNCEMENT_BG_TYPE = "announcement-bg";

const BG_IMG_RE = /<img\b[^>]*\bdata-announcement-bg\b[^>]*\/?>/giu;
const BG_DIV_RE = /<div\b[^>]*\bdata-announcement-bg\b[^>]*>[\s\S]*?<\/div>/giu;

/**
 * Remove the runtime background image node from overlay HTML.
 * Variation selection (not draft HTML) is the source of truth for the photo.
 */
export const stripAnnouncementBackgroundHtml = (html: string): string =>
  html
    .replaceAll(BG_IMG_RE, "")
    .replaceAll(BG_DIV_RE, "")
    .replaceAll(/\n{3,}/gu, "\n\n")
    .trim();

/**
 * Strip photo `background-image:url(...)` paints that belong on the GrapesJS
 * Body/wrapper only (runtime), so draft CSS never embeds variation URLs.
 * Leaves gradients and non-url backgrounds alone.
 */
export const stripRuntimePhotoBackgroundCss = (css: string): string => {
  if (!css.trim()) {
    return css;
  }

  // Drop background-image declarations that reference remote/data/same-origin
  // asset URLs (`/api/r2-asset?key=…` is what the live canvas actually paints).
  const withoutImages = css.replaceAll(
    /background-image\s*:\s*url\(\s*(?<quote>["']?)(?:https?:|data:|blob:|\/)[^)"']*\k<quote>\s*\)\s*;?/giu,
    ""
  );

  // Clean empty rule bodies left behind.
  return withoutImages
    .replaceAll(/[^{}]+ \{\s*\}/gu, "")
    .replaceAll(/\n{3,}/gu, "\n\n")
    .trim();
};

/**
 * Readability scrims must be alpha gradients so the photo shows through.
 * Never solid fills — those overpower the background image layer.
 */
export const BOTTOM_SCRIM_GRADIENT =
  "linear-gradient(to top, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.22) 42%, transparent 78%)";

export const TOP_SCRIM_GRADIENT =
  "linear-gradient(to bottom, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.22) 42%, transparent 78%)";

export const LEFT_SCRIM_GRADIENT =
  "linear-gradient(to right, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.22) 42%, transparent 78%)";

export const RIGHT_SCRIM_GRADIENT =
  "linear-gradient(to left, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.22) 42%, transparent 78%)";

export const PANEL_SCRIM_GRADIENT =
  "linear-gradient(180deg, rgba(0,0,0,0.48) 0%, rgba(0,0,0,0.28) 100%)";

const GRADIENT_FN_RE = /(?:linear|radial|conic)-gradient\s*\(/iu;
const BG_IMAGE_URL_RE = /url\s*\(/iu;
const TRANSPARENT_BG_RE = /^(?:none|transparent|initial|inherit|unset|0)$/iu;

/** Hex / rgb(a) / named-ish color tokens that are not gradients or images. */
const SOLID_COLOR_RE =
  /^(?:#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})|rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?(?:\s*,\s*[\d.]+%?)?\s*\)|hsla?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?(?:\s*,\s*[\d.]+%?)?\s*\)|[a-z]+)$/iu;

interface RgbaColor {
  a: number;
  b: number;
  g: number;
  r: number;
}

const clampByte = (value: number): number =>
  Math.max(0, Math.min(255, Math.round(value)));

const parseHexColor = (hex: string): RgbaColor | null => {
  const raw = hex.slice(1);

  if (raw.length === 3 || raw.length === 4) {
    const r = Number.parseInt(raw[0] + raw[0], 16);
    const g = Number.parseInt(raw[1] + raw[1], 16);
    const b = Number.parseInt(raw[2] + raw[2], 16);
    const a = raw.length === 4 ? Number.parseInt(raw[3] + raw[3], 16) / 255 : 1;
    return { a, b, g, r };
  }

  if (raw.length === 6 || raw.length === 8) {
    const r = Number.parseInt(raw.slice(0, 2), 16);
    const g = Number.parseInt(raw.slice(2, 4), 16);
    const b = Number.parseInt(raw.slice(4, 6), 16);
    const a = raw.length === 8 ? Number.parseInt(raw.slice(6, 8), 16) / 255 : 1;
    return { a, b, g, r };
  }

  return null;
};

const parseRgbFunction = (value: string): RgbaColor | null => {
  const match =
    /^rgba?\(\s*(?<r>[\d.]+)%?\s*,\s*(?<g>[\d.]+)%?\s*,\s*(?<b>[\d.]+)%?(?:\s*,\s*(?<a>[\d.]+)%?)?\s*\)$/iu.exec(
      value
    );

  if (!match?.groups) {
    return null;
  }

  const {
    a: alphaToken,
    b: blueToken,
    g: greenToken,
    r: redToken,
  } = match.groups;

  const r = clampByte(Number.parseFloat(redToken ?? "0"));
  const g = clampByte(Number.parseFloat(greenToken ?? "0"));
  const b = clampByte(Number.parseFloat(blueToken ?? "0"));
  const a =
    alphaToken === undefined
      ? 1
      : Math.max(0, Math.min(1, Number.parseFloat(alphaToken)));

  return { a, b, g, r };
};

const NAMED_COLORS: Record<string, RgbaColor> = {
  black: { a: 1, b: 0, g: 0, r: 0 },
  gray: { a: 1, b: 128, g: 128, r: 128 },
  grey: { a: 1, b: 128, g: 128, r: 128 },
  white: { a: 1, b: 255, g: 255, r: 255 },
};

export const parseCssColor = (value: string): RgbaColor | null => {
  const trimmed = value.trim().toLowerCase();

  if (trimmed.startsWith("#")) {
    return parseHexColor(trimmed);
  }

  if (trimmed.startsWith("rgb")) {
    return parseRgbFunction(trimmed);
  }

  return NAMED_COLORS[trimmed] ?? null;
};

/**
 * Build an alpha gradient from a solid color so the photo layer remains visible.
 * Full-canvas / panel backgrounds must never be solid opaque fills.
 */
export const solidColorToAlphaGradient = (
  colorValue: string,
  variant: "bottom" | "panel" = "panel"
): string => {
  const color = parseCssColor(colorValue);
  const r = color?.r ?? 0;
  const g = color?.g ?? 0;
  const b = color?.b ?? 0;
  // Cap alpha so fills cannot fully bury the background image.
  const baseAlpha = Math.min(color?.a ?? 0.55, 0.65);

  if (variant === "bottom") {
    return `linear-gradient(to top, rgba(${r},${g},${b},${baseAlpha}) 0%, rgba(${r},${g},${b},${(baseAlpha * 0.35).toFixed(2)}) 42%, transparent 78%)`;
  }

  return `linear-gradient(180deg, rgba(${r},${g},${b},${baseAlpha}) 0%, rgba(${r},${g},${b},${(baseAlpha * 0.55).toFixed(2)}) 100%)`;
};

const isSolidColorValue = (value: string): boolean => {
  const trimmed = value.trim();

  if (!trimmed || TRANSPARENT_BG_RE.test(trimmed)) {
    return false;
  }

  if (GRADIENT_FN_RE.test(trimmed) || BG_IMAGE_URL_RE.test(trimmed)) {
    return false;
  }

  // Multi-layer backgrounds that aren't pure solids.
  if (
    trimmed.includes(",") &&
    !trimmed.startsWith("rgb") &&
    !trimmed.startsWith("hsl")
  ) {
    return false;
  }

  return SOLID_COLOR_RE.test(trimmed);
};

/**
 * Coerce any solid background paint into an alpha gradient.
 * Gradients and transparent/none values pass through unchanged.
 */
export const coerceBackgroundToAlphaGradient = (
  value: string,
  variant: "bottom" | "panel" = "panel"
): string => {
  const trimmed = value.trim();

  if (!trimmed || TRANSPARENT_BG_RE.test(trimmed)) {
    return trimmed || "transparent";
  }

  if (GRADIENT_FN_RE.test(trimmed) || BG_IMAGE_URL_RE.test(trimmed)) {
    return trimmed;
  }

  if (isSolidColorValue(trimmed)) {
    return solidColorToAlphaGradient(trimmed, variant);
  }

  // Unknown paint (e.g. multiple layers) — fall back to safe panel scrim.
  return variant === "bottom" ? BOTTOM_SCRIM_GRADIENT : PANEL_SCRIM_GRADIENT;
};

/**
 * Normalize a CSS declaration list (inline style or rule body) so backgrounds
 * are alpha gradients rather than solid fills that overpower the photo.
 */
export const normalizeBackgroundDeclarations = (cssBody: string): string => {
  const declarations = cssBody
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);

  let backgroundValue: string | null = null;
  let backgroundColorValue: string | null = null;
  const kept: string[] = [];

  for (const declaration of declarations) {
    const colon = declaration.indexOf(":");

    if (colon === -1) {
      kept.push(declaration);
      continue;
    }

    const property = declaration.slice(0, colon).trim().toLowerCase();
    const value = declaration.slice(colon + 1).trim();

    if (property === "background-color") {
      backgroundColorValue = value;
      continue;
    }

    if (property === "background") {
      backgroundValue = value;
      continue;
    }

    // Drop solid shorthand variants that bury the photo.
    if (property === "background-image" && isSolidColorValue(value)) {
      backgroundValue = value;
      continue;
    }

    kept.push(`${property}:${value}`);
  }

  const source = backgroundValue ?? backgroundColorValue;

  if (source && !TRANSPARENT_BG_RE.test(source)) {
    const gradient = coerceBackgroundToAlphaGradient(source, "panel");
    kept.push(`background:${gradient}`);
    kept.push("background-color:transparent");
  } else if (
    backgroundColorValue &&
    TRANSPARENT_BG_RE.test(backgroundColorValue)
  ) {
    kept.push("background-color:transparent");
  } else if (backgroundValue && TRANSPARENT_BG_RE.test(backgroundValue)) {
    kept.push("background:transparent");
  }

  return kept.join(";");
};

/** Normalize every inline style="" attribute in an HTML fragment. */
export const normalizeInlineBackgroundStyles = (html: string): string =>
  html.replaceAll(
    /style\s*=\s*(?<quote>["'])(?<styleBody>[\s\S]*?)\k<quote>/giu,
    (...args) => {
      const groups = args.at(-1) as
        | { quote?: string; styleBody?: string }
        | undefined;
      const quote = groups?.quote ?? '"';
      const body = groups?.styleBody ?? "";
      const normalized = normalizeBackgroundDeclarations(body);
      return `style=${quote}${normalized}${quote}`;
    }
  );

/** Normalize background-* declarations inside CSS rule bodies. */
export const normalizeStylesheetBackgrounds = (css: string): string => {
  if (!css.trim()) {
    return css;
  }

  // Walk simple `selector { decls }` blocks (GrapesJS output is flat enough).
  return css.replaceAll(/\{(?<decls>[^{}]*)\}/gu, (...args) => {
    const groups = args.at(-1) as { decls?: string } | undefined;
    const decls = groups?.decls ?? "";
    return `{${normalizeBackgroundDeclarations(decls)}}`;
  });
};

/**
 * GrapesJS device styles are stored as `@media (max-width: 1920px) { … }`.
 * That only applies when the *browser viewport* is ≤1920px. Export/html-to-image
 * runs in the host document — wide monitors skip the whole rule set, so the JPG
 * looks unstyled. Announcements are a fixed 1920×1080 stage: unwrap those media
 * queries so rules always apply.
 */
export const flattenStageMediaQueries = (css: string): string => {
  if (!css.includes("@media")) {
    return css;
  }

  const openRe = /@media\s*\(\s*max-width\s*:\s*(?<width>\d+)px\s*\)\s*\{/giu;
  let result = "";
  let cursor = 0;
  let match = openRe.exec(css);

  while (match) {
    const width = Number.parseInt(match.groups?.width ?? "0", 10);
    const openIndex = match.index;
    const bodyStart = openIndex + match[0].length;

    // Only flatten stage-sized (or larger) max-width queries — our canvas is fixed.
    if (width < ANNOUNCEMENT_WIDTH) {
      match = openRe.exec(css);
      continue;
    }

    let depth = 1;
    let i = bodyStart;

    while (i < css.length && depth > 0) {
      const char = css[i];

      if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
      }

      i += 1;
    }

    if (depth !== 0) {
      // Malformed — leave the rest untouched.
      break;
    }

    const body = css.slice(bodyStart, i - 1);
    result += css.slice(cursor, openIndex);
    result += body;
    cursor = i;
    openRe.lastIndex = cursor;
    match = openRe.exec(css);
  }

  result += css.slice(cursor);
  return result.replaceAll(/\n{3,}/gu, "\n\n").trim();
};

/**
 * GrapesJS sometimes emits a real `<body id="…">` wrapper. Nested in a div via
 * innerHTML that is invalid chrome — convert to a plain div so IDs/CSS still match.
 */
export const normalizeOverlayComponentsHtml = (html: string): string =>
  html
    .replaceAll(/<html\b[^>]*>/giu, "")
    .replaceAll(/<\/html>/giu, "")
    .replaceAll(/<head\b[^>]*>[\s\S]*?<\/head>/giu, "")
    .replaceAll(/<body\b/giu, "<div")
    .replaceAll(/<\/body>/giu, "</div>")
    .trim();

const sanitizeOverlayCss = (css: string): string =>
  normalizeStylesheetBackgrounds(
    flattenStageMediaQueries(stripRuntimePhotoBackgroundCss(css.trim()))
  );

/**
 * Split a stored overlay HTML string into components markup + CSS.
 * Supports legacy fully-inline markup and style-tag bundles from GrapesJS.
 * Pure string parsing so unit tests can run without a DOM.
 */
export const parseOverlayHtml = (
  raw: string
): { components: string; css: string } => {
  const trimmed = raw.trim();

  if (!trimmed) {
    return { components: "", css: "" };
  }

  const cssParts: string[] = [];
  let withoutStyles = trimmed.replaceAll(STYLE_TAG_RE, (...args) => {
    const groups = args.at(-1) as { cssBody?: string } | undefined;
    const text = (groups?.cssBody ?? "").trim();

    if (text) {
      cssParts.push(text);
    }

    return "";
  });

  withoutStyles = withoutStyles.trim();

  const openMatch = OVERLAY_OPEN_RE.exec(withoutStyles);

  if (openMatch && openMatch.index !== undefined) {
    const openEnd = openMatch.index + openMatch[0].length;
    const closeTag = "</div>";
    const closeIndex = withoutStyles.lastIndexOf(closeTag);

    if (closeIndex > openEnd) {
      return {
        components: normalizeInlineBackgroundStyles(
          normalizeOverlayComponentsHtml(
            stripAnnouncementBackgroundHtml(
              withoutStyles.slice(openEnd, closeIndex).trim()
            )
          )
        ),
        css: sanitizeOverlayCss(cssParts.join("\n")),
      };
    }
  }

  return {
    components: normalizeInlineBackgroundStyles(
      normalizeOverlayComponentsHtml(
        stripAnnouncementBackgroundHtml(withoutStyles)
      )
    ),
    css: sanitizeOverlayCss(cssParts.join("\n")),
  };
};

/** Build a self-contained overlay fragment for storage/export. */
export const buildOverlayHtml = (components: string, css: string): string => {
  const safeComponents = normalizeInlineBackgroundStyles(
    normalizeOverlayComponentsHtml(
      stripAnnouncementBackgroundHtml(components.trim())
    )
  );
  const safeCss = sanitizeOverlayCss(css);

  const styleBlock =
    safeCss.length > 0
      ? `<style>\n.announcement-overlay,.announcement-overlay *{box-sizing:border-box;}\n.announcement-overlay{background:transparent;}\n${safeCss}\n</style>\n`
      : "";

  return `<div class="announcement-overlay" style="${OVERLAY_ROOT_STYLE}">\n${styleBlock}${safeComponents}\n</div>`;
};

/**
 * Normalize stored overlay HTML for DOM render / html-to-image capture.
 * Flattens stage media queries and repairs body wrappers so existing drafts
 * export correctly without a re-edit.
 */
export const prepareOverlayHtmlForRender = (raw: string): string => {
  const trimmed = raw.trim();

  if (!trimmed) {
    return raw;
  }

  const { components, css } = parseOverlayHtml(trimmed);

  if (!components && !css) {
    return raw;
  }

  return buildOverlayHtml(components, css);
};

// ── GrapesJS project JSON helpers ────────────────────────────────────────────

const RUNTIME_PHOTO_URL_RE =
  /url\(\s*(?<quote>["']?)(?:https?:|data:|blob:|\/)/iu;

const isRecord = (value: unknown): value is Record<string, JsonValue> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Stable string key for comparing project JSON snapshots. */
export const projectDataKey = (
  projectData: GrapesProjectData | null | undefined
): string => {
  if (!projectData) {
    return "";
  }

  try {
    return JSON.stringify(projectData);
  } catch {
    return "";
  }
};

const stripPhotoFromStyleObject = (
  style: Record<string, JsonValue>
): Record<string, JsonValue> => {
  const next: Record<string, JsonValue> = {};
  let changed = false;

  for (const [key, value] of Object.entries(style)) {
    const lower = key.toLowerCase();

    if (
      typeof value === "string" &&
      (lower === "background-image" || lower === "background") &&
      RUNTIME_PHOTO_URL_RE.test(value)
    ) {
      changed = true;
      continue;
    }

    next[key] = value;
  }

  return changed ? next : style;
};

const stripPhotoFromCssRule = (rule: JsonValue): JsonValue => {
  if (!isRecord(rule)) {
    return rule;
  }

  const next: Record<string, JsonValue> = { ...rule };
  let changed = false;

  if (isRecord(next.style)) {
    const cleaned = stripPhotoFromStyleObject(next.style);

    if (cleaned !== next.style) {
      next.style = cleaned;
      changed = true;
    }
  }

  if (Array.isArray(next.rules)) {
    next.rules = next.rules.map((nested) => stripPhotoFromCssRule(nested));
    changed = true;
  }

  return changed ? next : rule;
};

/**
 * Recursively strip runtime photo paint + legacy bg nodes from a GrapesJS
 * component definition tree (as stored in project JSON pages).
 */
const stripPhotoFromComponent = (component: JsonValue): JsonValue | null => {
  if (typeof component === "string") {
    return stripAnnouncementBackgroundHtml(component);
  }

  if (!isRecord(component)) {
    return component;
  }

  const next: Record<string, JsonValue> = { ...component };
  let changed = false;

  // Drop locked background image components from older drafts.
  if (isRecord(next.attributes)) {
    const attrs = next.attributes;
    if (
      attrs[ANNOUNCEMENT_BG_ATTR] === "1" ||
      attrs[ANNOUNCEMENT_BG_ATTR] === 1 ||
      attrs[ANNOUNCEMENT_BG_ATTR] === true
    ) {
      return null;
    }
  }

  if (next.type === ANNOUNCEMENT_BG_TYPE) {
    return null;
  }

  if (isRecord(next.style)) {
    const cleaned = stripPhotoFromStyleObject(next.style);

    if (cleaned !== next.style) {
      next.style = cleaned;
      changed = true;
    }
  }

  if (Array.isArray(next.components)) {
    const children = next.components
      .map((child) => stripPhotoFromComponent(child))
      .filter((child): child is JsonValue => child !== null);
    next.components = children;
    changed = true;
  }

  if (typeof next.content === "string" && next.content.includes("<")) {
    const cleaned = stripAnnouncementBackgroundHtml(next.content);

    if (cleaned !== next.content) {
      next.content = cleaned;
      changed = true;
    }
  }

  return changed ? next : component;
};

const stripPhotoFromPage = (page: JsonValue): JsonValue => {
  if (!isRecord(page)) {
    return page;
  }

  const next: Record<string, JsonValue> = { ...page };
  let changed = false;

  if (next.component !== undefined) {
    const cleaned = stripPhotoFromComponent(next.component);

    if (cleaned !== next.component) {
      next.component = cleaned;
      changed = true;
    }
  }

  if (Array.isArray(next.frames)) {
    next.frames = next.frames.map((frame) => {
      if (!isRecord(frame)) {
        return frame;
      }

      const frameNext: Record<string, JsonValue> = { ...frame };

      if (frameNext.component !== undefined) {
        frameNext.component = stripPhotoFromComponent(frameNext.component);
      }

      return frameNext;
    });
    changed = true;
  }

  return changed ? next : page;
};

/**
 * Clone GrapesJS project JSON and strip runtime variation photo paint so
 * drafts never embed selected-background URLs (R2 variations remain source of truth).
 */
export const sanitizeProjectData = (
  projectData: GrapesProjectData | null | undefined
): GrapesProjectData | null => {
  if (!projectData || !isRecord(projectData)) {
    return null;
  }

  // Deep clone so we never mutate the live editor snapshot.
  let clone: GrapesProjectData;

  try {
    clone = structuredClone(projectData);
  } catch {
    return null;
  }

  if (Array.isArray(clone.styles)) {
    clone.styles = (clone.styles as JsonValue[]).map((rule) =>
      stripPhotoFromCssRule(rule)
    );
  }

  if (Array.isArray(clone.pages)) {
    clone.pages = (clone.pages as JsonValue[]).map((page) =>
      stripPhotoFromPage(page)
    );
  }

  return clone;
};

/** True when value looks like a non-empty GrapesJS project payload. */
export const isUsableProjectData = (
  value: unknown
): value is GrapesProjectData => {
  if (!isRecord(value)) {
    return false;
  }

  if (Array.isArray(value.pages) && value.pages.length > 0) {
    return true;
  }

  // Some exports may only have styles + empty pages; still prefer over bare HTML
  // when pages array exists (even empty means intentional project shape).
  return Array.isArray(value.pages) || Array.isArray(value.styles);
};
