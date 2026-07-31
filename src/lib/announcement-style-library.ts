/**
 * Hand-authored design presets for announcement overlays.
 *
 * Each preset is a full 1920×1080 GrapesJS project JSON springboard (structure +
 * typography + scrims). Applying a preset replaces the canvas via
 * `loadProjectData`; the Body photo is never included.
 */

import {
  ANNOUNCEMENT_HEIGHT,
  ANNOUNCEMENT_WIDTH,
} from "~/lib/announcement-types";
import type {
  AnnouncementContent,
  GrapesProjectData,
  JsonValue,
} from "~/lib/announcement-types";

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
  /** Build a GrapesJS project JSON payload from draft content fields. */
  buildProject: (content: AnnouncementContent) => GrapesProjectData;
}

export interface ApplyDesignPresetResult {
  packId: string;
  projectData: GrapesProjectData;
}

/** Selector for a role attribute (for GrapesJS find / querySelector). */
export const roleSelector = (role: AnnouncementStyleRole): string =>
  `[${ANNOUNCEMENT_ROLE_ATTR}="${role}"]`;

// ── Helpers ─────────────────────────────────────────────────────────────────

const SYSTEM_SANS = "system-ui, sans-serif";
const GEORGIA_SERIF = "Georgia, 'Times New Roman', serif";

type StyleMap = Record<string, string>;

/** GrapesJS-compatible component definition (JSON-serializable). */
interface ComponentDef {
  attributes?: Record<string, string>;
  components?: ComponentDef[];
  content?: string;
  /**
   * Layer Manager label. Without this GrapesJS falls back to tagName/type
   * (usually "Div" / "Text") — not `data-ann-role`.
   */
  name?: string;
  style?: StyleMap;
  tagName?: string;
  type?: string;
}

/** Human labels for Layer Manager (from announcement roles). */
const ROLE_LAYER_NAMES: Record<AnnouncementStyleRole, string> = {
  body: "Body",
  heading: "Heading",
  link: "Link",
  panel: "Panel",
  "scrim-bottom": "Bottom scrim",
  "scrim-left": "Left scrim",
  "scrim-right": "Right scrim",
  "scrim-top": "Top scrim",
  subtitle: "Subtitle",
  title: "Title",
};

interface ResolvedContent {
  body: string;
  heading: string;
  subtitle: string;
  title: string;
}

/** Trim draft fields; empty strings mean “do not render this role”. */
const resolveContent = (content: AnnouncementContent): ResolvedContent => ({
  body: content.tertiary.trim(),
  heading: content.heading.trim(),
  subtitle: content.subtitle.trim(),
  title: content.title.trim(),
});

const roleAttrs = (name: AnnouncementStyleRole): Record<string, string> => ({
  [ANNOUNCEMENT_ROLE_ATTR]: name,
});

const parseStyleString = (css: string): StyleMap => {
  const style: StyleMap = {};

  for (const part of css.split(";")) {
    const trimmed = part.trim();

    if (!trimmed) {
      continue;
    }

    const colon = trimmed.indexOf(":");

    if (colon === -1) {
      continue;
    }

    const property = trimmed.slice(0, colon).trim();
    const value = trimmed.slice(colon + 1).trim();

    if (property && value) {
      style[property] = value;
    }
  }

  return style;
};

const mergeStyles = (...parts: (StyleMap | string | undefined)[]): StyleMap => {
  const result: StyleMap = {};

  for (const part of parts) {
    if (!part) {
      continue;
    }

    const map = typeof part === "string" ? parseStyleString(part) : part;
    Object.assign(result, map);
  }

  return result;
};

const textNode = (
  role: AnnouncementStyleRole,
  text: string,
  style: StyleMap,
  tagName: "p" | "h1" = "p"
): ComponentDef => ({
  attributes: roleAttrs(role),
  content: text,
  name: ROLE_LAYER_NAMES[role],
  style,
  tagName,
  type: "text",
});

const divNode = (
  style: StyleMap,
  components: ComponentDef[],
  role?: AnnouncementStyleRole,
  layerName?: string
): ComponentDef => ({
  attributes: role ? roleAttrs(role) : undefined,
  components,
  name: layerName ?? (role ? ROLE_LAYER_NAMES[role] : "Box"),
  style,
  tagName: "div",
});

const textStack = (
  c: ResolvedContent,
  options: {
    align?: "left" | "center" | "right";
    bodyStyle?: string;
    headingStyle?: string;
    subtitleStyle?: string;
    titleStyle?: string;
  } = {}
): ComponentDef[] => {
  const align = options.align ?? "left";
  const textAlign: StyleMap = { "text-align": align };
  const nodes: ComponentDef[] = [];

  if (c.heading) {
    nodes.push(
      textNode(
        "heading",
        c.heading,
        mergeStyles({ margin: "0 0 16px" }, textAlign, options.headingStyle)
      )
    );
  }

  if (c.title) {
    nodes.push(
      textNode(
        "title",
        c.title,
        mergeStyles({ margin: "0 0 24px" }, textAlign, options.titleStyle),
        "h1"
      )
    );
  }

  if (c.subtitle) {
    nodes.push(
      textNode(
        "subtitle",
        c.subtitle,
        mergeStyles({ margin: "0 0 32px" }, textAlign, options.subtitleStyle)
      )
    );
  }

  if (c.body) {
    nodes.push(
      textNode(
        "body",
        c.body,
        mergeStyles({ margin: "0" }, textAlign, options.bodyStyle)
      )
    );
  }

  return nodes;
};

/** Wrap child components in a GrapesJS project payload (no photo, no assets). */
const toProjectData = (components: ComponentDef[]): GrapesProjectData => {
  const wrapper: ComponentDef = {
    components,
    name: "Body",
    style: {
      "background-color": "transparent",
      "box-sizing": "border-box",
      color: "#ffffff",
      "font-family": GEORGIA_SERIF,
      height: `${ANNOUNCEMENT_HEIGHT}px`,
      overflow: "hidden",
      position: "relative",
      width: `${ANNOUNCEMENT_WIDTH}px`,
    },
    type: "wrapper",
  };

  // JsonValue-compatible clone
  return {
    assets: [],
    pages: [
      {
        frames: [
          {
            component: wrapper as unknown as JsonValue,
          },
        ],
      },
    ],
    styles: [],
  };
};

// Shared type recipes — sized for living-room / sanctuary TV screens at 1920×1080.
const HEADING_CLASSIC = `font-size:42px;letter-spacing:0.28em;text-transform:uppercase;opacity:0.92;font-family:${SYSTEM_SANS};color:#ffffff;text-shadow:0 3px 16px rgba(0,0,0,0.5);`;
const TITLE_CLASSIC = `font-size:132px;line-height:1.02;font-weight:700;font-family:${GEORGIA_SERIF};color:#ffffff;text-shadow:0 6px 32px rgba(0,0,0,0.5);`;
const SUBTITLE_CLASSIC = `font-size:58px;line-height:1.2;font-weight:400;font-family:${GEORGIA_SERIF};color:#ffffff;opacity:0.95;`;
const BODY_CLASSIC = `font-size:40px;line-height:1.35;opacity:0.9;font-family:${SYSTEM_SANS};color:#ffffff;max-width:1400px;`;

const HEADING_MODERN = `font-size:36px;letter-spacing:0.18em;text-transform:uppercase;font-weight:600;font-family:${SYSTEM_SANS};color:#a5b4fc;text-shadow:0 2px 12px rgba(0,0,0,0.4);`;
const TITLE_MODERN = `font-size:120px;line-height:1.0;font-weight:700;letter-spacing:-0.02em;font-family:${SYSTEM_SANS};color:#f8fafc;text-shadow:0 4px 24px rgba(0,0,0,0.45);`;
const SUBTITLE_MODERN = `font-size:52px;line-height:1.25;font-weight:400;font-family:${SYSTEM_SANS};color:#f1f5f9;opacity:0.92;`;
const BODY_MODERN = `font-size:40px;line-height:1.4;font-family:${SYSTEM_SANS};color:#e2e8f0;opacity:0.92;max-width:1000px;`;

const HEADING_GOLD = `font-size:40px;letter-spacing:0.28em;text-transform:uppercase;font-weight:600;font-family:${SYSTEM_SANS};color:#fbbf24;text-shadow:0 3px 16px rgba(0,0,0,0.55);`;
const TITLE_GOLD = `font-size:124px;line-height:1.02;font-weight:700;font-family:${GEORGIA_SERIF};color:#fffbeb;text-shadow:0 6px 28px rgba(0,0,0,0.55);`;
const SUBTITLE_GOLD = `font-size:54px;line-height:1.2;font-weight:400;font-family:${GEORGIA_SERIF};color:#fde68a;opacity:0.95;`;
const BODY_GOLD = `font-size:40px;line-height:1.35;font-family:${SYSTEM_SANS};color:#fef3c7;opacity:0.92;max-width:780px;`;

const BOTTOM_SCRIM =
  "linear-gradient(to top, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.22) 42%, transparent 78%)";

// ── Layout builders ─────────────────────────────────────────────────────────

const buildBottomBand = (content: AnnouncementContent): GrapesProjectData => {
  const c = resolveContent(content);
  return toProjectData([
    divNode(
      {
        background: BOTTOM_SCRIM,
        "background-color": "transparent",
        bottom: "0",
        height: "55%",
        left: "0",
        "pointer-events": "none",
        position: "absolute",
        right: "0",
      },
      [],
      "scrim-bottom"
    ),
    divNode(
      {
        "align-items": "flex-start",
        background: "transparent",
        bottom: "0",
        "box-sizing": "border-box",
        display: "flex",
        "flex-direction": "column",
        "justify-content": "flex-end",
        left: "0",
        padding: "80px 100px",
        position: "absolute",
        right: "0",
      },
      textStack(c, {
        align: "left",
        bodyStyle: BODY_CLASSIC,
        headingStyle: HEADING_CLASSIC,
        subtitleStyle: SUBTITLE_CLASSIC,
        titleStyle: TITLE_CLASSIC,
      }),
      undefined,
      "Text stack"
    ),
  ]);
};

const buildLowerLeft = (content: AnnouncementContent): GrapesProjectData => {
  const c = resolveContent(content);
  return toProjectData([
    divNode(
      {
        background:
          "linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.28) 40%, transparent 75%)",
        "background-color": "transparent",
        bottom: "0",
        height: "62%",
        left: "0",
        "pointer-events": "none",
        position: "absolute",
        right: "0",
      },
      [],
      "scrim-bottom"
    ),
    divNode(
      {
        background:
          "linear-gradient(to right, rgba(0,0,0,0.35) 0%, transparent 100%)",
        "background-color": "transparent",
        bottom: "0",
        left: "0",
        "pointer-events": "none",
        position: "absolute",
        top: "0",
        width: "48%",
      },
      [],
      "scrim-left"
    ),
    divNode(
      {
        "align-items": "flex-start",
        background: "transparent",
        bottom: "0",
        "box-sizing": "border-box",
        display: "flex",
        "flex-direction": "column",
        "justify-content": "flex-end",
        left: "0",
        "max-width": "1100px",
        padding: "72px 80px 88px 100px",
        position: "absolute",
        width: "58%",
      },
      textStack(c, {
        align: "left",
        bodyStyle: `${BODY_CLASSIC}max-width:1000px;`,
        headingStyle: HEADING_CLASSIC,
        subtitleStyle: SUBTITLE_CLASSIC,
        titleStyle: `${TITLE_CLASSIC}font-size:120px;`,
      }),
      undefined,
      "Text stack"
    ),
  ]);
};

const buildCenteredHero = (content: AnnouncementContent): GrapesProjectData => {
  const c = resolveContent(content);
  return toProjectData([
    divNode(
      {
        background:
          "linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, transparent 100%)",
        "background-color": "transparent",
        height: "40%",
        left: "0",
        "pointer-events": "none",
        position: "absolute",
        right: "0",
        top: "0",
      },
      [],
      "scrim-top"
    ),
    divNode(
      {
        background:
          "linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 100%)",
        "background-color": "transparent",
        bottom: "0",
        height: "45%",
        left: "0",
        "pointer-events": "none",
        position: "absolute",
        right: "0",
      },
      [],
      "scrim-bottom"
    ),
    divNode(
      {
        "align-items": "center",
        background: "transparent",
        bottom: "0",
        "box-sizing": "border-box",
        display: "flex",
        "flex-direction": "column",
        "justify-content": "center",
        left: "0",
        padding: "100px 140px",
        position: "absolute",
        right: "0",
        top: "0",
      },
      textStack(c, {
        align: "center",
        bodyStyle: `${BODY_MODERN}max-width:1100px;`,
        headingStyle: HEADING_MODERN,
        subtitleStyle: `${SUBTITLE_MODERN}max-width:1200px;`,
        titleStyle: `${TITLE_MODERN}font-size:140px;max-width:1600px;`,
      }),
      undefined,
      "Text stack"
    ),
  ]);
};

const buildTopBanner = (content: AnnouncementContent): GrapesProjectData => {
  const c = resolveContent(content);
  return toProjectData([
    divNode(
      {
        background:
          "linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.28) 48%, transparent 100%)",
        "background-color": "transparent",
        height: "52%",
        left: "0",
        "pointer-events": "none",
        position: "absolute",
        right: "0",
        top: "0",
      },
      [],
      "scrim-top"
    ),
    divNode(
      {
        "align-items": "flex-start",
        background: "transparent",
        "box-sizing": "border-box",
        display: "flex",
        "flex-direction": "column",
        "justify-content": "flex-start",
        left: "0",
        padding: "72px 100px 40px",
        position: "absolute",
        right: "0",
        top: "0",
      },
      textStack(c, {
        align: "left",
        bodyStyle: BODY_CLASSIC,
        headingStyle: HEADING_CLASSIC,
        subtitleStyle: SUBTITLE_CLASSIC,
        titleStyle: `${TITLE_CLASSIC}font-size:124px;`,
      }),
      undefined,
      "Text stack"
    ),
  ]);
};

const buildLeftPanel = (content: AnnouncementContent): GrapesProjectData => {
  const c = resolveContent(content);
  return toProjectData([
    divNode(
      {
        background:
          "linear-gradient(to right, rgba(2,6,23,0.82) 0%, rgba(2,6,23,0.55) 55%, transparent 100%)",
        "background-color": "transparent",
        bottom: "0",
        left: "0",
        "pointer-events": "none",
        position: "absolute",
        top: "0",
        width: "50%",
      },
      [],
      "scrim-left"
    ),
    divNode(
      {
        "align-items": "flex-start",
        background:
          "linear-gradient(180deg, rgba(2,6,23,0.35) 0%, rgba(2,6,23,0.15) 100%)",
        "background-color": "transparent",
        bottom: "0",
        "box-sizing": "border-box",
        display: "flex",
        "flex-direction": "column",
        "justify-content": "center",
        left: "0",
        padding: "88px 64px 88px 96px",
        position: "absolute",
        top: "0",
        width: "48%",
      },
      textStack(c, {
        align: "left",
        bodyStyle: `font-size:38px;line-height:1.35;font-family:${SYSTEM_SANS};color:#bae6fd;opacity:0.92;max-width:720px;`,
        headingStyle: `font-size:34px;letter-spacing:0.22em;text-transform:uppercase;font-weight:600;font-family:${SYSTEM_SANS};color:#7dd3fc;text-shadow:0 3px 14px rgba(2,6,23,0.65);`,
        subtitleStyle: `font-size:48px;line-height:1.25;font-family:${SYSTEM_SANS};color:#e0f2fe;opacity:0.95;`,
        titleStyle: `font-size:100px;line-height:1.02;font-weight:700;letter-spacing:-0.015em;font-family:${SYSTEM_SANS};color:#f0f9ff;text-shadow:0 6px 28px rgba(2,6,23,0.7);`,
      }),
      "panel"
    ),
  ]);
};

const buildRightPanel = (content: AnnouncementContent): GrapesProjectData => {
  const c = resolveContent(content);
  return toProjectData([
    divNode(
      {
        background:
          "linear-gradient(to left, rgba(20,12,0,0.8) 0%, rgba(20,12,0,0.45) 55%, transparent 100%)",
        "background-color": "transparent",
        bottom: "0",
        "pointer-events": "none",
        position: "absolute",
        right: "0",
        top: "0",
        width: "52%",
      },
      [],
      "scrim-right"
    ),
    divNode(
      {
        "align-items": "flex-end",
        background:
          "linear-gradient(180deg, rgba(41,25,0,0.4) 0%, rgba(41,25,0,0.18) 100%)",
        "background-color": "transparent",
        bottom: "0",
        "box-sizing": "border-box",
        display: "flex",
        "flex-direction": "column",
        "justify-content": "center",
        padding: "88px 96px 88px 64px",
        position: "absolute",
        right: "0",
        top: "0",
        width: "48%",
      },
      textStack(c, {
        align: "right",
        bodyStyle: BODY_GOLD,
        headingStyle: HEADING_GOLD,
        subtitleStyle: SUBTITLE_GOLD,
        titleStyle: `${TITLE_GOLD}font-size:110px;`,
      }),
      "panel"
    ),
  ]);
};

const buildTwoPanel = (content: AnnouncementContent): GrapesProjectData => {
  const c = resolveContent(content);
  const topParts: ComponentDef[] = [];

  if (c.heading) {
    topParts.push(
      textNode(
        "heading",
        c.heading,
        mergeStyles(
          { margin: "0 0 24px", "text-align": "left" },
          HEADING_CLASSIC
        )
      )
    );
  }

  if (c.title) {
    topParts.push(
      textNode(
        "title",
        c.title,
        {
          color: "#ffffff",
          "font-family": GEORGIA_SERIF,
          "font-size": "108px",
          "font-weight": "700",
          "line-height": "1.04",
          margin: "0",
          "text-align": "left",
          "text-shadow": "0 6px 28px rgba(0,0,0,0.5)",
        },
        "h1"
      )
    );
  }

  const bottomParts: ComponentDef[] = [];

  if (c.subtitle) {
    bottomParts.push(
      textNode(
        "subtitle",
        c.subtitle,
        mergeStyles(
          { margin: "0 0 24px", "text-align": "left" },
          SUBTITLE_CLASSIC
        )
      )
    );
  }

  if (c.body) {
    bottomParts.push(
      textNode(
        "body",
        c.body,
        mergeStyles(
          { margin: "0", "text-align": "left" },
          `${BODY_CLASSIC}max-width:720px;`
        )
      )
    );
  }

  const panelChildren: ComponentDef[] = [];

  if (topParts.length > 0) {
    panelChildren.push(
      divNode(
        {
          "align-items": "flex-start",
          background: "transparent",
          display: "flex",
          "flex-direction": "column",
        },
        topParts,
        undefined,
        "Title block"
      )
    );
  }

  if (bottomParts.length > 0) {
    panelChildren.push(
      divNode(
        {
          "align-items": "flex-start",
          background: "transparent",
          display: "flex",
          "flex-direction": "column",
          "margin-top": "48px",
        },
        bottomParts,
        undefined,
        "Details block"
      )
    );
  }

  return toProjectData([
    divNode(
      {
        background:
          "linear-gradient(to right, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.55) 70%, transparent 100%)",
        "background-color": "transparent",
        bottom: "0",
        left: "0",
        "pointer-events": "none",
        position: "absolute",
        top: "0",
        width: "54%",
      },
      [],
      "scrim-left"
    ),
    divNode(
      {
        "align-items": "flex-start",
        background:
          "linear-gradient(180deg, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0.22) 100%)",
        "background-color": "transparent",
        "border-right": "1px solid rgba(255,255,255,0.12)",
        bottom: "0",
        "box-sizing": "border-box",
        display: "flex",
        "flex-direction": "column",
        "justify-content": "space-between",
        left: "0",
        padding: "88px 56px 88px 88px",
        position: "absolute",
        top: "0",
        width: "48%",
      },
      panelChildren,
      "panel"
    ),
  ]);
};

const buildCornerCard = (content: AnnouncementContent): GrapesProjectData => {
  const c = resolveContent(content);
  return toProjectData([
    divNode(
      {
        background:
          "linear-gradient(to top, rgba(28,25,23,0.45) 0%, transparent 85%)",
        "background-color": "transparent",
        bottom: "0",
        height: "52%",
        left: "0",
        "pointer-events": "none",
        position: "absolute",
        right: "0",
      },
      [],
      "scrim-bottom"
    ),
    divNode(
      {
        "align-items": "flex-start",
        background:
          "linear-gradient(180deg, rgba(28,25,23,0.78) 0%, rgba(28,25,23,0.58) 100%)",
        "background-color": "transparent",
        "border-radius": "28px",
        bottom: "56px",
        "box-shadow": "0 28px 72px rgba(0,0,0,0.38)",
        "box-sizing": "border-box",
        display: "flex",
        "flex-direction": "column",
        "justify-content": "flex-end",
        left: "64px",
        padding: "64px 72px",
        position: "absolute",
        width: "1120px",
      },
      textStack(c, {
        align: "left",
        bodyStyle: `font-size:40px;line-height:1.4;font-family:${GEORGIA_SERIF};color:#e7e5e4;opacity:0.92;max-width:980px;`,
        headingStyle: `font-size:34px;letter-spacing:0.22em;text-transform:uppercase;font-weight:500;font-family:${SYSTEM_SANS};color:#d6d3d1;text-shadow:0 2px 10px rgba(0,0,0,0.35);`,
        subtitleStyle: `font-size:52px;line-height:1.25;font-weight:400;font-family:${GEORGIA_SERIF};color:#f5f5f4;opacity:0.94;`,
        titleStyle: `font-size:100px;line-height:1.05;font-weight:500;font-family:${GEORGIA_SERIF};color:#fafaf9;text-shadow:0 4px 24px rgba(0,0,0,0.4);`,
      }),
      "panel"
    ),
  ]);
};

// ── Seed library ────────────────────────────────────────────────────────────

const STYLE_PACKS: AnnouncementStylePack[] = [
  {
    buildProject: buildBottomBand,
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
    buildProject: buildLowerLeft,
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
    buildProject: buildCenteredHero,
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
    buildProject: buildTopBanner,
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
    buildProject: buildLeftPanel,
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
    buildProject: buildRightPanel,
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
    buildProject: buildTwoPanel,
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
    buildProject: buildCornerCard,
    composition: "corner-card",
    description:
      "Floating lower-left card with soft panel fill — editorial and easy to nudge on the canvas.",
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
 * Build GrapesJS project JSON for a design preset using the given content.
 * Returns null when the pack id is unknown.
 */
export const buildDesignPresetProject = (
  packId: string,
  content: AnnouncementContent
): GrapesProjectData | null => {
  const pack = getStylePack(packId);

  if (!pack) {
    return null;
  }

  return pack.buildProject(content);
};
