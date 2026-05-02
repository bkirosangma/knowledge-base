"use client";

import React from "react";
import {
  Folder, FolderOpen, FilePlus, FileText, FolderPlus, RefreshCw,
  EllipsisVertical, ChevronRight,
  ArrowUp, ArrowDown, Check,
} from "lucide-react";
import type { ExplorerFilter } from "../../utils/types";
import type { SortField, SortDirection, SortGrouping } from "./ExplorerPanel";
import type { ContextMenuState } from "./TreeNodeRow";
import { Tooltip } from "../Tooltip";

const sortBtnClass =
  "flex items-center gap-2 w-full px-3 py-1.5 text-[13px] transition-colors text-ink-2 hover:bg-surface-2";

export interface ExplorerHeaderProps {
  directoryName: string;
  isLoading: boolean;
  dragOverPath: string | null;

  // Sort / filter state (passed through from ExplorerPanelProps)
  sortField: SortField;
  sortDirection: SortDirection;
  sortGrouping: SortGrouping;
  explorerFilter: ExplorerFilter | undefined;
  onFilterChange?: (filter: ExplorerFilter) => void;
  onRefresh: () => void;

  // Dropdown state
  dotMenuOpen: boolean;
  setDotMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  sortSubMenuOpen: boolean;
  setSortSubMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  dotMenuRef: React.RefObject<HTMLDivElement | null>;

  onOpenFolder?: () => void;

  // Callbacks
  setContextMenu: (m: ContextMenuState | null) => void;
  selectedFolderPath: string | null;
  handleCreateFile: (parentPath?: string) => void;
  handleCreateDocument: (parentPath?: string) => void;
  handleCreateFolder: (parentPath?: string) => void;
  handleDragOver: (e: React.DragEvent, folderPath: string) => void;
  handleDragEnter: (e: React.DragEvent, folderPath: string) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent, targetFolderPath: string) => void;
  handleSortFieldClick: (field: SortField) => void;
  handleGroupingClick: (grouping: SortGrouping) => void;
}

/**
 * Explorer's directory header (root drop target + new file/folder/refresh
 * buttons + the ⋮ dot menu containing the Sort submenu) and, below it, the
 * All / Diagrams / Documents filter-toggle row.
 */
export default function ExplorerHeader({
  directoryName,
  isLoading,
  dragOverPath,
  sortField,
  sortDirection,
  sortGrouping,
  explorerFilter,
  onFilterChange,
  onRefresh,
  dotMenuOpen,
  setDotMenuOpen,
  sortSubMenuOpen,
  setSortSubMenuOpen,
  dotMenuRef,
  setContextMenu,
  selectedFolderPath,
  handleCreateFile,
  handleCreateDocument,
  handleCreateFolder,
  handleDragOver,
  handleDragEnter,
  handleDragLeave,
  handleDrop,
  handleSortFieldClick,
  handleGroupingClick,
  onOpenFolder,
}: ExplorerHeaderProps) {
  return (
    <>
      {/* Directory header — also a drop target for moving to root */}
      <div
        className={`flex flex-col px-3 pt-2 pb-1 border-b border-line relative ${
          dragOverPath === "" ? "bg-blue-50 outline outline-1 outline-blue-300 outline-dashed" : ""
        }`}
        onContextMenu={(e) => {
          e.preventDefault();
          setContextMenu({ x: e.clientX, y: e.clientY, type: "folder", path: "", name: directoryName });
        }}
        onDragOver={(e) => handleDragOver(e, "")}
        onDragEnter={(e) => handleDragEnter(e, "")}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, "")}
      >
        {/* Row 1 — folder name + 3-dot menu */}
        <div className="flex items-center gap-1.5 min-w-0">
          <Folder size={16} className="text-amber-500 flex-shrink-0" />
          <span className="text-xs font-semibold text-ink-2 truncate flex-1">
            {selectedFolderPath
              ? <><span className="text-mute font-normal">{directoryName} / </span>{selectedFolderPath.split("/").pop()}</>
              : directoryName}
          </span>
          {onOpenFolder && (
            <Tooltip label="Open different folder">
              <button
                onClick={onOpenFolder}
                className="p-1 hover:bg-surface-2 rounded transition-colors flex-shrink-0"
                aria-label="Open different folder"
              >
                <FolderOpen size={14} className="text-mute" />
              </button>
            </Tooltip>
          )}
          <Tooltip label="More actions">
            <button
              onClick={() => { setDotMenuOpen((v) => !v); setSortSubMenuOpen(false); }}
              className="p-1 hover:bg-surface-2 rounded transition-colors flex-shrink-0"
              aria-label="More actions"
              aria-haspopup="menu"
              aria-expanded={dotMenuOpen}
            >
              <EllipsisVertical size={14} className="text-mute" />
            </button>
          </Tooltip>
        </div>

        {/* Row 2 — create + refresh icons */}
        <div className="flex items-center gap-0.5 mt-1">
          <Tooltip label={`New Diagram${selectedFolderPath ? ` in ${selectedFolderPath.split("/").pop()}` : ""}`}>
            <button
              onClick={() => handleCreateFile(selectedFolderPath ?? "")}
              className="p-1 hover:bg-surface-2 rounded transition-colors"
              aria-label={`New Diagram${selectedFolderPath ? ` in ${selectedFolderPath.split("/").pop()}` : ""}`}
            >
              <FilePlus size={14} className="text-mute" />
            </button>
          </Tooltip>
          <Tooltip label={`New Document${selectedFolderPath ? ` in ${selectedFolderPath.split("/").pop()}` : ""}`}>
            <button
              onClick={() => handleCreateDocument(selectedFolderPath ?? "")}
              className="p-1 hover:bg-surface-2 rounded transition-colors"
              aria-label={`New Document${selectedFolderPath ? ` in ${selectedFolderPath.split("/").pop()}` : ""}`}
            >
              <FileText size={14} className="text-mute" />
            </button>
          </Tooltip>
          <Tooltip label={`New Folder${selectedFolderPath ? ` in ${selectedFolderPath.split("/").pop()}` : ""}`}>
            <button
              onClick={() => handleCreateFolder(selectedFolderPath ?? "")}
              className="p-1 hover:bg-surface-2 rounded transition-colors"
              aria-label={`New Folder${selectedFolderPath ? ` in ${selectedFolderPath.split("/").pop()}` : ""}`}
            >
              <FolderPlus size={14} className="text-mute" />
            </button>
          </Tooltip>
          <Tooltip label="Refresh">
            <button
              onClick={onRefresh}
              className="p-1 hover:bg-surface-2 rounded transition-colors"
              aria-label="Refresh explorer"
            >
              <RefreshCw size={14} className={`text-mute ${isLoading ? "animate-spin" : ""}`} />
            </button>
          </Tooltip>

          {/* 3-dot dropdown menu */}
          {dotMenuOpen && (
            <div
              ref={dotMenuRef}
              className="absolute right-1 top-full mt-1 z-[9999] bg-surface rounded-lg shadow-lg border border-line py-1 min-w-[150px]"
            >
            <div
              className="relative"
              onMouseEnter={() => setSortSubMenuOpen(true)}
              onMouseLeave={() => setSortSubMenuOpen(false)}
            >
              <button
                className={`${sortBtnClass} justify-between`}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => setSortSubMenuOpen((v) => !v)}
                aria-label="Sort options"
                aria-haspopup="menu"
                aria-expanded={sortSubMenuOpen}
              >
                <span>Sort</span>
                <ChevronRight size={13} className="text-mute" />
              </button>

              {/* Sort submenu */}
              {sortSubMenuOpen && (
                <div
                  className="absolute left-full top-0 ml-0.5 z-[9999] bg-surface rounded-lg shadow-lg border border-line py-1 min-w-[180px]"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <div className="px-3 py-1 text-[11px] font-semibold text-mute uppercase tracking-wider">Sort by</div>
                  {([["name", "Name"], ["created", "Created Date"], ["modified", "Modified Date"]] as [SortField, string][]).map(([field, label]) => (
                    <button
                      key={field}
                      className={`${sortBtnClass} justify-between ${sortField === field ? "bg-surface-2 font-medium" : ""}`}
                      onClick={() => handleSortFieldClick(field)}
                      aria-label={`Sort by ${label}`}
                      aria-pressed={sortField === field}
                    >
                      <span>{label}</span>
                      {sortField === field && (
                        sortDirection === "asc"
                          ? <ArrowDown size={13} className="text-blue-500" />
                          : <ArrowUp size={13} className="text-blue-500" />
                      )}
                    </button>
                  ))}
                  <div className="border-t border-line my-1" />
                  {([["folders-first", "Folders First"], ["files-first", "Files First"], ["mixed", "Mixed"]] as [SortGrouping, string][]).map(([grouping, label]) => (
                    <button
                      key={grouping}
                      className={`${sortBtnClass} justify-between`}
                      onClick={() => handleGroupingClick(grouping)}
                      aria-label={`Group: ${label}`}
                      aria-pressed={sortGrouping === grouping}
                    >
                      <span>{label}</span>
                      {sortGrouping === grouping && <Check size={13} className="text-blue-500" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
            </div>
          )}
        </div>
      </div>

      {/* Filter toggles */}
      {onFilterChange && (
        <div
          className="flex items-center gap-0.5 px-3 py-1.5 border-b border-line"
          role="group"
          aria-label="Filter explorer items"
        >
          {(["all", "diagrams", "documents"] as ExplorerFilter[]).map(f => (
            <button
              key={f}
              onClick={() => onFilterChange(f)}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                explorerFilter === f ? "bg-blue-100 text-blue-700" : "text-mute hover:bg-surface-2"
              }`}
              aria-pressed={explorerFilter === f}
            >
              {f === "all" ? "All" : f === "diagrams" ? "Diagrams" : "Documents"}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
