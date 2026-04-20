"use client";

import React from "react";
import {
  ChevronDown, ChevronRight,
  Folder, FileText, FileJson,
  FilePlus, FolderPlus, Pencil, Copy,
} from "lucide-react";
import type { TreeNode } from "../../hooks/useFileExplorer";
import type { SortField, SortDirection, SortGrouping } from "./ExplorerPanel";
import { sortTreeNodes } from "./explorerTreeUtils";

export interface ContextMenuState {
  x: number;
  y: number;
  type: "file" | "folder";
  path: string;
  name: string;
}

export interface TreeNodeRowProps {
  node: TreeNode;
  depth: number;

  // Per-row state reads
  editingPath: string | null;
  editValue: string;
  expandedFolders: Set<string>;
  dragOverPath: string | null;
  rightClickedPath: string | null;
  dirtyFiles: Set<string>;
  leftPaneFile: string | null;
  rightPaneFile: string | null;

  // Sort state (for recursive child ordering)
  sortField: SortField;
  sortDirection: SortDirection;
  sortGrouping: SortGrouping;

  // Refs
  editInputRef: React.RefObject<HTMLInputElement | null>;

  // Setters
  setEditValue: (v: string) => void;
  setEditingPath: (p: string | null) => void;
  setContextMenu: (m: ContextMenuState | null) => void;

  // Actions
  toggleFolder: (path: string) => void;
  commitRename: () => void;
  startRename: (path: string, name: string, type: "file" | "folder") => void;
  handleCreateFile: (parentPath?: string) => void;
  handleCreateDocument: (parentPath?: string) => void;
  handleCreateFolder: (parentPath?: string) => void;
  handleDragStart: (e: React.DragEvent, path: string, type: "file" | "folder") => void;
  handleDragOver: (e: React.DragEvent, folderPath: string) => void;
  handleDragEnter: (e: React.DragEvent, folderPath: string) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent, targetFolderPath: string) => void;
  onSelectFile: (path: string) => void;
  onSelectDocument?: (path: string) => void;
  onDuplicateFile: (path: string) => void;
}

/** Hover action button helper — slides in on row hover. */
function HoverBtn({
  onClick,
  title,
  children,
}: {
  onClick: (e: React.MouseEvent) => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      className="p-0.5 rounded hover:bg-slate-200 opacity-0 group-hover:opacity-100 transition-opacity"
      title={title}
      onClick={(e) => { e.stopPropagation(); onClick(e); }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {children}
    </button>
  );
}

/**
 * Recursive tree renderer. Renders one file or folder row; folders render
 * their sorted children as nested `<TreeNodeRow>`s when expanded.
 */
export default function TreeNodeRow(props: TreeNodeRowProps) {
  const {
    node,
    depth,
    editingPath,
    editValue,
    expandedFolders,
    dragOverPath,
    rightClickedPath,
    dirtyFiles,
    leftPaneFile,
    rightPaneFile,
    sortField,
    sortDirection,
    sortGrouping,
    editInputRef,
    setEditValue,
    setEditingPath,
    setContextMenu,
    toggleFolder,
    commitRename,
    startRename,
    handleCreateFile,
    handleCreateDocument,
    handleCreateFolder,
    handleDragStart,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
    onSelectFile,
    onSelectDocument,
    onDuplicateFile,
  } = props;

  const isEditing = editingPath === node.path;
  const indent = depth * 16;
  const isDragOver = dragOverPath === node.path;
  const isRightClicked = rightClickedPath === node.path;

  if (node.type === "folder") {
    const isExpanded = expandedFolders.has(node.path);
    return (
      <div key={node.path}>
        <div
          data-tree-node
          className={`group flex items-center gap-1 py-1 cursor-pointer text-xs text-slate-700 select-none ${
            isDragOver ? "bg-blue-50 outline outline-1 outline-blue-300 outline-dashed" :
            isRightClicked ? "bg-slate-100" : "hover:bg-slate-50"
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
                <HoverBtn onClick={() => handleCreateFile(node.path)} title="New Diagram">
                  <FilePlus size={13} className="text-slate-400 hover:text-slate-600" />
                </HoverBtn>
                <HoverBtn onClick={() => handleCreateDocument(node.path)} title="New Document">
                  <FileText size={13} className="text-slate-400 hover:text-slate-600" />
                </HoverBtn>
                <HoverBtn onClick={() => handleCreateFolder(node.path)} title="New Folder">
                  <FolderPlus size={13} className="text-slate-400 hover:text-slate-600" />
                </HoverBtn>
                <HoverBtn onClick={() => startRename(node.path, node.name, "folder")} title="Rename">
                  <Pencil size={13} className="text-slate-400 hover:text-slate-600" />
                </HoverBtn>
              </div>
            </>
          )}
        </div>
        {isExpanded && node.children && sortTreeNodes(node.children, sortField, sortDirection, sortGrouping).map((child) => (
          <TreeNodeRow key={child.path} {...props} node={child} depth={depth + 1} />
        ))}
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
          {node.fileType === "document"
            ? <FileText size={16} className="text-emerald-500 flex-shrink-0" />
            : <FileJson size={16} className="text-blue-500 flex-shrink-0" />
          }
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
          data-tree-node
          className={`group w-full flex items-center gap-1.5 py-1 text-left text-xs transition-colors cursor-pointer ${
            leftPaneFile === node.path && rightPaneFile === node.path
              ? "bg-gradient-to-r from-blue-50 to-green-50 text-blue-600"
              : leftPaneFile === node.path
                ? "bg-blue-50 text-blue-600"
                : rightPaneFile === node.path
                  ? "bg-green-50 text-green-600"
                  : "text-slate-700 hover:bg-slate-50"
          } ${dirty ? "font-semibold" : ""}`}
          style={{ paddingLeft: indent + 22 }}
          onClick={() => {
            if (node.fileType === "document" && onSelectDocument) {
              onSelectDocument(node.path);
            } else {
              onSelectFile(node.path);
            }
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setContextMenu({ x: e.clientX, y: e.clientY, type: "file", path: node.path, name: node.name });
          }}
          draggable
          onDragStart={(e) => handleDragStart(e, node.path, "file")}
        >
          {node.fileType === "document"
            ? <FileText size={16} className="text-emerald-500 flex-shrink-0" />
            : <FileJson size={16} className="text-blue-500 flex-shrink-0" />
          }
          <span className="truncate flex-1">{dirty ? "* " : ""}{node.name}</span>
          <div className="ml-auto flex items-center gap-0.5 pr-1">
            <HoverBtn onClick={() => startRename(node.path, node.name, "file")} title="Rename">
              <Pencil size={13} className="text-slate-400 hover:text-slate-600" />
            </HoverBtn>
            <HoverBtn onClick={() => onDuplicateFile(node.path)} title="Duplicate">
              <Copy size={13} className="text-slate-400 hover:text-slate-600" />
            </HoverBtn>
          </div>
        </div>
      )}
    </div>
  );
}
