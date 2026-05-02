"use client";

/**
 * Left-rail filter panel for the Vault Graph view. Exposes:
 *   - Folder filter (top-level folders in the tree, multi-select).
 *   - File-type filter (.md / .json checkboxes).
 *   - Orphans-only toggle (nodes with 0 connections).
 *
 * All chrome uses design tokens — no hardcoded slate-* / blue-*.
 */

import React from "react";
import type { GraphFilters as FiltersState } from "../hooks/useGraphData";

interface GraphFiltersProps {
  allFolders: string[];
  filters: FiltersState;
  onChange: (next: FiltersState) => void;
}

export default function GraphFilters({ allFolders, filters, onChange }: GraphFiltersProps) {
  const allFoldersSet = React.useMemo(() => new Set(allFolders), [allFolders]);
  const activeFolders = filters.folders ?? allFoldersSet;
  const allFolderActive = activeFolders.size === allFoldersSet.size;

  const toggleFolder = (folder: string) => {
    const next = new Set(activeFolders);
    if (next.has(folder)) next.delete(folder);
    else next.add(folder);
    onChange({
      ...filters,
      folders: next.size === allFoldersSet.size ? null : next,
    });
  };

  const toggleAllFolders = () => {
    onChange({ ...filters, folders: allFolderActive ? new Set() : null });
  };

  const toggleFileType = (kind: "md" | "json") => {
    const next = new Set(filters.fileTypes);
    if (next.has(kind)) next.delete(kind);
    else next.add(kind);
    onChange({ ...filters, fileTypes: next });
  };

  const toggleOrphans = () => {
    onChange({ ...filters, orphansOnly: !filters.orphansOnly });
  };

  const toggleRecent = () => {
    onChange({ ...filters, recentOnly: !filters.recentOnly });
  };

  return (
    <aside
      className="flex-shrink-0 w-56 border-r border-line bg-surface flex flex-col overflow-y-auto"
      aria-label="Graph filters"
      data-testid="graph-filters"
    >
      <section className="px-3 py-3 border-b border-line">
        <h2 className="text-[10px] font-semibold uppercase tracking-widest text-mute mb-2">
          File type
        </h2>
        <label className="flex items-center gap-2 text-sm text-ink-2 py-1 cursor-pointer">
          <input
            type="checkbox"
            checked={filters.fileTypes.has("md")}
            onChange={() => toggleFileType("md")}
            aria-label="Show markdown documents"
            data-testid="graph-filter-md"
          />
          <span>Documents (.md)</span>
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-2 py-1 cursor-pointer">
          <input
            type="checkbox"
            checked={filters.fileTypes.has("json")}
            onChange={() => toggleFileType("json")}
            aria-label="Show diagrams"
            data-testid="graph-filter-json"
          />
          <span>Diagrams (.json)</span>
        </label>
      </section>

      <section className="px-3 py-3 border-b border-line">
        <h2 className="text-[10px] font-semibold uppercase tracking-widest text-mute mb-2">
          Activity
        </h2>
        <label className="flex items-center gap-2 text-sm text-ink-2 py-1 cursor-pointer">
          <input
            type="checkbox"
            checked={filters.orphansOnly}
            onChange={toggleOrphans}
            aria-label="Show only orphan nodes"
            data-testid="graph-filter-orphans"
          />
          <span>Orphans only</span>
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-2 py-1 cursor-pointer">
          <input
            type="checkbox"
            checked={filters.recentOnly}
            onChange={toggleRecent}
            aria-label="Show only the most recently modified files"
            data-testid="graph-filter-recent-only"
          />
          <span>Recent only</span>
        </label>
      </section>

      <section className="px-3 py-3">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[10px] font-semibold uppercase tracking-widest text-mute">
            Folders
          </h2>
          <button
            type="button"
            onClick={toggleAllFolders}
            className="text-[10px] text-mute hover:text-ink-2"
            aria-label={allFolderActive ? "Hide all folders" : "Show all folders"}
          >
            {allFolderActive ? "None" : "All"}
          </button>
        </div>
        {allFolders.length === 0 ? (
          <div className="text-xs text-mute">No folders</div>
        ) : (
          <ul className="m-0 p-0 list-none">
            {allFolders.map((folder) => (
              <li key={folder || "(root)"}>
                <label className="flex items-center gap-2 text-sm text-ink-2 py-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={activeFolders.has(folder)}
                    onChange={() => toggleFolder(folder)}
                    aria-label={`Show folder ${folder || "root"}`}
                    data-testid={`graph-filter-folder-${folder || "root"}`}
                  />
                  <span className="truncate">{folder || "(root)"}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}
