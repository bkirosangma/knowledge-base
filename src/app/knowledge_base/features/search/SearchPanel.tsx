"use client";

// Dedicated search surface (KB-010c / SEARCH-8.6).
// Mounts as a virtual pane via the SEARCH_SENTINEL pattern, mirroring
// the Graph view. v1 renders an input + results list; chip filters
// (kind / field / folder) compose post-query as documented in
// `applyChipFilters.ts`.

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Field, SearchResult } from "./VaultIndex";
import {
  applyChipFilters,
  listResultFolders,
  type ChipFilters,
} from "./applyChipFilters";

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
const FIELD_OPTIONS: readonly Field[] = ["body", "title", "label", "flow"];

export default function SearchPanel({ searchFn, onResultClick }: SearchPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [rawResults, setRawResults] = useState<SearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  // Chip selections — applied post-query, so changing chips never
  // re-fires the worker.
  const [kindFilter, setKindFilter] = useState<"doc" | "diagram" | null>(null);
  const [fieldFilters, setFieldFilters] = useState<Set<Field>>(() => new Set());
  const [folderFilters, setFolderFilters] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Race-by-cleanup: each keystroke schedules a fresh query; the
  // cleanup flips `cancelled` so a stale result never overwrites the
  // current view.
  useEffect(() => {
    if (!query) {
      setRawResults([]);
      return;
    }
    let cancelled = false;
    void searchFn(query, RESULT_LIMIT).then((items) => {
      if (!cancelled) setRawResults(items);
    });
    return () => {
      cancelled = true;
    };
  }, [query, searchFn]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, kindFilter, fieldFilters, folderFilters]);

  const filters: ChipFilters = useMemo(
    () => ({ kind: kindFilter, fields: fieldFilters, folders: folderFilters }),
    [kindFilter, fieldFilters, folderFilters],
  );

  const results = useMemo(() => applyChipFilters(rawResults, filters), [rawResults, filters]);

  // Folder chips are derived from the raw result set (not the filtered
  // set) so deselecting a folder doesn't make its chip disappear.
  const availableFolders = useMemo(() => listResultFolders(rawResults), [rawResults]);

  const announcement = useMemo(() => {
    if (!query) return "Type to search the vault";
    if (rawResults.length === 0) return "No results";
    if (results.length === 0) return "No results match the active filters";
    return `${results.length} ${results.length === 1 ? "result" : "results"}`;
  }, [query, rawResults, results]);

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

  const toggleField = (f: Field) => {
    setFieldFilters((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });
  };

  const toggleFolder = (f: string) => {
    setFolderFilters((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });
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

      {/* Filter chips — only meaningful once there's a result set. */}
      {rawResults.length > 0 && (
        <div
          className="border-b border-line px-4 py-2 flex flex-wrap gap-x-3 gap-y-2 items-center text-xs"
          data-testid="search-panel-chips"
          aria-label="Filter chips"
        >
          <ChipGroup label="Kind">
            <Chip
              testId="chip-kind-doc"
              active={kindFilter === "doc"}
              onClick={() => setKindFilter(kindFilter === "doc" ? null : "doc")}
            >
              Documents
            </Chip>
            <Chip
              testId="chip-kind-diagram"
              active={kindFilter === "diagram"}
              onClick={() => setKindFilter(kindFilter === "diagram" ? null : "diagram")}
            >
              Diagrams
            </Chip>
          </ChipGroup>

          <ChipGroup label="Field">
            {FIELD_OPTIONS.map((f) => (
              <Chip
                key={f}
                testId={`chip-field-${f}`}
                active={fieldFilters.has(f)}
                onClick={() => toggleField(f)}
              >
                {f}
              </Chip>
            ))}
          </ChipGroup>

          {availableFolders.length > 1 && (
            <ChipGroup label="Folder">
              {availableFolders.map((f) => (
                <Chip
                  key={f || "__root__"}
                  testId={`chip-folder-${f || "root"}`}
                  active={folderFilters.has(f)}
                  onClick={() => toggleFolder(f)}
                >
                  {f === "" ? "(root)" : f}
                </Chip>
              ))}
            </ChipGroup>
          )}
        </div>
      )}

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
          <li
            className="px-4 py-6 text-center text-sm text-mute"
            role="presentation"
            data-testid="search-panel-empty-state"
            data-state="idle"
          >
            Type to search across documents and diagrams.
          </li>
        ) : results.length === 0 ? (
          <li
            className="px-4 py-6 text-center text-sm text-mute"
            role="presentation"
            data-testid="search-panel-empty-state"
            data-state={rawResults.length === 0 ? "no-results" : "filtered-out"}
          >
            {rawResults.length === 0
              ? "No results"
              : "No results match the active filters"}
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

// ─── Chip primitives ─────────────────────────────────────────────────────

function ChipGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-mute select-none">
        {label}
      </span>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  testId,
  children,
}: {
  active: boolean;
  onClick: () => void;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      data-active={active ? "true" : "false"}
      aria-pressed={active}
      onClick={onClick}
      className={`px-2 py-0.5 rounded-full border text-[11px] transition-colors ${
        active
          ? "bg-blue-50 text-blue-700 border-blue-200"
          : "bg-transparent text-ink-2 border-line hover:bg-surface-2"
      }`}
    >
      {children}
    </button>
  );
}
