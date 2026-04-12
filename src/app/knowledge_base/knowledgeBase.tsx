import React, { useState, useCallback, useEffect, useRef } from "react";
import type { ExplorerFilter } from "./shared/utils/types";
import ExplorerPanel from "./shared/components/explorer/ExplorerPanel";
import ConfirmPopover from "./shared/components/explorer/ConfirmPopover";
import Header from "./shared/components/Header";
import { useFileExplorer } from "./shared/hooks/useFileExplorer";
import { useDocuments } from "./features/document/hooks/useDocuments";
import { useLinkIndex } from "./features/document/hooks/useLinkIndex";
import { readVaultConfig, initVault, updateVaultLastOpened } from "./features/document/utils/vaultConfig";
import { updateWikiLinkPaths } from "./features/document/utils/wikiLinkParser";
import { readTextFile, writeTextFile } from "./shared/hooks/useFileExplorer";
import type { SortField, SortDirection, SortGrouping } from "./shared/components/explorer/ExplorerPanel";
import DesignView from "./features/design/DesignView";
import type { DesignBridge } from "./features/design/DesignView";
import DocumentView from "./features/document/DocumentView";
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

  // ─── Design bridge: DesignView pushes its state here ───
  const designBridgeRef = useRef<DesignBridge | null>(null);
  const [designBridge, setDesignBridge] = useState<DesignBridge | null>(null);
  const handleDesignBridge = useCallback((bridge: DesignBridge) => {
    designBridgeRef.current = bridge;
    setDesignBridge(bridge);
  }, []);

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
  const isDirty = designBridge?.isDirty ?? false;
  const title = designBridge?.title ?? "Untitled";
  const confirmAction = designBridge?.confirmAction ?? null;

  // ─── Wiki-link aware rename/delete ───
  const handleRenameFileWithLinks = useCallback(async (oldPath: string, newName: string) => {
    designBridgeRef.current?.handleRenameFile(oldPath, newName);

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
    designBridgeRef.current?.handleDeleteFile(path, event);
    if (path.endsWith(".md") && fileExplorer.dirHandleRef.current) {
      await linkManager.removeDocumentFromIndex(fileExplorer.dirHandleRef.current, path);
    }
  }, [fileExplorer.dirHandleRef, linkManager]);

  // ─── Document operations ───
  const handleOpenDocument = useCallback(async (path: string) => {
    const rootHandle = fileExplorer.dirHandleRef.current;
    if (!rootHandle) return;
    if (docManager.docDirty && docManager.activeDocPath) {
      await docManager.saveDocument(rootHandle);
    }
    await docManager.openDocument(rootHandle, path);
    // Open in pane manager
    panes.openFile(path, "document");
  }, [fileExplorer.dirHandleRef, docManager, panes]);

  // ─── File selection: route to correct pane type ───
  const handleSelectFile = useCallback((path: string) => {
    if (path.endsWith(".md")) {
      handleOpenDocument(path);
    } else {
      designBridgeRef.current?.handleLoadFile(path);
      panes.openFile(path, "design");
    }
  }, [handleOpenDocument, panes]);

  // ─── Cmd+S handler ───
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        const activeEntry = panes.activeEntry;
        if (activeEntry?.fileType === "document") {
          const rootHandle = fileExplorer.dirHandleRef.current;
          if (rootHandle && docManager.docDirty && docManager.activeDocPath) {
            docManager.saveDocument(rootHandle).then(() => {
              linkManager.updateDocumentLinks(rootHandle, docManager.activeDocPath!, docManager.activeDocContent);
            });
          }
        }
        // Always try to save diagram if there's an active design file
        if (!activeEntry || activeEntry.fileType === "design") {
          designBridgeRef.current?.onSave();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [panes.activeEntry, fileExplorer.dirHandleRef, docManager, linkManager]);

  // ─── Auto-load last opened file ───
  useEffect(() => {
    if (fileExplorer.pendingFile) {
      handleSelectFile(fileExplorer.pendingFile);
      fileExplorer.clearPendingFile();
    }
  }, [fileExplorer.pendingFile, fileExplorer.clearPendingFile, handleSelectFile]);

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
  const activePaneType = panes.activeEntry?.fileType ?? "design";

  // ─── Render pane callback for PaneManager ───
  const renderPane = useCallback((entry: PaneEntry, focused: boolean) => {
    if (entry.fileType === "design") {
      return (
        <DesignView
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
          onDesignBridge={handleDesignBridge}
        />
      );
    }

    return (
      <DocumentView
        focused={focused}
        docManager={docManager}
        linkManager={linkManager}
        tree={fileExplorer.tree}
        onNavigateLink={handleOpenDocument}
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
  }, [fileExplorer, docManager, linkManager, handleOpenDocument, explorerCollapsed, historyCollapsed, panes, handleDesignBridge]);

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
        title={designBridge?.title ?? "Untitled"}
        titleInputValue={designBridge?.titleInputValue ?? "Untitled"}
        setTitleInputValue={(v) => designBridge?.setTitleInputValue(v)}
        titleWidth={designBridge?.titleWidth ?? "auto"}
        setTitleWidth={(w) => designBridge?.setTitleWidth(w)}
        onTitleCommit={(v) => designBridge?.onTitleCommit(v)}
        isDirty={isDirty}
        hasActiveFile={!!fileExplorer.activeFile}
        onDiscard={(e) => designBridge?.onDiscard(e)}
        onSave={() => designBridge?.onSave()}
        activePaneType={activePaneType}
        isSplit={panes.isSplit}
        onToggleSplit={() => {
          if (panes.isSplit) {
            panes.exitSplit();
          } else if (panes.leftPane) {
            panes.enterSplit(panes.leftPane.filePath, panes.leftPane.fileType);
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
        {/* Left sidebar: Explorer only (HistoryPanel moved into DesignView) */}
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
            onCreateFile={(parentPath) => designBridgeRef.current?.handleCreateFile(parentPath) ?? Promise.resolve(null)}
            onCreateFolder={(parentPath) => designBridgeRef.current?.handleCreateFolder(parentPath) ?? Promise.resolve(null)}
            onDeleteFile={handleDeleteFileWithLinks}
            onDeleteFolder={(path, event) => designBridgeRef.current?.handleDeleteFolder(path, event)}
            onRenameFile={handleRenameFileWithLinks}
            onRenameFolder={(oldPath, newName) => designBridgeRef.current?.handleRenameFolder(oldPath, newName)}
            onDuplicateFile={(path) => designBridgeRef.current?.handleDuplicateFile(path)}
            onMoveItem={(source, target) => designBridgeRef.current?.handleMoveItem(source, target)}
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

      {/* Confirmation popover — state owned by DesignView via bridge */}
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
          onConfirm={() => designBridgeRef.current?.handleConfirmAction()}
          onCancel={() => designBridgeRef.current?.setConfirmAction(null)}
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
