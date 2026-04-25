import React from "react";
import { Columns2 } from "lucide-react";
import { useCommandRegistry } from "../context/CommandRegistry";

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
  const { setOpen } = useCommandRegistry();

  return (
    <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2 bg-white border-b border-slate-200 z-20">
      {/* ⌘K trigger chip — centered in the flex gap */}
      <div className="flex-1 flex items-center justify-center">
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-3 px-3 py-1 w-[220px] rounded-lg border border-slate-200 bg-slate-50 text-slate-400 hover:bg-white hover:border-slate-300 hover:text-slate-500 transition-all text-xs"
          title="Open command palette (⌘K)"
          aria-label="Search commands"
          data-testid="command-palette-trigger"
        >
          <span className="flex-1 text-left">Search commands…</span>
          <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-slate-200 bg-white text-slate-400 leading-none">
            ⌘K
          </kbd>
        </button>
      </div>

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
