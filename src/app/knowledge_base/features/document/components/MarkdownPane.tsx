// src/app/knowledge_base/components/MarkdownPane.tsx
"use client";

import React, { useState } from "react";
import { FileText, ChevronRight, Lock, LockOpen } from "lucide-react";
import MarkdownEditor from "./MarkdownEditor";

interface MarkdownPaneProps {
  filePath: string | null;           // currently open document path
  content: string;                   // raw markdown
  title: string;                     // document title (derived from filename)
  onChange?: (markdown: string) => void;
  onNavigateLink?: (path: string, section?: string) => void;
  onCreateDocument?: (path: string) => void;
  onTitleChange?: (newTitle: string) => void;
  existingDocPaths?: Set<string>;
  allDocPaths?: string[];
  backlinks?: { sourcePath: string; section?: string }[];
  onNavigateBacklink?: (sourcePath: string) => void;
  rightSidebar?: React.ReactNode;
}

export default function MarkdownPane({
  filePath,
  content,
  title,
  onChange,
  onNavigateLink,
  onCreateDocument,
  onTitleChange,
  existingDocPaths,
  allDocPaths,
  backlinks = [],
  onNavigateBacklink,
  rightSidebar,
}: MarkdownPaneProps) {
  const [showBacklinks, setShowBacklinks] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(title);
  const [readOnly, setReadOnly] = useState(false);

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

  // Breadcrumb from file path
  const pathParts = filePath.split("/");

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 bg-white">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-xs text-slate-400">
          {pathParts.map((part, i) => (
            <React.Fragment key={i}>
              {i > 0 && <ChevronRight size={10} />}
              <span className={i === pathParts.length - 1 ? "text-slate-700 font-medium" : ""}>
                {part}
              </span>
            </React.Fragment>
          ))}
        </div>

        <div className="flex-1" />

        {/* Read Mode toggle */}
        <button
          onClick={() => setReadOnly((v) => !v)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all border ${
            readOnly
              ? "bg-white shadow-sm text-blue-600 border-slate-200"
              : "bg-slate-50 text-slate-500 hover:text-slate-700 border-slate-100"
          }`}
          title={readOnly ? "Exit Read Mode" : "Enter Read Mode"}
          aria-pressed={readOnly}
          aria-label={readOnly ? "Exit Read Mode" : "Enter Read Mode"}
        >
          {readOnly ? <Lock size={13} /> : <LockOpen size={13} />}
          <span>Read Mode</span>
        </button>

        {/* Backlinks indicator */}
        {backlinks.length > 0 && (
          <button
            onClick={() => setShowBacklinks(!showBacklinks)}
            className="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600"
          >
            {backlinks.length} reference{backlinks.length !== 1 ? "s" : ""}
          </button>
        )}
      </div>

      {/* Title */}
      <div className="px-4 pt-3 pb-1">
        {isEditingTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => {
              setIsEditingTitle(false);
              if (titleDraft.trim() && titleDraft !== title) {
                onTitleChange?.(titleDraft.trim());
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") { setTitleDraft(title); setIsEditingTitle(false); }
            }}
            className="text-lg font-semibold text-slate-900 outline-none border-b-2 border-blue-500 w-full bg-transparent"
          />
        ) : (
          <h1
            onClick={() => setIsEditingTitle(true)}
            className="text-lg font-semibold text-slate-900 cursor-text hover:bg-slate-50 rounded px-1 -mx-1"
          >
            {title}
          </h1>
        )}
      </div>

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
          onNavigateLink={onNavigateLink}
          onCreateDocument={onCreateDocument}
          existingDocPaths={existingDocPaths}
          allDocPaths={allDocPaths}
          currentDocDir={filePath.split("/").slice(0, -1).join("/")}
          readOnly={readOnly}
          rightSidebar={rightSidebar}
        />
      </div>
    </div>
  );
}
