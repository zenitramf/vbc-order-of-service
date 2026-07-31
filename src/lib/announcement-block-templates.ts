/**
 * Pure GrapesJS component definitions for announcement Block Manager entries.
 * Shared by the editor (register blocks) and AI layout executor (addBlock ops).
 */

import {
  BOTTOM_SCRIM_GRADIENT,
  LEFT_SCRIM_GRADIENT,
  PANEL_SCRIM_GRADIENT,
  RIGHT_SCRIM_GRADIENT,
  TOP_SCRIM_GRADIENT,
} from "~/lib/announcement-overlay-html";
import { ANNOUNCEMENT_ROLE_ATTR } from "~/lib/announcement-style-library";
import type { AnnouncementStyleRole } from "~/lib/announcement-style-library";

export type StyleMap = Record<string, string>;

/** GrapesJS-compatible component definition (JSON-serializable). */
export interface AnnouncementComponentDef {
  attributes?: Record<string, string>;
  components?: AnnouncementComponentDef[];
  content?: string;
  name?: string;
  style?: StyleMap;
  tagName?: string;
  type?: string;
}

export interface AnnouncementBlockMeta {
  category: "Announcement" | "Basic";
  id: string;
  label: string;
  media: string;
}

export interface AnnouncementBlockTemplate extends AnnouncementBlockMeta {
  content: AnnouncementComponentDef;
}

export type AnnouncementBlockId =
  | "ann-heading"
  | "ann-title"
  | "ann-subtitle"
  | "ann-body"
  | "ann-text-box"
  | "ann-scrim"
  | "ann-scrim-top"
  | "ann-scrim-left"
  | "ann-scrim-right"
  | "ann-spacer"
  | "ann-div"
  | "ann-text"
  | "ann-link";

const roleAttrs = (role: AnnouncementStyleRole): Record<string, string> => ({
  [ANNOUNCEMENT_ROLE_ATTR]: role,
});

const BLOCK_TEMPLATES: Record<AnnouncementBlockId, AnnouncementBlockTemplate> =
  {
    "ann-body": {
      category: "Announcement",
      content: {
        attributes: roleAttrs("body"),
        content: "Additional details go here.",
        name: "tertiary",
        style: {
          color: "#ffffff",
          "font-family": "system-ui, sans-serif",
          "font-size": "40px",
          "line-height": "1.35",
          margin: "0",
          "max-width": "1400px",
          opacity: "0.9",
        },
        type: "text",
      },
      id: "ann-body",
      label: "Body text",
      media: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M4 5h16v2H4V5zm0 4h16v2H4V9zm0 4h16v2H4v-2zm0 4h10v2H4v-2z"/></svg>`,
    },
    "ann-div": {
      category: "Basic",
      content: {
        style: {
          "min-height": "80px",
          padding: "16px",
          width: "100%",
        },
        tagName: "div",
      },
      id: "ann-div",
      label: "Box",
      media: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M3 3h18v18H3V3zm2 2v14h14V5H5z"/></svg>`,
    },
    "ann-heading": {
      category: "Announcement",
      content: {
        attributes: roleAttrs("heading"),
        content: "HEADING",
        name: "heading",
        style: {
          color: "#ffffff",
          "font-family": "system-ui, sans-serif",
          "font-size": "42px",
          "letter-spacing": "0.28em",
          margin: "0 0 16px 0",
          "text-shadow": "0 3px 16px rgba(0,0,0,0.5)",
          "text-transform": "uppercase",
        },
        type: "text",
      },
      id: "ann-heading",
      label: "Heading",
      media: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M4 4h2v7h6V4h2v16h-2v-7H6v7H4V4zm14 8h2v8h-2v-8zm0-6h2v4h-2V6z"/></svg>`,
    },
    "ann-link": {
      category: "Basic",
      content: {
        attributes: roleAttrs("link"),
        content: "Link text",
        style: {
          color: "#fbbf24",
          "font-size": "40px",
        },
        type: "link",
      },
      id: "ann-link",
      label: "Link",
      media: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>`,
    },
    "ann-scrim": {
      category: "Announcement",
      content: {
        attributes: roleAttrs("scrim-bottom"),
        name: "Bottom scrim",
        style: {
          background: BOTTOM_SCRIM_GRADIENT,
          "background-color": "transparent",
          bottom: "0",
          height: "55%",
          left: "0",
          "pointer-events": "none",
          position: "absolute",
          right: "0",
        },
        tagName: "div",
      },
      id: "ann-scrim",
      label: "Bottom scrim",
      media: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path fill-rule="evenodd" d="M3 3h18v18H3V3zm2 2v14h14V5H5z"/><path d="M5 12h14v7H5z"/></svg>`,
    },
    "ann-scrim-left": {
      category: "Announcement",
      content: {
        attributes: roleAttrs("scrim-left"),
        name: "Left scrim",
        style: {
          background: LEFT_SCRIM_GRADIENT,
          "background-color": "transparent",
          bottom: "0",
          left: "0",
          "pointer-events": "none",
          position: "absolute",
          top: "0",
          width: "45%",
        },
        tagName: "div",
      },
      id: "ann-scrim-left",
      label: "Left scrim",
      media: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path fill-rule="evenodd" d="M3 3h18v18H3V3zm2 2v14h14V5H5z"/><path d="M5 5h7v14H5z"/></svg>`,
    },
    "ann-scrim-right": {
      category: "Announcement",
      content: {
        attributes: roleAttrs("scrim-right"),
        name: "Right scrim",
        style: {
          background: RIGHT_SCRIM_GRADIENT,
          "background-color": "transparent",
          bottom: "0",
          "pointer-events": "none",
          position: "absolute",
          right: "0",
          top: "0",
          width: "45%",
        },
        tagName: "div",
      },
      id: "ann-scrim-right",
      label: "Right scrim",
      media: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path fill-rule="evenodd" d="M3 3h18v18H3V3zm2 2v14h14V5H5z"/><path d="M12 5h7v14h-7z"/></svg>`,
    },
    "ann-scrim-top": {
      category: "Announcement",
      content: {
        attributes: roleAttrs("scrim-top"),
        name: "Top scrim",
        style: {
          background: TOP_SCRIM_GRADIENT,
          "background-color": "transparent",
          height: "55%",
          left: "0",
          "pointer-events": "none",
          position: "absolute",
          right: "0",
          top: "0",
        },
        tagName: "div",
      },
      id: "ann-scrim-top",
      label: "Top scrim",
      media: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path fill-rule="evenodd" d="M3 3h18v18H3V3zm2 2v14h14V5H5z"/><path d="M5 5h14v7H5z"/></svg>`,
    },
    "ann-spacer": {
      category: "Announcement",
      content: {
        name: "Spacer",
        style: {
          height: "40px",
          width: "100%",
        },
        tagName: "div",
      },
      id: "ann-spacer",
      label: "Spacer",
      media: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M11 4h2v16h-2V4z"/></svg>`,
    },
    "ann-subtitle": {
      category: "Announcement",
      content: {
        attributes: roleAttrs("subtitle"),
        content: "Subtitle text",
        name: "subtitle",
        style: {
          color: "#ffffff",
          "font-family": "Georgia, 'Times New Roman', serif",
          "font-size": "58px",
          "font-weight": "400",
          "line-height": "1.2",
          margin: "0 0 32px 0",
          opacity: "0.95",
        },
        type: "text",
      },
      id: "ann-subtitle",
      label: "Subtitle",
      media: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M4 6h16v2H4V6zm0 5h12v2H4v-2zm0 5h10v2H4v-2z"/></svg>`,
    },
    "ann-text": {
      category: "Basic",
      content: {
        content: "Insert your text here",
        style: {
          color: "#ffffff",
          "font-size": "40px",
          padding: "8px",
        },
        type: "text",
      },
      id: "ann-text",
      label: "Text",
      media: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M5 4v3h5.5v12h3V7H19V4H5z"/></svg>`,
    },
    "ann-text-box": {
      category: "Announcement",
      content: {
        attributes: roleAttrs("panel"),
        components: [
          {
            attributes: roleAttrs("body"),
            content: "Editable text block",
            name: "tertiary",
            style: {
              color: "#ffffff",
              "font-size": "40px",
              margin: "0",
            },
            type: "text",
          },
        ],
        name: "Panel",
        style: {
          background: PANEL_SCRIM_GRADIENT,
          "background-color": "transparent",
          "border-radius": "12px",
          "box-sizing": "border-box",
          padding: "32px 40px",
          width: "800px",
        },
        tagName: "div",
      },
      id: "ann-text-box",
      label: "Text box",
      media: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M3 5h18v14H3V5zm2 2v10h14V7H5zm2 2h10v2H7V9zm0 4h7v2H7v-2z"/></svg>`,
    },
    "ann-title": {
      category: "Announcement",
      content: {
        attributes: roleAttrs("title"),
        content: "Announcement Title",
        name: "title",
        style: {
          color: "#ffffff",
          "font-family": "Georgia, 'Times New Roman', serif",
          "font-size": "132px",
          "font-weight": "700",
          "line-height": "1.02",
          margin: "0 0 24px 0",
          "text-shadow": "0 6px 32px rgba(0,0,0,0.5)",
        },
        tagName: "h1",
        type: "text",
      },
      id: "ann-title",
      label: "Title",
      media: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M5 4h14v3h-5.5v13h-3V7H5V4z"/></svg>`,
    },
  };

export const ANNOUNCEMENT_BLOCK_IDS = Object.keys(
  BLOCK_TEMPLATES
) as AnnouncementBlockId[];

export const isAnnouncementBlockId = (
  value: string
): value is AnnouncementBlockId =>
  Object.hasOwn(BLOCK_TEMPLATES, value as AnnouncementBlockId);

export const listAnnouncementBlockTemplates = (): AnnouncementBlockTemplate[] =>
  ANNOUNCEMENT_BLOCK_IDS.map((id) => BLOCK_TEMPLATES[id]);

export interface BlockDefOverrides {
  content?: string;
  role?: AnnouncementStyleRole;
  style?: StyleMap;
}

const deepCloneDef = (
  def: AnnouncementComponentDef
): AnnouncementComponentDef => structuredClone(def) as AnnouncementComponentDef;

/**
 * Return a component def for a registered block, with optional overrides.
 */
export const getAnnouncementBlockDef = (
  blockId: AnnouncementBlockId,
  overrides: BlockDefOverrides = {}
): AnnouncementComponentDef => {
  const base = deepCloneDef(BLOCK_TEMPLATES[blockId].content);

  if (overrides.content !== undefined) {
    base.content = overrides.content;
  }

  if (overrides.style) {
    base.style = { ...base.style, ...overrides.style };
  }

  if (overrides.role) {
    base.attributes = {
      ...base.attributes,
      ...roleAttrs(overrides.role),
    };
  }

  return base;
};

export const getAnnouncementBlockTemplate = (
  blockId: AnnouncementBlockId
): AnnouncementBlockTemplate => BLOCK_TEMPLATES[blockId];
