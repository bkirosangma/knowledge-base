"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import MarkdownPane from "./components/MarkdownPane";
import DocumentProperties from "./properties/DocumentProperties";
import { useDocumentContent } from "./hooks/useDocumentContent";
import type { DocumentPaneBridge } from "./hooks/useDocumentContent";
import type { useLinkIndex } from "./hooks/useLinkIndex";
import type { TreeNode } from "../../shared/hooks/useFileExplorer";
import { getFirstHeading } from "./utils/getFirstHeading";
import { useDocumentHistory } from "../../shared/hooks/useDocumentHistory";
import { useDocumentKeyboardShortcuts } from "./hooks/useDocumentKeyboardShortcuts";
import { useDocumentFileWatcher } from "./hooks/useDocumentFileWatcher";
import ConflictBanner from "../../shared/components/ConflictBanner";
import DraftRestoreBanner from "./components/DraftRestoreBanner";
import { useReadOnlyState } from "../../shared/hooks/useReadOnlyState";
import { useToast } from "../../shell/ToastContext";
import ConfirmPopover from "../../shared/components/explorer/ConfirmPopover";
import { SKIP_DISCARD_CONFIRM_KEY } from "../../shared/constants";

const TITLE_DEBOUNCE_MS = 250;

export type { DocumentPaneBridge };

export interface DocumentViewProps {
  focused: boolean;
  filePath: string | null;
  dirHandleRef: React.RefObject<FileSystemDirectoryHandle | null>;
  onDocBridge?: (bridge: DocumentPaneBridge | null) => void;
  linkManager: ReturnType<typeof useLinkIndex>;
  tree: TreeNode[];
  onNavigateLink: (path: string) => void;
  onCreateDocument: (path: string) => void;
  /** Shell-level Focus Mode flag (⌘.). When on, MarkdownPane hides its
   *  toolbar/title row and DocumentView hides the properties sidebar. */
  focusMode?: boolean;
  /**
   * Notify the shell when this document's dirty state flips, so the global
   * "N unsaved" indicator in `Header` can include open documents alongside
   * diagram drafts. (SHELL-1.12, 2026-04-26.)
   */
  onDirtyChange?: (filePath: string, dirty: boolean) => void;
}

export default function DocumentView({
  filePath,
  dirHandleRef,
  onDocBridge,
  linkManager,
  tree,
  onNavigateLink,
  onCreateDocument,
  focusMode = false,
  onDirtyChange,
}: DocumentViewProps) {
  const {
    content, dirty, updateContent, bridge, save, discard, resetToContent, loadedPath,
    diskChecksumRef, getContentFromDisk, updateDiskChecksum,
    pendingDraft, dismissDraftBanner,
  } = useDocumentContent(filePath);
  const history = useDocumentHistory();
  const { conflictContent, handleReloadFromDisk, handleKeepEdits } = useDocumentFileWatcher({
    filePath,
    dirty,
    diskChecksumRef,
    getContentFromDisk,
    resetToContent,
    history,
    updateDiskChecksum,
  });
  const saveStateRef = useRef({ content, history });
  saveStateRef.current = { content, history };
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const [historyToken, setHistoryToken] = useState(0);
  const bumpToken = () => setHistoryToken((t) => t + 1);
  const { readOnly, toggleReadOnly } = useReadOnlyState(filePath, "document-read-only");
  const { showToast } = useToast();
  const hasShownReadModeToast = useRef(false);
  const handleFirstKeystrokeInReadMode = useCallback(() => {
    if (hasShownReadModeToast.current) return;
    hasShownReadModeToast.current = true;
    showToast("Press E to edit");
  }, [showToast]);
  const [discardConfirmPos, setDiscardConfirmPos] = useState<{ x: number; y: number } | null>(null);

  // Debounced H1 / first-line derivation. `content` changes on every
  // keystroke; re-rendering the PaneHeader title that often is wasteful, and
  // the user doesn't need instant title sync — 250 ms settles nicely once
  // they pause. File-name fallback keeps the pane header populated before
  // the first H1.
  const fileBase = filePath?.split("/").pop()?.replace(/\.md$/, "") ?? "";
  const [derivedTitle, setDerivedTitle] = useState(() => getFirstHeading(content) || fileBase);
  useEffect(() => {
    const t = setTimeout(() => {
      const heading = getFirstHeading(content);
      setDerivedTitle(heading || fileBase);
    }, TITLE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [content, fileBase]);

  const [propertiesCollapsed, setPropertiesCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("properties-collapsed") === "true";
  });
  const toggleProperties = useCallback(() => {
    setPropertiesCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem("properties-collapsed", String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // Ref kept in place so the effect below (defined after handleSave) can close over it.
  const onDocBridgeRef = useRef(onDocBridge);
  onDocBridgeRef.current = onDocBridge;

  // Populate link index when a document is first opened so backlinks are
  // available for rename/delete propagation even if the doc is never saved.
  const indexedOnOpenRef = useRef<string | null>(null);
  useEffect(() => { indexedOnOpenRef.current = null; }, [filePath]);
  useEffect(() => {
    const dh = dirHandleRef.current;
    if (!filePath || !dh || !content || loadedPath !== filePath) return;
    if (indexedOnOpenRef.current === filePath) return;
    indexedOnOpenRef.current = filePath;
    linkManager.updateDocumentLinks(dh, filePath, content).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath, content, loadedPath]);

  // Collect all wiki-linkable paths for link autocomplete
  const allDocPaths = React.useMemo(() => {
    const paths: string[] = [];
    const walk = (items: TreeNode[]) => {
      for (const item of items) {
        if (
          item.type === "file" &&
          (item.name.endsWith(".md") || item.name.endsWith(".json"))
        ) {
          paths.push(item.path);
        }
        if (item.children) walk(item.children);
      }
    };
    walk(tree);
    return paths;
  }, [tree]);

  const existingDocPaths = React.useMemo(() => new Set(allDocPaths), [allDocPaths]);

  // Get backlinks for the current document.
  // Depend on `linkManager.linkIndex` (the only piece that changes when the
  // index actually mutates) rather than the whole `linkManager` object —
  // its identity is fresh on every `useLinkIndex` render and would over-fire
  // this memo on unrelated re-renders.
  const backlinks = React.useMemo(
    () => (filePath ? linkManager.getBacklinksFor(filePath) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filePath, linkManager.linkIndex],
  );

  // Lookup function for the wiki-link hover card — returns the backlink count
  // for *any* target path (not just the currently open file). Re-bound when
  // the link index reference changes so wiki-link inserts/edits in the
  // current doc surface in the next hover.
  const getBacklinkCount = React.useCallback(
    (resolvedPath: string) =>
      linkManager.linkIndex.backlinks[resolvedPath]?.linkedFrom.length ?? 0,
    [linkManager.linkIndex],
  );

  // Get outbound links for the current document
  const outboundLinks = React.useMemo(() => {
    if (!filePath) return null;
    const docEntry = linkManager.linkIndex.documents[filePath];
    if (!docEntry) return null;
    const links: { target: string; section?: string }[] = [];
    for (const link of docEntry.outboundLinks) {
      links.push({ target: link.targetPath });
    }
    for (const sl of docEntry.sectionLinks) {
      links.push({ target: sl.targetPath, section: sl.section });
    }
    return links;
  }, [filePath, linkManager.linkIndex]);

  // History: re-initialize once the content for the new file is truly loaded.
  // We use a ref to fire only once per file switch — `content` is in deps so
  // the effect re-runs on every keystroke, but the ref prevents re-init.
  const historyInitedPathRef = useRef<string | null>(null);
  useEffect(() => { historyInitedPathRef.current = null; }, [filePath]);
  useEffect(() => {
    // loadedPath === filePath means useDocumentContent has finished loading
    // the current file's content into `content`. Guard against re-init on
    // every keystroke with the ref.
    if (!filePath || loadedPath !== filePath) return;
    if (historyInitedPathRef.current === filePath) return;
    historyInitedPathRef.current = filePath;
    (async () => {
      const dh = dirHandleRef.current ?? null;
      await history.initHistory(content, dh, filePath);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath, loadedPath, content]);

  // Combined content change handler: updates content + records debounced history entry
  const handleContentChange = useCallback((markdown: string) => {
    updateContent(markdown);
    history.onContentChange(markdown);
  }, [updateContent, history]);

  // Wrapped save: flush pending draft + mark saved checkpoint (no new entry).
  // saveStateRef avoids listing content/history as deps so handleSave is stable
  // across keystrokes — a stable handleSave means the bridge published to the
  // parent doesn't change every time the user types, preventing bridge churn.
  const handleSave = useCallback(async () => {
    await save();
    const { content: c, history: h } = saveStateRef.current;
    h.onFileSave(c);
  }, [save]); // stable: save is memoized on filePath only

  // Expose bridge to parent. Replace bridge.save with handleSave so every save
  // path (toolbar button, Cmd+S via parent) goes through the full save + history
  // update. Getters must be spelled out — spread would evaluate them immediately,
  // producing stale static values instead of live refs.
  useEffect(() => {
    if (!bridge) { onDocBridgeRef.current?.(null); return; }
    const fullBridge: DocumentPaneBridge = {
      save: handleSave,
      discard: bridge.discard,
      get dirty() { return bridge.dirty; },
      get filePath() { return bridge.filePath; },
      get content() { return bridge.content; },
    };
    onDocBridgeRef.current?.(fullBridge);
    return () => onDocBridgeRef.current?.(null);
  }, [bridge, handleSave]); // handleSave stable; bridge changes only on file switch

  // Publish per-pane dirty state up to the shell so the global dirty-stack
  // indicator in `Header` reflects unsaved documents (not just diagram drafts).
  // SHELL-1.12, 2026-04-26.
  const onDirtyChangeRef = useRef(onDirtyChange);
  useEffect(() => { onDirtyChangeRef.current = onDirtyChange; }, [onDirtyChange]);
  useEffect(() => {
    if (!filePath) return;
    onDirtyChangeRef.current?.(filePath, dirty);
    // On unmount or file switch, clear the dirty flag for the previous path
    // so the indicator doesn't include a path that no longer has an open pane.
    return () => { onDirtyChangeRef.current?.(filePath, false); };
  }, [filePath, dirty]);

  // History-first discard: restore saved snapshot from history; fall back to
  // disk only if history has no saved state (e.g. freshly opened file).
  const executeDiscard = useCallback(async () => {
    const saved = history.goToSaved();
    if (saved !== null) {
      resetToContent(saved);
      bumpToken();
      return;
    }
    await discard();
    bumpToken();
  }, [history, resetToContent, discard]);

  // Show confirmation popover (with "don't ask again" option) before discarding
  const handleDiscard = useCallback((e: React.MouseEvent) => {
    if (!dirty) return;
    if (typeof window !== "undefined" && localStorage.getItem(SKIP_DISCARD_CONFIRM_KEY) === "true") {
      executeDiscard();
      return;
    }
    setDiscardConfirmPos({ x: e.clientX, y: e.clientY });
  }, [dirty, executeDiscard]);

  // Keyboard shortcuts: Cmd+Z / Cmd+Shift+Z / E
  useDocumentKeyboardShortcuts({
    onUndo: useCallback(() => {
      const s = history.undo();
      if (s !== null) { updateContent(s); bumpToken(); }
    }, [history, updateContent]),
    onRedo: useCallback(() => {
      const s = history.redo();
      if (s !== null) { updateContent(s); bumpToken(); }
    }, [history, updateContent]),
    readOnly,
    onToggleReadOnly: toggleReadOnly,
    onFirstKeystrokeInReadMode: handleFirstKeystrokeInReadMode,
  });

  // Bridge for HistoryPanel in DocumentProperties
  const historyBridge = {
    entries: history.entries as import("../../shared/utils/historyPersistence").HistoryEntry<unknown>[],
    currentIndex: history.currentIndex,
    savedIndex: history.savedIndex,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    onUndo: () => { const s = history.undo(); if (s !== null) { updateContent(s); bumpToken(); } },
    onRedo: () => { const s = history.redo(); if (s !== null) { updateContent(s); bumpToken(); } },
    onGoToEntry: (i: number) => { const s = history.goToEntry(i); if (s !== null) { updateContent(s); bumpToken(); } },
    collapsed: historyCollapsed,
    onToggleCollapse: () => setHistoryCollapsed((c) => !c),
  };

  return (
    <div className="flex-1 flex min-h-0 h-full">
      <div className="flex-1 flex flex-col min-h-0">
        {conflictContent && (
          <ConflictBanner
            onReload={handleReloadFromDisk}
            onKeep={handleKeepEdits}
          />
        )}
        {pendingDraft && (
          <DraftRestoreBanner
            savedAt={pendingDraft.savedAt}
            onDiscard={discard}
            onKeep={dismissDraftBanner}
          />
        )}
        <MarkdownPane
          filePath={filePath}
          content={content}
          title={derivedTitle}
          isDirty={dirty}
          onSave={handleSave}
          onDiscard={handleDiscard}
          onChange={handleContentChange}
          onBlockChange={history.onBlockChange}
          historyToken={historyToken}
          onNavigateLink={onNavigateLink}
          onCreateDocument={onCreateDocument}
          existingDocPaths={existingDocPaths}
          allDocPaths={allDocPaths}
          tree={tree}
          backlinks={backlinks}
          onNavigateBacklink={onNavigateLink}
          getBacklinkCount={getBacklinkCount}
          readOnly={readOnly}
          onToggleReadOnly={toggleReadOnly}
          hideToolbar={focusMode}
          rightSidebar={
            focusMode ? null : (
              <DocumentProperties
                filePath={filePath}
                content={content}
                outbound={outboundLinks}
                backlinks={backlinks}
                onNavigateLink={(path) => onNavigateLink?.(path)}
                collapsed={propertiesCollapsed}
                onToggleCollapse={toggleProperties}
                history={historyBridge}
                readOnly={readOnly}
                allFilePaths={allDocPaths}
                onConvertMention={(next) => {
                  // updateContent flips dirty + the history hook records a
                  // debounced entry; bumpToken forces the editor to re-render
                  // the new markdown immediately (same pattern as undo/redo).
                  updateContent(next);
                  history.onContentChange(next);
                  bumpToken();
                }}
              />
            )
          }
        />
      </div>
      {discardConfirmPos && (
        <ConfirmPopover
          message="Discard unsaved changes?"
          confirmLabel="Discard"
          confirmColor="red"
          showDontAsk
          position={discardConfirmPos}
          onConfirm={() => { setDiscardConfirmPos(null); executeDiscard(); }}
          onCancel={() => setDiscardConfirmPos(null)}
          onDontAskChange={(checked) => {
            if (checked) localStorage.setItem(SKIP_DISCARD_CONFIRM_KEY, "true");
          }}
        />
      )}
    </div>
  );
}
