"use client";

import React from "react";
import {
  Folder, FilePlus, FileText, FolderPlus, RefreshCw,
  EllipsisVertical, ChevronRight,
  ArrowUp, ArrowDown, Check,
} from "lucide-react";
import type { ExplorerFilter } from "../../utils/types";
import type { SortField, SortDirection, SortGrouping } from "./ExplorerPanel";
import type { ContextMenuState } from "./TreeNodeRow";

const sortBtnClass =
  "flex items-center gap-2 w-full px-3 py-1.5 text-[13px] transition-colors text-slate-700 hover:bg-slate-100";

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
}: ExplorerHeaderProps) {
  return (
    <>
      {/* Directory header — also a drop target for moving to root */}
      <div
        className={`flex flex-col px-3 pt-2 pb-1 border-b border-slate-100 relative ${
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
        {/* Row 1 — folder name */}
        <div className="flex items-center gap-1.5 min-w-0">
          <Folder size={16} className="text-amber-500 flex-shrink-0" />
          <span className="text-xs font-semibold text-slate-700 truncate">
            {selectedFolderPath
              ? <><span className="text-slate-400 font-normal">{directoryName} / </span>{selectedFolderPath.split("/").pop()}</>
              : directoryName}
          </span>
        </div>

        {/* Row 2 — action icons */}
        <div className="flex items-center gap-0.5 mt-1">
          <button
            onClick={() => handleCreateFile(selectedFolderPath ?? "")}
            className="p-1 hover:bg-slate-100 rounded transition-colors"
            title={`New Diagram${selectedFolderPath ? ` in ${selectedFolderPath.split("/").pop()}` : ""}`}
          >
            <FilePlus size={14} className="text-slate-500" />
          </button>
          <button
            onClick={() => handleCreateDocument(selectedFolderPath ?? "")}
            className="p-1 hover:bg-slate-100 rounded transition-colors"
            title={`New Document${selectedFolderPath ? ` in ${selectedFolderPath.split("/").pop()}` : ""}`}
          >
            <FileText size={14} className="text-slate-500" />
          </button>
          <button
            onClick={() => handleCreateFolder(selectedFolderPath ?? "")}
            className="p-1 hover:bg-slate-100 rounded transition-colors"
            title={`New Folder${selectedFolderPath ? ` in ${selectedFolderPath.split("/").pop()}` : ""}`}
          >
            <FolderPlus size={14} className="text-slate-500" />
          </button>
          <button
            onClick={onRefresh}
            className="p-1 hover:bg-slate-100 rounded transition-colors"
            title="Refresh"
          >
            <RefreshCw size={14} className={`text-slate-500 ${isLoading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => { setDotMenuOpen((v) => !v); setSortSubMenuOpen(false); }}
            className="p-1 hover:bg-slate-100 rounded transition-colors"
            title="More actions"
          >
            <EllipsisVertical size={14} className="text-slate-500" />
          </button>

          {/* 3-dot dropdown menu */}
          {dotMenuOpen && (
            <div
              ref={dotMenuRef}
              className="absolute right-1 top-full mt-1 z-[9999] bg-white rounded-lg shadow-lg border border-slate-200 py-1 min-w-[150px]"
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
              >
                <span>Sort</span>
                <ChevronRight size={13} className="text-slate-400" />
              </button>

              {/* Sort submenu */}
              {sortSubMenuOpen && (
                <div
                  className="absolute left-full top-0 ml-0.5 z-[9999] bg-white rounded-lg shadow-lg border border-slate-200 py-1 min-w-[180px]"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <div className="px-3 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Sort by</div>
                  {([["name", "Name"], ["created", "Created Date"], ["modified", "Modified Date"]] as [SortField, string][]).map(([field, label]) => (
                    <button
                      key={field}
                      className={`${sortBtnClass} justify-between ${sortField === field ? "bg-slate-50 font-medium" : ""}`}
                      onClick={() => handleSortFieldClick(field)}
                    >
                      <span>{label}</span>
                      {sortField === field && (
                        sortDirection === "asc"
                          ? <ArrowDown size={13} className="text-blue-500" />
                          : <ArrowUp size={13} className="text-blue-500" />
                      )}
                    </button>
                  ))}
                  <div className="border-t border-slate-100 my-1" />
                  {([["folders-first", "Folders First"], ["files-first", "Files First"], ["mixed", "Mixed"]] as [SortGrouping, string][]).map(([grouping, label]) => (
                    <button
                      key={grouping}
                      className={`${sortBtnClass} justify-between`}
                      onClick={() => handleGroupingClick(grouping)}
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
        <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-slate-100">
          {(["all", "diagrams", "documents"] as ExplorerFilter[]).map(f => (
            <button
              key={f}
              onClick={() => onFilterChange(f)}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                explorerFilter === f ? "bg-blue-100 text-blue-700" : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              {f === "all" ? "All" : f === "diagrams" ? "Diagrams" : "Documents"}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
