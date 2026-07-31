import { useCallback, useRef, useState } from "react";

import { projectDataKey } from "~/lib/announcement-overlay-html";
import type {
  AnnouncementDocument,
  GrapesProjectData,
} from "~/lib/announcement-types";

/** Max past snapshots retained for undo (present is separate). */
export const HTML_HISTORY_MAX_SNAPSHOTS = 10;

/** @deprecated Use DOCUMENT_HISTORY_MAX_SNAPSHOTS — alias kept for call sites. */
export const DOCUMENT_HISTORY_MAX_SNAPSHOTS = HTML_HISTORY_MAX_SNAPSHOTS;

interface HistoryState {
  future: AnnouncementDocument[];
  past: AnnouncementDocument[];
  present: AnnouncementDocument;
}

export interface HtmlHistoryApi {
  canRedo: boolean;
  canUndo: boolean;
  /** Commit a new present state (records a snapshot for undo). */
  commit: (next: AnnouncementDocument | string) => void;
  /** Present document (GrapesJS project JSON + derived HTML). */
  document: AnnouncementDocument;
  /** Derived overlay HTML (export / code view). */
  html: string;
  /** GrapesJS project JSON, or null for HTML-only legacy snapshots. */
  projectData: GrapesProjectData | null;
  /** Apply redo; returns the restored document, or null if none. */
  redo: () => AnnouncementDocument | null;
  /** Replace present without recording history (load / external server draft). */
  reset: (next: AnnouncementDocument | string) => void;
  /**
   * Set present without a snapshot (code-editor keystrokes).
   * Passing a string updates HTML and clears projectData (HTML path).
   */
  setDocument: (next: AnnouncementDocument | string) => void;
  /** @deprecated Prefer setDocument — string form clears projectData. */
  setHtml: (nextHtml: string) => void;
  /** Apply undo; returns the restored document, or null if none. */
  undo: () => AnnouncementDocument | null;
}

const toDocument = (
  value: AnnouncementDocument | string
): AnnouncementDocument => {
  if (typeof value === "string") {
    return { html: value, projectData: null };
  }

  return {
    html: value.html,
    projectData: value.projectData ?? null,
  };
};

const sameDocument = (
  a: AnnouncementDocument,
  b: AnnouncementDocument
): boolean =>
  a.html === b.html &&
  projectDataKey(a.projectData) === projectDataKey(b.projectData);

/**
 * Bounded undo/redo stack for announcement canvas documents.
 * Stores GrapesJS project JSON (canonical) plus derived HTML for export/code view.
 * Keeps up to {@link HTML_HISTORY_MAX_SNAPSHOTS} past entries plus present.
 */
export const useHtmlHistory = (
  initial: AnnouncementDocument | string
): HtmlHistoryApi => {
  const [state, setState] = useState<HistoryState>(() => ({
    future: [],
    past: [],
    present: toDocument(initial),
  }));
  const stateRef = useRef(state);
  stateRef.current = state;

  const reset = useCallback((nextValue: AnnouncementDocument | string) => {
    const next: HistoryState = {
      future: [],
      past: [],
      present: toDocument(nextValue),
    };
    stateRef.current = next;
    setState(next);
  }, []);

  const setDocument = useCallback(
    (nextValue: AnnouncementDocument | string) => {
      setState((previous) => {
        const present = toDocument(nextValue);

        if (sameDocument(previous.present, present)) {
          return previous;
        }

        const next: HistoryState = {
          ...previous,
          present,
        };
        stateRef.current = next;
        return next;
      });
    },
    []
  );

  const setHtml = useCallback(
    (nextHtml: string) => {
      setDocument(nextHtml);
    },
    [setDocument]
  );

  const commit = useCallback((nextValue: AnnouncementDocument | string) => {
    setState((previous) => {
      const present = toDocument(nextValue);

      if (sameDocument(previous.present, present)) {
        return previous;
      }

      const next: HistoryState = {
        future: [],
        past: [...previous.past, previous.present].slice(
          -HTML_HISTORY_MAX_SNAPSHOTS
        ),
        present,
      };
      stateRef.current = next;
      return next;
    });
  }, []);

  const undo = useCallback((): AnnouncementDocument | null => {
    const previous = stateRef.current;

    if (previous.past.length === 0) {
      return null;
    }

    const target = previous.past.at(-1);

    if (target === undefined) {
      return null;
    }

    const next: HistoryState = {
      future: [previous.present, ...previous.future].slice(
        0,
        HTML_HISTORY_MAX_SNAPSHOTS
      ),
      past: previous.past.slice(0, -1),
      present: target,
    };
    stateRef.current = next;
    setState(next);
    return target;
  }, []);

  const redo = useCallback((): AnnouncementDocument | null => {
    const previous = stateRef.current;

    if (previous.future.length === 0) {
      return null;
    }

    const [target, ...restFuture] = previous.future;

    if (target === undefined) {
      return null;
    }

    const next: HistoryState = {
      future: restFuture,
      past: [...previous.past, previous.present].slice(
        -HTML_HISTORY_MAX_SNAPSHOTS
      ),
      present: target,
    };
    stateRef.current = next;
    setState(next);
    return target;
  }, []);

  return {
    canRedo: state.future.length > 0,
    canUndo: state.past.length > 0,
    commit,
    document: state.present,
    html: state.present.html,
    projectData: state.present.projectData,
    redo,
    reset,
    setDocument,
    setHtml,
    undo,
  };
};
