import { grapesjs } from "grapesjs";
import type { Editor } from "grapesjs";

import "grapesjs/dist/css/grapes.min.css";
import { useEffect, useRef } from "react";

import {
  ANNOUNCEMENT_BG_ATTR,
  ANNOUNCEMENT_BG_TYPE,
  BOTTOM_SCRIM_GRADIENT,
  PANEL_SCRIM_GRADIENT,
  buildOverlayHtml,
  coerceBackgroundToAlphaGradient,
  parseOverlayHtml,
  stripAnnouncementBackgroundHtml,
} from "~/lib/announcement-overlay-html";
import {
  ANNOUNCEMENT_HEIGHT,
  ANNOUNCEMENT_WIDTH,
} from "~/lib/announcement-types";
import { cn } from "~/lib/utils";

export interface GrapesjsAnnouncementEditorProps {
  backgroundUrl: string | null;
  className?: string;
  html: string;
  onHtmlChange: (html: string) => void;
}

const SAVE_DEBOUNCE_MS = 400;

/** Canvas-frame CSS: wrapper stays transparent; photo is a locked component. */
const FRAME_BODY_CSS = `
  html, body, #wrapper {
    margin: 0;
    padding: 0;
    width: ${ANNOUNCEMENT_WIDTH}px;
    height: ${ANNOUNCEMENT_HEIGHT}px;
    overflow: hidden;
    background: transparent !important;
    background-color: transparent !important;
  }
  body, #wrapper {
    min-height: ${ANNOUNCEMENT_HEIGHT}px;
    position: relative !important;
  }
  * {
    box-sizing: border-box;
  }
  img[${ANNOUNCEMENT_BG_ATTR}] {
    position: absolute !important;
    inset: 0 !important;
    width: 100% !important;
    height: 100% !important;
    object-fit: cover !important;
    pointer-events: none !important;
    z-index: 0 !important;
    user-select: none !important;
  }
`;

/** Serialize GrapesJS project into a self-contained overlay fragment for export/storage. */
export const serializeOverlayHtml = (editor: Editor): string => {
  // Background is runtime-only; variation selection owns the photo URL.
  const components = stripAnnouncementBackgroundHtml(
    editor.getHtml({ cleanId: true }).trim()
  );
  const css = editor.getCss({ avoidProtected: true })?.trim() ?? "";
  return buildOverlayHtml(components, css);
};

const makeFrameTransparent = (editor: Editor): void => {
  const frameEl = editor.Canvas.getFrameEl();
  const body = editor.Canvas.getBody();
  const canvasEl = editor.Canvas.getElement();

  if (frameEl) {
    frameEl.style.background = "transparent";
  }

  if (body) {
    body.style.background = "transparent";
    const doc = body.ownerDocument;

    if (doc?.documentElement) {
      doc.documentElement.style.background = "transparent";
    }
  }

  // Empty-state chrome only — photo is inside the component tree.
  if (canvasEl) {
    canvasEl.style.backgroundImage = "none";
    canvasEl.style.backgroundColor = "#111";
  }
};

interface GrapesComponentLike {
  addAttributes: (attrs: Record<string, string>) => void;
  get: (key: string) => unknown;
  getAttributes: () => Record<string, string>;
  remove: () => void;
}

const isBackgroundComponent = (component: {
  get: (key: string) => unknown;
  getAttributes?: () => Record<string, string>;
}): boolean => {
  if (component.get("type") === ANNOUNCEMENT_BG_TYPE) {
    return true;
  }

  const attrs = component.getAttributes?.() ?? {};
  return attrs[ANNOUNCEMENT_BG_ATTR] === "1";
};

const registerBackgroundComponentType = (editor: Editor): void => {
  editor.DomComponents.addType(ANNOUNCEMENT_BG_TYPE, {
    isComponent: (el: HTMLElement) =>
      el.getAttribute?.(ANNOUNCEMENT_BG_ATTR) === "1"
        ? { type: ANNOUNCEMENT_BG_TYPE }
        : false,
    model: {
      defaults: {
        attributes: {
          [ANNOUNCEMENT_BG_ATTR]: "1",
          alt: "",
          draggable: "false",
        },
        copyable: false,
        draggable: false,
        droppable: false,
        highlightable: false,
        hoverable: false,
        layerable: true,
        locked: true,
        name: "Background photo",
        removable: false,
        resizable: false,
        selectable: false,
        style: {
          height: "100%",
          left: "0",
          "object-fit": "cover",
          "pointer-events": "none",
          position: "absolute",
          top: "0",
          width: "100%",
          "z-index": "0",
        },
        tagName: "img",
        type: ANNOUNCEMENT_BG_TYPE,
      },
    },
  });
};

/**
 * Ensure a locked full-bleed background image component matches the active
 * variation URL. Not persisted in draft HTML — re-injected whenever the
 * editor loads or the selected variation changes.
 */
export const syncBackgroundComponent = (
  editor: Editor,
  backgroundUrl: string | null
): void => {
  const wrapper = editor.getWrapper();

  if (!wrapper) {
    return;
  }

  wrapper.addStyle({
    height: `${ANNOUNCEMENT_HEIGHT}px`,
    overflow: "hidden",
    position: "relative",
    width: `${ANNOUNCEMENT_WIDTH}px`,
  });

  const existing = wrapper.find(
    `[${ANNOUNCEMENT_BG_ATTR}="1"]`
  ) as unknown as GrapesComponentLike[];

  if (!backgroundUrl) {
    for (const node of existing) {
      node.remove();
    }
    return;
  }

  const [bg] = existing;

  if (bg) {
    const currentSrc = bg.getAttributes().src ?? "";

    if (currentSrc !== backgroundUrl) {
      bg.addAttributes({ src: backgroundUrl });
    }

    // Keep a single background node; drop duplicates.
    for (const extra of existing.slice(1)) {
      extra.remove();
    }

    return;
  }

  wrapper.components().add(
    {
      attributes: {
        [ANNOUNCEMENT_BG_ATTR]: "1",
        alt: "",
        crossorigin: "anonymous",
        draggable: "false",
        src: backgroundUrl,
      },
      type: ANNOUNCEMENT_BG_TYPE,
    },
    { at: 0 }
  );
};

const registerAnnouncementBlocks = (editor: Editor): void => {
  const blockManager = editor.BlockManager;

  // Prefer announcement-specific blocks; keep a lean Basic set.
  blockManager.getAll().reset();

  blockManager.add("ann-heading", {
    category: "Announcement",
    content: {
      content: "HEADING",
      style: {
        color: "#ffffff",
        "font-family": "system-ui, sans-serif",
        "font-size": "28px",
        "letter-spacing": "0.28em",
        margin: "0 0 12px 0",
        "text-shadow": "0 2px 12px rgba(0,0,0,0.45)",
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
      content: "Announcement Title",
      style: {
        color: "#ffffff",
        "font-family": "Georgia, 'Times New Roman', serif",
        "font-size": "96px",
        "font-weight": "700",
        "line-height": "1.05",
        margin: "0 0 18px 0",
        "text-shadow": "0 4px 24px rgba(0,0,0,0.45)",
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
      content: "Subtitle text",
      style: {
        color: "#ffffff",
        "font-family": "Georgia, 'Times New Roman', serif",
        "font-size": "42px",
        "font-weight": "400",
        "line-height": "1.25",
        margin: "0 0 28px 0",
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
      content: "Additional details go here.",
      style: {
        color: "#ffffff",
        "font-family": "system-ui, sans-serif",
        "font-size": "28px",
        "line-height": "1.4",
        margin: "0",
        "max-width": "1200px",
        opacity: "0.88",
      },
      type: "text",
    },
    label: "Body text",
    media: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M4 5h16v2H4V5zm0 4h16v2H4V9zm0 4h16v2H4v-2zm0 4h10v2H4v-2z"/></svg>`,
  });

  blockManager.add("ann-text-box", {
    category: "Announcement",
    content: {
      components: [
        {
          content: "Editable text block",
          style: {
            color: "#ffffff",
            "font-size": "32px",
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
        padding: "24px 32px",
        width: "640px",
      },
      tagName: "div",
    },
    label: "Text box",
    media: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M3 5h18v14H3V5zm2 2v10h14V7H5zm2 2h10v2H7V9zm0 4h7v2H7v-2z"/></svg>`,
  });

  blockManager.add("ann-scrim", {
    category: "Announcement",
    content: {
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
    media: `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M3 3h18v18H3V3zm2 2v8.5c2 3 5 5.5 7 5.5s5-2.5 7-5.5V5H5z"/></svg>`,
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
        "font-size": "32px",
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
      content: "Link text",
      style: {
        color: "#fbbf24",
        "font-size": "28px",
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
 * The selected background variation is a locked full-bleed GrapesJS component
 * (`announcement-bg`) that updates when `backgroundUrl` changes. It is stripped
 * from serialized draft HTML so R2 variations remain the source of truth.
 * Overlay blocks use native GrapesJS panels (blocks, styles, layers, traits).
 */
export const GrapesjsAnnouncementEditor = ({
  backgroundUrl,
  className,
  html,
  onHtmlChange,
}: GrapesjsAnnouncementEditorProps) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const onHtmlChangeRef = useRef(onHtmlChange);
  const backgroundUrlRef = useRef(backgroundUrl);
  const syncedHtmlRef = useRef(html);
  const suppressEmitRef = useRef(false);
  const coercingBackgroundRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  onHtmlChangeRef.current = onHtmlChange;
  backgroundUrlRef.current = backgroundUrl;

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
          },
        ],
      },
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

    registerBackgroundComponentType(editor);
    registerAnnouncementBlocks(editor);

    const flushSave = (): void => {
      if (suppressEmitRef.current) {
        return;
      }

      const next = serializeOverlayHtml(editor);

      if (next === syncedHtmlRef.current) {
        return;
      }

      syncedHtmlRef.current = next;
      onHtmlChangeRef.current(next);
    };

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
     * Keep component paints as alpha gradients so solid fills never bury the
     * independently swappable background image layer.
     */
    const coerceSelectedBackgrounds = (): void => {
      if (suppressEmitRef.current || coercingBackgroundRef.current) {
        return;
      }

      const selected = editor.getSelectedAll();
      let changed = false;
      coercingBackgroundRef.current = true;

      try {
        for (const component of selected) {
          if (
            isBackgroundComponent(
              component as unknown as {
                get: (key: string) => unknown;
                getAttributes?: () => Record<string, string>;
              }
            )
          ) {
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

    // Ignore updates that only touch the locked background (src swaps).
    const scheduleSaveUnlessBackgroundOnly = (component?: {
      get: (key: string) => unknown;
      getAttributes?: () => Record<string, string>;
    }): void => {
      if (
        component &&
        isBackgroundComponent(component) &&
        !suppressEmitRef.current
      ) {
        return;
      }

      scheduleSave();
    };

    editor.on("update", scheduleSave);
    editor.on("component:update", scheduleSaveUnlessBackgroundOnly);
    editor.on("style:change", () => {
      coerceSelectedBackgrounds();
      scheduleSave();
    });
    editor.on("component:add", scheduleSaveUnlessBackgroundOnly);
    editor.on(
      "component:remove",
      (component: {
        get: (key: string) => unknown;
        getAttributes?: () => Record<string, string>;
      }) => {
        // Re-inject if something forced the locked bg out while a URL is active.
        if (
          isBackgroundComponent(component) &&
          backgroundUrlRef.current &&
          !suppressEmitRef.current
        ) {
          requestAnimationFrame(() => {
            if (editorRef.current !== editor) {
              return;
            }

            suppressEmitRef.current = true;
            syncBackgroundComponent(editor, backgroundUrlRef.current);
            requestAnimationFrame(() => {
              suppressEmitRef.current = false;
            });
          });
          return;
        }

        scheduleSaveUnlessBackgroundOnly(component);
      }
    );
    editor.on("component:drag:end", scheduleSave);

    editor.on("canvas:frame:load", () => {
      makeFrameTransparent(editor);
      suppressEmitRef.current = true;
      syncBackgroundComponent(editor, backgroundUrlRef.current);
      requestAnimationFrame(() => {
        suppressEmitRef.current = false;
      });
    });

    suppressEmitRef.current = true;
    loadHtmlIntoEditor(editor, syncedHtmlRef.current);
    syncBackgroundComponent(editor, backgroundUrlRef.current);
    editor.UndoManager.clear();
    suppressEmitRef.current = false;

    makeFrameTransparent(editor);

    editorRef.current = editor;

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }

      try {
        flushSave();
      } catch {
        // Editor may already be partially torn down.
      }

      editor.destroy();
      editorRef.current = null;
    };
  }, []);

  // External HTML (AI generation, undo snapshots, code editor) → reload canvas.
  useEffect(() => {
    const editor = editorRef.current;

    if (!editor) {
      syncedHtmlRef.current = html;
      return;
    }

    if (html === syncedHtmlRef.current) {
      return;
    }

    syncedHtmlRef.current = html;
    suppressEmitRef.current = true;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    loadHtmlIntoEditor(editor, html);
    syncBackgroundComponent(editor, backgroundUrlRef.current);
    editor.UndoManager.clear();
    makeFrameTransparent(editor);

    requestAnimationFrame(() => {
      suppressEmitRef.current = false;
    });
  }, [html]);

  // Swappable background — locked GrapesJS component, dynamic with variation.
  useEffect(() => {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    suppressEmitRef.current = true;
    syncBackgroundComponent(editor, backgroundUrl);
    makeFrameTransparent(editor);
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
