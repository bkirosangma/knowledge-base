"use client";
import type { ReactElement } from "react";

interface HistoryButtonsProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

export function HistoryButtons({ canUndo, canRedo, onUndo, onRedo }: HistoryButtonsProps): ReactElement {
  return (
    <div className="flex items-center gap-1" role="group" aria-label="History">
      <button
        type="button"
        aria-label="undo (⌘Z)"
        disabled={!canUndo}
        onClick={onUndo}
        title="Undo — ⌘Z"
        className="rounded border border-line px-2 py-0.5 text-sm hover:bg-line/20 disabled:opacity-40"
      >
        ↶
      </button>
      <button
        type="button"
        aria-label="redo (⌘⇧Z)"
        disabled={!canRedo}
        onClick={onRedo}
        title="Redo — ⌘⇧Z"
        className="rounded border border-line px-2 py-0.5 text-sm hover:bg-line/20 disabled:opacity-40"
      >
        ↷
      </button>
    </div>
  );
}
