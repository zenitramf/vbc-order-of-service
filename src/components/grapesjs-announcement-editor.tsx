import { grapesjs } from "grapesjs";
import type { Editor } from "grapesjs";

import "grapesjs/dist/css/grapes.min.css";
import { useEffect, useRef } from "react";

import {
  buildOverlayHtml,
  parseOverlayHtml,
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

/** Canvas-frame CSS: transparent so the host background layer shows through. */
const FRAME_BODY_CSS = `
  html, body {
    margin: 0;
    padding: 0;
    width: ${ANNOUNCEMENT_WIDTH}px;
    height: ${ANNOUNCEMENT_HEIGHT}px;
    overflow: hidden;
    background: transparent !important;
  }
  body {
    min-height: ${ANNOUNCEMENT_HEIGHT}px;
  }
  * {
    box-sizing: border-box;
  }
`;

/** Serialize GrapesJS project into a self-contained overlay fragment for export/storage. */
export const serializeOverlayHtml = (editor: Editor): string => {
  const components = editor.getHtml({ cleanId: true }).trim();
  const css = editor.getCss({ avoidProtected: true })?.trim() ?? "";
  return buildOverlayHtml(components, css);
};

const applyBackgroundToCanvas = (
  editor: Editor,
  backgroundUrl: string | null
): void => {
  const canvasEl = editor.Canvas.getElement();

  if (!canvasEl) {
    return;
  }

  if (backgroundUrl) {
    canvasEl.style.backgroundImage = `url("${backgroundUrl}")`;
    canvasEl.style.backgroundSize = "cover";
    canvasEl.style.backgroundPosition = "center";
    canvasEl.style.backgroundRepeat = "no-repeat";
    canvasEl.style.backgroundColor = "#000";
  } else {
    canvasEl.style.backgroundImage = "none";
    canvasEl.style.backgroundColor = "#111";
  }
};

const makeFrameTransparent = (editor: Editor): void => {
  const frameEl = editor.Canvas.getFrameEl();
  const body = editor.Canvas.getBody();

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
        "background-color": "rgba(0,0,0,0.35)",
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
        background:
          "linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.25) 45%, transparent 75%)",
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

/**
 * GrapesJS-powered announcement overlay editor.
 *
 * Background images are applied only to the host canvas chrome (not GrapesJS
 * components), so backgrounds stay independently swappable. Component layout
 * uses native GrapesJS blocks, style manager, layers, and traits.
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
              "background-color",
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

    editor.on("update", scheduleSave);
    editor.on("component:update", scheduleSave);
    editor.on("style:change", scheduleSave);
    editor.on("component:add", scheduleSave);
    editor.on("component:remove", scheduleSave);
    editor.on("component:drag:end", scheduleSave);

    editor.on("canvas:frame:load", () => {
      makeFrameTransparent(editor);
      applyBackgroundToCanvas(editor, backgroundUrlRef.current);
    });

    suppressEmitRef.current = true;
    loadHtmlIntoEditor(editor, syncedHtmlRef.current);
    editor.UndoManager.clear();
    suppressEmitRef.current = false;

    applyBackgroundToCanvas(editor, backgroundUrlRef.current);
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
    editor.UndoManager.clear();
    makeFrameTransparent(editor);
    applyBackgroundToCanvas(editor, backgroundUrlRef.current);

    requestAnimationFrame(() => {
      suppressEmitRef.current = false;
    });
  }, [html]);

  // Swappable background — host canvas chrome only, never a GrapesJS component.
  useEffect(() => {
    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    applyBackgroundToCanvas(editor, backgroundUrl);
    makeFrameTransparent(editor);
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
