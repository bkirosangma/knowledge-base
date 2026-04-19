import React from "react";
import { Columns2 } from "lucide-react";

interface HeaderProps {
  /** Whether split mode is on. */
  isSplit?: boolean;
  /** Toggle split mode. */
  onToggleSplit?: () => void;
}

/**
 * Top-level app header. Title editing, dirty indicator, Save, and Discard all
 * moved into each pane's `PaneTitle` row (per pane: diagram shows the editable
 * diagram title; document shows the debounced H1) — this bar now only hosts
 * cross-pane chrome. Split is the sole survivor.
 */
export default function Header({
  isSplit = false,
  onToggleSplit,
}: HeaderProps) {
  return (
    <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2 bg-white border-b border-slate-200 z-20">
      <div className="flex-1" />

      {onToggleSplit && (
        <button
          onClick={onToggleSplit}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all border ${
            isSplit ? "bg-white shadow-sm text-blue-600 border-slate-200" : "bg-slate-50 text-slate-500 hover:text-slate-700 border-slate-100"
          }`}
          title={isSplit ? "Exit split view" : "Split view"}
        >
          <Columns2 size={13} />
          <span className="hidden xl:inline">Split</span>
        </button>
      )}
    </div>
  );
}
