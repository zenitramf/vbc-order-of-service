import { grapesjs } from "grapesjs";
import type { Editor } from "grapesjs";

import "grapesjs/dist/css/grapes.min.css";
import { useEffect, useImperativeHandle, useRef } from "react";
import type { Ref } from "react";

import {
  ANNOUNCEMENT_BG_ATTR,
  BOTTOM_SCRIM_GRADIENT,
  LEFT_SCRIM_GRADIENT,
  PANEL_SCRIM_GRADIENT,
  RIGHT_SCRIM_GRADIENT,
  TOP_SCRIM_GRADIENT,
  buildOverlayHtml,
  coerceBackgroundToAlphaGradient,
  isUsableProjectData,
  parseOverlayHtml,
  projectDataKey,
  sanitizeProjectData,
  stripAnnouncementBackgroundHtml,
  stripRuntimePhotoBackgroundCss,
} from "~/lib/announcement-overlay-html";
import {
  ANNOUNCEMENT_ROLE_ATTR,
  buildDesignPresetHtml,
} from "~/lib/announcement-style-library";
import {
  ANNOUNCEMENT_HEIGHT,
  ANNOUNCEMENT_WIDTH,
} from "~/lib/announcement-types";
import type {
  AnnouncementCanvasSnapshot,
  AnnouncementContent,
  GrapesProjectData,
} from "~/lib/announcement-types";
import { cn } from "~/lib/utils";

export interface ApplyStylePackHandleResult extends AnnouncementCanvasSnapshot {
  packId: string;
}

/** Imperative API for parent flows that need a synchronous canvas snapshot (e.g. JPG export). */
export interface GrapesjsAnnouncementEditorHandle {
  /**
   * Replace the canvas with a full design-preset layout (structure + type +
   * scrims) filled from content fields. Never paints the Body photo.
   * Returns project JSON (persist) + ephemeral export HTML.
   */
  applyStylePack: (
    packId: string,
    content: AnnouncementContent
  ) => ApplyStylePackHandleResult | null;
  /**
   * Serialize the live canvas immediately (cancels pending debounced save).
   * `exportHtml` is for in-memory JPG export only — never persist it.
   */
  flush: () => AnnouncementCanvasSnapshot | null;
}

export interface GrapesjsAnnouncementEditorProps {
  backgroundUrl: string | null;
  className?: string;
  /**
   * Called when the canvas project changes (debounced).
   * Persist `projectData` only; use `exportHtml` for off-screen JPG / code view.
   */
  onProjectChange: (snapshot: AnnouncementCanvasSnapshot) => void;
  /**
   * GrapesJS project JSON — sole persistence load path when present.
   * @see https://grapesjs.com/docs/modules/Storage.html
   */
  projectData: GrapesProjectData | null;
  ref?: Ref<GrapesjsAnnouncementEditorHandle>;
  /**
   * One-shot HTML seed for: legacy draft migration, AI generate (until JSON
   * builders land), design presets applied outside the editor, or empty new
   * drafts. Loaded only when `projectData` is null or `seedRevision` changes.
   * Never persisted.
   */
  seedHtml?: string | null;
  /** Bump to force a seedHtml reload (e.g. AI generation, code-view apply). */
  seedRevision?: number;
}

const SAVE_DEBOUNCE_MS = 400;

/**
 * Canvas-frame CSS: fixed 1920×1080 stage.
 * Photo is painted on #wrapper (Body) via background-image — not a child node.
 */
const FRAME_BODY_CSS = `
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    width: ${ANNOUNCEMENT_WIDTH}px !important;
    height: ${ANNOUNCEMENT_HEIGHT}px !important;
    max-height: ${ANNOUNCEMENT_HEIGHT}px !important;
    overflow: hidden !important;
    background: transparent !important;
    background-color: transparent !important;
  }
  #wrapper {
    margin: 0 !important;
    padding: 0 !important;
    width: ${ANNOUNCEMENT_WIDTH}px !important;
    height: ${ANNOUNCEMENT_HEIGHT}px !important;
    max-height: ${ANNOUNCEMENT_HEIGHT}px !important;
    min-height: ${ANNOUNCEMENT_HEIGHT}px !important;
    overflow: hidden !important;
    position: relative !important;
    box-sizing: border-box !important;
    /* Photo comes from component styles on Body — do not force transparent here. */
    background-color: transparent;
    background-size: cover !important;
    background-position: center !important;
    background-repeat: no-repeat !important;
  }
  * {
    box-sizing: border-box;
  }
`;

const backgroundImageCss = (url: string): string => `url("${url}")`;

/** Serialize GrapesJS canvas into a self-contained overlay fragment for export/code view. */
export const serializeOverlayHtml = (editor: Editor): string => {
  // Photo lives on Body as runtime style only — never persist variation URLs.
  //
  // Keep auto-generated component IDs. GrapesJS stores styles as `#ixyz{…}` rules
  // (avoidInlineStyle). `cleanId: true` strips those IDs via a buggy rule check, so
  // the CSS no longer matches — export/preview render as unstyled black text.
  const components = stripAnnouncementBackgroundHtml(editor.getHtml().trim());
  const css = stripRuntimePhotoBackgroundCss(
    editor.getCss({ avoidProtected: true, keepUnusedStyles: true })?.trim() ??
      ""
  );
  // buildOverlayHtml flattens @media (max-width: 1920px) device rules so export
  // is not viewport-dependent, and converts any <body> wrapper to <div>.
  return buildOverlayHtml(components, css);
};

/**
 * Canonical GrapesJS persistence: project JSON (not HTML).
 * Strips runtime Body photo paint so R2 variations remain the source of truth.
 * @see https://grapesjs.com/docs/modules/Storage.html
 */
export const serializeProjectDocument = (
  editor: Editor
): AnnouncementCanvasSnapshot => {
  // getProjectData is JSON-serializable GrapesJS output; clone into the
  // serializable GrapesProjectData shape used by server functions.
  const raw = structuredClone(editor.getProjectData()) as GrapesProjectData;
  const projectData = sanitizeProjectData(raw);
  const exportHtml = serializeOverlayHtml(editor);

  if (!projectData) {
    // Extremely defensive — GrapesJS always returns a project object.
    return {
      exportHtml,
      projectData: { pages: [], styles: [] },
    };
  }

  return {
    exportHtml,
    projectData,
  };
};

const makeCanvasChrome = (editor: Editor): void => {
  const frameEl = editor.Canvas.getFrameEl();
  const canvasEl = editor.Canvas.getElement();

  if (frameEl) {
    frameEl.style.background = "transparent";
  }

  // Outside the iframe: empty-state color only (photo is on Body inside).
  if (canvasEl) {
    canvasEl.style.backgroundImage = "none";
    canvasEl.style.backgroundColor = "#111";
  }
};

/** Padding around the 1920×1080 stage when fitting into the editor panel. */
const VIEWPORT_FIT_GAP_PX = 24;

/**
 * Scale + center the fixed announcement stage so the full 1920×1080 frame is
 * visible inside the host panel (otherwise GrapesJS draws 1:1 and clips).
 */
const fitAnnouncementViewport = (editor: Editor): void => {
  try {
    editor.Canvas.fitViewport({ gap: VIEWPORT_FIT_GAP_PX });
  } catch {
    // Canvas may not be fully mounted yet.
  }
};

interface GrapesComponentLike {
  addStyle: (style: Record<string, string>) => void;
  remove: () => void;
  removeStyle: (style: string) => void;
}

/**
 * Paint the selected variation on the GrapesJS Body (`#wrapper`) component —
 * not a separate child. Removes any legacy background child nodes.
 * Variation URL is runtime-only (not saved in draft HTML).
 */
export const syncBackgroundOnBody = (
  editor: Editor,
  backgroundUrl: string | null
): void => {
  const wrapper = editor.getWrapper();

  if (!wrapper) {
    return;
  }

  // Drop legacy per-component background nodes from earlier iterations.
  const legacy = wrapper.find(
    `[${ANNOUNCEMENT_BG_ATTR}="1"]`
  ) as unknown as GrapesComponentLike[];

  for (const node of legacy) {
    node.remove();
  }

  // Stage geometry on Body.
  wrapper.addStyle({
    height: `${ANNOUNCEMENT_HEIGHT}px`,
    "max-height": `${ANNOUNCEMENT_HEIGHT}px`,
    "min-height": `${ANNOUNCEMENT_HEIGHT}px`,
    overflow: "hidden",
    position: "relative",
    width: `${ANNOUNCEMENT_WIDTH}px`,
  });

  if (!backgroundUrl) {
    wrapper.addStyle({
      "background-color": "transparent",
      "background-image": "none",
    });
    // Prefer remove so it doesn't serialize as noise.
    for (const property of [
      "background-image",
      "background-size",
      "background-position",
      "background-repeat",
    ]) {
      try {
        wrapper.removeStyle(property);
      } catch {
        // ignore unsupported removeStyle
      }
    }
    return;
  }

  wrapper.addStyle({
    "background-color": "transparent",
    "background-image": backgroundImageCss(backgroundUrl),
    "background-position": "center",
    "background-repeat": "no-repeat",
    "background-size": "cover",
  });
};

const roleAttrs = (role: string): Record<string, string> => ({
  [ANNOUNCEMENT_ROLE_ATTR]: role,
});

const registerAnnouncementBlocks = (editor: Editor): void => {
  const blockManager = editor.BlockManager;

  // Prefer announcement-specific blocks; keep a lean Basic set.
  blockManager.getAll().reset();

  blockManager.add("ann-heading", {
    category: "Announcement",
    content: {
      attributes: roleAttrs("heading"),
      content: "HEADING",
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
    label: "Heading",
    media: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M4 4h2v7h6V4h2v16h-2v-7H6v7H4V4zm14 8h2v8h-2v-8zm0-6h2v4h-2V6z"/></svg>`,
  });

  blockManager.add("ann-title", {
    category: "Announcement",
    content: {
      attributes: roleAttrs("title"),
      content: "Announcement Title",
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
    label: "Title",
    media: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M5 4h14v3h-5.5v13h-3V7H5V4z"/></svg>`,
  });

  blockManager.add("ann-subtitle", {
    category: "Announcement",
    content: {
      attributes: roleAttrs("subtitle"),
      content: "Subtitle text",
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
    label: "Subtitle",
    media: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M4 6h16v2H4V6zm0 5h12v2H4v-2zm0 5h10v2H4v-2z"/></svg>`,
  });

  blockManager.add("ann-body", {
    category: "Announcement",
    content: {
      attributes: roleAttrs("body"),
      content: "Additional details go here.",
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
    label: "Body text",
    media: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M4 5h16v2H4V5zm0 4h16v2H4V9zm0 4h16v2H4v-2zm0 4h10v2H4v-2z"/></svg>`,
  });

  blockManager.add("ann-text-box", {
    category: "Announcement",
    content: {
      attributes: roleAttrs("panel"),
      components: [
        {
          attributes: roleAttrs("body"),
          content: "Editable text block",
          style: {
            color: "#ffffff",
            "font-size": "40px",
            margin: "0",
          },
          type: "text",
        },
      ],
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
    label: "Text box",
    media: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M3 5h18v14H3V5zm2 2v10h14V7H5zm2 2h10v2H7V9zm0 4h7v2H7v-2z"/></svg>`,
  });

  blockManager.add("ann-scrim", {
    category: "Announcement",
    content: {
      attributes: roleAttrs("scrim-bottom"),
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
    label: "Bottom scrim",
    // Frame + solid band on the edge (evenodd hole so the band reads clearly).
    media: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path fill-rule="evenodd" d="M3 3h18v18H3V3zm2 2v14h14V5H5z"/><path d="M5 12h14v7H5z"/></svg>`,
  });

  blockManager.add("ann-scrim-top", {
    category: "Announcement",
    content: {
      attributes: roleAttrs("scrim-top"),
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
    label: "Top scrim",
    media: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path fill-rule="evenodd" d="M3 3h18v18H3V3zm2 2v14h14V5H5z"/><path d="M5 5h14v7H5z"/></svg>`,
  });

  blockManager.add("ann-scrim-left", {
    category: "Announcement",
    content: {
      attributes: roleAttrs("scrim-left"),
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
    label: "Left scrim",
    media: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path fill-rule="evenodd" d="M3 3h18v18H3V3zm2 2v14h14V5H5z"/><path d="M5 5h7v14H5z"/></svg>`,
  });

  blockManager.add("ann-scrim-right", {
    category: "Announcement",
    content: {
      attributes: roleAttrs("scrim-right"),
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
    label: "Right scrim",
    media: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path fill-rule="evenodd" d="M3 3h18v18H3V3zm2 2v14h14V5H5z"/><path d="M12 5h7v14h-7z"/></svg>`,
  });

  blockManager.add("ann-spacer", {
    category: "Announcement",
    content: {
      style: {
        height: "40px",
        width: "100%",
      },
      tagName: "div",
    },
    label: "Spacer",
    media: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M11 4h2v16h-2V4z"/></svg>`,
  });

  blockManager.add("ann-div", {
    category: "Basic",
    content: {
      style: {
        "min-height": "80px",
        padding: "16px",
        width: "100%",
      },
      tagName: "div",
    },
    label: "Box",
    media: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M3 3h18v18H3V3zm2 2v14h14V5H5z"/></svg>`,
  });

  blockManager.add("ann-text", {
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
    label: "Text",
    media: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M5 4v3h5.5v12h3V7H19V4H5z"/></svg>`,
  });

  blockManager.add("ann-link", {
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
    label: "Link",
    media: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>`,
  });
};

const loadHtmlIntoEditor = (editor: Editor, html: string): void => {
  const { components, css } = parseOverlayHtml(html);
  editor.DomComponents.clear();
  editor.CssComposer.clear();
  editor.setComponents(components || "");

  if (css) {
    editor.setStyle(css);
  }
};

/**
 * Load canvas from GrapesJS project JSON when available; otherwise parse seed HTML.
 * Prefer project JSON — HTML round-trips drop component metadata.
 * Seed HTML is never persisted (legacy migrate / AI / default preset only).
 */
export const loadDocumentIntoEditor = (
  editor: Editor,
  options: {
    projectData: GrapesProjectData | null;
    seedHtml?: string | null;
  }
): void => {
  if (isUsableProjectData(options.projectData)) {
    editor.loadProjectData(options.projectData);
    return;
  }

  loadHtmlIntoEditor(editor, options.seedHtml ?? "");
};

/**
 * Replace the editor canvas with a design-preset layout HTML fragment.
 * Photo stays on Body via syncBackgroundOnBody (caller should re-sync after).
 * Returns project JSON (persist) + ephemeral export HTML.
 */
export const applyDesignPresetToEditor = (
  editor: Editor,
  packId: string,
  content: AnnouncementContent
): ApplyStylePackHandleResult | null => {
  const presetHtml = buildDesignPresetHtml(packId, content);

  if (!presetHtml) {
    return null;
  }

  loadHtmlIntoEditor(editor, presetHtml);
  const snapshot = serializeProjectDocument(editor);

  return { ...snapshot, packId };
};

const isClearPaint = (value: string): boolean =>
  value === "" || value === "transparent" || value === "none";

/**
 * Coerce one component's background paint to an alpha gradient.
 * Returns true when styles were rewritten.
 */
const coerceComponentBackground = (component: {
  addStyle: (style: Record<string, string>) => void;
  getStyle: () => Record<string, string | undefined>;
}): boolean => {
  const style = component.getStyle();
  const background = (style.background ?? "").trim();
  const backgroundColor = (style["background-color"] ?? "").trim();
  const backgroundImage = (style["background-image"] ?? "").trim();

  // Never rewrite the Body photo paint (url) into a gradient.
  if (
    /url\s*\(/iu.test(background) ||
    /url\s*\(/iu.test(backgroundImage) ||
    /url\s*\(/iu.test(backgroundColor)
  ) {
    return false;
  }

  if (/gradient\s*\(/iu.test(background)) {
    if (!isClearPaint(backgroundColor)) {
      component.addStyle({ "background-color": "transparent" });
      return true;
    }

    return false;
  }

  let solidSource: string | null = null;

  if (!isClearPaint(backgroundColor)) {
    solidSource = backgroundColor;
  } else if (!isClearPaint(background)) {
    solidSource = background;
  }

  if (!solidSource) {
    return false;
  }

  const gradient = coerceBackgroundToAlphaGradient(solidSource, "panel");

  if (background === gradient && isClearPaint(backgroundColor)) {
    return false;
  }

  component.addStyle({
    background: gradient,
    "background-color": "transparent",
  });
  return true;
};

/**
 * GrapesJS-powered announcement overlay editor.
 *
 * Persistence is project JSON only (`getProjectData` / `loadProjectData`).
 * HTML is never saved — only derived in memory for JPG export / code view.
 * Seed HTML is a one-shot load path for legacy migration, AI (until JSON
 * builders), and default presets.
 *
 * @see https://grapesjs.com/docs/modules/Storage.html
 */
export const GrapesjsAnnouncementEditor = ({
  backgroundUrl,
  className,
  onProjectChange,
  projectData,
  ref,
  seedHtml = null,
  seedRevision = 0,
}: GrapesjsAnnouncementEditorProps) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const onProjectChangeRef = useRef(onProjectChange);
  const backgroundUrlRef = useRef(backgroundUrl);
  const seedHtmlRef = useRef(seedHtml);
  const projectDataRef = useRef(projectData);
  const syncedProjectKeyRef = useRef(projectDataKey(projectData));
  const syncedSeedRevisionRef = useRef(seedRevision);
  const suppressEmitRef = useRef(false);
  const coercingBackgroundRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushSaveRef = useRef<(() => void) | null>(null);
  const lastSnapshotRef = useRef<AnnouncementCanvasSnapshot | null>(
    isUsableProjectData(projectData) ? { exportHtml: "", projectData } : null
  );

  onProjectChangeRef.current = onProjectChange;
  backgroundUrlRef.current = backgroundUrl;
  seedHtmlRef.current = seedHtml;
  projectDataRef.current = projectData;

  useImperativeHandle(
    ref,
    () => ({
      applyStylePack: (packId: string, content: AnnouncementContent) => {
        const editor = editorRef.current;

        if (!editor) {
          return null;
        }

        // Suppress event-driven saves while replacing layout; parent persists once.
        suppressEmitRef.current = true;

        if (saveTimerRef.current) {
          clearTimeout(saveTimerRef.current);
          saveTimerRef.current = null;
        }

        const result = applyDesignPresetToEditor(editor, packId, content);

        if (!result) {
          suppressEmitRef.current = false;
          return null;
        }

        // Keep the selected variation photo on Body after layout swap.
        syncBackgroundOnBody(editor, backgroundUrlRef.current);
        makeCanvasChrome(editor);
        editor.UndoManager.clear();
        requestAnimationFrame(() => {
          fitAnnouncementViewport(editor);
        });

        const snapshot: AnnouncementCanvasSnapshot = {
          exportHtml: result.exportHtml,
          projectData: result.projectData,
        };
        syncedProjectKeyRef.current = projectDataKey(snapshot.projectData);
        lastSnapshotRef.current = snapshot;
        suppressEmitRef.current = false;

        return result;
      },
      flush: () => {
        const editor = editorRef.current;

        if (!editor) {
          return null;
        }

        if (saveTimerRef.current) {
          clearTimeout(saveTimerRef.current);
          saveTimerRef.current = null;
        }

        // Always snapshot the live canvas (even if emit is suppressed) so
        // approve/export sees current project JSON + in-memory HTML.
        const snapshot = serializeProjectDocument(editor);
        syncedProjectKeyRef.current = projectDataKey(snapshot.projectData);
        lastSnapshotRef.current = snapshot;

        if (!suppressEmitRef.current) {
          onProjectChangeRef.current(snapshot);
        }

        return snapshot;
      },
    }),
    []
  );

  // Mount GrapesJS once (client-only).
  useEffect(() => {
    const host = hostRef.current;

    if (!host || editorRef.current) {
      return;
    }

    const editor = grapesjs.init({
      canvas: {
        styles: [],
      },
      container: host,
      deviceManager: {
        devices: [
          {
            height: `${ANNOUNCEMENT_HEIGHT}px`,
            name: "Announcement 16:9",
            width: `${ANNOUNCEMENT_WIDTH}px`,
            // Empty widthMedia → styles are not device-media-scoped.
            widthMedia: "",
          },
        ],
      },
      // Single fixed stage — don't wrap component styles in viewport media queries.
      // Media-scoped rules break export when the host window is wider than 1920px.
      devicePreviewMode: true,
      fromElement: false,
      height: "100%",
      noticeOnUnload: false,
      protectedCss: FRAME_BODY_CSS,
      selectorManager: {
        componentFirst: true,
      },
      // Keep native GrapesJS chrome (blocks / layers / styles / traits / undo).
      showDevices: false,
      storageManager: false,
      styleManager: {
        sectors: [
          {
            name: "Dimension",
            open: false,
            properties: [
              "width",
              "height",
              "max-width",
              "min-height",
              "margin",
              "padding",
            ],
          },
          {
            name: "Typography",
            open: true,
            properties: [
              "font-family",
              "font-size",
              "font-weight",
              "letter-spacing",
              "color",
              "line-height",
              "text-align",
              "text-decoration",
              "text-shadow",
              "text-transform",
            ],
          },
          {
            name: "Decorations",
            open: false,
            properties: [
              // Solid background-color overpowers the photo — only gradient paints.
              "background",
              "border-radius",
              "border",
              "box-shadow",
              "opacity",
            ],
          },
          {
            name: "Extra",
            open: false,
            properties: [
              "position",
              "top",
              "right",
              "bottom",
              "left",
              "z-index",
            ],
          },
        ],
      },
      width: "100%",
    });

    registerAnnouncementBlocks(editor);

    const flushSave = (): void => {
      if (suppressEmitRef.current) {
        return;
      }

      const next = serializeProjectDocument(editor);
      const nextProjectKey = projectDataKey(next.projectData);

      if (nextProjectKey === syncedProjectKeyRef.current) {
        // Still refresh ephemeral export HTML for the off-screen stage.
        lastSnapshotRef.current = next;
        return;
      }

      syncedProjectKeyRef.current = nextProjectKey;
      lastSnapshotRef.current = next;
      onProjectChangeRef.current(next);
    };

    flushSaveRef.current = flushSave;

    const scheduleSave = (): void => {
      if (suppressEmitRef.current) {
        return;
      }

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        flushSave();
      }, SAVE_DEBOUNCE_MS);
    };

    /**
     * Keep overlay paints as alpha gradients so solid fills never bury the
     * Body photo. Skips the wrapper itself and any url(...) photo paint.
     */
    const coerceSelectedBackgrounds = (): void => {
      if (suppressEmitRef.current || coercingBackgroundRef.current) {
        return;
      }

      const wrapper = editor.getWrapper();
      const selected = editor.getSelectedAll();
      let changed = false;
      coercingBackgroundRef.current = true;

      try {
        for (const component of selected) {
          if (component === wrapper) {
            continue;
          }

          if (
            coerceComponentBackground(
              component as unknown as {
                addStyle: (style: Record<string, string>) => void;
                getStyle: () => Record<string, string | undefined>;
              }
            )
          ) {
            changed = true;
          }
        }
      } finally {
        coercingBackgroundRef.current = false;
      }

      if (changed) {
        scheduleSave();
      }
    };

    editor.on("update", scheduleSave);
    editor.on("component:update", scheduleSave);
    editor.on("style:change", () => {
      coerceSelectedBackgrounds();
      // If the user edits Body styles, re-apply the active variation photo.
      if (backgroundUrlRef.current) {
        const selected = editor.getSelectedAll();
        const wrapper = editor.getWrapper();

        if (selected.some((component) => component === wrapper)) {
          suppressEmitRef.current = true;
          syncBackgroundOnBody(editor, backgroundUrlRef.current);
          requestAnimationFrame(() => {
            suppressEmitRef.current = false;
          });
        }
      }
      scheduleSave();
    });
    editor.on("component:add", scheduleSave);
    editor.on("component:remove", scheduleSave);
    editor.on("component:drag:end", scheduleSave);

    editor.on("canvas:frame:load", () => {
      makeCanvasChrome(editor);
      suppressEmitRef.current = true;
      syncBackgroundOnBody(editor, backgroundUrlRef.current);
      // Defer fit until after layout paints the canvas host size.
      requestAnimationFrame(() => {
        fitAnnouncementViewport(editor);
        suppressEmitRef.current = false;
      });
    });

    // Keep the full stage visible when the editor panel is resized.
    let fitRafId = 0;
    const scheduleFitViewport = (): void => {
      if (fitRafId) {
        cancelAnimationFrame(fitRafId);
      }

      fitRafId = requestAnimationFrame(() => {
        fitRafId = 0;
        fitAnnouncementViewport(editor);
      });
    };

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            scheduleFitViewport();
          });

    if (resizeObserver) {
      resizeObserver.observe(host);
      const canvasEl = editor.Canvas.getElement();

      if (canvasEl) {
        resizeObserver.observe(canvasEl);
      }
    }

    suppressEmitRef.current = true;
    const initialProject = projectDataRef.current;
    loadDocumentIntoEditor(editor, {
      projectData: isUsableProjectData(initialProject) ? initialProject : null,
      seedHtml: seedHtmlRef.current,
    });
    syncBackgroundOnBody(editor, backgroundUrlRef.current);
    editor.UndoManager.clear();

    // New / legacy / seed loads should emit projectData so the parent can
    // persist JSON and drop any legacy html from R2.
    const initialSnapshot = serializeProjectDocument(editor);
    syncedProjectKeyRef.current = projectDataKey(initialSnapshot.projectData);
    lastSnapshotRef.current = initialSnapshot;
    suppressEmitRef.current = false;
    onProjectChangeRef.current(initialSnapshot);

    makeCanvasChrome(editor);
    requestAnimationFrame(() => {
      fitAnnouncementViewport(editor);
    });

    editorRef.current = editor;

    return () => {
      resizeObserver?.disconnect();

      if (fitRafId) {
        cancelAnimationFrame(fitRafId);
      }

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }

      try {
        flushSave();
      } catch {
        // Editor may already be partially torn down.
      }

      flushSaveRef.current = null;
      editor.destroy();
      editorRef.current = null;
    };
    // Mount once — external project/seed reloads are handled below.
  }, []);

  // External project (undo) or seed HTML (AI / code view / migrate) → reload canvas.
  useEffect(() => {
    const editor = editorRef.current;
    const nextProjectKey = projectDataKey(projectData);
    const projectChanged = nextProjectKey !== syncedProjectKeyRef.current;
    const seedChanged = seedRevision !== syncedSeedRevisionRef.current;

    if (!editor) {
      syncedProjectKeyRef.current = nextProjectKey;
      syncedSeedRevisionRef.current = seedRevision;
      return;
    }

    if (!projectChanged && !seedChanged) {
      return;
    }

    // Prefer project JSON when present and seed did not just change.
    // Seed revision bumps force HTML load (AI / code apply) even if project exists.
    const useSeed = seedChanged && Boolean(seedHtml?.trim());
    const loadProject = !useSeed && isUsableProjectData(projectData);

    syncedProjectKeyRef.current = nextProjectKey;
    syncedSeedRevisionRef.current = seedRevision;
    suppressEmitRef.current = true;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    loadDocumentIntoEditor(editor, {
      projectData: loadProject ? projectData : null,
      seedHtml: useSeed || !loadProject ? seedHtml : null,
    });
    syncBackgroundOnBody(editor, backgroundUrlRef.current);
    editor.UndoManager.clear();
    makeCanvasChrome(editor);

    // After seed load, emit so parent migrates to projectData and persists.
    if (useSeed || !loadProject) {
      const snapshot = serializeProjectDocument(editor);
      syncedProjectKeyRef.current = projectDataKey(snapshot.projectData);
      lastSnapshotRef.current = snapshot;
      requestAnimationFrame(() => {
        fitAnnouncementViewport(editor);
        suppressEmitRef.current = false;
        onProjectChangeRef.current(snapshot);
      });
      return;
    }

    lastSnapshotRef.current = isUsableProjectData(projectData)
      ? {
          exportHtml: lastSnapshotRef.current?.exportHtml ?? "",
          projectData,
        }
      : lastSnapshotRef.current;

    requestAnimationFrame(() => {
      fitAnnouncementViewport(editor);
      suppressEmitRef.current = false;
    });
  }, [projectData, seedHtml, seedRevision]);

  // Swappable background — painted on GrapesJS Body, dynamic with variation.
  useEffect(() => {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    suppressEmitRef.current = true;
    syncBackgroundOnBody(editor, backgroundUrl);
    makeCanvasChrome(editor);
    requestAnimationFrame(() => {
      suppressEmitRef.current = false;
    });
  }, [backgroundUrl]);

  return (
    <div
      className={cn(
        "grapesjs-announcement-editor flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-lg border",
        className
      )}
    >
      <div className="gjs-editor-host min-h-0 w-full flex-1" ref={hostRef} />
    </div>
  );
};
