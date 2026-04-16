import React, { useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import type { ExplorerFilter } from "./shared/utils/types";
import ExplorerPanel from "./shared/components/explorer/ExplorerPanel";
import ConfirmPopover from "./shared/components/explorer/ConfirmPopover";
import Header from "./shared/components/Header";
import { useFileExplorer } from "./shared/hooks/useFileExplorer";
import { useDocuments } from "./features/document/hooks/useDocuments";
import { useLinkIndex } from "./features/document/hooks/useLinkIndex";
import { readVaultConfig, initVault, updateVaultLastOpened } from "./features/document/utils/vaultConfig";
import { resolveWikiLinkPath, updateWikiLinkPaths } from "./features/document/utils/wikiLinkParser";
import { readTextFile, writeTextFile } from "./shared/hooks/useFileExplorer";
import { savePaneLayout, loadPaneLayout } from "./shared/utils/persistence";
import type { SortField, SortDirection, SortGrouping } from "./shared/components/explorer/ExplorerPanel";
import DiagramView from "./features/diagram/DiagramView";
import type { DiagramBridge } from "./features/diagram/DiagramView";
import DocumentView from "./features/document/DocumentView";
import type { DocumentPaneBridge } from "./features/document/DocumentView";
import { ToolbarProvider } from "./shell/ToolbarContext";
import PaneManager, { usePaneManager } from "./shell/PaneManager";
import type { PaneEntry } from "./shell/PaneManager";

const SKIP_DISCARD_CONFIRM_KEY = "knowledge-base-skip-discard-confirm";

function KnowledgeBaseInner() {
  // ─── Shell-level hooks ───
  const fileExplorer = useFileExplorer();
  const docManager = useDocuments();
  const linkManager = useLinkIndex();
  const panes = usePaneManager();

  // ─── Diagram bridge: DiagramView pushes its state here ───
  const diagramBridgeRef = useRef<DiagramBridge | null>(null);
  const [diagramBridge, setDiagramBridge] = useState<DiagramBridge | null>(null);
  const handleDiagramBridge = useCallback((bridge: DiagramBridge) => {
    diagramBridgeRef.current = bridge;
    setDiagramBridge(bridge);
  }, []);

  // ─── Document bridges: one per pane side ───
  const leftDocBridgeRef = useRef<DocumentPaneBridge | null>(null);
  const rightDocBridgeRef = useRef<DocumentPaneBridge | null>(null);

  // ─── Explorer UI state ───
  const [explorerCollapsed, setExplorerCollapsed] = useState(false);
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const [explorerFilter, setExplorerFilter] = useState<ExplorerFilter>("all");

  // Sort preferences
  const SORT_PREFS_KEY = "knowledge-base-sort-prefs";
  const [sortPrefs, setSortPrefs] = useState<{ field: SortField; direction: SortDirection; grouping: SortGrouping }>(() => {
    if (typeof window === "undefined") return { field: "name", direction: "asc", grouping: "folders-first" };
    try {
      const raw = JSON.parse(localStorage.getItem(SORT_PREFS_KEY) || "{}");
      return { field: raw.field ?? "name", direction: raw.direction ?? "asc", grouping: raw.grouping ?? "folders-first" };
    } catch { return { field: "name", direction: "asc", grouping: "folders-first" }; }
  });
  const handleSortChange = useCallback((field: SortField, direction: SortDirection, grouping: SortGrouping) => {
    setSortPrefs({ field, direction, grouping });
    try { localStorage.setItem(SORT_PREFS_KEY, JSON.stringify({ field, direction, grouping })); } catch { /* ignore */ }
  }, []);

  // Derived state from bridge (with safe defaults)
  const isDirty = diagramBridge?.isDirty ?? false;
  const title = diagramBridge?.title ?? "Untitled";
  const confirmAction = diagramBridge?.confirmAction ?? null;

  // ─── Wiki-link aware rename/delete ───
  const handleRenameFileWithLinks = useCallback(async (oldPath: string, newName: string) => {
    diagramBridgeRef.current?.handleRenameFile(oldPath, newName);

    if (!oldPath.endsWith(".md")) return;

    const rootHandle = fileExplorer.dirHandleRef.current;
    if (!rootHandle) return;

    const dir = oldPath.includes("/") ? oldPath.substring(0, oldPath.lastIndexOf("/")) : "";
    const newPath = dir ? `${dir}/${newName}` : newName;

    await linkManager.renameDocumentInIndex(rootHandle, oldPath, newPath);

    const backlinks = linkManager.getBacklinksFor(oldPath);
    for (const bl of backlinks) {
      try {
        const parts = bl.sourcePath.split("/");
        let dh: FileSystemDirectoryHandle = rootHandle;
        for (const part of parts.slice(0, -1)) dh = await dh.getDirectoryHandle(part);
        const fh = await dh.getFileHandle(parts[parts.length - 1]);
        const content = await readTextFile(fh);
        const updated = updateWikiLinkPaths(content, oldPath, newPath);
        if (updated !== content) {
          await writeTextFile(rootHandle, bl.sourcePath, updated);
        }
      } catch { /* skip files that can't be read */ }
    }
  }, [fileExplorer.dirHandleRef, linkManager]);

  const handleDeleteFileWithLinks = useCallback(async (path: string, event: React.MouseEvent) => {
    diagramBridgeRef.current?.handleDeleteFile(path, event);
    if (path.endsWith(".md") && fileExplorer.dirHandleRef.current) {
      await linkManager.removeDocumentFromIndex(fileExplorer.dirHandleRef.current, path);
    }
  }, [fileExplorer.dirHandleRef, linkManager]);

  // ─── Document operations ───
  const handleOpenDocument = useCallback((path: string) => {
    panes.openFile(path, "document");
  }, [panes]);

  // ─── File selection: route to correct pane type ───
  const handleSelectFile = useCallback((path: string) => {
    if (path.endsWith(".md")) {
      handleOpenDocument(path);
    } else {
      diagramBridgeRef.current?.handleLoadFile(path);
      panes.openFile(path, "diagram");
    }
  }, [handleOpenDocument, panes]);

  // Wiki-link targets (`[[name]]`) are usually written without an extension
  // and are relative to the current document's folder — Obsidian-style. Use
  // `resolveWikiLinkPath` (same helper `useLinkIndex` uses to build the link
  // index) so the path inside `docs/architecture/foo.md` referencing
  // `[[related-note]]` opens `docs/architecture/related-note.md`, not a
  // non-existent root file. Falls back to an exact hit, `.md`, then `.json`
  // so explicit paths and diagrams still work.
  const handleNavigateWikiLink = useCallback(
    (path: string) => {
      const allPaths: string[] = [];
      const walk = (items: typeof fileExplorer.tree) => {
        for (const it of items) {
          if (it.type === "file") allPaths.push(it.path);
          if (it.children) walk(it.children);
        }
      };
      walk(fileExplorer.tree);
      const set = new Set(allPaths);

      const activeFilePath = panes.activeEntry?.filePath ?? null;
      const docDir = activeFilePath
        ? activeFilePath.split("/").slice(0, -1).join("/")
        : "";
      const candidates: string[] = [];
      // 1. Resolved relative to current doc directory (default .md).
      candidates.push(resolveWikiLinkPath(path, docDir));
      // 2. Same resolution but for a diagram target.
      if (!/\.[a-z0-9]+$/i.test(path)) {
        const relDir = docDir ? `${docDir}/${path}` : path;
        candidates.push(`${relDir}.json`);
      }
      // 3. Bare path as given (already has an extension, e.g. `foo.json`).
      candidates.push(path);
      // 4. Append extensions at root for cases where the wiki-link is meant
      //    as an absolute bare name and step 1 guessed wrong.
      if (!/\.[a-z0-9]+$/i.test(path)) {
        candidates.push(`${path}.md`, `${path}.json`);
      }

      const resolved = candidates.find((c) => set.has(c)) ?? candidates[0];
      handleSelectFile(resolved);
    },
    [fileExplorer.tree, panes.activeEntry, handleSelectFile],
  );

  // ─── Persist pane layout to localStorage ───
  const layoutRestoredRef = useRef(false);

  useEffect(() => {
    if (!fileExplorer.directoryName || !layoutRestoredRef.current) return;
    savePaneLayout(panes.leftPane, panes.rightPane, panes.focusedSide, panes.lastClosedPane);
  }, [panes.leftPane, panes.rightPane, panes.focusedSide, panes.lastClosedPane, fileExplorer.directoryName]);

  // ─── Cmd+S handler ───
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        const activeEntry = panes.activeEntry;
        if (activeEntry?.fileType === "document") {
          const docBridge = panes.focusedSide === "right"
            ? rightDocBridgeRef.current : leftDocBridgeRef.current;
          if (docBridge?.dirty) {
            const rootHandle = fileExplorer.dirHandleRef.current;
            docBridge.save().then(() => {
              if (rootHandle && docBridge.filePath) {
                linkManager.updateDocumentLinks(rootHandle, docBridge.filePath, docBridge.content);
              }
            });
          }
        }
        // Always try to save diagram if there's an active diagram file
        if (!activeEntry || activeEntry.fileType === "diagram") {
          diagramBridgeRef.current?.onSave();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [panes.activeEntry, panes.focusedSide, fileExplorer.dirHandleRef, linkManager]);

  // ─── Restore pane layout (or fall back to single pending file) on directory load ───
  useEffect(() => {
    if (layoutRestoredRef.current || fileExplorer.tree.length === 0) return;
    layoutRestoredRef.current = true;

    const savedLayout = loadPaneLayout();
    if (savedLayout && (savedLayout.leftPane || savedLayout.rightPane)) {
      // Validate saved files still exist in tree
      const allPaths = new Set<string>();
      const walk = (items: typeof fileExplorer.tree) => {
        for (const it of items) {
          if (it.type === "file") allPaths.add(it.path);
          if (it.children) walk(it.children);
        }
      };
      walk(fileExplorer.tree);

      const validLeft = savedLayout.leftPane && allPaths.has(savedLayout.leftPane.filePath)
        ? savedLayout.leftPane : null;
      const validRight = savedLayout.rightPane && allPaths.has(savedLayout.rightPane.filePath)
        ? savedLayout.rightPane : null;

      if (validLeft || validRight) {
        panes.restoreLayout(validLeft, validRight, savedLayout.focusedSide);

        // Highlight the focused file in the explorer
        const focusedEntry = savedLayout.focusedSide === "right" && validRight ? validRight : validLeft;
        if (focusedEntry) fileExplorer.setActiveFile(focusedEntry.filePath);

        // Restore last closed pane if present
        if (savedLayout.lastClosedPane) {
          panes.setLastClosedPane(savedLayout.lastClosedPane);
        }

        // DocumentView instances auto-load content when they mount with a filePath

        if (fileExplorer.pendingFile) fileExplorer.clearPendingFile();
        return;
      }
    }

    // No saved layout — fall back to single pending file
    if (fileExplorer.pendingFile) {
      handleSelectFile(fileExplorer.pendingFile);
      fileExplorer.clearPendingFile();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileExplorer.tree]);

  // ─── Vault initialization ───
  useEffect(() => {
    const rootHandle = fileExplorer.dirHandleRef.current;
    if (!rootHandle || fileExplorer.tree.length === 0) return;
    (async () => {
      const config = await readVaultConfig(rootHandle);
      if (config) {
        await updateVaultLastOpened(rootHandle);
      } else if (fileExplorer.directoryName) {
        await initVault(rootHandle, fileExplorer.directoryName);
      }
      await linkManager.loadIndex(rootHandle);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileExplorer.directoryName]);

  // ─── Determine active pane type for header ───
  const activePaneType = panes.activeEntry?.fileType ?? "diagram";

  // ─── Render pane callback for PaneManager ───
  const renderPane = useCallback((entry: PaneEntry, focused: boolean, side: "left" | "right") => {
    if (entry.fileType === "diagram") {
      return (
        <DiagramView
          focused={focused}
          activeFile={entry.filePath}
          fileExplorer={fileExplorer}
          onOpenDocument={handleOpenDocument}
          documents={docManager.documents}
          onAttachDocument={(docPath, entityType, entityId) => {
            docManager.attachDocument(docPath, entityType as "node" | "connection", entityId);
          }}
          onDetachDocument={(docPath, entityType, entityId) => {
            docManager.detachDocument(docPath, entityType, entityId);
          }}
          onCreateDocument={async (rootHandle, path) => {
            await docManager.createDocument(rootHandle, path);
          }}
          onLoadDocuments={docManager.setDocuments}
          backlinks={entry.filePath ? linkManager.getBacklinksFor(entry.filePath) : []}
          explorerCollapsed={explorerCollapsed}
          historyCollapsed={historyCollapsed}
          sidebarCollapsed={explorerCollapsed}
          onToggleHistoryCollapse={() => {
            if (explorerCollapsed) {
              setExplorerCollapsed(false);
              setHistoryCollapsed(false);
            } else {
              setHistoryCollapsed((c) => !c);
            }
          }}
          onDiagramBridge={handleDiagramBridge}
        />
      );
    }

    return (
      <DocumentView
        focused={focused}
        filePath={entry.filePath}
        dirHandleRef={fileExplorer.dirHandleRef}
        onDocBridge={(bridge) => {
          if (side === "left") leftDocBridgeRef.current = bridge;
          else rightDocBridgeRef.current = bridge;
        }}
        linkManager={linkManager}
        tree={fileExplorer.tree}
        onNavigateLink={handleNavigateWikiLink}
        onCreateDocument={async (path) => {
          const rootHandle = fileExplorer.dirHandleRef.current;
          if (rootHandle) {
            await docManager.createDocument(rootHandle, path);
            handleOpenDocument(path);
          }
        }}
        onClose={() => panes.closeFocusedPane()}
      />
    );
  }, [fileExplorer, docManager, linkManager, handleOpenDocument, explorerCollapsed, historyCollapsed, panes, handleDiagramBridge, handleNavigateWikiLink]);

  // ─── Empty state when no file is open ───
  const emptyState = (
    <div className="flex-1 flex items-center justify-center bg-[#e8ecf0]">
      <div className="flex flex-col items-center gap-3 text-slate-400">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M9 21V9" /></svg>
        <p className="text-sm font-medium">No file open</p>
        <p className="text-xs text-slate-400">Open a file from the explorer to start editing</p>
      </div>
    </div>
  );

  return (
    <div className="w-full h-screen bg-[#f4f7f9] font-sans flex flex-col overflow-hidden relative">
      <Header
        title={diagramBridge?.title ?? "Untitled"}
        titleInputValue={diagramBridge?.titleInputValue ?? "Untitled"}
        setTitleInputValue={(v) => diagramBridge?.setTitleInputValue(v)}
        titleWidth={diagramBridge?.titleWidth ?? "auto"}
        setTitleWidth={(w) => diagramBridge?.setTitleWidth(w)}
        onTitleCommit={(v) => diagramBridge?.onTitleCommit(v)}
        isDirty={isDirty}
        hasActiveFile={!!fileExplorer.activeFile}
        onDiscard={(e) => diagramBridge?.onDiscard(e)}
        onSave={() => diagramBridge?.onSave()}
        activePaneType={activePaneType}
        isSplit={panes.isSplit}
        onToggleSplit={() => {
          if (panes.isSplit) {
            panes.exitSplit();
          } else if (panes.leftPane) {
            const reopen = panes.lastClosedPane;
            if (reopen) {
              panes.enterSplit(reopen.filePath, reopen.fileType);
            } else {
              panes.enterSplit(panes.leftPane.filePath, panes.leftPane.fileType);
            }
          }
        }}
      />

      {/* Hidden fallback input for browsers without File System Access API */}
      <input
        ref={fileExplorer.inputRef}
        type="file"
        /* @ts-expect-error webkitdirectory is non-standard */
        webkitdirectory=""
        className="hidden"
        onChange={(e) => fileExplorer.handleFallbackInput(e.target.files)}
      />

      {/* Explorer + Viewport + Properties */}
      <div className="flex-1 flex min-h-0">
        {/* Left sidebar: Explorer only (HistoryPanel moved into DiagramView) */}
        <div
          className="flex-shrink-0 bg-white border-r border-slate-200 flex flex-col transition-[width] duration-200 overflow-hidden"
          style={{ width: explorerCollapsed ? 36 : 260 }}
        >
          <ExplorerPanel
            collapsed={explorerCollapsed}
            onToggleCollapse={() => setExplorerCollapsed((c) => !c)}
            directoryName={fileExplorer.directoryName}
            tree={fileExplorer.tree}
            activeFile={fileExplorer.activeFile}
            dirtyFiles={fileExplorer.dirtyFiles}
            onOpenFolder={fileExplorer.openFolder}
            onSelectFile={handleSelectFile}
            onCreateFile={(parentPath) => diagramBridgeRef.current?.handleCreateFile(parentPath) ?? Promise.resolve(null)}
            onCreateFolder={(parentPath) => diagramBridgeRef.current?.handleCreateFolder(parentPath) ?? Promise.resolve(null)}
            onDeleteFile={handleDeleteFileWithLinks}
            onDeleteFolder={(path, event) => diagramBridgeRef.current?.handleDeleteFolder(path, event)}
            onRenameFile={handleRenameFileWithLinks}
            onRenameFolder={(oldPath, newName) => diagramBridgeRef.current?.handleRenameFolder(oldPath, newName)}
            onDuplicateFile={(path) => diagramBridgeRef.current?.handleDuplicateFile(path)}
            onMoveItem={(source, target) => diagramBridgeRef.current?.handleMoveItem(source, target)}
            isLoading={fileExplorer.isLoading}
            onRefresh={fileExplorer.refresh}
            sortField={sortPrefs.field}
            sortDirection={sortPrefs.direction}
            sortGrouping={sortPrefs.grouping}
            onSortChange={handleSortChange}
            explorerFilter={explorerFilter}
            onFilterChange={setExplorerFilter}
            onSelectDocument={handleOpenDocument}
          />
        </div>

        {/* Main content area: PaneManager handles single/split rendering */}
        <PaneManager
          leftPane={panes.leftPane}
          rightPane={panes.rightPane}
          isSplit={panes.isSplit}
          focusedSide={panes.focusedSide}
          setFocusedSide={panes.setFocusedSide}
          renderPane={renderPane}
          emptyState={emptyState}
        />
      </div>

      {/* Confirmation popover — state owned by DiagramView via bridge */}
      {confirmAction && (
        <ConfirmPopover
          message={
            confirmAction.type === "delete-file"
              ? `Delete "${confirmAction.path?.split("/").pop()}"?`
              : confirmAction.type === "delete-folder"
                ? `Delete folder "${confirmAction.path?.split("/").pop()}" and all its contents?`
                : "Discard all unsaved changes?"
          }
          confirmLabel={confirmAction.type === "discard" ? "Discard" : "Delete"}
          confirmColor={confirmAction.type === "discard" ? "blue" : "red"}
          showDontAsk={confirmAction.type === "discard"}
          onDontAskChange={(checked) => {
            if (checked) localStorage.setItem(SKIP_DISCARD_CONFIRM_KEY, "true");
            else localStorage.removeItem(SKIP_DISCARD_CONFIRM_KEY);
          }}
          position={{ x: confirmAction.x, y: confirmAction.y }}
          onConfirm={() => diagramBridgeRef.current?.handleConfirmAction()}
          onCancel={() => diagramBridgeRef.current?.setConfirmAction(null)}
        />
      )}
    </div>
  );
}

export default function KnowledgeBase() {
  return (
    <ToolbarProvider>
      <KnowledgeBaseInner />
    </ToolbarProvider>
  );
}
