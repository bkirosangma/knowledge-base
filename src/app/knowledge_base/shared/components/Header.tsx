import React from "react";
import { Columns2, Moon, Sun } from "lucide-react";
import { useCommandRegistry } from "../context/CommandRegistry";
import type { Theme } from "../hooks/useTheme";
import { Tooltip } from "./Tooltip";

interface HeaderProps {
  /** Whether split mode is on. */
  isSplit?: boolean;
  /** Toggle split mode. */
  onToggleSplit?: () => void;
  /**
   * Paths of every file with unsaved edits across panes. Drives the
   * "N unsaved" dirty-stack indicator left of the ⌘K chip. Empty / undefined
   * → indicator hidden. Reclaimed header real-estate after PaneTitle was
   * folded into the breadcrumb row.
   */
  dirtyFiles?: ReadonlySet<string> | string[];
  /**
   * Current theme — drives the sun/moon icon and `aria-pressed`.
   */
  theme?: Theme;
  /**
   * Click handler for the sun/moon button. Hidden when undefined (e.g.
   * unit tests rendering Header without theme wiring).
   */
  onToggleTheme?: () => void;
}

/**
 * Top-level app header. Title editing, dirty dot, Save, and Discard live in
 * each pane's `PaneHeader` (folded from the old `PaneTitle` row in SHELL-1.12).
 * This bar now hosts cross-pane chrome only: the global dirty-stack indicator,
 * the ⌘K command-palette trigger, the theme toggle, and the Split toggle.
 */
export default function Header({
  isSplit = false,
  onToggleSplit,
  dirtyFiles,
  theme,
  onToggleTheme,
}: HeaderProps) {
  const { setOpen } = useCommandRegistry();

  const dirtyList = React.useMemo<string[]>(() => {
    if (!dirtyFiles) return [];
    return Array.isArray(dirtyFiles) ? [...dirtyFiles] : Array.from(dirtyFiles);
  }, [dirtyFiles]);
  const dirtyCount = dirtyList.length;

  return (
    <div data-print-hide="true" className="flex-shrink-0 grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-2 bg-surface border-b border-line z-20">
      {/* Left column — dirty-stack indicator (right-aligned next to chip).
       *  KB-035: wrapper is a polite status live region so the empty→
       *  "N unsaved" transition is announced. Wrapper is always mounted
       *  even when count is 0, so the announcement fires on every change.
       */}
      <div role="status" aria-live="polite" className="flex items-center justify-end">
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
      <Tooltip label="Open command palette (⌘K)" placement="bottom">
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-3 px-3 py-1 w-[220px] rounded-lg border border-line bg-surface-2 text-mute hover:bg-surface hover:text-ink-2 transition-all text-xs"
          aria-label="Search commands"
          data-testid="command-palette-trigger"
        >
          <span className="flex-1 text-left">Search commands…</span>
          <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-line bg-surface text-mute leading-none">
            ⌘K
          </kbd>
        </button>
      </Tooltip>

      {/* Right column — theme toggle + split toggle */}
      <div className="flex items-center justify-start gap-1.5">
        {onToggleTheme && (
          <Tooltip label={theme === "dark" ? "Switch to light theme (⌘⇧L)" : "Switch to dark theme (⌘⇧L)"} placement="bottom">
            <button
              onClick={onToggleTheme}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-mute hover:bg-surface-2 hover:text-ink-2 transition-colors"
              aria-label="Toggle theme"
              aria-pressed={theme === "dark"}
              data-testid="theme-toggle"
            >
              {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </Tooltip>
        )}
        {onToggleSplit && (
          <Tooltip label={isSplit ? "Exit split view" : "Split view"} placement="bottom">
            <button
              onClick={onToggleSplit}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all border ${
                isSplit
                  ? "bg-surface shadow-sm text-blue-600 border-line"
                  : "bg-surface-2 text-mute hover:text-ink-2 border-line"
              }`}
              aria-label={isSplit ? "Exit split view" : "Enter split view"}
              aria-pressed={isSplit}
            >
              <Columns2 size={13} />
              <span className="hidden xl:inline">Split</span>
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
