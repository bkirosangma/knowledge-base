"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCommandRegistry } from "../context/CommandRegistry";
import type { Command } from "../context/CommandRegistry";
import type { SearchResult } from "../../features/search/VaultIndex";

// ─── CommandPalette ───────────────────────────────────────────────────────────
//
// KB-010c: the palette has two modes driven by a `>` prefix on the input.
//   - Empty input            → mode hint, no list.
//   - Input starts with `>`  → command mode (existing behaviour, query
//                              is the text after `>`).
//   - Anything else          → search mode: fires `searchFn` and routes
//                              the picked result through `onSearchPick`.
// Search results are rendered in the same listbox shape as commands so
// keyboard navigation and aria-active-descendant logic share one pass.

interface CommandPaletteProps {
  /** Vault search query function. Optional so the palette renders in
   *  contexts that haven't wired the worker yet. When absent, search
   *  mode falls through to the empty state. */
  searchFn?: (q: string, limit?: number) => Promise<SearchResult[]>;
  /** Fires when the user picks a search result. The shell is
   *  responsible for opening the file (and threading
   *  `searchTarget.nodeId` for diagram-label hits). */
  onSearchPick?: (result: SearchResult, query: string) => void;
}

const SEARCH_LIMIT = 50;
const COMMAND_PREFIX = ">";

export default function CommandPalette({ searchFn, onSearchPick }: CommandPaletteProps = {}) {
  const { commands, open, setOpen } = useCommandRegistry();
  const inputRef = useRef<HTMLInputElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);

  const mode = useMemo<"empty" | "command" | "search">(() => {
    if (!query) return "empty";
    if (query.startsWith(COMMAND_PREFIX)) return "command";
    return "search";
  }, [query]);

  const commandQuery = useMemo(() => {
    if (mode !== "command") return "";
    return query.slice(COMMAND_PREFIX.length).trim();
  }, [mode, query]);

  const filteredCommands = useMemo<Command[]>(() => {
    const visible = commands.filter((c) => c.when === undefined || c.when());
    if (mode !== "command") return [];
    if (!commandQuery) return visible;
    const lc = commandQuery.toLowerCase();
    return visible.filter((c) => c.title.toLowerCase().includes(lc));
  }, [commands, mode, commandQuery]);

  // Group commands by `group` while preserving insertion order.
  const groupedCommands = useMemo<{ group: string; items: Command[] }[]>(() => {
    const map = new Map<string, Command[]>();
    for (const cmd of filteredCommands) {
      if (!map.has(cmd.group)) map.set(cmd.group, []);
      map.get(cmd.group)!.push(cmd);
    }
    return Array.from(map.entries()).map(([group, items]) => ({ group, items }));
  }, [filteredCommands]);

  const flatCommands = useMemo(() => groupedCommands.flatMap((g) => g.items), [groupedCommands]);

  // Search mode: race-by-cleanup. Each keystroke schedules a fresh
  // query; the cleanup flips `cancelled` so a stale resolution can't
  // overwrite the current view, even if it lands later.
  useEffect(() => {
    if (mode !== "search" || !searchFn) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    void searchFn(query, SEARCH_LIMIT).then((items) => {
      if (!cancelled) setSearchResults(items);
    });
    return () => {
      cancelled = true;
    };
  }, [mode, query, searchFn]);

  // Reset active index when query or mode changes.
  useEffect(() => {
    setActiveIndex(0);
  }, [query, mode]);

  // Auto-focus input on open; restore focus on close.
  useEffect(() => {
    if (open) {
      prevFocusRef.current = document.activeElement as HTMLElement;
      const t = setTimeout(() => inputRef.current?.focus(), 10);
      return () => {
        clearTimeout(t);
        prevFocusRef.current?.focus();
        prevFocusRef.current = null;
      };
    }
  }, [open]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setSearchResults([]);
  }, [setOpen]);

  const executeCommand = useCallback(
    (cmd: Command) => {
      close();
      cmd.run();
    },
    [close],
  );

  const pickSearchResult = useCallback(
    (result: SearchResult, q: string) => {
      close();
      onSearchPick?.(result, q);
    },
    [close, onSearchPick],
  );

  const totalItems = mode === "search" ? searchResults.length : flatCommands.length;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, totalItems - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (mode === "search") {
          const r = searchResults[activeIndex];
          if (r) pickSearchResult(r, query);
        } else if (mode === "command") {
          const c = flatCommands[activeIndex];
          if (c) executeCommand(c);
        }
        return;
      }
    },
    [
      mode,
      totalItems,
      activeIndex,
      searchResults,
      flatCommands,
      query,
      pickSearchResult,
      executeCommand,
      close,
    ],
  );

  if (!open) return null;

  const announcement =
    mode === "empty"
      ? "Type to search the vault, or > for commands"
      : mode === "search"
        ? searchResults.length === 0
          ? "No results"
          : `${searchResults.length} ${searchResults.length === 1 ? "result" : "results"}`
        : flatCommands.length === 0
          ? "No commands"
          : `${flatCommands.length} command${flatCommands.length === 1 ? "" : "s"}`;

  const activeId = (() => {
    if (mode === "search") {
      const r = searchResults[activeIndex];
      return r ? `cmd-option-search-${r.path}` : undefined;
    }
    if (mode === "command") {
      const c = flatCommands[activeIndex];
      return c ? `cmd-option-${c.id}` : undefined;
    }
    return undefined;
  })();

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[20vh]"
      style={{ backgroundColor: "rgba(15, 23, 42, 0.45)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
    >
      <div
        className="w-full max-w-[560px] mx-4 bg-surface rounded-lg shadow-xl border border-line overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {announcement}
        </div>

        <div className="border-b border-line px-4 py-3">
          <input
            ref={inputRef}
            type="text"
            placeholder="Search the vault, or > for commands…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full text-sm text-ink-2 placeholder-mute outline-none bg-transparent"
            aria-label="Search the vault, or > for commands"
            aria-autocomplete="list"
            aria-controls="cmd-listbox"
            aria-activedescendant={activeId}
          />
        </div>

        <ul
          id="cmd-listbox"
          role="listbox"
          aria-label={mode === "search" ? "Search results" : "Commands"}
          className="max-h-[360px] overflow-y-auto py-1 list-none m-0 p-0"
        >
          {mode === "empty" ? (
            <li className="px-4 py-6 text-center text-sm text-mute" role="presentation">
              Type to search documents and diagrams. Press{" "}
              <kbd className="text-[10px] font-mono px-1 py-0.5 rounded border border-line bg-surface-2">
                {COMMAND_PREFIX}
              </kbd>{" "}
              to filter commands instead.
            </li>
          ) : mode === "search" ? (
            <SearchList
              results={searchResults}
              activeIndex={activeIndex}
              setActiveIndex={setActiveIndex}
              onPick={(r) => pickSearchResult(r, query)}
            />
          ) : (
            <CommandList
              grouped={groupedCommands}
              flatCommands={flatCommands}
              activeIndex={activeIndex}
              setActiveIndex={setActiveIndex}
              onExecute={executeCommand}
            />
          )}
        </ul>
      </div>
    </div>
  );
}

// ─── Sub-components for the two modes ────────────────────────────────────────

function SearchList({
  results,
  activeIndex,
  setActiveIndex,
  onPick,
}: {
  results: SearchResult[];
  activeIndex: number;
  setActiveIndex: (i: number) => void;
  onPick: (r: SearchResult) => void;
}) {
  if (results.length === 0) {
    return (
      <li className="px-4 py-6 text-center text-sm text-mute" role="presentation">
        No results
      </li>
    );
  }
  return (
    <>
      {results.map((r, idx) => {
        const isActive = idx === activeIndex;
        return (
          <li
            key={r.path}
            id={`cmd-option-search-${r.path}`}
            role="option"
            aria-selected={isActive}
            data-testid="palette-search-result"
            data-path={r.path}
            className={`flex flex-col gap-1 px-4 py-2 cursor-pointer select-none transition-colors ${
              isActive ? "bg-blue-50 text-blue-700" : "text-ink-2 hover:bg-surface-2"
            }`}
            onMouseEnter={() => setActiveIndex(idx)}
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(r);
            }}
          >
            <div className="flex items-center gap-2 text-sm">
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-line text-mute">
                {r.kind}
              </span>
              <span className="font-medium">{r.path}</span>
            </div>
            {r.snippet && <div className="text-xs text-mute">{r.snippet}</div>}
          </li>
        );
      })}
    </>
  );
}

function CommandList({
  grouped,
  flatCommands,
  activeIndex,
  setActiveIndex,
  onExecute,
}: {
  grouped: { group: string; items: Command[] }[];
  flatCommands: Command[];
  activeIndex: number;
  setActiveIndex: (i: number) => void;
  onExecute: (cmd: Command) => void;
}) {
  if (flatCommands.length === 0) {
    return (
      <li className="px-4 py-6 text-center text-sm text-mute" role="presentation">
        No matching commands
      </li>
    );
  }
  let flatIdx = 0;
  return (
    <>
      {grouped.map(({ group, items }) => (
        <li key={group} role="group" aria-label={group}>
          <div
            aria-hidden="true"
            className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-mute select-none"
          >
            {group}
          </div>
          {items.map((cmd) => {
            const idx = flatIdx++;
            const isActive = idx === activeIndex;
            return (
              <div
                key={cmd.id}
                id={`cmd-option-${cmd.id}`}
                role="option"
                aria-selected={isActive}
                className={`flex items-center gap-3 px-4 py-2 cursor-pointer select-none transition-colors ${
                  isActive ? "bg-blue-50 text-blue-700" : "text-ink-2 hover:bg-surface-2"
                }`}
                onMouseEnter={() => setActiveIndex(idx)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onExecute(cmd);
                }}
              >
                <span className="flex-1 text-sm">{cmd.title}</span>
                {cmd.shortcut && (
                  <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-line bg-surface-2 text-mute">
                    {cmd.shortcut}
                  </kbd>
                )}
              </div>
            );
          })}
        </li>
      ))}
    </>
  );
}
