/**
 * Hand-authored design presets for announcement overlays.
 *
 * Each preset is a full 1920×1080 layout springboard (structure + typography +
 * scrims). Applying a preset replaces the overlay HTML with content from the
 * draft fields; the Body photo is never included. Users refine further in GrapesJS.
 */

import {
  ANNOUNCEMENT_HEIGHT,
  ANNOUNCEMENT_WIDTH,
} from "~/lib/announcement-types";
import type { AnnouncementContent } from "~/lib/announcement-types";

export const ANNOUNCEMENT_ROLE_ATTR = "data-ann-role";

export type AnnouncementStyleRole =
  | "heading"
  | "title"
  | "subtitle"
  | "body"
  | "link"
  | "scrim-bottom"
  | "scrim-top"
  | "scrim-left"
  | "scrim-right"
  | "panel";

/** High-level layout family shown in the UI. */
export type DesignPresetComposition =
  | "bottom-band"
  | "lower-left"
  | "centered"
  | "top-banner"
  | "left-panel"
  | "right-panel"
  | "two-panel"
  | "corner-card";

export interface StylePackPreview {
  accent: string;
  /** Short label for the composition diagram, e.g. "Lower left". */
  compositionLabel: string;
  scrimHint: string;
  text: string;
}

export interface AnnouncementStylePack {
  composition: DesignPresetComposition;
  description: string;
  id: string;
  name: string;
  preview: StylePackPreview;
  /** Build a complete overlay fragment from draft content fields. */
  buildHtml: (content: AnnouncementContent) => string;
}

export interface ApplyDesignPresetResult {
  html: string;
  packId: string;
}

/** Selector for a role attribute (for GrapesJS find / querySelector). */
export const roleSelector = (role: AnnouncementStyleRole): string =>
  `[${ANNOUNCEMENT_ROLE_ATTR}="${role}"]`;

// ── Helpers ─────────────────────────────────────────────────────────────────

const SYSTEM_SANS = "system-ui, sans-serif";
const GEORGIA_SERIF = "Georgia, 'Times New Roman', serif";

const ROOT_STYLE = [
  "box-sizing:border-box",
  `width:${ANNOUNCEMENT_WIDTH}px`,
  `height:${ANNOUNCEMENT_HEIGHT}px`,
  "position:relative",
  "overflow:hidden",
  "background:transparent",
  `font-family:${GEORGIA_SERIF}`,
  "color:#ffffff",
].join(";");

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

interface ResolvedContent {
  body: string;
  heading: string;
  subtitle: string;
  title: string;
}

const resolveContent = (content: AnnouncementContent): ResolvedContent => ({
  body: content.tertiary.trim() || "Additional details",
  heading: content.heading.trim() || "Heading",
  subtitle: content.subtitle.trim() || "Subtitle",
  title: content.title.trim() || "Announcement Title",
});

const role = (name: AnnouncementStyleRole): string =>
  `${ANNOUNCEMENT_ROLE_ATTR}="${name}"`;

const textStack = (
  c: ResolvedContent,
  options: {
    align?: "left" | "center" | "right";
    bodyStyle?: string;
    headingStyle?: string;
    subtitleStyle?: string;
    titleStyle?: string;
  } = {}
): string => {
  const align = options.align ?? "left";
  const textAlign = `text-align:${align};`;

  return [
    `<p ${role("heading")} style="margin:0 0 12px;${textAlign}${options.headingStyle ?? ""}">${escapeHtml(c.heading)}</p>`,
    `<h1 ${role("title")} style="margin:0 0 18px;${textAlign}${options.titleStyle ?? ""}">${escapeHtml(c.title)}</h1>`,
    `<p ${role("subtitle")} style="margin:0 0 28px;${textAlign}${options.subtitleStyle ?? ""}">${escapeHtml(c.subtitle)}</p>`,
    `<p ${role("body")} style="margin:0;${textAlign}${options.bodyStyle ?? ""}">${escapeHtml(c.body)}</p>`,
  ].join("\n  ");
};

const wrapOverlay = (inner: string): string =>
  `<div class="announcement-overlay" style="${ROOT_STYLE}">\n${inner}\n</div>`;

// Shared type recipes
const HEADING_CLASSIC = `font-size:28px;letter-spacing:0.28em;text-transform:uppercase;opacity:0.92;font-family:${SYSTEM_SANS};color:#ffffff;text-shadow:0 2px 12px rgba(0,0,0,0.45);`;
const TITLE_CLASSIC = `font-size:96px;line-height:1.05;font-weight:700;font-family:${GEORGIA_SERIF};color:#ffffff;text-shadow:0 4px 24px rgba(0,0,0,0.45);`;
const SUBTITLE_CLASSIC = `font-size:42px;line-height:1.25;font-weight:400;font-family:${GEORGIA_SERIF};color:#ffffff;opacity:0.95;`;
const BODY_CLASSIC = `font-size:28px;line-height:1.4;opacity:0.88;font-family:${SYSTEM_SANS};color:#ffffff;max-width:1200px;`;

const HEADING_MODERN = `font-size:22px;letter-spacing:0.18em;text-transform:uppercase;font-weight:600;font-family:${SYSTEM_SANS};color:#a5b4fc;text-shadow:0 1px 8px rgba(0,0,0,0.35);`;
const TITLE_MODERN = `font-size:84px;line-height:1.02;font-weight:700;letter-spacing:-0.02em;font-family:${SYSTEM_SANS};color:#f8fafc;text-shadow:0 2px 16px rgba(0,0,0,0.4);`;
const SUBTITLE_MODERN = `font-size:36px;line-height:1.3;font-weight:400;font-family:${SYSTEM_SANS};color:#f1f5f9;opacity:0.92;`;
const BODY_MODERN = `font-size:26px;line-height:1.45;font-family:${SYSTEM_SANS};color:#e2e8f0;opacity:0.9;max-width:720px;`;

const HEADING_GOLD = `font-size:26px;letter-spacing:0.3em;text-transform:uppercase;font-weight:600;font-family:${SYSTEM_SANS};color:#fbbf24;text-shadow:0 2px 12px rgba(0,0,0,0.5);`;
const TITLE_GOLD = `font-size:92px;line-height:1.05;font-weight:700;font-family:${GEORGIA_SERIF};color:#fffbeb;text-shadow:0 4px 22px rgba(0,0,0,0.5);`;
const SUBTITLE_GOLD = `font-size:40px;line-height:1.25;font-weight:400;font-family:${GEORGIA_SERIF};color:#fde68a;opacity:0.95;`;
const BODY_GOLD = `font-size:28px;line-height:1.4;font-family:${SYSTEM_SANS};color:#fef3c7;opacity:0.9;max-width:640px;`;

// ── Layout builders ─────────────────────────────────────────────────────────

const buildBottomBand = (content: AnnouncementContent): string => {
  const c = resolveContent(content);
  return wrapOverlay(`  <div ${role("scrim-bottom")} style="position:absolute;left:0;right:0;bottom:0;height:55%;pointer-events:none;background:linear-gradient(to top, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.22) 42%, transparent 78%);background-color:transparent;"></div>
  <div style="position:absolute;left:0;right:0;bottom:0;box-sizing:border-box;padding:80px 100px;display:flex;flex-direction:column;justify-content:flex-end;align-items:flex-start;background:transparent;">
  ${textStack(c, {
    align: "left",
    bodyStyle: BODY_CLASSIC,
    headingStyle: HEADING_CLASSIC,
    subtitleStyle: SUBTITLE_CLASSIC,
    titleStyle: TITLE_CLASSIC,
  })}
  </div>`);
};

const buildLowerLeft = (content: AnnouncementContent): string => {
  const c = resolveContent(content);
  return wrapOverlay(`  <div ${role("scrim-bottom")} style="position:absolute;left:0;right:0;bottom:0;height:62%;pointer-events:none;background:linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.28) 40%, transparent 75%);background-color:transparent;"></div>
  <div ${role("scrim-left")} style="position:absolute;left:0;top:0;bottom:0;width:48%;pointer-events:none;background:linear-gradient(to right, rgba(0,0,0,0.35) 0%, transparent 100%);background-color:transparent;"></div>
  <div style="position:absolute;left:0;bottom:0;box-sizing:border-box;padding:72px 80px 88px 100px;width:58%;max-width:1100px;display:flex;flex-direction:column;justify-content:flex-end;align-items:flex-start;background:transparent;">
  ${textStack(c, {
    align: "left",
    bodyStyle: `${BODY_CLASSIC}max-width:900px;`,
    headingStyle: HEADING_CLASSIC,
    subtitleStyle: `${SUBTITLE_CLASSIC}font-size:38px;`,
    titleStyle: `${TITLE_CLASSIC}font-size:88px;`,
  })}
  </div>`);
};

const buildCenteredHero = (content: AnnouncementContent): string => {
  const c = resolveContent(content);
  return wrapOverlay(`  <div ${role("scrim-top")} style="position:absolute;left:0;right:0;top:0;height:40%;pointer-events:none;background:linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, transparent 100%);background-color:transparent;"></div>
  <div ${role("scrim-bottom")} style="position:absolute;left:0;right:0;bottom:0;height:45%;pointer-events:none;background:linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 100%);background-color:transparent;"></div>
  <div style="position:absolute;inset:0;box-sizing:border-box;padding:100px 140px;display:flex;flex-direction:column;justify-content:center;align-items:center;background:transparent;">
  ${textStack(c, {
    align: "center",
    bodyStyle: `${BODY_MODERN}max-width:900px;`,
    headingStyle: HEADING_MODERN,
    subtitleStyle: `${SUBTITLE_MODERN}max-width:960px;`,
    titleStyle: `${TITLE_MODERN}font-size:100px;max-width:1400px;`,
  })}
  </div>`);
};

const buildTopBanner = (content: AnnouncementContent): string => {
  const c = resolveContent(content);
  return wrapOverlay(`  <div ${role("scrim-top")} style="position:absolute;left:0;right:0;top:0;height:52%;pointer-events:none;background:linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.28) 48%, transparent 100%);background-color:transparent;"></div>
  <div style="position:absolute;left:0;right:0;top:0;box-sizing:border-box;padding:72px 100px 40px;display:flex;flex-direction:column;justify-content:flex-start;align-items:flex-start;background:transparent;">
  ${textStack(c, {
    align: "left",
    bodyStyle: BODY_CLASSIC,
    headingStyle: HEADING_CLASSIC,
    subtitleStyle: SUBTITLE_CLASSIC,
    titleStyle: `${TITLE_CLASSIC}font-size:90px;`,
  })}
  </div>`);
};

const buildLeftPanel = (content: AnnouncementContent): string => {
  const c = resolveContent(content);
  return wrapOverlay(`  <div ${role("scrim-left")} style="position:absolute;left:0;top:0;bottom:0;width:48%;pointer-events:none;background:linear-gradient(to right, rgba(2,6,23,0.82) 0%, rgba(2,6,23,0.55) 55%, transparent 100%);background-color:transparent;"></div>
  <div ${role("panel")} style="position:absolute;left:0;top:0;bottom:0;width:44%;box-sizing:border-box;padding:100px 72px 100px 100px;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;background:linear-gradient(180deg, rgba(2,6,23,0.35) 0%, rgba(2,6,23,0.15) 100%);background-color:transparent;">
  ${textStack(c, {
    align: "left",
    bodyStyle: `font-size:26px;line-height:1.45;font-family:${SYSTEM_SANS};color:#bae6fd;opacity:0.9;max-width:620px;`,
    headingStyle: `font-size:22px;letter-spacing:0.22em;text-transform:uppercase;font-weight:600;font-family:${SYSTEM_SANS};color:#7dd3fc;text-shadow:0 2px 12px rgba(2,6,23,0.6);`,
    subtitleStyle: `font-size:34px;line-height:1.3;font-family:${SYSTEM_SANS};color:#e0f2fe;opacity:0.95;`,
    titleStyle: `font-size:72px;line-height:1.05;font-weight:700;letter-spacing:-0.015em;font-family:${SYSTEM_SANS};color:#f0f9ff;text-shadow:0 4px 24px rgba(2,6,23,0.65);`,
  })}
  </div>`);
};

const buildRightPanel = (content: AnnouncementContent): string => {
  const c = resolveContent(content);
  return wrapOverlay(`  <div ${role("scrim-right")} style="position:absolute;right:0;top:0;bottom:0;width:50%;pointer-events:none;background:linear-gradient(to left, rgba(20,12,0,0.8) 0%, rgba(20,12,0,0.45) 55%, transparent 100%);background-color:transparent;"></div>
  <div ${role("panel")} style="position:absolute;right:0;top:0;bottom:0;width:46%;box-sizing:border-box;padding:100px 100px 100px 72px;display:flex;flex-direction:column;justify-content:center;align-items:flex-end;background:linear-gradient(180deg, rgba(41,25,0,0.4) 0%, rgba(41,25,0,0.18) 100%);background-color:transparent;">
  ${textStack(c, {
    align: "right",
    bodyStyle: BODY_GOLD,
    headingStyle: HEADING_GOLD,
    subtitleStyle: SUBTITLE_GOLD,
    titleStyle: `${TITLE_GOLD}font-size:80px;`,
  })}
  </div>`);
};

const buildTwoPanel = (content: AnnouncementContent): string => {
  const c = resolveContent(content);
  // Left solid-feeling panel with copy; right half stays open for the photo.
  return wrapOverlay(`  <div ${role("scrim-left")} style="position:absolute;left:0;top:0;bottom:0;width:52%;pointer-events:none;background:linear-gradient(to right, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.55) 70%, transparent 100%);background-color:transparent;"></div>
  <div ${role("panel")} style="position:absolute;left:0;top:0;bottom:0;width:46%;box-sizing:border-box;padding:96px 64px 96px 96px;display:flex;flex-direction:column;justify-content:space-between;align-items:flex-start;background:linear-gradient(180deg, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0.22) 100%);background-color:transparent;border-right:1px solid rgba(255,255,255,0.12);">
  <div style="display:flex;flex-direction:column;align-items:flex-start;background:transparent;">
  <p ${role("heading")} style="margin:0 0 20px;text-align:left;${HEADING_CLASSIC}">${escapeHtml(c.heading)}</p>
  <h1 ${role("title")} style="margin:0;text-align:left;font-size:78px;line-height:1.06;font-weight:700;font-family:${GEORGIA_SERIF};color:#ffffff;text-shadow:0 4px 24px rgba(0,0,0,0.45);">${escapeHtml(c.title)}</h1>
  </div>
  <div style="display:flex;flex-direction:column;align-items:flex-start;background:transparent;margin-top:48px;">
  <p ${role("subtitle")} style="margin:0 0 20px;text-align:left;${SUBTITLE_CLASSIC}font-size:36px;">${escapeHtml(c.subtitle)}</p>
  <p ${role("body")} style="margin:0;text-align:left;${BODY_CLASSIC}max-width:620px;">${escapeHtml(c.body)}</p>
  </div>
  </div>`);
};

const buildCornerCard = (content: AnnouncementContent): string => {
  const c = resolveContent(content);
  return wrapOverlay(`  <div ${role("scrim-bottom")} style="position:absolute;left:0;right:0;bottom:0;height:50%;pointer-events:none;background:linear-gradient(to top, rgba(28,25,23,0.45) 0%, transparent 85%);background-color:transparent;"></div>
  <div ${role("panel")} style="position:absolute;left:80px;bottom:72px;width:780px;box-sizing:border-box;padding:48px 52px;display:flex;flex-direction:column;justify-content:flex-end;align-items:flex-start;border-radius:20px;background:linear-gradient(180deg, rgba(28,25,23,0.72) 0%, rgba(28,25,23,0.52) 100%);background-color:transparent;box-shadow:0 24px 64px rgba(0,0,0,0.35);">
  ${textStack(c, {
    align: "left",
    bodyStyle: `font-size:24px;line-height:1.45;font-family:${GEORGIA_SERIF};color:#e7e5e4;opacity:0.9;max-width:680px;`,
    headingStyle: `font-size:18px;letter-spacing:0.22em;text-transform:uppercase;font-weight:500;font-family:${SYSTEM_SANS};color:#d6d3d1;text-shadow:0 1px 6px rgba(0,0,0,0.3);`,
    subtitleStyle: `font-size:32px;line-height:1.3;font-weight:400;font-family:${GEORGIA_SERIF};color:#f5f5f4;opacity:0.92;`,
    titleStyle: `font-size:64px;line-height:1.08;font-weight:500;font-family:${GEORGIA_SERIF};color:#fafaf9;text-shadow:0 2px 18px rgba(0,0,0,0.35);`,
  })}
  </div>`);
};

// ── Seed library ────────────────────────────────────────────────────────────

const STYLE_PACKS: AnnouncementStylePack[] = [
  {
    buildHtml: buildBottomBand,
    composition: "bottom-band",
    description:
      "Full-width bottom band with left-aligned serif title — the classic church announcement look.",
    id: "classic-bottom",
    name: "Classic bottom",
    preview: {
      accent: "#fbbf24",
      compositionLabel: "Bottom band",
      scrimHint: "rgba(0,0,0,0.65)",
      text: "#ffffff",
    },
  },
  {
    buildHtml: buildLowerLeft,
    composition: "lower-left",
    description:
      "Copy anchored lower-left with dual scrims — leaves the upper-right photo open.",
    id: "lower-left",
    name: "Lower left",
    preview: {
      accent: "#fde68a",
      compositionLabel: "Lower left",
      scrimHint: "rgba(0,0,0,0.72)",
      text: "#ffffff",
    },
  },
  {
    buildHtml: buildCenteredHero,
    composition: "centered",
    description:
      "Centered hero stack with soft top and bottom scrims — bold for single-message slides.",
    id: "centered-hero",
    name: "Centered hero",
    preview: {
      accent: "#a5b4fc",
      compositionLabel: "Centered",
      scrimHint: "rgba(0,0,0,0.5)",
      text: "#f8fafc",
    },
  },
  {
    buildHtml: buildTopBanner,
    composition: "top-banner",
    description:
      "Top-weighted banner with a deep top scrim — good when the subject sits low in the photo.",
    id: "top-banner",
    name: "Top banner",
    preview: {
      accent: "#fbbf24",
      compositionLabel: "Top banner",
      scrimHint: "rgba(0,0,0,0.7)",
      text: "#ffffff",
    },
  },
  {
    buildHtml: buildLeftPanel,
    composition: "left-panel",
    description:
      "Cool left panel of type; right half stays mostly photo — dramatic split composition.",
    id: "left-panel",
    name: "Left panel",
    preview: {
      accent: "#7dd3fc",
      compositionLabel: "Left panel",
      scrimHint: "rgba(2,6,23,0.82)",
      text: "#e0f2fe",
    },
  },
  {
    buildHtml: buildRightPanel,
    composition: "right-panel",
    description:
      "Warm right-aligned panel with gold accents — mirrors left panel for opposite photo balance.",
    id: "right-panel",
    name: "Right panel",
    preview: {
      accent: "#fbbf24",
      compositionLabel: "Right panel",
      scrimHint: "rgba(20,12,0,0.8)",
      text: "#fffbeb",
    },
  },
  {
    buildHtml: buildTwoPanel,
    composition: "two-panel",
    description:
      "Two-zone layout: title up top and details below on a left column, open photo on the right.",
    id: "two-panel",
    name: "Two panel",
    preview: {
      accent: "#fbbf24",
      compositionLabel: "Two panel",
      scrimHint: "rgba(0,0,0,0.78)",
      text: "#ffffff",
    },
  },
  {
    buildHtml: buildCornerCard,
    composition: "corner-card",
    description:
      "Floating lower-left card with soft panel fill — editorial and easy to nudge in GrapesJS.",
    id: "corner-card",
    name: "Corner card",
    preview: {
      accent: "#d6d3d1",
      compositionLabel: "Corner card",
      scrimHint: "rgba(28,25,23,0.72)",
      text: "#fafaf9",
    },
  },
];

export const listStylePacks = (): AnnouncementStylePack[] => [...STYLE_PACKS];

export const getStylePack = (id: string): AnnouncementStylePack | null =>
  STYLE_PACKS.find((pack) => pack.id === id) ?? null;

/**
 * Build overlay HTML for a design preset using the given content.
 * Returns null when the pack id is unknown.
 */
export const buildDesignPresetHtml = (
  packId: string,
  content: AnnouncementContent
): string | null => {
  const pack = getStylePack(packId);

  if (!pack) {
    return null;
  }

  return pack.buildHtml(content);
};
