"use client";

// Dedicated search surface (KB-010c / SEARCH-2.2). Mounts as a virtual
// pane via the SEARCH_SENTINEL pattern, mirroring the Graph view. v1
// renders an input + results list; filter chips for kind / field /
// folder are scaffolded into the spec but deferred per the stop
// conditions.

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { SearchResult } from "./VaultIndex";

interface SearchPanelProps {
  /** Resolves the latest results for a query. Wired to
   *  `useVaultSearch().search`. */
  searchFn: (q: string, limit?: number) => Promise<SearchResult[]>;
  /** Fires when the user picks a result. The shell decides how to open
   *  the target — for diagram-label hits it threads a `searchTarget`
   *  through `panes.openFile`. */
  onResultClick: (result: SearchResult, query: string) => void;
}

const RESULT_LIMIT = 50;

export default function SearchPanel({ searchFn, onResultClick }: SearchPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Race-by-cleanup: each keystroke schedules a fresh query; the
  // cleanup flips `cancelled` so a stale result never overwrites the
  // current view.
  useEffect(() => {
    if (!query) {
      setResults([]);
      return;
    }
    let cancelled = false;
    void searchFn(query, RESULT_LIMIT).then((items) => {
      if (!cancelled) setResults(items);
    });
    return () => {
      cancelled = true;
    };
  }, [query, searchFn]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const announcement = useMemo(() => {
    if (!query) return "Type to search the vault";
    if (results.length === 0) return "No results";
    return `${results.length} ${results.length === 1 ? "result" : "results"}`;
  }, [query, results]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = results[activeIndex];
      if (r) onResultClick(r, query);
    }
  };

  return (
    <div
      className="flex flex-col h-full bg-surface text-ink-2"
      data-testid="search-panel"
    >
      <div className="border-b border-line px-4 py-3">
        <input
          ref={inputRef}
          type="text"
          placeholder="Search the vault…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          className="w-full text-sm placeholder-mute outline-none bg-transparent"
          aria-label="Search the vault"
          aria-autocomplete="list"
          aria-controls="search-listbox"
          data-testid="search-panel-input"
        />
      </div>

      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>

      <ul
        id="search-listbox"
        role="listbox"
        aria-label="Search results"
        className="flex-1 overflow-y-auto py-1 list-none m-0 p-0"
      >
        {!query ? (
          <li className="px-4 py-6 text-center text-sm text-mute" role="presentation">
            Type to search across documents and diagrams.
          </li>
        ) : results.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-mute" role="presentation">
            No results
          </li>
        ) : (
          results.map((r, idx) => {
            const isActive = idx === activeIndex;
            return (
              <li
                key={r.path}
                role="option"
                aria-selected={isActive}
                data-testid="search-panel-result"
                data-path={r.path}
                className={`flex flex-col gap-1 px-4 py-2 cursor-pointer select-none transition-colors ${
                  isActive ? "bg-blue-50 text-blue-700" : "hover:bg-surface-2"
                }`}
                onMouseEnter={() => setActiveIndex(idx)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onResultClick(r, query);
                }}
              >
                <div className="flex items-center gap-2 text-sm">
                  <span
                    className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-line text-mute"
                    aria-label={`Kind: ${r.kind}`}
                  >
                    {r.kind}
                  </span>
                  <span className="font-medium">{r.path}</span>
                </div>
                {r.snippet && (
                  <div className="text-xs text-mute" data-testid="search-panel-result-snippet">
                    {r.snippet}
                  </div>
                )}
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
