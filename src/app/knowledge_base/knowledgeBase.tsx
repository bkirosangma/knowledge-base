import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import type { ExplorerFilter } from "./shared/utils/types";
import ExplorerPanel from "./shared/components/explorer/ExplorerPanel";
import ConfirmPopover from "./shared/components/explorer/ConfirmPopover";
import Header from "./shared/components/Header";
import UnsupportedBrowserCard from "./shared/components/UnsupportedBrowserCard";
import FirstRunHero from "./shared/components/FirstRunHero";
import EmptyState from "./shared/components/EmptyState";
import { useFileExplorer } from "./shared/hooks/useFileExplorer";
import { useDocuments } from "./features/document/hooks/useDocuments";
import { useLinkIndex } from "./features/document/hooks/useLinkIndex";
import { createVaultConfigRepository } from "./infrastructure/vaultConfigRepo";
import { resolveWikiLinkPath, stripWikiLinksForPath } from "./features/document/utils/wikiLinkParser";
import { createDocumentRepository } from "./infrastructure/documentRepo";
import { createTabRepository } from "./infrastructure/tabRepo";
import { propagateRename, propagateMoveLinks } from "./shared/hooks/fileExplorerHelpers";
import { savePaneLayout, loadPaneLayout } from "./shared/utils/persistence";
import type { SortField, SortDirection, SortGrouping } from "./shared/components/explorer/ExplorerPanel";
import DiagramView from "./features/diagram/DiagramView";
import type { DiagramBridge } from "./features/diagram/DiagramView";
import SVGEditorView, { type SVGEditorBridge } from "./features/svgEditor/SVGEditorView";
import DocumentView from "./features/document/DocumentView";
import type { DocumentPaneBridge } from "./features/document/DocumentView";
import GraphView from "./features/graph/GraphView";
import GraphifyView from "./features/graph/GraphifyView";
import { collectAllPaths } from "./features/graph/hooks/useGraphData";
import { useAllPaths } from "./shared/hooks/useAllPaths";
import { useVaultSearch } from "./features/search/useVaultSearch";
import SearchPanel from "./features/search/SearchPanel";
import { buildTabPaneContext, renderTabPaneEntry } from "./knowledgeBase.tabRouting.helper";
import { useGpImport } from "./features/tab/hooks/useGpImport";
import { readForSearchIndex, findFirstNodeMatching } from "./infrastructure/searchStream";
import type { SearchResult } from "./features/search/VaultIndex";
import { ToolbarProvider, GRAPH_SENTINEL, GRAPHIFY_SENTINEL, SEARCH_SENTINEL } from "./shell/ToolbarContext";
import { FooterProvider } from "./shell/FooterContext";
import { RepositoryProvider } from "./shell/RepositoryContext";
import { ShellErrorProvider, useShellErrors } from "./shell/ShellErrorContext";
import { FileWatcherProvider, useFileWatcher } from "./shared/context/FileWatcherContext";
import { ToastProvider, useToast } from "./shell/ToastContext";
import { useBackgroundScanner } from "./shared/hooks/useBackgroundScanner";
import ShellErrorBanner from "./shell/ShellErrorBanner";
import ShellErrorBoundary from "./shell/ShellErrorBoundary";
import { readOrNull } from "./domain/repositoryHelpers";
import Footer from "./shell/Footer";
import PaneManager, { usePaneManager } from "./shell/PaneManager";
import type { PaneEntry } from "./shell/PaneManager";
import { SKIP_DISCARD_CONFIRM_KEY } from "./shared/constants";
import { CommandRegistryProvider, useCommandRegistry, useRegisterCommands } from "./shared/context/CommandRegistry";
import CommandPalette from "./shared/components/CommandPalette";
import { useRecentFiles } from "./shared/hooks/useRecentFiles";
import { useTheme } from "./shared/hooks/useTheme";
import { useViewport } from "./shared/hooks/useViewport";
import { useOfflineCache } from "./shared/hooks/useOfflineCache";
import MobileShell from "./shell/MobileShell";
import ServiceWorkerRegister from "./shell/ServiceWorkerRegister";

/**
 * Returns a new Set with `path` added/removed, or the same Set when the
 * op is a no-op. Per-pane publishers use one Set per side so the same
 * file open in both panes can't have one pane's cleanup clear the other.
 * Exported for unit tests.
 */
export function updateDirtySet(prev: Set<string>, path: string, dirty: boolean): Set<string> {
  const has = prev.has(path);
  if (dirty && has) return prev;
  if (!dirty && !has) return prev;
  const next = new Set(prev);
  if (dirty) next.add(path);
  else next.delete(path);
  return next;
}

function KnowledgeBaseInner() {
  // ─── Shell-level hooks ───
  const { reportError } = useShellErrors();
  const fileExplorer = useFileExplorer();
  const docManager = useDocuments();
  const linkManager = useLinkIndex();
  const searchManager = useVaultSearch();
  // Viewport detection drives mobile shell branching.
  const { isMobile } = useViewport();
  // Initial state assumes supported so SSR/client first paint match;
  // the effect flips it on Firefox/Safari to swap in UnsupportedBrowserCard.
  const [isFsAccessSupported, setIsFsAccessSupported] = useState<boolean>(true);
  useEffect(() => {
    setIsFsAccessSupported("showDirectoryPicker" in window);
  }, []);
  // Offline cache for last 10 recents (best-effort).
  useOfflineCache({ rootHandleRef: fileExplorer.dirHandleRef, tree: fileExplorer.tree });
  // Cached flatten of every vault path; stable across non-tree renders so
  // consumers (wiki-link router, DocumentView) skip a per-render walk.
  const allPaths = useAllPaths(fileExplorer.tree);
  const panes = usePaneManager();
  const { subscribe, unsubscribe, refresh: watcherRefresh } = useFileWatcher();

  // Quiet rescan on watcher tick — `watcherRescan` (not `refresh`) skips
  // the loading flash and permission re-check on every poll.
  useEffect(() => {
    subscribe("tree", fileExplorer.watcherRescan);
    return () => unsubscribe("tree");
  }, [subscribe, unsubscribe, fileExplorer.watcherRescan]);

  // ─── Background scanner: update .history.json sidecars for closed files ───
  const { showToast } = useToast();
  const openFilePath = panes.activeEntry?.filePath ?? null;
  const { scan } = useBackgroundScanner({
    tree: fileExplorer.tree,
    openFilePath,
    dirHandleRef: fileExplorer.dirHandleRef,
    dirtyFiles: fileExplorer.dirtyFiles,
  });
  useEffect(() => {
    subscribe("background", async () => {
      try {
        const count = await scan();
        if (count === 1) showToast("File reloaded from disk");
        else if (count > 1) showToast(`${count} files reloaded from disk`);
      } catch {
        // Swallow — background scan failures must not block other watchers.
      }
    });
    return () => unsubscribe("background");
  }, [subscribe, unsubscribe, scan, showToast]);

  // ─── Diagram / SVG / Document pane bridges ───
  const diagramBridgeRef = useRef<DiagramBridge | null>(null);
  const [diagramBridge, setDiagramBridge] = useState<DiagramBridge | null>(null);
  const handleDiagramBridge = useCallback((bridge: DiagramBridge) => {
    diagramBridgeRef.current = bridge;
    setDiagramBridge(bridge);
  }, []);

  const svgEditorBridgeRef = useRef<SVGEditorBridge | null>(null);
  const handleSVGEditorBridge = useCallback((bridge: SVGEditorBridge) => {
    svgEditorBridgeRef.current = bridge;
  }, []);

  const leftDocBridgeRef = useRef<DocumentPaneBridge | null>(null);
  const rightDocBridgeRef = useRef<DocumentPaneBridge | null>(null);

  // Document dirty state lives inside `useDocumentContent`; mirror it up
  // so Header's dirty-stack indicator can union document + diagram drafts.
  // Per-pane Sets (not one keyed only by path) so a file open in both
  // panes can't have the right pane's cleanup clear the left pane's entry.
  const [leftDocDirty, setLeftDocDirty] = useState<Set<string>>(() => new Set());
  const [rightDocDirty, setRightDocDirty] = useState<Set<string>>(() => new Set());
  const handleLeftDocDirty = useCallback((filePath: string, dirty: boolean) => {
    setLeftDocDirty((prev) => updateDirtySet(prev, filePath, dirty));
  }, []);
  const handleRightDocDirty = useCallback((filePath: string, dirty: boolean) => {
    setRightDocDirty((prev) => updateDirtySet(prev, filePath, dirty));
  }, []);
  // Header badge counts distinct unsaved paths — same file in both panes
  // collapses to one.
  const headerDirtyFiles = React.useMemo(() => {
    const out = new Set<string>(fileExplorer.dirtyFiles);
    for (const p of leftDocDirty) out.add(p);
    for (const p of rightDocDirty) out.add(p);
    return out;
  }, [fileExplorer.dirtyFiles, leftDocDirty, rightDocDirty]);

  // beforeunload guard fires the browser's "leave site?" dialog when any
  // file is dirty; autosave-draft persists in parallel so work survives
  // even if the user dismisses the dialog.
  const headerDirtyCount = headerDirtyFiles.size;
  useEffect(() => {
    if (headerDirtyCount === 0) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Modern browsers ignore the message but honour preventDefault +
      // a non-empty returnValue.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [headerDirtyCount]);

  // ─── Explorer UI state ───
  const [explorerCollapsed, setExplorerCollapsed] = useState(false);
  const [explorerFilter, setExplorerFilter] = useState<ExplorerFilter>("all");

  // ─── Focus Mode (⌘.) ───
  // Toggle remembers prior chrome state so exiting restores whatever the
  // user had, not a default "explorer open".
  const [focusMode, setFocusMode] = useState(false);
  const focusRestoreRef = useRef<{ explorer: boolean; properties: boolean } | null>(null);

  // ─── Recent files + search ref ───
  const { recentFiles, addToRecents } = useRecentFiles();
  const explorerSearchRef = useRef<HTMLInputElement | null>(null);

  // Sort preferences
  const SORT_PREFS_KEY = "knowledge-base-sort-prefs";
  const [sortPrefs, setSortPrefs] = useState<{ field: SortField; direction: SortDirection; grouping: SortGrouping }>(() => {
    if (typeof window === "undefined") return { field: "name", direction: "asc", grouping: "files-first" };
    try {
      const raw = JSON.parse(localStorage.getItem(SORT_PREFS_KEY) || "{}");
      return { field: raw.field ?? "name", direction: raw.direction ?? "asc", grouping: raw.grouping ?? "files-first" };
    } catch { return { field: "name", direction: "asc", grouping: "files-first" }; }
  });
  const handleSortChange = useCallback((field: SortField, direction: SortDirection, grouping: SortGrouping) => {
    setSortPrefs({ field, direction, grouping });
    try { localStorage.setItem(SORT_PREFS_KEY, JSON.stringify({ field, direction, grouping })); } catch { /* ignore */ }
  }, []);

  // Title/isDirty are owned by each pane's `PaneHeader`; only the confirm
  // popover lifts to the shell because it overlays the whole viewport.
  const confirmAction = diagramBridge?.confirmAction ?? null;

  // Fallback confirm state for file/folder deletion when no DiagramView is open.
  const [shellConfirmAction, setShellConfirmAction] = useState<{
    type: "delete-file" | "delete-folder";
    path: string;
    x: number;
    y: number;
  } | null>(null);

  // ─── Wiki-link aware rename/delete ───
  const handleRenameFileWithLinks = useCallback(async (oldPath: string, newName: string) => {
    if (diagramBridgeRef.current) {
      await diagramBridgeRef.current.handleRenameFile(oldPath, newName);
    } else {
      await fileExplorer.renameFile(oldPath, newName);
    }

    const dir = oldPath.includes("/") ? oldPath.substring(0, oldPath.lastIndexOf("/")) : "";
    const newPath = dir ? `${dir}/${newName}` : newName;
    panes.renamePanePath(oldPath, newPath);

    if (!oldPath.endsWith(".md") && !oldPath.endsWith(".json")) return;

    const rootHandle = fileExplorer.dirHandleRef.current;
    if (!rootHandle) return;

    try {
      await propagateRename(rootHandle, oldPath, newPath, linkManager);
    } catch (e) {
      reportError(e, `Updating link index after renaming ${oldPath}`);
    }

    // Search reindex: drop old path, add new (content unchanged on disk).
    searchManager.removePath(oldPath);
    void (async () => {
      try {
        const item = await readForSearchIndex(rootHandle, newPath);
        if (item) searchManager.addDoc(item.path, item.kind, item.fields);
      } catch { /* swallowed — same policy as the bulk-index walk */ }
    })();
  }, [fileExplorer.dirHandleRef, fileExplorer.renameFile, panes.renamePanePath, linkManager, reportError, searchManager]);

  const handleDeleteFileWithLinks = useCallback((path: string, event: React.MouseEvent) => {
    if (diagramBridgeRef.current) {
      diagramBridgeRef.current.handleDeleteFile(path, event);
      if (path.endsWith(".md") && fileExplorer.dirHandleRef.current) {
        void linkManager.removeDocumentFromIndex(fileExplorer.dirHandleRef.current, path).catch(
          (e) => reportError(e, `Updating link index after deleting ${path}`)
        );
      }
      // `removePath` is a no-op for unindexed paths, so calling it
      // unconditionally is safe.
      searchManager.removePath(path);
    } else {
      setShellConfirmAction({ type: "delete-file", path, x: event.clientX, y: event.clientY });
    }
  }, [fileExplorer.dirHandleRef, linkManager, reportError, searchManager]);

  const handleMoveItemWithLinks = useCallback(async (sourcePath: string, targetFolderPath: string) => {
    // Snapshot tree before the FS move triggers a rescan.
    const tree = fileExplorer.tree;
    await diagramBridgeRef.current?.handleMoveItem(sourcePath, targetFolderPath);
    const rootHandle = fileExplorer.dirHandleRef.current;
    if (!rootHandle) return;
    await propagateMoveLinks(rootHandle, sourcePath, targetFolderPath, tree, linkManager);
  }, [fileExplorer.dirHandleRef, fileExplorer.tree, linkManager]);

  // ─── Document read / reference / delete helpers (used by DiagramView) ───
  const readDocument = useCallback(async (docPath: string): Promise<string | null> => {
    const rootHandle = fileExplorer.dirHandleRef.current;
    if (!rootHandle) return null;
    try {
      const repo = createDocumentRepository(rootHandle);
      return await readOrNull(() => repo.read(docPath));
    } catch (e) {
      reportError(e as Error, `Reading ${docPath}`);
      return null;
    }
  }, [fileExplorer.dirHandleRef, reportError]);

  const getDocumentReferences = useCallback((
    docPath: string,
    exclude?: { entityType: string; entityId: string },
  ) => {
    const doc = docManager.documents.find(d => d.filename === docPath);
    const attachments = (doc?.attachedTo ?? [])
      .filter(a => !exclude || !(a.type === exclude.entityType && a.id === exclude.entityId))
      .map(a => ({ entityType: a.type, entityId: a.id }));

    const seen = new Set<string>();
    const wikiBacklinks: string[] = [];
    for (const bl of linkManager.getBacklinksFor(docPath)) {
      if (!seen.has(bl.sourcePath)) {
        seen.add(bl.sourcePath);
        wikiBacklinks.push(bl.sourcePath);
      }
    }

    return { attachments, wikiBacklinks };
  }, [docManager.documents, linkManager]);

  const deleteDocumentWithCleanup = useCallback(async (docPath: string) => {
    const rootHandle = fileExplorer.dirHandleRef.current;
    if (!rootHandle) return;

    const repo = createDocumentRepository(rootHandle);
    const seen = new Set<string>();
    for (const bl of linkManager.getBacklinksFor(docPath)) {
      if (seen.has(bl.sourcePath)) continue;
      seen.add(bl.sourcePath);
      try {
        const content = await repo.read(bl.sourcePath);
        const stripped = stripWikiLinksForPath(content, docPath);
        if (stripped !== content) await repo.write(bl.sourcePath, stripped);
      } catch (e) {
        reportError(e as Error, `Stripping wiki-link from ${bl.sourcePath}`);
      }
    }

    await linkManager.removeDocumentFromIndex(rootHandle, docPath);
    await fileExplorer.deleteFile(docPath);
    docManager.removeDocument(docPath);
  }, [fileExplorer, linkManager, docManager]);

  // ─── Document operations ───
  const handleOpenDocument = useCallback((path: string) => {
    panes.openFile(path, "document");
  }, [panes]);

  const handleCreateAndAttach = useCallback(async (diagramPath: string, flowId: string, filename: string, editNow: boolean) => {
    const rootHandle = fileExplorer.dirHandleRef.current;
    if (!rootHandle) return;
    if (filename.includes("..") || filename.startsWith("/") || filename.includes("\0")) return;
    const diagramDir = diagramPath.split("/").slice(0, -1).join("/");
    const docPath = diagramDir ? `${diagramDir}/${filename}` : filename;
    try {
      await docManager.createDocument(rootHandle, docPath);
      docManager.attachDocument(docPath, "flow" as const, flowId);
      if (editNow) handleOpenDocument(docPath);
    } catch (e) {
      reportError(e, `Creating ${docPath}`);
    }
  }, [fileExplorer.dirHandleRef, docManager, handleOpenDocument, reportError]);

  // ─── File selection: route to correct pane type ───
  // DiagramView auto-loads on `activeFile` change, so opening the pane is
  // all the shell needs to do.
  const handleSelectFile = useCallback((path: string) => {
    if (path.endsWith(".md")) {
      handleOpenDocument(path);
    } else if (path.endsWith(".svg")) {
      panes.openFile(path, "svgEditor");
    } else if (path.endsWith(".alphatex")) {
      panes.openFile(path, "tab");
    } else {
      panes.openFile(path, "diagram");
    }
  }, [handleOpenDocument, panes]);

  // Resolves `[[name]]` Obsidian-style: relative to the current document's
  // folder first, then bare path, then root-level fallbacks. Same helper
  // `useLinkIndex` uses to build the index, so the resolution matches.
  const handleNavigateWikiLink = useCallback(
    (path: string) => {
      const set = new Set(allPaths);
      const activeFilePath = panes.activeEntry?.filePath ?? null;
      const docDir = activeFilePath
        ? activeFilePath.split("/").slice(0, -1).join("/")
        : "";
      const candidates: string[] = [];
      candidates.push(resolveWikiLinkPath(path, docDir));
      if (!/\.[a-z0-9]+$/i.test(path)) {
        const relDir = docDir ? `${docDir}/${path}` : path;
        candidates.push(`${relDir}.json`);
      }
      candidates.push(path);
      if (!/\.[a-z0-9]+$/i.test(path)) {
        candidates.push(`${path}.md`, `${path}.json`);
      }
      const resolved = candidates.find((c) => set.has(c)) ?? candidates[0];
      handleSelectFile(resolved);
    },
    [allPaths, panes.activeEntry, handleSelectFile],
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
        if (activeEntry?.fileType === "svgEditor") {
          svgEditorBridgeRef.current?.onSave();
          return;
        }
        if (activeEntry?.fileType === "document") {
          const docBridge = panes.focusedSide === "right"
            ? rightDocBridgeRef.current : leftDocBridgeRef.current;
          if (docBridge?.dirty) {
            const rootHandle = fileExplorer.dirHandleRef.current;
            docBridge.save().then(() => {
              if (rootHandle && docBridge.filePath) {
                linkManager.updateDocumentLinks(rootHandle, docBridge.filePath, docBridge.content)
                  .catch((e) => reportError(e, `Updating link index for ${docBridge.filePath}`));
                // Reindex with in-memory content — `save()` already persisted it.
                searchManager.addDoc(docBridge.filePath, "doc", { body: docBridge.content });
              }
            });
          }
        }
        if (!activeEntry || activeEntry.fileType === "diagram") {
          diagramBridgeRef.current?.onSave();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [panes.activeEntry, panes.focusedSide, fileExplorer.dirHandleRef, linkManager]);

  // ─── ⌘K global handler — opens command palette ───
  const { setOpen: setPaletteOpen } = useCommandRegistry();
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        // Skip when typing in an input/textarea/contenteditable.
        const el = document.activeElement as HTMLElement | null;
        if (el) {
          const tag = el.tagName;
          if (tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable) return;
        }
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setPaletteOpen]);

  // ─── ⌘F global handler — focus explorer search ───
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        // Skip when typing in an input/textarea/contenteditable.
        const el = document.activeElement as HTMLElement | null;
        if (el) {
          const tag = el.tagName;
          if (tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable) return;
        }
        e.preventDefault();
        if (explorerCollapsed) setExplorerCollapsed(false);
        // Defer focus so the just-expanded explorer is mounted first.
        setTimeout(() => {
          explorerSearchRef.current?.focus();
          explorerSearchRef.current?.select();
        }, 0);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [explorerCollapsed]);

  // ─── Track recents when active file changes ───
  // Virtual sentinels (graph/graphify/search) have no on-disk file, so
  // pushing them into Recents would render unresolvable entries.
  useEffect(() => {
    const path = panes.activeEntry?.filePath;
    if (path && path !== GRAPH_SENTINEL && path !== GRAPHIFY_SENTINEL && path !== SEARCH_SENTINEL) addToRecents(path);
  }, [panes.activeEntry?.filePath, addToRecents]);

  // ─── "Go to file…" command in palette ───
  const goToFileCommands = useMemo(() => [{
    id: "navigation.go-to-file",
    title: "Go to file…",
    group: "Navigation",
    shortcut: "⌘F",
    run: () => {
      if (explorerCollapsed) setExplorerCollapsed(false);
      setTimeout(() => {
        explorerSearchRef.current?.focus();
        explorerSearchRef.current?.select();
      }, 0);
    },
  }], [explorerCollapsed]);
  useRegisterCommands(goToFileCommands);

  // ─── Focus Mode toggle (⌘.) — palette + raw key handler ───
  const toggleFocusMode = useCallback(() => {
    setFocusMode((prev) => {
      const next = !prev;
      if (next) {
        // Properties state lives in DocumentView and isn't readable here,
        // so we only capture explorer state on enter.
        focusRestoreRef.current = {
          explorer: explorerCollapsed,
          properties: false,
        };
        setExplorerCollapsed(true);
      } else {
        const prior = focusRestoreRef.current;
        if (prior) setExplorerCollapsed(prior.explorer);
        focusRestoreRef.current = null;
      }
      return next;
    });
  }, [explorerCollapsed]);

  const focusModeCommands = useMemo(() => [{
    id: "view.toggle-focus-mode",
    title: "Toggle Focus Mode",
    group: "View",
    shortcut: "⌘.",
    run: toggleFocusMode,
  }], [toggleFocusMode]);
  useRegisterCommands(focusModeCommands);

  // ─── Theme ────────────────────────────────────────────────────────────
  // `useTheme` needs RepositoryContext to persist the user's choice; the
  // palette command + ⌘⇧L handler live inside `ThemedShell` (below) so
  // they fire against the same hook instance the data-theme attribute
  // reads from.

  // Raw ⌘. handler.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ".") {
        // Skip when typing in an input/textarea/contenteditable.
        const el = document.activeElement as HTMLElement | null;
        if (el) {
          const tag = el.tagName;
          if (tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable) return;
        }
        e.preventDefault();
        toggleFocusMode();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleFocusMode]);

  // ─── Restore pane layout (or fall back to single pending file) on directory load ───
  useEffect(() => {
    if (layoutRestoredRef.current || fileExplorer.tree.length === 0) return;
    layoutRestoredRef.current = true;

    const savedLayout = loadPaneLayout();
    if (savedLayout && (savedLayout.leftPane || savedLayout.rightPane)) {
      const allPaths = new Set<string>();
      const walk = (items: typeof fileExplorer.tree) => {
        for (const it of items) {
          if (it.type === "file") allPaths.add(it.path);
          if (it.children) walk(it.children);
        }
      };
      walk(fileExplorer.tree);

      // Virtual sentinels (graph/graphify/search) bypass tree validation
      // since they have no on-disk file; everything else must still exist.
      const isValidEntry = (e: PaneEntry | null): boolean =>
        !!e && (e.fileType === "graph" || e.fileType === "graphify" || e.fileType === "search" || allPaths.has(e.filePath));
      const validLeft = isValidEntry(savedLayout.leftPane) ? savedLayout.leftPane : null;
      const validRight = isValidEntry(savedLayout.rightPane) ? savedLayout.rightPane : null;

      if (validLeft || validRight) {
        panes.restoreLayout(validLeft, validRight, savedLayout.focusedSide);

        const focusedEntry = savedLayout.focusedSide === "right" && validRight ? validRight : validLeft;
        if (focusedEntry) fileExplorer.setActiveFile(focusedEntry.filePath);

        if (savedLayout.lastClosedPane) {
          panes.setLastClosedPane(savedLayout.lastClosedPane);
        }

        if (fileExplorer.pendingFile) fileExplorer.clearPendingFile();
        return;
      }
    }

    if (fileExplorer.pendingFile) {
      handleSelectFile(fileExplorer.pendingFile);
      fileExplorer.clearPendingFile();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileExplorer.tree]);

  // ─── Vault initialization ───
  useEffect(() => {
    const rootHandle = fileExplorer.dirHandleRef.current;
    if (!rootHandle) return;
    (async () => {
      const vaultRepo = createVaultConfigRepository(rootHandle);
      try {
        // readOrNull maps "not a vault folder" (no .archdesigner config)
        // to null → we create one. Any other failure (permission,
        // malformed) surfaces to the shell banner.
        const config = await readOrNull(() => vaultRepo.read());
        if (config) {
          await vaultRepo.touchLastOpened();
        } else if (fileExplorer.directoryName) {
          await vaultRepo.init(fileExplorer.directoryName);
        }
      } catch (e) {
        reportError(e, "Initializing vault config");
      }
      await linkManager.loadIndex(rootHandle);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileExplorer.directoryName]);

  // ─── Full link-index rebuild on first tree load ───
  // `loadIndex` only restores the snapshot; files never opened this
  // session would otherwise miss their backlink entries. Runs once per
  // vault open, in the background, mirroring the Graph "Refresh" trigger.
  const indexRebuildVaultRef = useRef<string | null>(null);
  useEffect(() => {
    const rootHandle = fileExplorer.dirHandleRef.current;
    if (!rootHandle || fileExplorer.tree.length === 0) return;
    if (indexRebuildVaultRef.current === fileExplorer.directoryName) return;
    indexRebuildVaultRef.current = fileExplorer.directoryName;

    const allPaths = collectAllPaths(fileExplorer.tree);
    linkManager.fullRebuild(rootHandle, allPaths).catch((e) =>
      reportError(e, "Hydrating link index on vault open")
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileExplorer.tree, fileExplorer.directoryName]);

  // ─── Search index: bulk reindex on vault open / swap (KB-010b) ───
  // Mirrors the link-index rebuild but stays a separate walk on purpose —
  // combining the two would couple two evolving subsystems. Clears
  // first so paths from the previous vault don't carry over.
  const searchInitVaultRef = useRef<string | null>(null);
  useEffect(() => {
    const rootHandle = fileExplorer.dirHandleRef.current;
    if (!rootHandle || fileExplorer.tree.length === 0 || !searchManager.ready) return;
    if (searchInitVaultRef.current === fileExplorer.directoryName) return;
    searchInitVaultRef.current = fileExplorer.directoryName;

    searchManager.clear();
    const paths = collectAllPaths(fileExplorer.tree);
    void (async () => {
      for (const path of paths) {
        try {
          const item = await readForSearchIndex(rootHandle, path);
          if (item) searchManager.addDoc(item.path, item.kind, item.fields);
        } catch {
          // Per-file failures are non-fatal; the rest of the vault still indexes.
        }
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileExplorer.tree, fileExplorer.directoryName, searchManager.ready]);

  // ─── Graph pane: open-graph + open-from-graph helpers ───
  // Pinning individual `panes` callbacks (instead of depending on `panes`
  // itself) keeps these handler identities stable. `panes` is a fresh
  // object every render, so depending on it would re-register palette
  // commands each render and feedback-loop through `useRegisterCommands`.
  const panesOpenFile = panes.openFile;
  const panesEnterSplit = panes.enterSplit;
  const panesSetFocusedSide = panes.setFocusedSide;
  const handleToggleGraph = useCallback(() => {
    const p = panesRef.current;
    const leftIsGraph  = p.leftPane?.fileType  === "graph";
    const rightIsGraph = p.rightPane?.fileType === "graph";
    if (leftIsGraph || rightIsGraph) {
      const side = leftIsGraph ? "left" : "right";
      p.setFocusedSide(side);
      p.closeFocusedPane();
    } else {
      panesOpenFile(GRAPH_SENTINEL, "graph");
    }
  }, [panesOpenFile]);

  const handleToggleGraphify = useCallback(() => {
    const p = panesRef.current;
    const leftIsGraphify  = p.leftPane?.fileType  === "graphify";
    const rightIsGraphify = p.rightPane?.fileType === "graphify";
    if (leftIsGraphify || rightIsGraphify) {
      const side = leftIsGraphify ? "left" : "right";
      p.setFocusedSide(side);
      p.closeFocusedPane();
    } else {
      panesOpenFile(GRAPHIFY_SENTINEL, "graphify");
    }
  }, [panesOpenFile]);

  // ─── KB-010c: Search panel + palette result picker ──────────────
  const handleToggleSearchPanel = useCallback(() => {
    const p = panesRef.current;
    const leftIsSearch  = p.leftPane?.fileType  === "search";
    const rightIsSearch = p.rightPane?.fileType === "search";
    if (leftIsSearch || rightIsSearch) {
      const side = leftIsSearch ? "left" : "right";
      p.setFocusedSide(side);
      p.closeFocusedPane();
    } else {
      panesOpenFile(SEARCH_SENTINEL, "search");
    }
  }, [panesOpenFile]);

  // Vault-search result picker — used by both the palette and the
  // dedicated SearchPanel. For diagram hits, re-reads the diagram once
  // to find the first node whose label matches the query, then opens
  // with `PaneEntry.searchTarget` so DiagramView can centre + select on
  // mount. For doc hits it just opens the document.
  const handleSearchPick = useCallback(async (result: SearchResult, query: string) => {
    const rootHandle = fileExplorer.dirHandleRef.current;
    if (result.kind === "diagram") {
      let nodeId: string | null = null;
      if (rootHandle) {
        try {
          nodeId = await findFirstNodeMatching(rootHandle, result.path, query);
        } catch {
          /* fall through with no centring intent */
        }
      }
      panesOpenFile(result.path, "diagram", nodeId ? { searchTarget: { nodeId } } : undefined);
    } else if (result.kind === "tab") {
      panesOpenFile(result.path, "tab");
    } else {
      panesOpenFile(result.path, "document");
    }
  }, [fileExplorer.dirHandleRef, panesOpenFile]);

  // Click-from-graph: open the file in the OPPOSITE pane so the graph is
  // never replaced. Reads `panes` via a ref at call time — depending on
  // `panes` directly would flip this callback every render and re-mount
  // the GraphView canvas.
  const panesRef = useRef(panes);
  panesRef.current = panes;
  const handleSelectFromGraph = useCallback((path: string) => {
    const p = panesRef.current;
    const fileType: "document" | "diagram" = path.endsWith(".json") ? "diagram" : "document";
    if (!p.isSplit) {
      panesEnterSplit(path, fileType);
      return;
    }
    const focusedIsGraph = p.focusedSide === "left"
      ? p.leftPane?.fileType === "graph"
      : p.rightPane?.fileType === "graph";
    if (focusedIsGraph) {
      // Flip focus to non-graph side first; defer openFile a tick because
      // `setFocusedSide` and `openFile` are both state setters.
      panesSetFocusedSide(p.focusedSide === "left" ? "right" : "left");
      setTimeout(() => panesOpenFile(path, fileType), 0);
      return;
    }
    panesOpenFile(path, fileType);
  }, [panesEnterSplit, panesSetFocusedSide, panesOpenFile]);

  // ⌘⇧G (not ⌘G) avoids colliding with the diagram editor's Ctrl+G
  // multi-line→flow shortcut (DIAG-3.14-05).
  const openGraphCommands = useMemo(() => [{
    id: "view.open-graph",
    title: "Toggle Graph View",
    group: "View",
    shortcut: "⌘⇧G",
    run: handleToggleGraph,
  }], [handleToggleGraph]);
  useRegisterCommands(openGraphCommands);

  const openGraphifyCommands = useMemo(() => [{
    id: "view.open-graphify",
    title: "Toggle Knowledge Graph",
    group: "View",
    shortcut: "⌘⌃G",
    run: handleToggleGraphify,
  }], [handleToggleGraphify]);
  useRegisterCommands(openGraphifyCommands);

  const openSearchCommands = useMemo(() => [{
    id: "view.open-search",
    title: "Toggle Search Panel",
    group: "View",
    shortcut: "⌘⇧F",
    run: handleToggleSearchPanel,
  }], [handleToggleSearchPanel]);
  useRegisterCommands(openSearchCommands);

  // Inline TabRepository — `KnowledgeBaseInner` sits above the
  // RepositoryProvider, so we can't useRepositories() here. The factory
  // is cheap; the duplicate alongside the provider's internal call is
  // acceptable per `project_repository_context_deferred.md`.
  const tabRepoForImport = useMemo(
    () => fileExplorer.rootHandle ? createTabRepository(fileExplorer.rootHandle) : null,
    [fileExplorer.rootHandle],
  );
  const handleTabImported = useCallback((tabPath: string) => {
    // Open the file in the pane immediately so the user-visible action
    // isn't gated on indexing. The two re-index passes below run in
    // the background — same fire-and-forget shape as the rename
    // handler at L240-250.
    handleSelectFile(tabPath);

    const rootHandle = fileExplorer.dirHandleRef.current;
    if (!rootHandle) return;

    void (async () => {
      try {
        const item = await readForSearchIndex(rootHandle, tabPath);
        if (item) searchManager.addDoc(item.path, item.kind, item.fields);
      } catch {
        // Same swallow policy as the rename re-index path.
      }
    })();

    void (async () => {
      try {
        const allPaths = Object.keys(linkManager.linkIndex.documents);
        if (!allPaths.includes(tabPath)) allPaths.push(tabPath);
        await linkManager.fullRebuild(rootHandle, allPaths);
      } catch (e) {
        reportError(e, `Indexing wiki-links for ${tabPath}`);
      }
    })();
  }, [
    fileExplorer.dirHandleRef,
    searchManager,
    linkManager,
    reportError,
    handleSelectFile,
  ]);

  const gpImport = useGpImport({
    tab: tabRepoForImport,
    onImported: handleTabImported,
  });
  const importGpCommands = useMemo(() => [{
    id: "tabs.import-gp",
    title: "Import Guitar Pro file…",
    group: "File",
    when: () => fileExplorer.directoryName !== null,
    run: () => gpImport.pickFile(),
  }], [gpImport, fileExplorer.directoryName]);
  useRegisterCommands(importGpCommands);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "f" || e.key === "F")) {
        const el = document.activeElement as HTMLElement | null;
        if (el) {
          const tag = el.tagName;
          if (tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable) return;
        }
        e.preventDefault();
        handleToggleSearchPanel();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleToggleSearchPanel]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "g" || e.key === "G")) {
        const el = document.activeElement as HTMLElement | null;
        if (el) {
          const tag = el.tagName;
          if (tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable) return;
        }
        e.preventDefault();
        handleToggleGraph();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleToggleGraph]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey && e.ctrlKey && !e.shiftKey && (e.key === "g" || e.key === "G")) {
        const el = document.activeElement as HTMLElement | null;
        if (el) {
          const tag = el.tagName;
          if (tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable) return;
        }
        e.preventDefault();
        handleToggleGraphify();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleToggleGraphify]);

  // ─── Render pane callback for PaneManager ───
  const renderPane = useCallback((entry: PaneEntry, focused: boolean, side: "left" | "right") => {
    if (entry.fileType === "search") {
      return (
        <SearchPanel
          searchFn={searchManager.search}
          onResultClick={handleSearchPick}
        />
      );
    }
    if (entry.fileType === "graphify") {
      return (
        <GraphifyView
          focused={focused}
          dirHandleRef={fileExplorer.dirHandleRef}
          onSelectNode={handleSelectFromGraph}
        />
      );
    }
    if (entry.fileType === "graph") {
      return (
        <GraphView
          focused={focused}
          tree={fileExplorer.tree}
          linkIndex={linkManager.linkIndex}
          onSelectNode={handleSelectFromGraph}
          onRefresh={async () => {
            const rootHandle = fileExplorer.dirHandleRef.current;
            if (!rootHandle) return;
            const allPaths = collectAllPaths(fileExplorer.tree);
            await linkManager.fullRebuild(rootHandle, allPaths).catch((e) =>
              reportError(e, "Rebuilding graph index")
            );
          }}
        />
      );
    }
    if (entry.fileType === "diagram") {
      return (
        <DiagramView
          focused={focused}
          side={side}
          activeFile={entry.filePath}
          searchTarget={entry.searchTarget}
          fileExplorer={fileExplorer}
          onOpenDocument={handleOpenDocument}
          documents={docManager.documents}
          onAttachDocument={(docPath, entityType, entityId) => {
            docManager.attachDocument(docPath, entityType as "node" | "connection" | "flow", entityId);
          }}
          onDetachDocument={(docPath, entityType, entityId) => {
            docManager.detachDocument(docPath, entityType, entityId);
          }}
          onCreateAndAttach={(flowId, filename, editNow) => handleCreateAndAttach(entry.filePath ?? '', flowId, filename, editNow)}
          onCreateDocument={async (rootHandle, path) => {
            try {
              await docManager.createDocument(rootHandle, path);
            } catch (e) {
              reportError(e, `Creating ${path}`);
            }
          }}
          onLoadDocuments={docManager.setDocuments}
          backlinks={entry.filePath ? linkManager.getBacklinksFor(entry.filePath) : []}
          onDiagramBridge={handleDiagramBridge}
          readDocument={readDocument}
          getDocumentReferences={getDocumentReferences}
          deleteDocumentWithCleanup={deleteDocumentWithCleanup}
          onAfterDiagramSaved={(diagramPath, docs) => {
            const rootHandle = fileExplorer.dirHandleRef.current;
            if (!rootHandle) return;
            const docFilenames = docs.map((d) => d.filename);
            linkManager.updateDiagramLinks(rootHandle, diagramPath, docFilenames).catch((e) =>
              reportError(e, `Updating diagram links for ${diagramPath}`)
            );
            // Search reindex: re-read the diagram so new node labels /
            // layer titles / flow names enter the index. The bridge has
            // already written to disk by the time this fires.
            void (async () => {
              try {
                const item = await readForSearchIndex(rootHandle, diagramPath);
                if (item) searchManager.addDoc(item.path, item.kind, item.fields);
              } catch { /* see bulk-index policy */ }
            })();
          }}
        />
      );
    }
    if (entry.fileType === "svgEditor") {
      return (
        <SVGEditorView
          focused={focused}
          side={side}
          activeFile={entry.filePath}
          onSVGEditorBridge={handleSVGEditorBridge}
        />
      );
    }

    if (entry.fileType === "tab") {
      return renderTabPaneEntry(entry, buildTabPaneContext({
        documents: docManager.documents,
        backlinks: entry.filePath ? linkManager.getBacklinksFor(entry.filePath) : [],
        // KB-040 / TAB-012: mobile boots the tab pane read-only.
        isMobile,
        onPreviewDocument: (docPath) => handleOpenDocument(docPath),
        onAttachDocument: (docPath, entityType, entityId) => {
          docManager.attachDocument(
            docPath,
            entityType as "tab" | "tab-section",
            entityId,
          );
        },
        onDetachDocument: (docPath, entityType, entityId) => {
          docManager.detachDocument(docPath, entityType, entityId);
        },
        onCreateDocument: async (rootHandle, path) => {
          try {
            await docManager.createDocument(rootHandle, path);
          } catch (e) {
            reportError(e, `Creating ${path}`);
          }
        },
        getDocumentsForEntity: docManager.getDocumentsForEntity,
        allDocPaths: docManager.collectDocPaths(fileExplorer.tree),
        rootHandle: fileExplorer.dirHandleRef.current,
        onMigrateAttachments: (path, migrations) => {
          docManager.migrateAttachments(path, migrations);
        },
      }));
    }

    return (
      <DocumentView
        focused={focused}
        filePath={entry.filePath}
        dirHandleRef={fileExplorer.dirHandleRef}
        // Force focus-mode on mobile so markdown toolbar + Properties panel
        // collapse for a reader-first chrome.
        focusMode={focusMode || isMobile}
        onDocBridge={(bridge) => {
          if (side === "left") leftDocBridgeRef.current = bridge;
          else rightDocBridgeRef.current = bridge;
        }}
        onDirtyChange={side === "left" ? handleLeftDocDirty : handleRightDocDirty}
        linkManager={linkManager}
        tree={fileExplorer.tree}
        onNavigateLink={handleNavigateWikiLink}
        onCreateDocument={async (path) => {
          const rootHandle = fileExplorer.dirHandleRef.current;
          if (!rootHandle) return;
          try {
            await docManager.createDocument(rootHandle, path);
            handleOpenDocument(path);
          } catch (e) {
            reportError(e, `Creating ${path}`);
          }
        }}
      />
    );
  }, [fileExplorer, docManager, linkManager, handleOpenDocument, handleDiagramBridge, handleSVGEditorBridge, handleNavigateWikiLink, handleCreateAndAttach, focusMode, isMobile, handleLeftDocDirty, handleRightDocDirty, reportError]);

  // ─── Empty state when no file is open ───
  // FirstRunHero takes over only when no vault is open; the explorer's
  // own "No folder open" sidebar UI is left alone.
  const noVaultOpen = !fileExplorer.directoryName && fileExplorer.tree.length === 0;
  const handleEmptyStateNewNote = useCallback(async () => {
    const created = await fileExplorer.createDocument("");
    if (created) handleSelectFile(created);
  }, [fileExplorer, handleSelectFile]);
  const emptyState = noVaultOpen ? (
    <FirstRunHero
      onOpenFolder={fileExplorer.openFolder}
      onOpenWithSeed={fileExplorer.openFolderWithSeed}
    />
  ) : (
    <EmptyState
      recents={recentFiles}
      onSelectRecent={handleSelectFile}
      onCreateNote={handleEmptyStateNewNote}
    />
  );

  // ─── Mobile read pane content ───
  // Reuses the desktop `renderPane`; the diagram touch hook activates
  // because `isMobile && readOnly` is true on mobile boot. Graph is
  // handled inside MobileShell directly.
  const mobileReadPane = panes.activeEntry && panes.activeEntry.fileType !== "graph"
    ? renderPane(panes.activeEntry, true, panes.focusedSide)
    : null;

  return (
    <RepositoryProvider rootHandle={fileExplorer.rootHandle}>
    <ThemedShell>
    {(themeCtx) => (
    <>
    <ServiceWorkerRegister />
    {!isFsAccessSupported ? (
      <div
        data-testid="knowledge-base"
        data-theme={themeCtx.theme}
        className="w-full h-screen bg-surface-2 font-sans flex items-center justify-center p-8 overflow-hidden"
      >
        <UnsupportedBrowserCard />
      </div>
    ) : isMobile ? (
      <div
        data-testid="knowledge-base"
        data-theme={themeCtx.theme}
        className="w-full h-screen overflow-hidden"
      >
        <MobileShell
          theme={themeCtx.theme}
          onToggleTheme={themeCtx.toggleTheme}
          dirtyCount={headerDirtyFiles.size}
          activeFilePath={
            panes.activeEntry && panes.activeEntry.fileType !== "graph" && panes.activeEntry.fileType !== "graphify"
              ? panes.activeEntry.filePath
              : null
          }
          readPane={mobileReadPane}
          linkIndex={linkManager.linkIndex}
          onSelectFromGraph={handleSelectFromGraph}
          directoryName={fileExplorer.directoryName}
          tree={fileExplorer.tree}
          leftPaneFile={panes.leftPane?.filePath ?? null}
          rightPaneFile={panes.rightPane?.filePath ?? null}
          dirtyFiles={fileExplorer.dirtyFiles}
          onOpenFolder={fileExplorer.openFolder}
          onSelectFile={handleSelectFile}
          onCreateFile={async (parentPath) => {
            const result = await fileExplorer.createFile(parentPath);
            if (result) {
              handleSelectFile(result.path);
              const rootHandle = fileExplorer.dirHandleRef.current;
              if (rootHandle) {
                linkManager.updateDiagramLinks(rootHandle, result.path, []).catch(() => {});
                // Register an empty entry so rename/delete have a path to
                // reference before the user adds searchable content.
                searchManager.addDoc(result.path, "diagram", {});
              }
            }
            return result?.path ?? null;
          }}
          onCreateDocument={async (parentPath) => {
            const resultPath = await fileExplorer.createDocument(parentPath);
            if (resultPath) {
              handleSelectFile(resultPath);
              const rootHandle = fileExplorer.dirHandleRef.current;
              if (rootHandle) {
                linkManager.updateDocumentLinks(rootHandle, resultPath, "").catch(() => {});
                searchManager.addDoc(resultPath, "doc", { body: "" });
              }
            }
            return resultPath;
          }}
          onCreateSVG={async (parentPath) => {
            const resultPath = await fileExplorer.createSVG(parentPath);
            if (resultPath) handleSelectFile(resultPath);
            return resultPath;
          }}
          onCreateFolder={(parentPath) => diagramBridgeRef.current?.handleCreateFolder(parentPath) ?? Promise.resolve(null)}
          onDeleteFile={handleDeleteFileWithLinks}
          onDeleteFolder={(path, event) => {
            if (diagramBridgeRef.current) {
              diagramBridgeRef.current.handleDeleteFolder(path, event);
            } else {
              setShellConfirmAction({ type: "delete-folder", path, x: event.clientX, y: event.clientY });
            }
          }}
          onRenameFile={handleRenameFileWithLinks}
          onRenameFolder={(oldPath, newName) => diagramBridgeRef.current?.handleRenameFolder(oldPath, newName)}
          onDuplicateFile={(path) => diagramBridgeRef.current?.handleDuplicateFile(path)}
          onMoveItem={handleMoveItemWithLinks}
          isLoading={fileExplorer.isLoading}
          onRefresh={watcherRefresh}
          sortField={sortPrefs.field}
          sortDirection={sortPrefs.direction}
          sortGrouping={sortPrefs.grouping}
          onSortChange={handleSortChange}
          explorerFilter={explorerFilter}
          onFilterChange={setExplorerFilter}
          onSelectDocument={handleOpenDocument}
          recentFiles={recentFiles}
          searchInputRef={explorerSearchRef}
        />
        <CommandPalette searchFn={searchManager.search} onSearchPick={handleSearchPick} />
      </div>
    ) : (
    <div
      data-testid="knowledge-base"
      data-theme={themeCtx.theme}
      className="w-full h-screen bg-surface-2 font-sans flex flex-col overflow-hidden relative"
    >
      <Header
        isSplit={panes.isSplit}
        dirtyFiles={headerDirtyFiles}
        theme={themeCtx.theme}
        onToggleTheme={themeCtx.toggleTheme}
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

      {/* Explorer + Viewport + Properties */}
      <div className="flex-1 flex min-h-0">
        {/* Left sidebar: Explorer (fully hidden in Focus Mode — even the
            36px collapsed bar is gone so reading lines aren't cramped). */}
        <div
          className="flex-shrink-0 bg-surface border-r border-line flex flex-col transition-[width] duration-200 overflow-hidden"
          style={{ width: focusMode ? 0 : explorerCollapsed ? 36 : 240, borderRightWidth: focusMode ? 0 : 1 }}
          data-testid="explorer-container"
          data-print-hide="true"
          aria-hidden={focusMode}
        >
          <ExplorerPanel
            collapsed={explorerCollapsed}
            onToggleCollapse={() => setExplorerCollapsed((c) => !c)}
            directoryName={fileExplorer.directoryName}
            tree={fileExplorer.tree}
            leftPaneFile={panes.leftPane?.filePath ?? null}
            rightPaneFile={panes.rightPane?.filePath ?? null}
            dirtyFiles={fileExplorer.dirtyFiles}
            onOpenFolder={fileExplorer.openFolder}
            onSelectFile={handleSelectFile}
            onCreateFile={async (parentPath) => {
              const result = await fileExplorer.createFile(parentPath);
              if (result) handleSelectFile(result.path);
              return result?.path ?? null;
            }}
            onCreateDocument={async (parentPath) => {
              const resultPath = await fileExplorer.createDocument(parentPath);
              if (resultPath) handleSelectFile(resultPath);
              return resultPath;
            }}
            onCreateSVG={async (parentPath) => {
              const resultPath = await fileExplorer.createSVG(parentPath);
              if (resultPath) handleSelectFile(resultPath);
              return resultPath;
            }}
            onCreateFolder={(parentPath) => diagramBridgeRef.current?.handleCreateFolder(parentPath) ?? Promise.resolve(null)}
            onDeleteFile={handleDeleteFileWithLinks}
            onDeleteFolder={(path, event) => {
              if (diagramBridgeRef.current) {
                diagramBridgeRef.current.handleDeleteFolder(path, event);
              } else {
                setShellConfirmAction({ type: "delete-folder", path, x: event.clientX, y: event.clientY });
              }
            }}
            onRenameFile={handleRenameFileWithLinks}
            onRenameFolder={(oldPath, newName) => diagramBridgeRef.current?.handleRenameFolder(oldPath, newName)}
            onDuplicateFile={(path) => diagramBridgeRef.current?.handleDuplicateFile(path)}
            onMoveItem={handleMoveItemWithLinks}
            isLoading={fileExplorer.isLoading}
            onRefresh={watcherRefresh}
            sortField={sortPrefs.field}
            sortDirection={sortPrefs.direction}
            sortGrouping={sortPrefs.grouping}
            onSortChange={handleSortChange}
            explorerFilter={explorerFilter}
            onFilterChange={setExplorerFilter}
            onSelectDocument={handleOpenDocument}
            recentFiles={recentFiles}
            searchInputRef={explorerSearchRef}
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

      {/* Footer unmounts in Focus Mode so document content fills the
          full vertical space. */}
      {!focusMode && <Footer focusedEntry={panes.activeEntry} isSplit={panes.isSplit} />}

      {/* ⌘K Command Palette — overlays the entire viewport */}
      <CommandPalette searchFn={searchManager.search} onSearchPick={handleSearchPick} />

      {/* Confirmation popover — bridge-owned (diagram open) or shell-owned (no diagram) */}
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
      {shellConfirmAction && (
        <ConfirmPopover
          message={
            shellConfirmAction.type === "delete-file"
              ? `Delete "${shellConfirmAction.path.split("/").pop()}"?`
              : `Delete folder "${shellConfirmAction.path.split("/").pop()}" and all its contents?`
          }
          confirmLabel="Delete"
          confirmColor="red"
          position={{ x: shellConfirmAction.x, y: shellConfirmAction.y }}
          onConfirm={async () => {
            const { type, path } = shellConfirmAction;
            setShellConfirmAction(null);
            if (type === "delete-file") {
              await fileExplorer.deleteFile(path);
              if (path.endsWith(".md") && fileExplorer.dirHandleRef.current) {
                await linkManager.removeDocumentFromIndex(fileExplorer.dirHandleRef.current, path).catch(
                  (e) => reportError(e, `Updating link index after deleting ${path}`)
                );
              }
            } else {
              await fileExplorer.deleteFolder(path);
            }
          }}
          onCancel={() => setShellConfirmAction(null)}
        />
      )}
    </div>
    )}
    </>
    )}
    </ThemedShell>
    </RepositoryProvider>
  );
}

/**
 * Render-prop wrapper that mounts `useTheme` inside `RepositoryProvider`
 * (the hook needs the context to persist into `vaultConfig.theme`), and
 * registers the palette command + ⌘⇧L handler against that hook instance.
 */
function ThemedShell({
  children,
}: {
  children: (api: { theme: "light" | "dark"; toggleTheme: () => void }) => React.ReactNode;
}) {
  const { theme, toggleTheme } = useTheme();

  const themeCommands = useMemo(() => [{
    id: "view.toggle-theme",
    title: "Toggle Light / Dark Theme",
    group: "View",
    shortcut: "⌘⇧L",
    run: toggleTheme,
  }], [toggleTheme]);
  useRegisterCommands(themeCommands);

  // Raw ⌘⇧L handler.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "l" || e.key === "L")) {
        // Skip when typing in an input/textarea/contenteditable.
        const el = document.activeElement as HTMLElement | null;
        if (el) {
          const tag = el.tagName;
          if (tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable) return;
        }
        e.preventDefault();
        toggleTheme();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleTheme]);

  return <>{children({ theme, toggleTheme })}</>;
}

export default function KnowledgeBase() {
  return (
    <ShellErrorBoundary>
      <ShellErrorProvider>
        <ShellErrorBanner />
        <ToolbarProvider>
          <FooterProvider>
            <FileWatcherProvider>
              <ToastProvider>
                <CommandRegistryProvider>
                  <KnowledgeBaseInner />
                </CommandRegistryProvider>
              </ToastProvider>
            </FileWatcherProvider>
          </FooterProvider>
        </ToolbarProvider>
      </ShellErrorProvider>
    </ShellErrorBoundary>
  );
}
