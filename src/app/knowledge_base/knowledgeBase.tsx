import React, { useState, useCallback, useEffect } from "react";
import type { ExplorerFilter } from "./utils/types";
import ExplorerPanel from "./components/explorer/ExplorerPanel";
import ConfirmPopover from "./components/explorer/ConfirmPopover";
import Header from "./components/Header";
import HistoryPanel from "./components/HistoryPanel";
import { useFileExplorer } from "./hooks/useFileExplorer";
import { useFileActions } from "./hooks/useFileActions";
import { useDocuments } from "./hooks/useDocuments";
import { useLinkIndex } from "./hooks/useLinkIndex";
import { loadDiagramFromData } from "./utils/persistence";
import { readVaultConfig, initVault, updateVaultLastOpened } from "./utils/vaultConfig";
import { updateWikiLinkPaths } from "./utils/wikiLinkParser";
import { readTextFile, writeTextFile } from "./hooks/useFileExplorer";
import type { SortField, SortDirection, SortGrouping } from "./components/explorer/ExplorerPanel";
import DesignView from "./features/design/DesignView";
import DocumentView from "./features/document/DocumentView";
import { ToolbarProvider } from "./shell/ToolbarContext";
import PaneManager, { usePaneManager } from "./shell/PaneManager";
import type { PaneEntry } from "./shell/PaneManager";
import { useActionHistory } from "./hooks/useActionHistory";
import type { DiagramSnapshot } from "./hooks/useActionHistory";

const SKIP_DISCARD_CONFIRM_KEY = "knowledge-base-skip-discard-confirm";

function KnowledgeBaseInner() {
  // ─── Shell-level hooks ───
  const fileExplorer = useFileExplorer();
  const docManager = useDocuments();
  const linkManager = useLinkIndex();
  const panes = usePaneManager();
  const history = useActionHistory();

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

  // ─── Confirm action state (delete/discard popovers) ───
  const [confirmAction, setConfirmAction] = useState<{
    type: "delete-file" | "delete-folder" | "discard";
    path?: string;
    x: number;
    y: number;
  } | null>(null);

  // ─── Design view bridge state ───
  // These are owned by DesignView but the shell needs some for the Header.
  // For now the Header is wired for the design-only case; the PaneManager
  // approach doesn't need viewMode anymore (each pane is typed).
  const [titleInputValue, setTitleInputValue] = useState("Untitled");
  const [titleWidth, setTitleWidth] = useState<number | string>("auto");

  // Dummy refs needed by useFileActions -- DesignView owns the real canvas ref,
  // but useFileActions only uses canvasRef for popover positioning on discard.
  const canvasRef = React.useRef<HTMLDivElement>(null);
  const isRestoringRef = React.useRef(false);

  // Placeholder state for useFileActions -- DesignView owns the real diagram state.
  // useFileActions needs these to serialize on save. We'll bridge them via
  // a ref that DesignView populates. For now keep the existing flow where
  // useFileActions is called in the shell for file-level operations.
  const [title, setTitle] = useState("Untitled");
  const [layerDefs, setLayerDefs] = useState<ReturnType<typeof loadDiagramFromData>["layers"]>([]);
  const [nodes, setNodes] = useState<ReturnType<typeof loadDiagramFromData>["nodes"]>([]);
  const [connections, setConnections] = useState<ReturnType<typeof loadDiagramFromData>["connections"]>([]);
  const [layerManualSizes, setLayerManualSizes] = useState<ReturnType<typeof loadDiagramFromData>["layerManualSizes"]>({});
  const [lineCurve, setLineCurve] = useState<ReturnType<typeof loadDiagramFromData>["lineCurve"]>("orthogonal");
  const [flows, setFlows] = useState<ReturnType<typeof loadDiagramFromData>["flows"]>([]);

  const isDirty = fileExplorer.dirtyFiles.has(fileExplorer.activeFile ?? "");

  /** Apply a loaded diagram to state. */
  const applyDiagramToState = useCallback((
    data: ReturnType<typeof loadDiagramFromData>,
    opts?: { setSnapshot?: boolean; snapshotSource?: ReturnType<typeof loadDiagramFromData> },
  ) => {
    setTitle(data.title);
    setTitleInputValue(data.title);
    setLayerDefs(data.layers);
    setNodes(data.nodes);
    setConnections(data.connections);
    setLayerManualSizes(data.layerManualSizes);
    setLineCurve(data.lineCurve);
    setFlows(data.flows);
  }, []);

  // File operation handlers
  const {
    handleLoadFile, handleSave, handleCreateFile, handleCreateFolder,
    handleDeleteFile, handleDeleteFolder, handleRenameFile, handleRenameFolder,
    handleDuplicateFile, handleMoveItem, handleDiscard, handleConfirmAction,
  } = useFileActions(
    fileExplorer, history, applyDiagramToState, isRestoringRef, isDirty, () => {},
    confirmAction, setConfirmAction, canvasRef,
    title, layerDefs, nodes, connections, layerManualSizes, lineCurve, flows,
    docManager.documents,
    docManager.setDocuments,
  );

  // ─── Wiki-link aware rename/delete ───
  const handleRenameFileWithLinks = useCallback(async (oldPath: string, newName: string) => {
    handleRenameFile(oldPath, newName);

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
  }, [handleRenameFile, fileExplorer.dirHandleRef, linkManager]);

  const handleDeleteFileWithLinks = useCallback(async (path: string, event: React.MouseEvent) => {
    handleDeleteFile(path, event);
    if (path.endsWith(".md") && fileExplorer.dirHandleRef.current) {
      await linkManager.removeDocumentFromIndex(fileExplorer.dirHandleRef.current, path);
    }
  }, [handleDeleteFile, fileExplorer.dirHandleRef, linkManager]);

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
      handleLoadFile(path);
      panes.openFile(path, "design");
    }
  }, [handleLoadFile, handleOpenDocument, panes]);

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
          handleSave();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave, panes.activeEntry, fileExplorer.dirHandleRef, docManager, linkManager]);

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

  // ─── Undo/Redo (for history panel) ───
  const applySnapshot = useCallback((snapshot: DiagramSnapshot | null) => {
    if (!snapshot) return;
    isRestoringRef.current = true;
    const diagram = loadDiagramFromData({
      title: snapshot.title,
      layers: snapshot.layerDefs,
      nodes: snapshot.nodes,
      connections: snapshot.connections,
      layerManualSizes: snapshot.layerManualSizes,
      lineCurve: snapshot.lineCurve,
      flows: snapshot.flows,
    });
    applyDiagramToState(diagram);
    requestAnimationFrame(() => { isRestoringRef.current = false; });
  }, [applyDiagramToState]);

  const handleUndo = useCallback(() => {
    applySnapshot(history.undo());
  }, [history.undo, applySnapshot]);

  const handleRedo = useCallback(() => {
    applySnapshot(history.redo());
  }, [history.redo, applySnapshot]);

  const handleGoToEntry = useCallback((index: number) => {
    applySnapshot(history.goToEntry(index));
  }, [history.goToEntry, applySnapshot]);

  // ─── Determine active pane type for header ───
  const activePaneType = panes.activeEntry?.fileType ?? "design";

  // ─── Render pane callback for PaneManager ───
  const renderPane = useCallback((entry: PaneEntry, focused: boolean) => {
    if (entry.fileType === "design") {
      return (
        <DesignView
          focused={focused}
          activeFile={entry.filePath}
          isDirty={isDirty}
          markDirty={fileExplorer.markDirty}
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
          fileExplorer={{
            dirHandleRef: fileExplorer.dirHandleRef,
            tree: fileExplorer.tree,
          }}
          explorerCollapsed={explorerCollapsed}
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
  }, [isDirty, fileExplorer, docManager, linkManager, handleOpenDocument, explorerCollapsed, panes]);

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
        title={title}
        titleInputValue={titleInputValue}
        setTitleInputValue={setTitleInputValue}
        titleWidth={titleWidth}
        setTitleWidth={setTitleWidth}
        onTitleCommit={(v) => { setTitle(v); }}
        isDirty={isDirty}
        hasActiveFile={!!fileExplorer.activeFile}
        isLive={false}
        showLabels={true}
        showMinimap={true}
        zoom={1}
        onToggleLive={() => {}}
        onToggleLabels={() => {}}
        onToggleMinimap={() => {}}
        onZoomChange={() => {}}
        onDiscard={handleDiscard}
        onSave={handleSave}
        activePaneType={activePaneType}
        isSplit={panes.isSplit}
        onToggleSplit={() => {
          if (panes.isSplit) {
            panes.exitSplit();
          } else if (panes.leftPane) {
            // Open a blank document pane in the right side
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
        {/* Left sidebar: Explorer + History */}
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
            onCreateFile={handleCreateFile}
            onCreateFolder={handleCreateFolder}
            onDeleteFile={handleDeleteFileWithLinks}
            onDeleteFolder={handleDeleteFolder}
            onRenameFile={handleRenameFileWithLinks}
            onRenameFolder={handleRenameFolder}
            onDuplicateFile={handleDuplicateFile}
            onMoveItem={handleMoveItem}
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
          <HistoryPanel
            entries={history.entries}
            currentIndex={history.currentIndex}
            savedIndex={history.savedIndex}
            canUndo={history.canUndo}
            canRedo={history.canRedo}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onGoToEntry={handleGoToEntry}
            collapsed={historyCollapsed}
            sidebarCollapsed={explorerCollapsed}
            onToggleCollapse={() => {
              if (explorerCollapsed) {
                setExplorerCollapsed(false);
                setHistoryCollapsed(false);
              } else {
                setHistoryCollapsed((c) => !c);
              }
            }}
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

      {/* Confirmation popover */}
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
          onConfirm={handleConfirmAction}
          onCancel={() => setConfirmAction(null)}
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
