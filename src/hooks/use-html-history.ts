import { useCallback, useRef, useState } from "react";

/** Max past snapshots retained for undo (present is separate). */
export const HTML_HISTORY_MAX_SNAPSHOTS = 10;

interface HistoryState {
  future: string[];
  past: string[];
  present: string;
}

export interface HtmlHistoryApi {
  canRedo: boolean;
  canUndo: boolean;
  /** Commit a new present state (records a snapshot for undo). */
  commit: (nextHtml: string) => void;
  html: string;
  /** Apply redo; returns the restored HTML, or null if none. */
  redo: () => string | null;
  /** Replace present without recording history (load / external server draft). */
  reset: (nextHtml: string) => void;
  /** Set present without a snapshot (code editor keystrokes). */
  setHtml: (nextHtml: string) => void;
  /** Apply undo; returns the restored HTML, or null if none. */
  undo: () => string | null;
}

/**
 * Bounded undo/redo stack for announcement HTML overlays.
 * Keeps up to {@link HTML_HISTORY_MAX_SNAPSHOTS} past entries plus present.
 */
export const useHtmlHistory = (initialHtml: string): HtmlHistoryApi => {
  const [state, setState] = useState<HistoryState>({
    future: [],
    past: [],
    present: initialHtml,
  });
  const stateRef = useRef(state);
  stateRef.current = state;

  const reset = useCallback((nextHtml: string) => {
    const next: HistoryState = {
      future: [],
      past: [],
      present: nextHtml,
    };
    stateRef.current = next;
    setState(next);
  }, []);

  const setHtml = useCallback((nextHtml: string) => {
    setState((previous) => {
      if (previous.present === nextHtml) {
        return previous;
      }

      const next: HistoryState = {
        ...previous,
        present: nextHtml,
      };
      stateRef.current = next;
      return next;
    });
  }, []);

  const commit = useCallback((nextHtml: string) => {
    setState((previous) => {
      if (previous.present === nextHtml) {
        return previous;
      }

      const next: HistoryState = {
        future: [],
        past: [...previous.past, previous.present].slice(
          -HTML_HISTORY_MAX_SNAPSHOTS
        ),
        present: nextHtml,
      };
      stateRef.current = next;
      return next;
    });
  }, []);

  const undo = useCallback((): string | null => {
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

  const redo = useCallback((): string | null => {
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
    html: state.present,
    redo,
    reset,
    setHtml,
    undo,
  };
};
