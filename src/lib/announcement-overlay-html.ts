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
].join(";");

const STYLE_TAG_RE = /<style\b[^>]*>(?<cssBody>[\s\S]*?)<\/style>/giu;
const OVERLAY_OPEN_RE =
  /<div\b[^>]*\bclass\s*=\s*["'][^"']*\bannouncement-overlay\b[^"']*["'][^>]*>/iu;

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
        components: withoutStyles.slice(openEnd, closeIndex).trim(),
        css: cssParts.join("\n").trim(),
      };
    }
  }

  return {
    components: withoutStyles,
    css: cssParts.join("\n").trim(),
  };
};

/** Build a self-contained overlay fragment for storage/export. */
export const buildOverlayHtml = (components: string, css: string): string => {
  const styleBlock =
    css.trim().length > 0
      ? `<style>\n.announcement-overlay,.announcement-overlay *{box-sizing:border-box;}\n${css.trim()}\n</style>\n`
      : "";

  return `<div class="announcement-overlay" style="${OVERLAY_ROOT_STYLE}">\n${styleBlock}${components.trim()}\n</div>`;
};
