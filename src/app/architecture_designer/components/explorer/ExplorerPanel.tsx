"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  ChevronLeft, ChevronRight, ChevronDown, FolderOpen, Folder, FileJson,
  RefreshCw, FilePlus, FolderPlus, Trash2, Pencil, Copy,
  EllipsisVertical, ArrowUp, ArrowDown, Check,
} from "lucide-react";
import type { TreeNode } from "../../hooks/useFileExplorer";

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
  activeFile: string | null;
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
}

/* ── Sorting utility ── */

function sortTree(nodes: TreeNode[], field: SortField, direction: SortDirection, grouping: SortGrouping): TreeNode[] {
  const compare = (a: TreeNode, b: TreeNode): number => {
    let result: number;
    if (field === "name") {
      result = a.name.localeCompare(b.name);
    } else {
      // Both "created" and "modified" use lastModified (only timestamp available from File API)
      result = (a.lastModified ?? 0) - (b.lastModified ?? 0);
    }
    return direction === "desc" ? -result : result;
  };

  const sorted = [...nodes].map((n) =>
    n.type === "folder" && n.children
      ? { ...n, children: sortTree(n.children, field, direction, grouping) }
      : n,
  );

  if (grouping === "folders-first") {
    const folders = sorted.filter((n) => n.type === "folder").sort(compare);
    const files = sorted.filter((n) => n.type === "file").sort(compare);
    return [...folders, ...files];
  } else if (grouping === "files-first") {
    const files = sorted.filter((n) => n.type === "file").sort(compare);
    const folders = sorted.filter((n) => n.type === "folder").sort(compare);
    return [...files, ...folders];
  } else {
    return sorted.sort(compare);
  }
}

export default function ExplorerPanel({
  collapsed,
  onToggleCollapse,
  directoryName,
  tree,
  activeFile,
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

  const sortedTree = useMemo(() => sortTree(tree, sortField, sortDirection, sortGrouping), [tree, sortField, sortDirection, sortGrouping]);

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

  // Hover action button helper
  const hoverBtn = (onClick: (e: React.MouseEvent) => void, title: string, children: React.ReactNode) => (
    <button
      className="p-0.5 rounded hover:bg-slate-200 opacity-0 group-hover:opacity-100 transition-opacity"
      title={title}
      onClick={(e) => { e.stopPropagation(); onClick(e); }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {children}
    </button>
  );

  // Recursive tree item renderer
  const renderNode = (node: TreeNode, depth: number) => {
    const isEditing = editingPath === node.path;
    const indent = depth * 16;
    const isDragOver = dragOverPath === node.path;

    if (node.type === "folder") {
      const isExpanded = expandedFolders.has(node.path);
      return (
        <div key={node.path}>
          <div
            className={`group flex items-center gap-1 py-1 cursor-pointer hover:bg-slate-50 text-xs text-slate-700 select-none ${
              isDragOver ? "bg-blue-50 outline outline-1 outline-blue-300 outline-dashed" : ""
            }`}
            style={{ paddingLeft: indent + 8 }}
            onClick={() => toggleFolder(node.path)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setContextMenu({ x: e.clientX, y: e.clientY, type: "folder", path: node.path, name: node.name });
            }}
            draggable={!isEditing}
            onDragStart={(e) => handleDragStart(e, node.path, "folder")}
            onDragOver={(e) => handleDragOver(e, node.path)}
            onDragEnter={(e) => handleDragEnter(e, node.path)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, node.path)}
          >
            {isExpanded ? (
              <ChevronDown size={14} className="text-slate-400 flex-shrink-0" />
            ) : (
              <ChevronRight size={14} className="text-slate-400 flex-shrink-0" />
            )}
            <Folder size={16} className="text-amber-500 flex-shrink-0" />
            {isEditing ? (
              <input
                ref={editInputRef}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") { setEditingPath(null); setEditValue(""); }
                }}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 text-xs px-1 py-0.5 border border-blue-400 rounded outline-none bg-white min-w-0"
              />
            ) : (
              <>
                <span className="truncate flex-1">{node.name}</span>
                <div className="ml-auto flex items-center gap-0.5 pr-1">
                  {hoverBtn(() => handleCreateFile(node.path), "New Architecture", <FilePlus size={13} className="text-slate-400 hover:text-slate-600" />)}
                  {hoverBtn(() => handleCreateFolder(node.path), "New Folder", <FolderPlus size={13} className="text-slate-400 hover:text-slate-600" />)}
                  {hoverBtn(() => startRename(node.path, node.name, "folder"), "Rename", <Pencil size={13} className="text-slate-400 hover:text-slate-600" />)}
                </div>
              </>
            )}
          </div>
          {isExpanded && node.children && sortTree(node.children, sortField, sortDirection, sortGrouping).map((child) => renderNode(child, depth + 1))}
        </div>
      );
    }

    // File node
    const dirty = dirtyFiles.has(node.path);
    return (
      <div key={node.path}>
        {isEditing ? (
          <div
            className="flex items-center gap-1.5 py-1"
            style={{ paddingLeft: indent + 22 }}
          >
            <FileJson size={16} className="text-blue-500 flex-shrink-0" />
            <input
              ref={editInputRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") { setEditingPath(null); setEditValue(""); }
              }}
              className="flex-1 text-xs px-1 py-0.5 border border-blue-400 rounded outline-none bg-white min-w-0"
            />
          </div>
        ) : (
          <div
            className={`group w-full flex items-center gap-1.5 py-1 text-left text-xs transition-colors cursor-pointer ${
              activeFile === node.path
                ? "bg-blue-50 text-blue-600"
                : "text-slate-700 hover:bg-slate-50"
            } ${dirty ? "font-semibold" : ""}`}
            style={{ paddingLeft: indent + 22 }}
            onClick={() => onSelectFile(node.path)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setContextMenu({ x: e.clientX, y: e.clientY, type: "file", path: node.path, name: node.name });
            }}
            draggable
            onDragStart={(e) => handleDragStart(e, node.path, "file")}
          >
            <FileJson size={16} className="text-blue-500 flex-shrink-0" />
            <span className="truncate flex-1">{dirty ? "* " : ""}{node.name}</span>
            <div className="ml-auto flex items-center gap-0.5 pr-1">
              {hoverBtn(() => startRename(node.path, node.name, "file"), "Rename", <Pencil size={13} className="text-slate-400 hover:text-slate-600" />)}
              {hoverBtn(() => onDuplicateFile(node.path), "Duplicate", <Copy size={13} className="text-slate-400 hover:text-slate-600" />)}
            </div>
          </div>
        )}
      </div>
    );
  };

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
              {/* Directory header — also a drop target for moving to root */}
              <div
                className={`flex items-center gap-1.5 px-3 py-2 border-b border-slate-100 relative ${
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
                <Folder size={16} className="text-amber-500 flex-shrink-0" />
                <span className="text-xs font-semibold text-slate-700 truncate flex-1">
                  {directoryName}
                </span>
                <button
                  onClick={() => handleCreateFile("")}
                  className="p-1 hover:bg-slate-100 rounded transition-colors flex-shrink-0"
                  title="New Architecture"
                >
                  <FilePlus size={14} className="text-slate-500" />
                </button>
                <button
                  onClick={() => handleCreateFolder("")}
                  className="p-1 hover:bg-slate-100 rounded transition-colors flex-shrink-0"
                  title="New Folder"
                >
                  <FolderPlus size={14} className="text-slate-500" />
                </button>
                <button
                  onClick={onRefresh}
                  className="p-1 hover:bg-slate-100 rounded transition-colors flex-shrink-0"
                  title="Refresh"
                >
                  <RefreshCw size={14} className={`text-slate-500 ${isLoading ? "animate-spin" : ""}`} />
                </button>
                <button
                  onClick={() => { setDotMenuOpen((v) => !v); setSortSubMenuOpen(false); }}
                  className="p-1 hover:bg-slate-100 rounded transition-colors flex-shrink-0"
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

              {/* Tree */}
              <div className="flex-1 overflow-y-auto py-1">
                {isLoading ? (
                  <div className="px-3 py-4 text-xs text-slate-400 text-center">Scanning...</div>
                ) : tree.length === 0 ? (
                  <div className="px-3 py-4 text-xs text-slate-400 text-center">Empty folder</div>
                ) : (
                  sortedTree.map((node) => renderNode(node, 0))
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
