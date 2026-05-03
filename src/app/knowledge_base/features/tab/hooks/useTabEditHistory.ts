// src/app/knowledge_base/features/tab/hooks/useTabEditHistory.ts
import { useCallback, useState } from "react";
import type { TabEditOp } from "../../../domain/tabEngine";
import { inverseOf, type PreState } from "../editHistory/inverseOf";

const MAX_DEPTH = 200;

interface HistoryFrame {
  op: TabEditOp;
  inverse: TabEditOp;
  ts: number;
}

export interface UseTabEditHistoryDeps {
  /** Dispatch an op to the tab engine (apply it). */
  dispatch: (op: TabEditOp) => void;
  /**
   * Called before dispatch to snapshot whatever pre-state the op needs for
   * its inverse. The caller (TabEditor) reads this from the live engine state.
   */
  captureState: (op: TabEditOp) => PreState;
}

export interface UseTabEditHistoryResult {
  apply: (op: TabEditOp) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

/**
 * Per-op undo/redo with inverse-op storage.
 *
 * Keeps two stacks — `past` and `future` — capped at MAX_DEPTH (200) each via
 * FIFO eviction on the past stack. apply() clears the future stack so that a
 * new edit after undo-ing drops the redo history (standard linear undo model).
 */
export function useTabEditHistory(deps: UseTabEditHistoryDeps): UseTabEditHistoryResult {
  const [past, setPast] = useState<HistoryFrame[]>([]);
  const [future, setFuture] = useState<HistoryFrame[]>([]);

  const apply = useCallback(
    (op: TabEditOp) => {
      const preState = deps.captureState(op);
      const inverse = inverseOf(op, preState);
      deps.dispatch(op);
      setPast((p) => {
        const next = [...p, { op, inverse, ts: Date.now() }];
        return next.length > MAX_DEPTH ? next.slice(next.length - MAX_DEPTH) : next;
      });
      setFuture([]);
    },
    [deps],
  );

  const undo = useCallback(() => {
    setPast((p) => {
      if (!p.length) return p;
      const frame = p[p.length - 1];
      deps.dispatch(frame.inverse);
      setFuture((f) => [...f, frame]);
      return p.slice(0, -1);
    });
  }, [deps]);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (!f.length) return f;
      const frame = f[f.length - 1];
      deps.dispatch(frame.op);
      setPast((p) => {
        const next = [...p, frame];
        return next.length > MAX_DEPTH ? next.slice(next.length - MAX_DEPTH) : next;
      });
      return f.slice(0, -1);
    });
  }, [deps]);

  return {
    apply,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
  };
}
