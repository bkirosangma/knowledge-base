"use client";

import React from "react";
import { FileText } from "lucide-react";
import MarkdownEditor from "./MarkdownEditor";
import type { ReadingMeta } from "./MarkdownEditor";
import ReadingTOC from "./ReadingTOC";
import ReadingProgress from "./ReadingProgress";
import BacklinksRail from "./BacklinksRail";
import type { TreeNode } from "../../../shared/hooks/useFileExplorer";
import PaneHeader from "../../../shared/components/PaneHeader";
import { useRegisterCommands } from "../../../shared/context/CommandRegistry";
import ExportMenu from "../../export/ExportMenu";
import { printDocument } from "../../export/printDocument";

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
  /** Lookup function returning the backlink count for any vault-relative
   *  path. Used by the wiki-link hover card to show "N backlinks" for the
   *  link target — not just the currently open document. */
  getBacklinkCount?: (resolvedPath: string) => number;
  rightSidebar?: React.ReactNode;
  onBlockChange?: (content: string) => void;
  historyToken?: number;
  /** Whether the editor is in read-only (locked) mode. Controlled by parent. */
  readOnly?: boolean;
  /** Called when the user clicks the read-only toggle in the pane header. */
  onToggleReadOnly?: () => void;
  /** When true, hide the editor toolbar (Focus Mode is on). */
  hideToolbar?: boolean;
  /** Repository for writing pasted/dropped images. Absent while no vault is open. */
  attachmentRepo?: import("../../../domain/repositories").AttachmentRepository | null;
  /** Called when an image write fails. Parent should surface via ShellErrorContext. */
  onImageError?: (err: unknown) => void;
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
  getBacklinkCount,
  rightSidebar,
  onBlockChange,
  historyToken,
  readOnly = false,
  onToggleReadOnly,
  hideToolbar = false,
  attachmentRepo = null,
  onImageError,
}: MarkdownPaneProps) {
  const [showBacklinks, setShowBacklinks] = React.useState(false);
  // Reading meta (word count + headings) is owned here so PaneHeader can
  // render the reading-time pill and ReadingTOC can list anchors without
  // re-parsing markdown.  Reset on file switch so a stale TOC never paints
  // before the new doc's onUpdate fires.
  const [readingMeta, setReadingMeta] = React.useState<ReadingMeta>({
    wordCount: 0,
    headings: [],
  });
  React.useEffect(() => {
    setReadingMeta({ wordCount: 0, headings: [] });
  }, [filePath]);
  // Whether the user has dismissed the TOC via ⌘⇧O.  Stored per-pane (not
  // per-file) so toggling once stays sticky as the user reads through
  // multiple docs.  Default-on in read mode.
  const [tocOpen, setTocOpen] = React.useState(true);

  // Shared ref to the editor's scroll container — read by ReadingProgress
  // (scrollTop / scrollHeight) and ReadingTOC (querySelector + scrollTo).
  const editorContainerRef = React.useRef<HTMLDivElement>(null);

  // Reading-time estimate: 200 wpm.  `Math.max(1, …)` keeps a non-empty doc
  // from showing "0 min read".
  const readingTimeMinutes = readingMeta.wordCount > 0
    ? Math.max(1, Math.round(readingMeta.wordCount / 200))
    : 0;

  // ⌘⇧O — toggle TOC visibility.  Registered as a palette command so the
  // shortcut, palette label, and behaviour stay in lock-step.  The runtime
  // guard hides it in edit mode where the TOC has nothing to toggle.
  const tocCommands = React.useMemo(() => [{
    id: "document.toggle-toc",
    title: "Toggle Table of Contents",
    group: "Document",
    shortcut: "⌘⇧O",
    when: () => readOnly,
    run: () => setTocOpen((v) => !v),
  }], [readOnly]);
  useRegisterCommands(tocCommands);

  // Direct keyboard shortcut for ⌘⇧O — the palette registration above
  // documents the binding for users, but the actual key handler lives
  // here so it works without opening the palette first.
  React.useEffect(() => {
    if (!readOnly) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "O" || e.key === "o")) {
        const el = document.activeElement as HTMLElement | null;
        if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) {
          // Don't fire the toggle while the user is typing in a real input.
          return;
        }
        e.preventDefault();
        setTocOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [readOnly]);

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
    <div className="flex flex-col h-full bg-white" data-pane-content="document">
      <PaneHeader
        filePath={filePath}
        readOnly={readOnly}
        onToggleReadOnly={onToggleReadOnly ?? (() => {})}
        readingTimeMinutes={readingTimeMinutes}
        title={title}
        isDirty={isDirty}
        hasActiveFile={!!filePath}
        onSave={onSave}
        onDiscard={onDiscard}
        hideTitleControls={hideToolbar}
      >
        {backlinks.length > 0 && (
          <button
            onClick={() => setShowBacklinks(!showBacklinks)}
            className="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600"
          >
            {backlinks.length} reference{backlinks.length !== 1 ? "s" : ""}
          </button>
        )}
        {/* KB-011: Export menu — document → Print / Save as PDF */}
        <ExportMenu paneType="document" handlers={{ print: () => { printDocument(); } }} />
      </PaneHeader>

      {/* Reading progress bar — read mode only.  Mounted (not just hidden)
          when readOnly so the scroll listener doesn't run in edit mode. */}
      {readOnly && (
        <ReadingProgress scrollContainerRef={editorContainerRef} resetKey={filePath} />
      )}

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

      {/* Editor — TOC rail is mounted as the editor's `rightSidebar` slot
          (read mode only) so it lives in the same horizontal flex row as
          the editor and the existing properties sidebar.  Mounted only
          when readOnly + tocOpen so it never participates in edit-mode
          layout or listeners. */}
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
          hideToolbar={hideToolbar}
          editorContainerRef={editorContainerRef}
          onReadingMetaChange={setReadingMeta}
          getBacklinkCount={getBacklinkCount}
          attachmentRepo={attachmentRepo}
          onImageError={onImageError}
          belowContent={
            <BacklinksRail
              filePath={filePath}
              backlinks={backlinks}
              onNavigate={onNavigateBacklink}
            />
          }
          rightSidebar={
            <>
              {readOnly && tocOpen && (
                <ReadingTOC
                  headings={readingMeta.headings}
                  scrollContainerRef={editorContainerRef}
                />
              )}
              {rightSidebar}
            </>
          }
        />
      </div>
    </div>
  );
}
