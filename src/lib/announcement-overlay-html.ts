import {
  ANNOUNCEMENT_HEIGHT,
  ANNOUNCEMENT_WIDTH,
} from "~/lib/announcement-types";

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
 * Readability scrims must be alpha gradients so the photo shows through.
 * Never solid fills — those overpower the background image layer.
 */
export const BOTTOM_SCRIM_GRADIENT =
  "linear-gradient(to top, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.22) 42%, transparent 78%)";

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
          stripAnnouncementBackgroundHtml(
            withoutStyles.slice(openEnd, closeIndex).trim()
          )
        ),
        css: normalizeStylesheetBackgrounds(cssParts.join("\n").trim()),
      };
    }
  }

  return {
    components: normalizeInlineBackgroundStyles(
      stripAnnouncementBackgroundHtml(withoutStyles)
    ),
    css: normalizeStylesheetBackgrounds(cssParts.join("\n").trim()),
  };
};

/** Build a self-contained overlay fragment for storage/export. */
export const buildOverlayHtml = (components: string, css: string): string => {
  const safeComponents = normalizeInlineBackgroundStyles(
    stripAnnouncementBackgroundHtml(components.trim())
  );
  const safeCss = normalizeStylesheetBackgrounds(css.trim());

  const styleBlock =
    safeCss.length > 0
      ? `<style>\n.announcement-overlay,.announcement-overlay *{box-sizing:border-box;}\n.announcement-overlay{background:transparent;}\n${safeCss}\n</style>\n`
      : "";

  return `<div class="announcement-overlay" style="${OVERLAY_ROOT_STYLE}">\n${styleBlock}${safeComponents}\n</div>`;
};
