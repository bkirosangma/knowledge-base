"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  ChevronLeft, ChevronRight, FolderOpen,
  FilePlus, FolderPlus, FileText, FileImage, Trash2, Pencil, Copy, Clipboard, FileSymlink, FolderSymlink,
  X, ChevronDown,
} from "lucide-react";
import type { TreeNode } from "../../hooks/useFileExplorer";
import type { ExplorerFilter } from "../../utils/types";
import { sortTreeNodes, filterTreeNodes } from "./explorerTreeUtils";
import TreeNodeRow, { type ContextMenuState } from "./TreeNodeRow";
import ExplorerHeader from "./ExplorerHeader";

export type SortField = "name" | "created" | "modified";
export type SortDirection = "asc" | "desc";
export type SortGrouping = "folders-first" | "files-first" | "mixed";


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
  onCreateDocument: (parentPath: string) => Promise<string | null>;
  onCreateSVG: (parentPath: string) => Promise<string | null>;
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
  recentFiles?: string[];
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
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
  onCreateDocument,
  onCreateSVG,
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
  recentFiles = [],
  searchInputRef,
}: ExplorerPanelProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const editValueRef = useRef(editValue);
  editValueRef.current = editValue;
  const [editType, setEditType] = useState<"file" | "folder">("file");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);
  const [dotMenuOpen, setDotMenuOpen] = useState(false);
  const [sortSubMenuOpen, setSortSubMenuOpen] = useState(false);
  const [newSubMenuOpen, setNewSubMenuOpen] = useState(false);
  const [selectedFolderPath, setSelectedFolderPath] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const dotMenuRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  // ─── Search ───
  const [searchQuery, setSearchQuery] = useState("");
  const internalSearchRef = useRef<HTMLInputElement>(null);
  const resolvedSearchRef = searchInputRef ?? internalSearchRef;

  // ─── Recents collapse (not persisted — resets to open on reload) ───
  const [recentsCollapsed, setRecentsCollapsed] = useState(false);

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

  // ─── Search: flat list of all file paths ───
  const allFilePaths = useMemo(() => {
    const paths: string[] = [];
    function walk(nodes: TreeNode[]) {
      for (const n of nodes) {
        if (n.type === "file") paths.push(n.path);
        if (n.children) walk(n.children);
      }
    }
    walk(tree);
    return paths;
  }, [tree]);

  // Filter out stale recents (paths that no longer exist after rename/delete)
  const validRecentFiles = useMemo(
    () => recentFiles.filter((p) => allFilePaths.includes(p)),
    [recentFiles, allFilePaths]
  );

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.trim().toLowerCase();
    return allFilePaths.filter((p) => p.toLowerCase().includes(q));
  }, [searchQuery, allFilePaths]);

  // ─── Dirty files as array ───
  const dirtyFilesArray = useMemo(() => Array.from(dirtyFiles), [dirtyFiles]);

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

  const handleCreateDocument = useCallback(async (parentPath: string = "") => {
    if (parentPath) setExpandedFolders((prev) => new Set(prev).add(parentPath));
    const resultPath = await onCreateDocument(parentPath);
    if (resultPath) {
      setEditingPath(resultPath);
      setEditValue(resultPath.split("/").pop() || "untitled.md");
      setEditType("file");
    }
  }, [onCreateDocument]);

  const handleCreateSVG = useCallback(async (parentPath: string = "") => {
    if (parentPath) setExpandedFolders((prev) => new Set(prev).add(parentPath));
    const resultPath = await onCreateSVG(parentPath);
    if (resultPath) {
      setEditingPath(resultPath);
      setEditValue(resultPath.split("/").pop() || "untitled.svg");
      setEditType("file");
    }
  }, [onCreateSVG]);

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
    const val = editInputRef.current?.value ?? editValueRef.current;
    if (!editingPath || !val.trim()) {
      setEditingPath(null);
      return;
    }
    const currentName = editingPath.split("/").pop() || "";
    if (val.trim() !== currentName) {
      if (editType === "file") {
        onRenameFile(editingPath, val.trim());
      } else {
        onRenameFolder(editingPath, val.trim());
      }
    }
    setEditingPath(null);
    setEditValue("");
  }, [editingPath, editType, onRenameFile, onRenameFolder]);

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

  const renderNode = (node: TreeNode, depth: number) => (
    <TreeNodeRow
      key={node.path}
      node={node}
      depth={depth}
      editingPath={editingPath}
      editValue={editValue}
      expandedFolders={expandedFolders}
      dragOverPath={dragOverPath}
      selectedFolderPath={selectedFolderPath}
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
      onSelectFolder={setSelectedFolderPath}
      toggleFolder={toggleFolder}
      commitRename={commitRename}
      startRename={startRename}
      handleCreateFile={handleCreateFile}
      handleCreateDocument={handleCreateDocument}
      handleCreateSVG={handleCreateSVG}
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
        className="flex items-center gap-2 px-2.5 py-3 border-b border-line hover:bg-surface-2 transition-colors"
        aria-label={collapsed ? "Expand Explorer" : "Collapse Explorer"}
        aria-expanded={!collapsed}
      >
        {collapsed ? (
          <ChevronRight size={16} className="text-mute" />
        ) : (
          <ChevronLeft size={16} className="text-mute" />
        )}
        {!collapsed && (
          <span className="text-xs font-bold text-ink-2 uppercase tracking-wider">
            Explorer
          </span>
        )}
      </button>

      {/* Content */}
      {!collapsed && (
        <div className="flex-1 flex flex-col min-h-0">
          {!directoryName ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6">
              <FolderOpen size={48} className="text-mute opacity-60" />
              <p className="text-sm text-mute text-center">No folder open</p>
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
                selectedFolderPath={selectedFolderPath}
                handleCreateFile={handleCreateFile}
                handleCreateDocument={handleCreateDocument}
                handleCreateFolder={handleCreateFolder}
                handleDragOver={handleDragOver}
                handleDragEnter={handleDragEnter}
                handleDragLeave={handleDragLeave}
                handleDrop={handleDrop}
                handleSortFieldClick={handleSortFieldClick}
                handleGroupingClick={handleGroupingClick}
              />

              {/* Search input */}
              <div className="px-2 py-1.5 border-b border-line">
                <div className="relative flex items-center">
                  <input
                    ref={resolvedSearchRef}
                    data-testid="explorer-search"
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search files… ⌘F"
                    aria-label="Search files"
                    className="w-full pl-2 pr-7 py-1 text-xs bg-surface-2 rounded border border-transparent focus:border-blue-400 focus:bg-surface outline-none text-ink-2 placeholder-mute transition-colors"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-1.5 text-mute hover:text-ink-2 transition-colors"
                      aria-label="Clear search"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>

              {/* Scrollable content: Recents + Unsaved + Tree */}
              <div
                className="flex-1 overflow-y-auto"
                onContextMenu={(e) => {
                  if (e.target === e.currentTarget || (e.target as HTMLElement).closest('[data-tree-node]') === null) {
                    e.preventDefault();
                    setSelectedFolderPath(null);
                    setContextMenu({ x: e.clientX, y: e.clientY, type: "folder", path: "", name: directoryName! });
                  }
                }}
              >
                {/* Recents group — hidden when empty, shown above tree */}
                {!searchResults && validRecentFiles.length > 0 && (
                  <div className="border-b border-line">
                    <button
                      className="flex items-center gap-1 w-full px-2 py-1 text-[11px] font-semibold text-mute uppercase tracking-wider hover:bg-surface-2 transition-colors"
                      onClick={() => setRecentsCollapsed((c) => !c)}
                    >
                      <ChevronDown
                        size={12}
                        className={`transition-transform ${recentsCollapsed ? "-rotate-90" : ""}`}
                      />
                      Recents
                    </button>
                    {!recentsCollapsed && (
                      <div className="pb-1">
                        {validRecentFiles.map((path) => {
                          const name = path.split("/").pop() ?? path;
                          const isActive = leftPaneFile === path || rightPaneFile === path;
                          return (
                            <button
                              key={path}
                              className={`flex items-center w-full px-3 py-0.5 text-xs text-left truncate hover:bg-surface-2 transition-colors ${isActive ? "text-accent font-medium" : "text-ink-2"}`}
                              title={path}
                              onClick={() => onSelectFile(path)}
                            >
                              {name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Unsaved group — always visible when non-empty */}
                {!searchResults && dirtyFilesArray.length > 0 && (
                  <div className="border-b border-line">
                    <div className="flex items-center gap-1 w-full px-2 py-1 text-[11px] font-semibold text-amber-600 uppercase tracking-wider">
                      Unsaved changes
                    </div>
                    <div className="pb-1">
                      {dirtyFilesArray.map((path) => {
                        const name = path.split("/").pop() ?? path;
                        const isActive = leftPaneFile === path || rightPaneFile === path;
                        return (
                          <button
                            key={path}
                            className={`flex items-center w-full px-3 py-0.5 text-xs text-left truncate hover:bg-amber-50 transition-colors ${isActive ? "text-amber-700 font-semibold" : "text-amber-600"}`}
                            title={path}
                            onClick={() => onSelectFile(path)}
                          >
                            {name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Search results (flat) or normal tree */}
                {searchResults !== null ? (
                  <div className="py-1" data-testid="explorer-search-results">
                    {searchResults.length === 0 ? (
                      <div className="px-3 py-4 text-xs text-mute text-center">No files match</div>
                    ) : (
                      searchResults.map((path) => {
                        const name = path.split("/").pop() ?? path;
                        const isActive = leftPaneFile === path || rightPaneFile === path;
                        return (
                          <button
                            key={path}
                            className={`flex flex-col w-full px-3 py-1 text-left hover:bg-surface-2 transition-colors ${isActive ? "bg-blue-50" : ""}`}
                            onClick={() => onSelectFile(path)}
                          >
                            <span className={`text-xs font-medium truncate ${isActive ? "text-accent" : "text-ink-2"}`}>{name}</span>
                            <span className="text-[10px] text-mute truncate">{path}</span>
                          </button>
                        );
                      })
                    )}
                  </div>
                ) : (
                  <div className="py-1" data-testid="explorer-tree">
                    {isLoading ? (
                      <div className="px-3 py-4 text-xs text-mute text-center">Scanning...</div>
                    ) : tree.length === 0 ? (
                      <div className="px-3 py-4 text-xs text-mute text-center">Empty folder</div>
                    ) : (
                      filteredTree.map((node) => renderNode(node, 0))
                    )}
                  </div>
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
          className="fixed z-[9999] bg-surface rounded-lg shadow-lg border border-line py-1 min-w-[170px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenu.type === "folder" && (
            <>
              <div
                className="relative"
                onMouseEnter={() => setNewSubMenuOpen(true)}
                onMouseLeave={() => setNewSubMenuOpen(false)}
              >
                <button
                  className={`${btnClass} justify-between text-ink-2 hover:bg-surface-2`}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <span className="flex items-center gap-2.5">
                    <FilePlus size={15} className="text-mute" />
                    New
                  </span>
                  <ChevronRight size={13} className="text-mute" />
                </button>
                {newSubMenuOpen && (
                  <div
                    className="absolute left-full top-0 ml-0.5 z-[9999] bg-surface rounded-lg shadow-lg border border-line py-1 min-w-[160px]"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <button
                      className={`${btnClass} text-ink-2 hover:bg-surface-2`}
                      onClick={() => { handleCreateFile(contextMenu.path); setContextMenu(null); setNewSubMenuOpen(false); }}
                    >
                      <FilePlus size={15} className="text-mute" />
                      Diagram
                    </button>
                    <button
                      className={`${btnClass} text-ink-2 hover:bg-surface-2`}
                      onClick={() => { handleCreateDocument(contextMenu.path); setContextMenu(null); setNewSubMenuOpen(false); }}
                    >
                      <FileText size={15} className="text-mute" />
                      Document
                    </button>
                    <button
                      className={`${btnClass} text-ink-2 hover:bg-surface-2`}
                      onClick={() => { handleCreateSVG(contextMenu.path); setContextMenu(null); setNewSubMenuOpen(false); }}
                    >
                      <FileImage size={15} className="text-mute" />
                      SVG
                    </button>
                    <button
                      className={`${btnClass} text-ink-2 hover:bg-surface-2`}
                      onClick={() => { handleCreateFolder(contextMenu.path); setContextMenu(null); setNewSubMenuOpen(false); }}
                    >
                      <FolderPlus size={15} className="text-mute" />
                      Folder
                    </button>
                  </div>
                )}
              </div>
              {contextMenu.path && (
                <>
                  <div className="border-t border-line my-1" />
                  <button
                    className={`${btnClass} text-ink-2 hover:bg-surface-2`}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => startRename(contextMenu.path, contextMenu.name, "folder")}
                  >
                    <Pencil size={15} className="text-mute" />
                    Rename
                  </button>
                  <div className="border-t border-line my-1" />
                  <button
                    className={`${btnClass} text-ink-2 hover:bg-surface-2`}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => { navigator.clipboard.writeText(contextMenu.name); setContextMenu(null); }}
                  >
                    <Clipboard size={15} className="text-mute" />
                    Copy Name
                  </button>
                  <button
                    className={`${btnClass} text-ink-2 hover:bg-surface-2`}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => { navigator.clipboard.writeText(contextMenu.path); setContextMenu(null); }}
                  >
                    <FileSymlink size={15} className="text-mute" />
                    Copy Relative Path
                  </button>
                  <button
                    className={`${btnClass} text-ink-2 hover:bg-surface-2`}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => { navigator.clipboard.writeText(directoryName ? directoryName + "/" + contextMenu.path : contextMenu.path); setContextMenu(null); }}
                  >
                    <FolderSymlink size={15} className="text-mute" />
                    Copy Path
                  </button>
                  <div className="border-t border-line my-1" />
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
                className={`${btnClass} text-ink-2 hover:bg-surface-2`}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => startRename(contextMenu.path, contextMenu.name, "file")}
              >
                <Pencil size={15} className="text-mute" />
                Rename
              </button>
              <button
                className={`${btnClass} text-ink-2 hover:bg-surface-2`}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => { onDuplicateFile(contextMenu.path); setContextMenu(null); }}
              >
                <Copy size={15} className="text-mute" />
                Duplicate
              </button>
              <div className="border-t border-line my-1" />
              <button
                className={`${btnClass} text-ink-2 hover:bg-surface-2`}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => { navigator.clipboard.writeText(contextMenu.name); setContextMenu(null); }}
              >
                <Clipboard size={15} className="text-mute" />
                Copy Name
              </button>
              <button
                className={`${btnClass} text-ink-2 hover:bg-surface-2`}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => { navigator.clipboard.writeText(contextMenu.path); setContextMenu(null); }}
              >
                <FileSymlink size={15} className="text-mute" />
                Copy Relative Path
              </button>
              <button
                className={`${btnClass} text-ink-2 hover:bg-surface-2`}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => { navigator.clipboard.writeText(directoryName ? directoryName + "/" + contextMenu.path : contextMenu.path); setContextMenu(null); }}
              >
                <FolderSymlink size={15} className="text-mute" />
                Copy Path
              </button>
              <div className="border-t border-line my-1" />
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
