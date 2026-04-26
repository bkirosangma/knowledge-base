import React from "react";
import { Columns2 } from "lucide-react";
import { useCommandRegistry } from "../context/CommandRegistry";

interface HeaderProps {
  /** Whether split mode is on. */
  isSplit?: boolean;
  /** Toggle split mode. */
  onToggleSplit?: () => void;
  /**
   * Paths of every file with unsaved edits across panes. Drives the
   * "N unsaved" dirty-stack indicator left of the ⌘K chip. Empty / undefined
   * → indicator hidden. Phase 2 PR 2 (SHELL-1.12) reclaims header real-estate
   * after PaneTitle was folded into the breadcrumb row.
   */
  dirtyFiles?: ReadonlySet<string> | string[];
}

/**
 * Top-level app header. Title editing, dirty dot, Save, and Discard live in
 * each pane's `PaneHeader` (folded from the old `PaneTitle` row in SHELL-1.12).
 * This bar now hosts cross-pane chrome only: the global dirty-stack indicator,
 * the ⌘K command-palette trigger, and the Split toggle.
 */
export default function Header({
  isSplit = false,
  onToggleSplit,
  dirtyFiles,
}: HeaderProps) {
  const { setOpen } = useCommandRegistry();

  const dirtyList = React.useMemo<string[]>(() => {
    if (!dirtyFiles) return [];
    return Array.isArray(dirtyFiles) ? [...dirtyFiles] : Array.from(dirtyFiles);
  }, [dirtyFiles]);
  const dirtyCount = dirtyList.length;

  return (
    <div className="flex-shrink-0 grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-2 bg-white border-b border-slate-200 z-20">
      {/* Left column — dirty-stack indicator (right-aligned next to chip) */}
      <div className="flex items-center justify-end">
        {dirtyCount > 0 && (
          <span
            data-testid="dirty-stack-indicator"
            title={`Unsaved changes:\n${dirtyList.join("\n")}`}
            aria-label={`${dirtyCount} unsaved file${dirtyCount === 1 ? "" : "s"}`}
            className="bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5 text-xs font-medium leading-none"
          >
            {dirtyCount} unsaved
          </span>
        )}
      </div>

      {/* Centre column — ⌘K trigger chip */}
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

      {/* Right column — Split toggle */}
      <div className="flex items-center justify-start">
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
    </div>
  );
}
