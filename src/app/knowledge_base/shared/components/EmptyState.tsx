"use client";

/**
 * EmptyState — KB-045 replacement for the generic "No file open" pane.
 *
 * Three sections, each kept tight:
 *   1. Five shortcut chips. Listed for discoverability — the chips are
 *      documentation, not buttons. Wiring of the underlying actions
 *      (palette, save, focus mode, etc.) lives elsewhere; the empty
 *      state just surfaces what the user can press.
 *   2. Up to five recent files (clickable). Routed back to the host via
 *      `onSelectRecent` so the host's existing extension-aware open
 *      logic stays the source of truth.
 *   3. "New Note" button — primary affordance to escape the empty state.
 */

import React from "react";
import { FilePlus, FileText } from "lucide-react";

export interface EmptyStateShortcut {
  combo: string;
  label: string;
}

/**
 * Canonical shortcut row exported for tests and downstream surfaces that
 * may want to render the same set (mobile read-tab, palette, etc.).
 *
 * Order matches the KB-045 ticket:
 *   ⌘K — open command palette
 *   ⌘N — new note
 *   ⌘S — save the active file
 *   ⌘. — toggle Focus Mode
 *   ⌘\ — split pane with the current file
 */
export const EMPTY_STATE_SHORTCUTS: ReadonlyArray<EmptyStateShortcut> = [
  { combo: "⌘K", label: "Open palette" },
  { combo: "⌘N", label: "New note" },
  { combo: "⌘S", label: "Save" },
  { combo: "⌘.", label: "Focus mode" },
  { combo: "⌘\\", label: "Split pane" },
];

const RECENTS_LIMIT = 5;

export interface EmptyStateProps {
  /** Recent files in most-recent-first order. Component slices to 5. */
  recents: ReadonlyArray<string>;
  onSelectRecent: (path: string) => void;
  onCreateNote: () => void;
}

function basenameNoMd(path: string): string {
  const base = path.split("/").pop() ?? path;
  return base.endsWith(".md") ? base.slice(0, -3) : base;
}

export default function EmptyState({
  recents,
  onSelectRecent,
  onCreateNote,
}: EmptyStateProps) {
  const visibleRecents = recents.slice(0, RECENTS_LIMIT);

  return (
    <div
      className="flex-1 flex items-center justify-center bg-surface-2 px-6"
      data-testid="empty-state"
    >
      <div className="w-full max-w-md flex flex-col gap-6 text-ink">
        <section aria-labelledby="empty-state-shortcuts-heading">
          <h2
            id="empty-state-shortcuts-heading"
            className="text-[10px] font-semibold uppercase tracking-widest text-mute mb-2"
          >
            Shortcuts
          </h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 m-0 p-0 list-none">
            {EMPTY_STATE_SHORTCUTS.map((s) => (
              <li
                key={s.combo}
                className="flex items-center gap-2 text-sm text-ink-2"
              >
                <kbd className="inline-flex items-center min-w-[2.5rem] justify-center px-1.5 py-0.5 text-xs font-medium rounded border border-line bg-surface text-ink">
                  {s.combo}
                </kbd>
                <span>{s.label}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="empty-state-recents-heading">
          <h2
            id="empty-state-recents-heading"
            className="text-[10px] font-semibold uppercase tracking-widest text-mute mb-2"
          >
            Recent files
          </h2>
          {visibleRecents.length === 0 ? (
            <p
              className="text-sm text-mute"
              data-testid="empty-state-recents-empty"
            >
              No recents yet — open a file to start your history.
            </p>
          ) : (
            <ul className="m-0 p-0 list-none flex flex-col">
              {visibleRecents.map((path) => (
                <li key={path}>
                  <button
                    type="button"
                    onClick={() => onSelectRecent(path)}
                    data-testid={`empty-state-recent-${path}`}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-ink-2 hover:bg-surface-3 rounded transition-colors text-left"
                  >
                    <FileText size={14} className="text-mute flex-shrink-0" aria-hidden="true" />
                    <span className="truncate">{basenameNoMd(path)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <button
          type="button"
          onClick={onCreateNote}
          data-testid="empty-state-new-note"
          className="self-start inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded bg-accent text-white hover:opacity-90 transition-opacity"
        >
          <FilePlus size={14} aria-hidden="true" />
          New Note
        </button>
      </div>
    </div>
  );
}
