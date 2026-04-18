"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  ChevronLeft, ChevronRight, ChevronDown, FolderOpen, Folder, FileJson, FileText,
  RefreshCw, FilePlus, FolderPlus, Trash2, Pencil, Copy, Clipboard, FileSymlink, FolderSymlink,
  EllipsisVertical, ArrowUp, ArrowDown, Check,
} from "lucide-react";
import type { TreeNode } from "../../hooks/useFileExplorer";
import type { ExplorerFilter } from "../../utils/types";
import { sortTreeNodes, filterTreeNodes } from "./explorerTreeUtils";
import TreeNodeRow, { type ContextMenuState } from "./TreeNodeRow";
import ExplorerHeader from "./ExplorerHeader";

export type SortField = "name" | "created" | "modified";
export type SortDirection = "asc" | "desc";
export type SortGrouping = "folders-first" | "files-first" | "mixed";

interface ExplorerContextMenu {
  x: number;
  y: number;
  type: "file" | "folder";
  path: string;
  name: string;
}

interface ExplorerPanelProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  directoryName: string | null;
  tree: TreeNode[];
  leftPaneFile: string | null;
  rightPaneFile: string | null;
  dirtyFiles: Set<string>;
  onOpenFolder: () => void;
  onSelectFile: (path: string) => void;
  onCreateFile: (parentPath: string) => Promise<string | null>;
  onCreateFolder: (parentPath: string) => Promise<string | null>;
  onDeleteFile: (path: string, event: React.MouseEvent) => void;
  onDeleteFolder: (path: string, event: React.MouseEvent) => void;
  onRenameFile: (oldPath: string, newName: string) => void;
  onRenameFolder: (oldPath: string, newName: string) => void;
  onDuplicateFile: (path: string) => void;
  onMoveItem: (sourcePath: string, targetFolderPath: string) => void;
  isLoading: boolean;
  onRefresh: () => void;
  sortField: SortField;
  sortDirection: SortDirection;
  sortGrouping: SortGrouping;
  onSortChange: (field: SortField, direction: SortDirection, grouping: SortGrouping) => void;
  explorerFilter?: ExplorerFilter;
  onFilterChange?: (filter: ExplorerFilter) => void;
  onSelectDocument?: (path: string) => void;
}

/* ── Sorting utility ── */


export default function ExplorerPanel({
  collapsed,
  onToggleCollapse,
  directoryName,
  tree,
  leftPaneFile,
  rightPaneFile,
  dirtyFiles,
  onOpenFolder,
  onSelectFile,
  onCreateFile,
  onCreateFolder,
  onDeleteFile,
  onDeleteFolder,
  onRenameFile,
  onRenameFolder,
  onDuplicateFile,
  onMoveItem,
  isLoading,
  onRefresh,
  sortField,
  sortDirection,
  sortGrouping,
  onSortChange,
  explorerFilter,
  onFilterChange,
  onSelectDocument,
}: ExplorerPanelProps) {
  const [contextMenu, setContextMenu] = useState<ExplorerContextMenu | null>(null);
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editType, setEditType] = useState<"file" | "folder">("file");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);
  const [dotMenuOpen, setDotMenuOpen] = useState(false);
  const [sortSubMenuOpen, setSortSubMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const dotMenuRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  // Auto-expand folders to reveal highlighted pane files
  useEffect(() => {
    const paths = [leftPaneFile, rightPaneFile].filter(Boolean) as string[];
    if (paths.length === 0) return;
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const fp of paths) {
        const parts = fp.split("/");
        for (let i = 1; i < parts.length; i++) {
          const ancestor = parts.slice(0, i).join("/");
          if (!next.has(ancestor)) { next.add(ancestor); changed = true; }
        }
      }
      return changed ? next : prev;
    });
  }, [leftPaneFile, rightPaneFile]);

  const sortedTree = useMemo(() => sortTreeNodes(tree, sortField, sortDirection, sortGrouping), [tree, sortField, sortDirection, sortGrouping]);
  const filteredTree = useMemo(() => filterTreeNodes(sortedTree, explorerFilter), [sortedTree, explorerFilter]);

  // Close context menu on outside click / Escape
  useEffect(() => {
    if (!contextMenu) return;
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setContextMenu(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [contextMenu]);

  // Close dot menu on outside click / Escape
  useEffect(() => {
    if (!dotMenuOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (dotMenuRef.current && !dotMenuRef.current.contains(e.target as Node)) {
        setDotMenuOpen(false);
        setSortSubMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setDotMenuOpen(false); setSortSubMenuOpen(false); }
    };
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [dotMenuOpen]);

  // Focus rename input
  useEffect(() => {
    if (editingPath && editInputRef.current) {
      editInputRef.current.focus();
      const dotIndex = editValue.lastIndexOf(".");
      editInputRef.current.setSelectionRange(0, dotIndex > 0 ? dotIndex : editValue.length);
    }
  }, [editingPath]);

  const toggleFolder = useCallback((path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  }, []);

  const handleCreateFile = useCallback(async (parentPath: string = "") => {
    if (parentPath) setExpandedFolders((prev) => new Set(prev).add(parentPath));
    const resultPath = await onCreateFile(parentPath);
    if (resultPath) {
      setEditingPath(resultPath);
      setEditValue(resultPath.split("/").pop() || "untitled.json");
      setEditType("file");
    }
  }, [onCreateFile]);

  const handleCreateFolder = useCallback(async (parentPath: string = "") => {
    if (parentPath) setExpandedFolders((prev) => new Set(prev).add(parentPath));
    const resultPath = await onCreateFolder(parentPath);
    if (resultPath) {
      setExpandedFolders((prev) => new Set(prev).add(resultPath));
      setEditingPath(resultPath);
      setEditValue(resultPath.split("/").pop() || "new-folder");
      setEditType("folder");
    }
  }, [onCreateFolder]);

  const commitRename = useCallback(() => {
    if (!editingPath || !editValue.trim()) {
      setEditingPath(null);
      return;
    }
    const currentName = editingPath.split("/").pop() || "";
    if (editValue.trim() !== currentName) {
      if (editType === "file") {
        onRenameFile(editingPath, editValue.trim());
      } else {
        onRenameFolder(editingPath, editValue.trim());
      }
    }
    setEditingPath(null);
    setEditValue("");
  }, [editingPath, editValue, editType, onRenameFile, onRenameFolder]);

  const startRename = useCallback((path: string, name: string, type: "file" | "folder") => {
    setEditingPath(path);
    setEditValue(name);
    setEditType(type);
    setContextMenu(null);
  }, []);

  // Drag-and-drop handlers
  const handleDragStart = useCallback((e: React.DragEvent, path: string, type: "file" | "folder") => {
    e.dataTransfer.setData("text/plain", JSON.stringify({ path, type }));
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, folderPath: string) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setDragOverPath(folderPath);
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent, folderPath: string) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    setDragOverPath(folderPath);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) setDragOverPath(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetFolderPath: string) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setDragOverPath(null);
    try {
      const data = JSON.parse(e.dataTransfer.getData("text/plain"));
      if (data.path && data.path !== targetFolderPath) {
        onMoveItem(data.path, targetFolderPath);
      }
    } catch { /* invalid drag data */ }
  }, [onMoveItem]);

  // Sort handlers
  const handleSortFieldClick = useCallback((field: SortField) => {
    if (field === sortField) {
      onSortChange(field, sortDirection === "asc" ? "desc" : "asc", sortGrouping);
    } else {
      onSortChange(field, "asc", sortGrouping);
    }
  }, [sortField, sortDirection, sortGrouping, onSortChange]);

  const handleGroupingClick = useCallback((grouping: SortGrouping) => {
    onSortChange(sortField, sortDirection, grouping);
    setDotMenuOpen(false);
    setSortSubMenuOpen(false);
  }, [sortField, sortDirection, onSortChange]);

  const btnClass = "flex items-center gap-2.5 w-full px-3 py-1.5 text-[13px] transition-colors";
  const sortBtnClass = "flex items-center gap-2 w-full px-3 py-1.5 text-[13px] transition-colors text-slate-700 hover:bg-slate-100";

  const renderNode = (node: TreeNode, depth: number) => (
    <TreeNodeRow
      key={node.path}
      node={node}
      depth={depth}
      editingPath={editingPath}
      editValue={editValue}
      expandedFolders={expandedFolders}
      dragOverPath={dragOverPath}
      dirtyFiles={dirtyFiles}
      leftPaneFile={leftPaneFile}
      rightPaneFile={rightPaneFile}
      sortField={sortField}
      sortDirection={sortDirection}
      sortGrouping={sortGrouping}
      editInputRef={editInputRef}
      setEditValue={setEditValue}
      setEditingPath={setEditingPath}
      setContextMenu={setContextMenu}
      toggleFolder={toggleFolder}
      commitRename={commitRename}
      startRename={startRename}
      handleCreateFile={handleCreateFile}
      handleCreateFolder={handleCreateFolder}
      handleDragStart={handleDragStart}
      handleDragOver={handleDragOver}
      handleDragEnter={handleDragEnter}
      handleDragLeave={handleDragLeave}
      handleDrop={handleDrop}
      onSelectFile={onSelectFile}
      onSelectDocument={onSelectDocument}
      onDuplicateFile={onDuplicateFile}
    />
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Toggle header */}
      <button
        onClick={onToggleCollapse}
        className="flex items-center gap-2 px-2.5 py-3 border-b border-slate-200 hover:bg-slate-50 transition-colors"
      >
        {collapsed ? (
          <ChevronRight size={16} className="text-slate-500" />
        ) : (
          <ChevronLeft size={16} className="text-slate-500" />
        )}
        {!collapsed && (
          <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
            Explorer
          </span>
        )}
      </button>

      {/* Content */}
      {!collapsed && (
        <div className="flex-1 flex flex-col min-h-0">
          {!directoryName ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6">
              <FolderOpen size={48} className="text-slate-300" />
              <p className="text-sm text-slate-500 text-center">No folder open</p>
              <button
                onClick={onOpenFolder}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Open Folder
              </button>
            </div>
          ) : (
            <>
              <ExplorerHeader
                directoryName={directoryName}
                isLoading={isLoading}
                dragOverPath={dragOverPath}
                sortField={sortField}
                sortDirection={sortDirection}
                sortGrouping={sortGrouping}
                explorerFilter={explorerFilter}
                onFilterChange={onFilterChange}
                onRefresh={onRefresh}
                dotMenuOpen={dotMenuOpen}
                setDotMenuOpen={setDotMenuOpen}
                sortSubMenuOpen={sortSubMenuOpen}
                setSortSubMenuOpen={setSortSubMenuOpen}
                dotMenuRef={dotMenuRef}
                setContextMenu={setContextMenu}
                handleCreateFile={handleCreateFile}
                handleCreateFolder={handleCreateFolder}
                handleDragOver={handleDragOver}
                handleDragEnter={handleDragEnter}
                handleDragLeave={handleDragLeave}
                handleDrop={handleDrop}
                handleSortFieldClick={handleSortFieldClick}
                handleGroupingClick={handleGroupingClick}
              />

              {/* Tree */}
              <div className="flex-1 overflow-y-auto py-1">
                {isLoading ? (
                  <div className="px-3 py-4 text-xs text-slate-400 text-center">Scanning...</div>
                ) : tree.length === 0 ? (
                  <div className="px-3 py-4 text-xs text-slate-400 text-center">Empty folder</div>
                ) : (
                  filteredTree.map((node) => renderNode(node, 0))
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-[9999] bg-white rounded-lg shadow-lg border border-slate-200 py-1 min-w-[170px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenu.type === "folder" && (
            <>
              <button
                className={`${btnClass} text-slate-700 hover:bg-slate-100`}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => { handleCreateFile(contextMenu.path); setContextMenu(null); }}
              >
                <FilePlus size={15} className="text-slate-500" />
                New Architecture
              </button>
              <button
                className={`${btnClass} text-slate-700 hover:bg-slate-100`}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => { handleCreateFolder(contextMenu.path); setContextMenu(null); }}
              >
                <FolderPlus size={15} className="text-slate-500" />
                New Folder
              </button>
              {contextMenu.path && (
                <>
                  <div className="border-t border-slate-100 my-1" />
                  <button
                    className={`${btnClass} text-slate-700 hover:bg-slate-100`}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => startRename(contextMenu.path, contextMenu.name, "folder")}
                  >
                    <Pencil size={15} className="text-slate-500" />
                    Rename
                  </button>
                  <div className="border-t border-slate-100 my-1" />
                  <button
                    className={`${btnClass} text-slate-700 hover:bg-slate-100`}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => { navigator.clipboard.writeText(contextMenu.name); setContextMenu(null); }}
                  >
                    <Clipboard size={15} className="text-slate-500" />
                    Copy Name
                  </button>
                  <button
                    className={`${btnClass} text-slate-700 hover:bg-slate-100`}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => { navigator.clipboard.writeText(contextMenu.path); setContextMenu(null); }}
                  >
                    <FileSymlink size={15} className="text-slate-500" />
                    Copy Relative Path
                  </button>
                  <button
                    className={`${btnClass} text-slate-700 hover:bg-slate-100`}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => { navigator.clipboard.writeText(directoryName ? directoryName + "/" + contextMenu.path : contextMenu.path); setContextMenu(null); }}
                  >
                    <FolderSymlink size={15} className="text-slate-500" />
                    Copy Path
                  </button>
                  <div className="border-t border-slate-100 my-1" />
                  <button
                    className={`${btnClass} text-red-600 hover:bg-red-50`}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => { onDeleteFolder(contextMenu.path, e); setContextMenu(null); }}
                  >
                    <Trash2 size={15} />
                    Delete
                  </button>
                </>
              )}
            </>
          )}
          {contextMenu.type === "file" && (
            <>
              <button
                className={`${btnClass} text-slate-700 hover:bg-slate-100`}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => startRename(contextMenu.path, contextMenu.name, "file")}
              >
                <Pencil size={15} className="text-slate-500" />
                Rename
              </button>
              <button
                className={`${btnClass} text-slate-700 hover:bg-slate-100`}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => { onDuplicateFile(contextMenu.path); setContextMenu(null); }}
              >
                <Copy size={15} className="text-slate-500" />
                Duplicate
              </button>
              <div className="border-t border-slate-100 my-1" />
              <button
                className={`${btnClass} text-slate-700 hover:bg-slate-100`}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => { navigator.clipboard.writeText(contextMenu.name); setContextMenu(null); }}
              >
                <Clipboard size={15} className="text-slate-500" />
                Copy Name
              </button>
              <button
                className={`${btnClass} text-slate-700 hover:bg-slate-100`}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => { navigator.clipboard.writeText(contextMenu.path); setContextMenu(null); }}
              >
                <FileSymlink size={15} className="text-slate-500" />
                Copy Relative Path
              </button>
              <button
                className={`${btnClass} text-slate-700 hover:bg-slate-100`}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => { navigator.clipboard.writeText(directoryName ? directoryName + "/" + contextMenu.path : contextMenu.path); setContextMenu(null); }}
              >
                <FolderSymlink size={15} className="text-slate-500" />
                Copy Path
              </button>
              <div className="border-t border-slate-100 my-1" />
              <button
                className={`${btnClass} text-red-600 hover:bg-red-50`}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { onDeleteFile(contextMenu.path, e); setContextMenu(null); }}
              >
                <Trash2 size={15} />
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
