import { html } from "@codemirror/lang-html";
import { json } from "@codemirror/lang-json";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { githubDark, githubLight } from "@uiw/codemirror-theme-github";
import CodeMirror from "@uiw/react-codemirror";
import { useEffect, useMemo, useState } from "react";

import { cn } from "~/lib/utils";

export type CodeEditorLanguage = "html" | "json";

interface HtmlCodeEditorProps {
  className?: string;
  id?: string;
  /** Syntax highlighting mode. @default "html" */
  language?: CodeEditorLanguage;
  minHeight?: string;
  onChange?: (value: string) => void;
  /** When true, the document cannot be edited. @default false */
  readOnly?: boolean;
  value: string;
}

const editorChrome = EditorView.theme({
  "&": {
    fontSize: "0.75rem",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-content": {
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    padding: "0.5rem 0",
  },
  ".cm-scroller": {
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    lineHeight: "1.5",
  },
});

const htmlLanguage = html();
const jsonLanguage = json();

const isDocumentDark = () => {
  if (typeof document === "undefined") {
    return true;
  }

  return document.documentElement.classList.contains("dark");
};

/** Tracks the app's class-based light/dark theme (`html.dark`). */
const useColorScheme = (): "dark" | "light" => {
  const [scheme, setScheme] = useState<"dark" | "light">(() =>
    isDocumentDark() ? "dark" : "light"
  );

  useEffect(() => {
    const root = document.documentElement;

    const sync = () => {
      setScheme(root.classList.contains("dark") ? "dark" : "light");
    };

    sync();

    const observer = new MutationObserver(sync);
    observer.observe(root, { attributeFilter: ["class"], attributes: true });

    return () => {
      observer.disconnect();
    };
  }, []);

  return scheme;
};

/**
 * CodeMirror editor for announcement advanced views (project JSON or HTML).
 * Supports read-only mode for export HTML previews.
 */
export const HtmlCodeEditor = ({
  className,
  id,
  language = "html",
  minHeight = "18rem",
  onChange,
  readOnly = false,
  value,
}: HtmlCodeEditorProps) => {
  const scheme = useColorScheme();
  const theme = useMemo(
    () => (scheme === "dark" ? githubDark : githubLight),
    [scheme]
  );

  const extensions = useMemo(() => {
    const languageExtension = language === "json" ? jsonLanguage : htmlLanguage;
    const next = [languageExtension, editorChrome, EditorView.lineWrapping];

    if (readOnly) {
      next.push(EditorState.readOnly.of(true));
      next.push(EditorView.editable.of(false));
    }

    return next;
  }, [language, readOnly]);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-transparent bg-input/50 transition-[color,box-shadow] duration-200 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30",
        readOnly && "opacity-90",
        className
      )}
      data-slot="html-code-editor"
      id={id}
      style={{ minHeight }}
    >
      <CodeMirror
        basicSetup={{
          autocompletion: !readOnly,
          bracketMatching: true,
          closeBrackets: !readOnly,
          foldGutter: true,
          highlightActiveLine: !readOnly,
          highlightActiveLineGutter: !readOnly,
          indentOnInput: !readOnly,
          lineNumbers: true,
        }}
        editable={!readOnly}
        extensions={extensions}
        height={minHeight}
        minHeight={minHeight}
        onChange={readOnly ? undefined : onChange}
        readOnly={readOnly}
        theme={theme}
        value={value}
      />
    </div>
  );
};
