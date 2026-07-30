import { html } from "@codemirror/lang-html";
import { EditorView } from "@codemirror/view";
import { githubDark, githubLight } from "@uiw/codemirror-theme-github";
import CodeMirror from "@uiw/react-codemirror";
import { useEffect, useMemo, useState } from "react";

import { cn } from "~/lib/utils";

interface HtmlCodeEditorProps {
  className?: string;
  id?: string;
  minHeight?: string;
  onChange: (value: string) => void;
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

const extensions = [htmlLanguage, editorChrome, EditorView.lineWrapping];

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

export const HtmlCodeEditor = ({
  className,
  id,
  minHeight = "18rem",
  onChange,
  value,
}: HtmlCodeEditorProps) => {
  const scheme = useColorScheme();
  const theme = useMemo(
    () => (scheme === "dark" ? githubDark : githubLight),
    [scheme]
  );

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-transparent bg-input/50 transition-[color,box-shadow] duration-200 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30",
        className
      )}
      data-slot="html-code-editor"
      id={id}
    >
      <CodeMirror
        basicSetup={{
          autocompletion: true,
          bracketMatching: true,
          closeBrackets: true,
          foldGutter: true,
          highlightActiveLine: true,
          highlightActiveLineGutter: true,
          indentOnInput: true,
          lineNumbers: true,
        }}
        extensions={extensions}
        height={minHeight}
        onChange={onChange}
        theme={theme}
        value={value}
      />
    </div>
  );
};
