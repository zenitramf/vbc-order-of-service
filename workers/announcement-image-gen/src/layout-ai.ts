/**
 * Announcement-slide overlay HTML via Workers AI (Claude Sonnet 5).
 * Self-contained — does not import GrapesJS or TanStack.
 */

import type { AnnouncementContent } from "./types";
import { ANNOUNCEMENT_HEIGHT, ANNOUNCEMENT_WIDTH, LAYOUT_MODEL } from "./types";

const OVERLAY_ROOT_STYLE = [
  "box-sizing:border-box",
  `width:${ANNOUNCEMENT_WIDTH}px`,
  `height:${ANNOUNCEMENT_HEIGHT}px`,
  "position:relative",
  "overflow:hidden",
  "background:transparent",
].join(";");

const LAYOUT_MAX_TOKENS = 8192;

const layoutSystemPrompt = [
  "You design the HTML overlay for church announcement slides.",
  "The overlay is a 1920×1080 layer composited over a separate photo into a full-screen slide, read from 20–50 feet away. It is not a webpage, app screen, card, or component library.",
  "Complete redesigns are expected. Current overlay HTML is optional context, not a layout to preserve. Change composition, hierarchy, alignment, and structure whenever that makes a stronger slide. Only keep the existing composition when the style notes explicitly say to keep it.",
  "Return only the HTML fragment. No markdown fences, no commentary.",
  'ALL presentation must be inline style attributes. Do not emit <style>, <link>, stylesheets, or class-based CSS. The root may keep class="announcement-overlay" as a marker only. No other class attributes.',
  "Never use pills, badges, chips, tags, or capsule shapes. No fully rounded labels (border-radius: 999px, 9999px, 50%, or similar) around short text. No chip-style dates, times, categories, or calls to action. Style notes cannot override this.",
  "Place every non-empty title, subtitle, heading, and tertiary field as the slide copy. Do not invent extra wording. Do not drop provided fields.",
  "Do not include scripts, event handlers, or photographic backgrounds. No background-image:url(). The photo is a separate layer. The root background stays transparent.",
  "Scrims and panels use alpha linear-gradients that fade to transparent, never solid opaque fills.",
  "When you set font-size, use these minimums: title ≥ 110px, subtitle ≥ 48px, heading ≥ 34px, body ≥ 40px. Do not shrink type that is already at or above those floors.",
].join(" ");

const EMPTY_OVERLAY = `<div class="announcement-overlay" style="${OVERLAY_ROOT_STYLE}"></div>`;

export type RunAiGateway = (
  model: string,
  input: Record<string, unknown>
) => Promise<unknown>;

const layoutRequestInput = (userPayload: string): Record<string, unknown> => ({
  max_tokens: LAYOUT_MAX_TOKENS,
  messages: [{ content: userPayload, role: "user" }],
  system: layoutSystemPrompt,
});

const buildLayoutUserPayload = (options: {
  content: AnnouncementContent;
  html: string;
  styleNotes?: string;
}): string => {
  const html = options.html.trim() || EMPTY_OVERLAY;

  return [
    "Style notes:",
    options.styleNotes?.trim() ||
      "None. Design a complete announcement slide. Redesign freely. Never use pills.",
    "",
    "Content fields (slide copy — place every non-empty field):",
    JSON.stringify(options.content),
    "",
    "Current overlay HTML (context only — discard this layout if a redesign is stronger):",
    html,
  ].join("\n");
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const textFromContent = (content: unknown): string => {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  const parts: string[] = [];

  for (const block of content) {
    if (typeof block === "string") {
      parts.push(block);
      continue;
    }

    if (isRecord(block) && typeof block.text === "string") {
      parts.push(block.text);
    }
  }

  return parts.join("");
};

const extractModelText = (response: unknown): string => {
  if (typeof response === "string") {
    return response;
  }

  if (!isRecord(response)) {
    return "";
  }

  if (typeof response.response === "string") {
    return response.response;
  }

  const fromContent = textFromContent(response.content);

  if (fromContent.trim()) {
    return fromContent;
  }

  const { choices } = response;
  const [firstChoice] = Array.isArray(choices) ? choices : [];

  if (isRecord(firstChoice)) {
    const message = isRecord(firstChoice.message) ? firstChoice.message : null;
    const content = message?.content ?? firstChoice.text;
    const text = textFromContent(content);

    if (text.trim()) {
      return text;
    }
  }

  return "";
};

const assertNotTruncated = (response: unknown): void => {
  if (!isRecord(response)) {
    return;
  }

  const reason = response.stop_reason ?? response.stopReason;

  if (reason === "max_tokens") {
    throw new Error("AI overlay HTML was truncated. Try a shorter overlay.");
  }
};

const unwrapFence = (raw: string): string => {
  const trimmed = raw.trim();
  const fenced =
    /^```(?:html)?\s*(?<body>[\s\S]*?)```$/iu.exec(trimmed)?.groups?.body ??
    trimmed;

  return fenced.trim();
};

const stripUnsafeMarkup = (html: string): string =>
  html
    .replaceAll(/<script\b[^>]*>[\s\S]*?<\/script>/giu, "")
    .replaceAll(/<style\b[^>]*>[\s\S]*?<\/style>/giu, "")
    .replaceAll(/<link\b[^>]*>/giu, "")
    .replaceAll(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/giu, "")
    .replaceAll(/background-image\s*:\s*url\([^)]*\)\s*;?/giu, "");

const extractOverlayHtml = (raw: string): string | null => {
  const unwrapped = unwrapFence(raw);
  const start = unwrapped.search(/<div\b/iu);

  if (start === -1) {
    return null;
  }

  const slice = unwrapped.slice(start);
  const lastClose = slice.lastIndexOf("</div>");

  if (lastClose === -1) {
    return null;
  }

  const html = stripUnsafeMarkup(
    slice.slice(0, lastClose + "</div>".length)
  ).trim();

  if (!html || !/style\s*=\s*["'][^"']+/iu.test(html)) {
    return null;
  }

  if (/\bannouncement-overlay\b/iu.test(html)) {
    return html;
  }

  return `<div class="announcement-overlay" style="${OVERLAY_ROOT_STYLE}">\n${html}\n</div>`;
};

const hasStylesheet = (raw: string): boolean => /<style\b|<link\b/iu.test(raw);

/**
 * Design the announcement-slide overlay. Styles are inline; stylesheets are stripped.
 */
export const reviseOverlayHtmlWithAi = async (
  options: {
    content: AnnouncementContent;
    html: string;
    styleNotes?: string;
  },
  runAiGateway: RunAiGateway
): Promise<string> => {
  const response = await runAiGateway(
    LAYOUT_MODEL,
    layoutRequestInput(buildLayoutUserPayload(options))
  );
  assertNotTruncated(response);

  const firstText = extractModelText(response);
  const needsInlineRepair = hasStylesheet(firstText);
  const firstHtml = needsInlineRepair ? null : extractOverlayHtml(firstText);

  if (firstHtml) {
    return firstHtml;
  }

  const repairPayload = needsInlineRepair
    ? [
        "Move every CSS rule into style attributes.",
        "Delete every <style>, <link>, class-based rule, and <script> tag.",
        "Remove every pill, badge, chip, tag, and capsule shape.",
        "Return only the overlay HTML for the announcement slide.",
        "",
        firstText.trim() || options.html,
      ].join("\n")
    : [
        "The previous reply was not overlay HTML.",
        "Return only the announcement-slide overlay HTML fragment, using inline styles. No pills.",
        "",
        firstText.trim() || options.html,
      ].join("\n");

  const repaired = await runAiGateway(
    LAYOUT_MODEL,
    layoutRequestInput(repairPayload)
  );
  assertNotTruncated(repaired);

  const html = extractOverlayHtml(extractModelText(repaired));

  if (!html) {
    throw new Error("AI did not return overlay HTML.");
  }

  return html;
};
