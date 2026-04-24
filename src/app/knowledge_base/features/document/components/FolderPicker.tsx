"use client";
import React, { useState } from "react";
import { ArrowLeft, Folder, FileText, Workflow, ChevronRight } from "lucide-react";
import type { TreeNode } from "../../../shared/utils/fileTree";

interface FolderPickerProps {
  tree: TreeNode[];
  /** Folder path to open initially (e.g. "docs/notes" or "" for root). */
  startPath: string;
  onSelect: (path: string) => void;
}

function getChildrenAt(tree: TreeNode[], folderPath: string): TreeNode[] {
  if (!folderPath) return tree;
  const parts = folderPath.split("/");
  let nodes: TreeNode[] = tree;
  for (const part of parts) {
    const found = nodes.find((n) => n.type === "folder" && n.name === part);
    if (!found || !found.children) return [];
    nodes = found.children;
  }
  return nodes;
}

export function FolderPicker({ tree, startPath, onSelect }: FolderPickerProps) {
  const [currentPath, setCurrentPath] = useState(startPath);
  const children = getChildrenAt(tree, currentPath);
  const folders = children.filter((n) => n.type === "folder");
  const files = children.filter((n) => n.type === "file");
  const pathParts = currentPath ? currentPath.split("/") : [];
  const folderLabel = pathParts.length > 0 ? pathParts[pathParts.length - 1] : "Root";
  const canGoUp = currentPath !== "";

  return (
    <div className="w-full max-h-56 overflow-y-auto rounded-md border border-slate-200 bg-white text-xs">
      <div className="sticky top-0 flex items-center gap-1.5 px-2 py-1.5 bg-slate-50 border-b border-slate-100">
        {canGoUp && (
          <button
            type="button"
            className="shrink-0 text-slate-400 hover:text-slate-700 p-0.5 rounded hover:bg-slate-200"
            onMouseDown={(e) => {
              e.preventDefault();
              setCurrentPath(pathParts.slice(0, -1).join("/"));
            }}
          >
            <ArrowLeft size={11} />
          </button>
        )}
        <span className="truncate font-medium text-slate-600">{folderLabel}</span>
      </div>

      {folders.map((n) => (
        <div
          key={n.path}
          className="flex items-center gap-1.5 px-2.5 py-1.5 cursor-pointer hover:bg-slate-50 text-slate-700 select-none"
          onMouseDown={(e) => {
            e.preventDefault();
            setCurrentPath(n.path);
          }}
        >
          <Folder size={11} className="shrink-0 text-amber-400" />
          <span className="flex-1 truncate">{n.name}</span>
          <ChevronRight size={10} className="shrink-0 text-slate-300" />
        </div>
      ))}

      {files.map((n) => (
        <div
          key={n.path}
          className="flex items-center gap-1.5 px-2.5 py-1.5 cursor-pointer hover:bg-blue-50 text-slate-700 select-none"
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(n.path);
          }}
        >
          {n.fileType === "diagram" ? (
            <Workflow size={11} className="shrink-0 text-blue-500" />
          ) : (
            <FileText size={11} className="shrink-0 text-green-600" />
          )}
          <span className="flex-1 truncate">{n.name}</span>
        </div>
      ))}

      {folders.length === 0 && files.length === 0 && (
        <p className="px-3 py-2 text-slate-400 italic">Empty folder</p>
      )}
    </div>
  );
}
