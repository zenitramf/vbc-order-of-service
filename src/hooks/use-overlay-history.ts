import { useCallback, useRef, useState } from "react";

/** Max past snapshots retained for undo (present is separate). */
export const OVERLAY_HISTORY_MAX_SNAPSHOTS = 20;

interface HistoryState {
  future: (string | null)[];
  past: (string | null)[];
  present: string | null;
}

export interface OverlayHistoryApi {
  canRedo: boolean;
  canUndo: boolean;
  /** Commit a new present overlay (records a snapshot for undo). */
  commit: (next: string | null) => void;
  /** Current overlay HTML (canonical canvas state). */
  overlayHtml: string | null;
  /** Apply redo; returns the restored overlay, or null if none. */
  redo: () => string | null;
  /** Replace present without recording history (load / external server draft). */
  reset: (next: string | null) => void;
  /** Set present without a snapshot. */
  setOverlayHtml: (next: string | null) => void;
  /** Apply undo; returns the restored overlay, or null if none. */
  undo: () => string | null;
}

const sameOverlay = (a: string | null, b: string | null): boolean =>
  (a ?? "") === (b ?? "");

/**
 * Bounded undo/redo stack for the announcement overlay HTML.
 * Keeps up to {@link OVERLAY_HISTORY_MAX_SNAPSHOTS} past entries plus present.
 */
export const useOverlayHistory = (
  initial: string | null
): OverlayHistoryApi => {
  const [state, setState] = useState<HistoryState>(() => ({
    future: [],
    past: [],
    present: initial,
  }));
  const stateRef = useRef(state);
  stateRef.current = state;

  const reset = useCallback((next: string | null) => {
    const nextState: HistoryState = { future: [], past: [], present: next };
    stateRef.current = nextState;
    setState(nextState);
  }, []);

  const setOverlayHtml = useCallback((next: string | null) => {
    setState((previous) => {
      if (sameOverlay(previous.present, next)) {
        return previous;
      }

      const nextState: HistoryState = { ...previous, present: next };
      stateRef.current = nextState;
      return nextState;
    });
  }, []);

  const commit = useCallback((next: string | null) => {
    setState((previous) => {
      if (sameOverlay(previous.present, next)) {
        return previous;
      }

      const nextState: HistoryState = {
        future: [],
        past: [...previous.past, previous.present].slice(
          -OVERLAY_HISTORY_MAX_SNAPSHOTS
        ),
        present: next,
      };
      stateRef.current = nextState;
      return nextState;
    });
  }, []);

  const undo = useCallback((): string | null => {
    const previous = stateRef.current;

    if (previous.past.length === 0) {
      return null;
    }

    const target = previous.past.at(-1) ?? null;
    const nextState: HistoryState = {
      future: [previous.present, ...previous.future].slice(
        0,
        OVERLAY_HISTORY_MAX_SNAPSHOTS
      ),
      past: previous.past.slice(0, -1),
      present: target,
    };
    stateRef.current = nextState;
    setState(nextState);
    return target;
  }, []);

  const redo = useCallback((): string | null => {
    const previous = stateRef.current;

    if (previous.future.length === 0) {
      return null;
    }

    const [target, ...restFuture] = previous.future;
    const nextState: HistoryState = {
      future: restFuture,
      past: [...previous.past, previous.present].slice(
        -OVERLAY_HISTORY_MAX_SNAPSHOTS
      ),
      present: target ?? null,
    };
    stateRef.current = nextState;
    setState(nextState);
    return target ?? null;
  }, []);

  return {
    canRedo: state.future.length > 0,
    canUndo: state.past.length > 0,
    commit,
    overlayHtml: state.present,
    redo,
    reset,
    setOverlayHtml,
    undo,
  };
};
