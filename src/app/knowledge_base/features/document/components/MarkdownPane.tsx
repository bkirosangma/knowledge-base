"use client";

import React from "react";
import { FileText } from "lucide-react";
import MarkdownEditor from "./MarkdownEditor";
import type { TreeNode } from "../../../shared/hooks/useFileExplorer";
import PaneHeader from "../../../shared/components/PaneHeader";
import PaneTitle from "../../../shared/components/PaneTitle";

interface MarkdownPaneProps {
  filePath: string | null;           // currently open document path
  content: string;                   // raw markdown
  /** Title shown in the pane header — the document's H1 (debounced). Read-only. */
  title: string;
  onChange?: (markdown: string) => void;
  onNavigateLink?: (path: string, section?: string) => void;
  onCreateDocument?: (path: string) => void;
  /** Whether there are unsaved edits — drives dirty dot + Save/Discard state. */
  isDirty?: boolean;
  /** Save current document to disk. */
  onSave?: () => void;
  /** Discard unsaved edits (re-read from disk). */
  onDiscard?: (e: React.MouseEvent) => void;
  existingDocPaths?: Set<string>;
  allDocPaths?: string[];
  tree?: TreeNode[];
  backlinks?: { sourcePath: string; section?: string }[];
  onNavigateBacklink?: (sourcePath: string) => void;
  rightSidebar?: React.ReactNode;
  onBlockChange?: (content: string) => void;
  historyToken?: number;
  /** Whether the editor is in read-only (locked) mode. Controlled by parent. */
  readOnly?: boolean;
  /** Called when the user clicks the read-only toggle in the pane header. */
  onToggleReadOnly?: () => void;
}

export default function MarkdownPane({
  filePath,
  content,
  title,
  onChange,
  onNavigateLink,
  onCreateDocument,
  isDirty,
  onSave,
  onDiscard,
  existingDocPaths,
  allDocPaths,
  tree,
  backlinks = [],
  onNavigateBacklink,
  rightSidebar,
  onBlockChange,
  historyToken,
  readOnly = false,
  onToggleReadOnly,
}: MarkdownPaneProps) {
  const [showBacklinks, setShowBacklinks] = React.useState(false);

  if (!filePath) {
    return (
      <div className="flex h-full">
        <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
          <FileText size={48} strokeWidth={1} />
          <p className="mt-3 text-sm">No document selected</p>
          <p className="text-xs mt-1">Select a .md file from the explorer or click an element&apos;s &#9432; badge</p>
        </div>
        {rightSidebar}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">
      <PaneHeader
        filePath={filePath}
        readOnly={readOnly}
        onToggleReadOnly={onToggleReadOnly ?? (() => {})}
      >
        {backlinks.length > 0 && (
          <button
            onClick={() => setShowBacklinks(!showBacklinks)}
            className="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600"
          >
            {backlinks.length} reference{backlinks.length !== 1 ? "s" : ""}
          </button>
        )}
      </PaneHeader>

      {/* Title row — derived H1 (read-only) + save / discard */}
      <PaneTitle
        title={title}
        isDirty={isDirty}
        hasActiveFile={!!filePath}
        onSave={onSave}
        onDiscard={onDiscard}
      />

      {/* Backlinks dropdown */}
      {showBacklinks && backlinks.length > 0 && (
        <div className="mx-4 mb-2 p-2 bg-slate-50 rounded border border-slate-200 text-xs">
          <div className="font-medium text-slate-500 mb-1">Referenced by:</div>
          {backlinks.map((bl, i) => (
            <button
              key={i}
              onClick={() => onNavigateBacklink?.(bl.sourcePath)}
              className="block w-full text-left px-2 py-1 rounded hover:bg-white text-blue-600 truncate"
            >
              {bl.sourcePath}{bl.section ? ` #${bl.section}` : ""}
            </button>
          ))}
        </div>
      )}

      {/* Editor */}
      <div className="flex-1 min-h-0">
        <MarkdownEditor
          content={content}
          onChange={onChange}
          onBlockChange={onBlockChange}
          historyToken={historyToken}
          onNavigateLink={onNavigateLink}
          onCreateDocument={onCreateDocument}
          existingDocPaths={existingDocPaths}
          allDocPaths={allDocPaths}
          tree={tree}
          currentDocDir={filePath.split("/").slice(0, -1).join("/")}
          readOnly={readOnly}
          rightSidebar={rightSidebar}
        />
      </div>
    </div>
  );
}
