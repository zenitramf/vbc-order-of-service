import { useCallback, useRef, useState } from "react";

import { projectDataKey } from "~/lib/announcement-overlay-html";
import type { GrapesProjectData } from "~/lib/announcement-types";

/** Max past snapshots retained for undo (present is separate). */
export const HTML_HISTORY_MAX_SNAPSHOTS = 10;

/** @deprecated Alias kept for call sites — history is project JSON only. */
export const DOCUMENT_HISTORY_MAX_SNAPSHOTS = HTML_HISTORY_MAX_SNAPSHOTS;

interface HistoryState {
  future: (GrapesProjectData | null)[];
  past: (GrapesProjectData | null)[];
  present: GrapesProjectData | null;
}

export interface HtmlHistoryApi {
  canRedo: boolean;
  canUndo: boolean;
  /** Commit a new present project (records a snapshot for undo). */
  commit: (next: GrapesProjectData | null) => void;
  /** GrapesJS project JSON (canonical canvas state). */
  projectData: GrapesProjectData | null;
  /** Apply redo; returns the restored project, or null if none. */
  redo: () => GrapesProjectData | null;
  /** Replace present without recording history (load / external server draft). */
  reset: (next: GrapesProjectData | null) => void;
  /** Set present without a snapshot. */
  setProjectData: (next: GrapesProjectData | null) => void;
  /** Apply undo; returns the restored project, or null if none. */
  undo: () => GrapesProjectData | null;
}

const sameProject = (
  a: GrapesProjectData | null,
  b: GrapesProjectData | null
): boolean => projectDataKey(a) === projectDataKey(b);

/**
 * Bounded undo/redo stack for announcement GrapesJS project JSON.
 * Keeps up to {@link HTML_HISTORY_MAX_SNAPSHOTS} past entries plus present.
 * HTML is never stored — export HTML is ephemeral on the editor page.
 */
export const useHtmlHistory = (
  initial: GrapesProjectData | null
): HtmlHistoryApi => {
  const [state, setState] = useState<HistoryState>(() => ({
    future: [],
    past: [],
    present: initial,
  }));
  const stateRef = useRef(state);
  stateRef.current = state;

  const reset = useCallback((next: GrapesProjectData | null) => {
    const nextState: HistoryState = {
      future: [],
      past: [],
      present: next,
    };
    stateRef.current = nextState;
    setState(nextState);
  }, []);

  const setProjectData = useCallback((next: GrapesProjectData | null) => {
    setState((previous) => {
      if (sameProject(previous.present, next)) {
        return previous;
      }

      const nextState: HistoryState = {
        ...previous,
        present: next,
      };
      stateRef.current = nextState;
      return nextState;
    });
  }, []);

  const commit = useCallback((next: GrapesProjectData | null) => {
    setState((previous) => {
      if (sameProject(previous.present, next)) {
        return previous;
      }

      const nextState: HistoryState = {
        future: [],
        past: [...previous.past, previous.present].slice(
          -HTML_HISTORY_MAX_SNAPSHOTS
        ),
        present: next,
      };
      stateRef.current = nextState;
      return nextState;
    });
  }, []);

  const undo = useCallback((): GrapesProjectData | null => {
    const previous = stateRef.current;

    if (previous.past.length === 0) {
      return null;
    }

    const target = previous.past.at(-1);

    if (target === undefined) {
      return null;
    }

    const nextState: HistoryState = {
      future: [previous.present, ...previous.future].slice(
        0,
        HTML_HISTORY_MAX_SNAPSHOTS
      ),
      past: previous.past.slice(0, -1),
      present: target,
    };
    stateRef.current = nextState;
    setState(nextState);
    return target;
  }, []);

  const redo = useCallback((): GrapesProjectData | null => {
    const previous = stateRef.current;

    if (previous.future.length === 0) {
      return null;
    }

    const [target, ...restFuture] = previous.future;

    if (target === undefined) {
      return null;
    }

    const nextState: HistoryState = {
      future: restFuture,
      past: [...previous.past, previous.present].slice(
        -HTML_HISTORY_MAX_SNAPSHOTS
      ),
      present: target,
    };
    stateRef.current = nextState;
    setState(nextState);
    return target;
  }, []);

  return {
    canRedo: state.future.length > 0,
    canUndo: state.past.length > 0,
    commit,
    projectData: state.present,
    redo,
    reset,
    setProjectData,
    undo,
  };
};
