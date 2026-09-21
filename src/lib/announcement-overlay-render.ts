/**
 * Pure `ComponentDef` → overlay HTML renderer (no GrapesJS).
 *
 * The design presets (`announcement-style-library`) and AI block templates
 * (`announcement-block-templates`) are plain, JSON-serializable component
 * trees. This module walks those trees and emits self-contained overlay HTML
 * (inline styles, wrapped by `buildOverlayHtml`), so presets and AI layout
 * plans render without ever instantiating a GrapesJS editor.
 *
 * This is the replacement for the GrapesJS `loadProjectData` +
 * `applyCanvasPlanToEditor` path: text is HTML, the background photo is a
 * separate layer, and there is no live-editor re-render loop.
 */

import type { CanvasOp, CanvasPlan } from "~/lib/announcement-ai-plan";
import { getAnnouncementBlockDef } from "~/lib/announcement-block-templates";
import type { AnnouncementComponentDef } from "~/lib/announcement-block-templates";
import {
  buildOverlayHtml,
  coerceBackgroundToAlphaGradient,
} from "~/lib/announcement-overlay-html";
import {
  ANNOUNCEMENT_ROLE_ATTR,
  buildDesignPresetComponents,
} from "~/lib/announcement-style-library";
import type { AnnouncementStyleRole } from "~/lib/announcement-style-library";
import type { AnnouncementContent } from "~/lib/announcement-types";

type StyleMap = Record<string, string>;

/** Void elements that must not emit a closing tag. */
const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

/** Text-ish component types whose `content` is inline HTML text. */
const TEXT_TYPES = new Set(["text", "textnode", "link"]);

const HTML_TEXT_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
};

const ATTR_ESCAPES: Record<string, string> = {
  '"': "&quot;",
  "&": "&amp;",
};

/** Escape a plain-text run for safe HTML text content. */
const escapeText = (value: string): string =>
  value.replaceAll(/[&<>]/gu, (ch) => HTML_TEXT_ESCAPES[ch] ?? ch);

/** Escape an attribute value for a double-quoted attribute. */
const escapeAttr = (value: string): string =>
  value.replaceAll(/[&"]/gu, (ch) => ATTR_ESCAPES[ch] ?? ch);

/** True when a content string already contains markup (authored HTML). */
const looksLikeHtml = (value: string): boolean =>
  /<[a-z!/][\s\S]*>/iu.test(value);

/** Serialize an inline style map to a `prop:value;` string (stable order). */
const styleToString = (style: StyleMap | undefined): string => {
  if (!style) {
    return "";
  }

  const parts: string[] = [];

  for (const key of Object.keys(style)) {
    const value = style[key];

    if (
      key &&
      value !== null &&
      value !== undefined &&
      `${value}`.trim().length > 0
    ) {
      parts.push(`${key}:${`${value}`.trim()}`);
    }
  }

  return parts.join(";");
};

/** Serialize a component's non-style attributes. */
const attributesToString = (
  attributes: Record<string, string> | undefined
): string => {
  if (!attributes) {
    return "";
  }

  const parts: string[] = [];

  for (const key of Object.keys(attributes)) {
    const value = attributes[key];

    if (!key) {
      continue;
    }

    if (value === "") {
      parts.push(key);
      continue;
    }

    parts.push(`${key}="${escapeAttr(`${value}`)}"`);
  }

  return parts.join(" ");
};

/**
 * Render one component definition (and its subtree) to an HTML string.
 * Text components emit their `content` (authored HTML passes through; plain
 * text is escaped). Container components recurse into `components`.
 */
export const renderComponentDefToHtml = (
  def: AnnouncementComponentDef
): string => {
  const type = def.type ?? "";
  const tag = (def.tagName ?? (type === "link" ? "a" : "div")).toLowerCase();

  const attrParts: string[] = [];
  const attrs = attributesToString(def.attributes);

  if (attrs) {
    attrParts.push(attrs);
  }

  const styleString = styleToString(def.style);

  if (styleString) {
    attrParts.push(`style="${escapeAttr(styleString)}"`);
  }

  const openTag =
    attrParts.length > 0 ? `<${tag} ${attrParts.join(" ")}>` : `<${tag}>`;

  if (VOID_TAGS.has(tag)) {
    return openTag;
  }

  let inner = "";

  if (Array.isArray(def.components) && def.components.length > 0) {
    inner = def.components.map(renderComponentDefToHtml).join("");
  } else if (typeof def.content === "string" && def.content.length > 0) {
    // Text roles may carry authored inline HTML (e.g. <br>, <em>); pass those
    // through, but escape anything that is plain text so `<` is not lost.
    inner = looksLikeHtml(def.content) ? def.content : escapeText(def.content);
  }

  return `${openTag}${inner}</${tag}>`;
};

/**
 * Render a full component tree (the children under the stage wrapper) to
 * self-contained overlay HTML. Inline styles carry all typography; the CSS
 * argument to `buildOverlayHtml` stays empty (styles live on the nodes).
 */
export const renderOverlayComponentsToHtml = (
  components: AnnouncementComponentDef[]
): string => {
  const markup = components.map(renderComponentDefToHtml).join("");
  return buildOverlayHtml(markup, "");
};

/**
 * Build overlay HTML for a design preset from the draft content fields.
 * Returns null when the pack id is unknown.
 */
export const buildDesignPresetHtml = (
  packId: string,
  content: AnnouncementContent
): string | null => {
  const components = buildDesignPresetComponents(packId, content);

  if (!components) {
    return null;
  }

  return renderOverlayComponentsToHtml(components);
};

// ── AI CanvasPlan → HTML (pure) ──────────────────────────────────────────────

const ROLE_ATTR = ANNOUNCEMENT_ROLE_ATTR;

const roleOf = (def: AnnouncementComponentDef): string | undefined =>
  def.attributes?.[ROLE_ATTR];

const isClearPaint = (value: string): boolean =>
  value === "" || value === "transparent" || value === "none";

const URL_IN_VALUE_RE = /url\s*\(/iu;
const GRADIENT_RE = /gradient\s*\(/iu;

/**
 * Coerce a solid background paint into an alpha gradient so scrims never bury
 * the photo (mirrors the old live-editor `coerceComponentBackground`).
 */
const coerceDefBackground = (def: AnnouncementComponentDef): void => {
  const { style } = def;

  if (!style) {
    return;
  }

  const background = (style.background ?? "").trim();
  const backgroundColor = (style["background-color"] ?? "").trim();
  const backgroundImage = (style["background-image"] ?? "").trim();

  if (
    URL_IN_VALUE_RE.test(background) ||
    URL_IN_VALUE_RE.test(backgroundImage) ||
    URL_IN_VALUE_RE.test(backgroundColor)
  ) {
    return;
  }

  if (GRADIENT_RE.test(background)) {
    if (!isClearPaint(backgroundColor)) {
      style["background-color"] = "transparent";
    }

    return;
  }

  let solidSource: string | null = null;

  if (!isClearPaint(backgroundColor)) {
    solidSource = backgroundColor;
  } else if (!isClearPaint(background)) {
    solidSource = background;
  }

  if (!solidSource) {
    return;
  }

  style.background = coerceBackgroundToAlphaGradient(solidSource, "panel");
  style["background-color"] = "transparent";
};

/** Recursively coerce backgrounds across a def subtree. */
const coerceSubtreeBackgrounds = (def: AnnouncementComponentDef): void => {
  coerceDefBackground(def);

  if (Array.isArray(def.components)) {
    for (const child of def.components) {
      coerceSubtreeBackgrounds(child);
    }
  }
};

/** Find the first def in a tree matching a role attribute (depth-first). */
const findByRole = (
  roots: AnnouncementComponentDef[],
  role: AnnouncementStyleRole,
  index: number
): AnnouncementComponentDef | null => {
  let seen = 0;

  const walk = (
    def: AnnouncementComponentDef
  ): AnnouncementComponentDef | null => {
    if (roleOf(def) === role) {
      if (seen === index) {
        return def;
      }

      seen += 1;
    }

    if (Array.isArray(def.components)) {
      for (const child of def.components) {
        const hit = walk(child);

        if (hit) {
          return hit;
        }
      }
    }

    return null;
  };

  for (const root of roots) {
    const hit = walk(root);

    if (hit) {
      return hit;
    }
  }

  return null;
};

const removeByRole = (
  roots: AnnouncementComponentDef[],
  role: AnnouncementStyleRole,
  index: number
): AnnouncementComponentDef[] => {
  let seen = 0;

  const prune = (
    defs: AnnouncementComponentDef[]
  ): AnnouncementComponentDef[] => {
    const next: AnnouncementComponentDef[] = [];

    for (const def of defs) {
      if (roleOf(def) === role) {
        if (seen === index) {
          seen += 1;
          continue;
        }

        seen += 1;
      }

      if (Array.isArray(def.components)) {
        def.components = prune(def.components);
      }

      next.push(def);
    }

    return next;
  };

  return prune(roots);
};

/** Set text content on a def (or its single text child). */
const setDefText = (def: AnnouncementComponentDef, text: string): void => {
  if (
    TEXT_TYPES.has(def.type ?? "") ||
    !Array.isArray(def.components) ||
    def.components.length === 0
  ) {
    def.content = text;
    def.components = undefined;
    return;
  }

  if (def.components.length === 1) {
    setDefText(def.components[0], text);
    return;
  }

  def.content = text;
  def.components = undefined;
};

/**
 * Apply a single CanvasOp to a working component tree.
 * `roots` is the list of stage children; returns the new list.
 */
const applyOpToTree = (
  roots: AnnouncementComponentDef[],
  op: CanvasOp,
  content: AnnouncementContent
): AnnouncementComponentDef[] => {
  switch (op.op) {
    case "clear": {
      return [];
    }
    case "applyPreset": {
      return buildDesignPresetComponents(op.packId, content) ?? roots;
    }
    case "addBlock": {
      const def = getAnnouncementBlockDef(op.blockId, {
        content: op.content,
        role: op.role,
        style: op.style,
      });

      if (op.parentRole && op.parentRole !== "wrapper") {
        const parent = findByRole(roots, op.parentRole, 0);

        if (parent) {
          parent.components = [...(parent.components ?? []), def];
          return roots;
        }
      }

      return [...roots, def];
    }
    case "updateRole": {
      if (op.remove) {
        return removeByRole(roots, op.role, op.index ?? 0);
      }

      const target = findByRole(roots, op.role, op.index ?? 0);

      if (!target) {
        return roots;
      }

      if (op.content !== undefined) {
        setDefText(target, op.content);
      }

      if (op.style) {
        target.style = { ...target.style, ...op.style };
      }

      return roots;
    }
    case "setStageStyle": {
      // Stage (wrapper) style is fixed 1920×1080; per-op stage styling is not
      // represented in the flat overlay model, so this is a no-op here.
      return roots;
    }
    default: {
      const _exhaustive: never = op;
      void _exhaustive;
      return roots;
    }
  }
};

/**
 * Render an AI CanvasPlan to overlay HTML (pure — no GrapesJS).
 * Mirrors the old executor: start from a preset when the plan does not, apply
 * each op to a working component tree, coerce backgrounds, then serialize.
 */
export const renderCanvasPlanToHtml = (
  plan: CanvasPlan,
  content: AnnouncementContent
): string => {
  const [first] = plan.ops;
  const startsStructural = first?.op === "clear" || first?.op === "applyPreset";

  let roots: AnnouncementComponentDef[] = startsStructural
    ? []
    : (buildDesignPresetComponents(
        plan.basePresetId ?? "classic-bottom",
        content
      ) ?? []);

  for (const op of plan.ops) {
    roots = applyOpToTree(roots, op, content);
  }

  for (const root of roots) {
    coerceSubtreeBackgrounds(root);
  }

  return renderOverlayComponentsToHtml(roots);
};

// ── Legacy GrapesJS project JSON → overlay HTML migration ────────────────────

interface LegacyFrame {
  component?: unknown;
}

interface LegacyPage {
  frames?: unknown;
}

const asDefArray = (value: unknown): AnnouncementComponentDef[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is AnnouncementComponentDef =>
      typeof item === "object" && item !== null && !Array.isArray(item)
  );
};

/**
 * Migrate a legacy GrapesJS project-JSON blob to overlay HTML.
 * Walks `pages[0].frames[0].component.components` (the stage wrapper's
 * children) and renders them; returns null when the shape is unusable.
 */
export const legacyProjectDataToOverlayHtml = (
  projectData: unknown
): string | null => {
  if (
    !projectData ||
    typeof projectData !== "object" ||
    Array.isArray(projectData)
  ) {
    return null;
  }

  const { pages } = projectData as { pages?: unknown };

  if (!Array.isArray(pages) || pages.length === 0) {
    return null;
  }

  const firstPage = pages[0] as LegacyPage;
  const { frames } = firstPage;

  if (!Array.isArray(frames) || frames.length === 0) {
    return null;
  }

  const wrapper = (frames[0] as LegacyFrame).component;

  if (!wrapper || typeof wrapper !== "object") {
    return null;
  }

  const children = asDefArray((wrapper as AnnouncementComponentDef).components);

  if (children.length === 0) {
    return null;
  }

  return renderOverlayComponentsToHtml(children);
};
