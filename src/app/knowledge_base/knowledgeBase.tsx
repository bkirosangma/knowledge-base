import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import type { ExplorerFilter } from "./shared/utils/types";
import ExplorerPanel from "./shared/components/explorer/ExplorerPanel";
import ConfirmPopover from "./shared/components/explorer/ConfirmPopover";
import Header from "./shared/components/Header";
import { useFileExplorer } from "./shared/hooks/useFileExplorer";
import { useDocuments } from "./features/document/hooks/useDocuments";
import { useLinkIndex } from "./features/document/hooks/useLinkIndex";
import { createVaultConfigRepository } from "./infrastructure/vaultConfigRepo";
import { resolveWikiLinkPath, stripWikiLinksForPath } from "./features/document/utils/wikiLinkParser";
import { createDocumentRepository } from "./infrastructure/documentRepo";
import { propagateRename, propagateMoveLinks } from "./shared/hooks/fileExplorerHelpers";
import { savePaneLayout, loadPaneLayout } from "./shared/utils/persistence";
import type { SortField, SortDirection, SortGrouping } from "./shared/components/explorer/ExplorerPanel";
import DiagramView from "./features/diagram/DiagramView";
import type { DiagramBridge } from "./features/diagram/DiagramView";
import DocumentView from "./features/document/DocumentView";
import type { DocumentPaneBridge } from "./features/document/DocumentView";
import GraphView from "./features/graph/GraphView";
import { ToolbarProvider, GRAPH_SENTINEL } from "./shell/ToolbarContext";
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
 * Returns a new Set with `path` added (when `dirty`) or removed (when `!dirty`),
 * or the same Set when the operation is a no-op. Exported for unit tests.
 *
 * Used by per-pane dirty publishers in `KnowledgeBaseInner` (SHELL-1.12).
 * Each pane gets its own Set so the same file open in both panes is tracked
 * as two distinct publishers — preventing the right pane's mount from
 * clearing a path the left pane still owns.
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
  // Phase 3 PR 3 — viewport detection drives mobile shell branching.
  const { isMobile } = useViewport();
  // Phase 3 PR 3 — offline cache for last 10 recents (best-effort).
  useOfflineCache({ rootHandleRef: fileExplorer.dirHandleRef, tree: fileExplorer.tree });
  const panes = usePaneManager();
  const { subscribe, unsubscribe, refresh: watcherRefresh } = useFileWatcher();

  // ─── Tree subscriber: file-watcher events trigger quiet rescan ───
  // Uses watcherRescan (not refresh) to avoid loading-state flash and
  // permission re-check on every polling tick.
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
        // Background scan errors are non-fatal — silently swallow so the
        // subscriber failure doesn't block other watchers on this tick.
      }
    });
    return () => unsubscribe("background");
  }, [subscribe, unsubscribe, scan, showToast]);

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

  // ─── Open-document dirty tracker ───
  // DiagramView already pushes dirty file paths into `fileExplorer.dirtyFiles`
  // via `useDrafts.markDirty`; documents track dirty state locally inside
  // `useDocumentContent`. This shell-level state bridges the document side so
  // the global dirty-stack indicator in `Header` reflects every unsaved file
  // across panes (SHELL-1.12, 2026-04-26).
  //
  // Per-pane publishers (SHELL-1.12, race-condition fix): each pane is its
  // own publisher, keyed by side. The previous single Set<string> keyed only
  // by filePath caused a race when the same file was open in both panes —
  // the right pane's mount effect would fire `onDirtyChange(path, false)` and
  // clear a path the left pane still owned. Splitting state by side keeps
  // each pane's publish/cleanup scoped to itself; the Header takes the union.
  const [leftDocDirty, setLeftDocDirty] = useState<Set<string>>(() => new Set());
  const [rightDocDirty, setRightDocDirty] = useState<Set<string>>(() => new Set());
  const handleLeftDocDirty = useCallback((filePath: string, dirty: boolean) => {
    setLeftDocDirty((prev) => updateDirtySet(prev, filePath, dirty));
  }, []);
  const handleRightDocDirty = useCallback((filePath: string, dirty: boolean) => {
    setRightDocDirty((prev) => updateDirtySet(prev, filePath, dirty));
  }, []);
  // Combine diagram drafts + per-pane document dirty state for the Header badge.
  // Same file open in both panes deduplicates to one entry — the badge counts
  // distinct unsaved paths globally.
  const headerDirtyFiles = React.useMemo(() => {
    const out = new Set<string>(fileExplorer.dirtyFiles);
    for (const p of leftDocDirty) out.add(p);
    for (const p of rightDocDirty) out.add(p);
    return out;
  }, [fileExplorer.dirtyFiles, leftDocDirty, rightDocDirty]);

  // ─── Explorer UI state ───
  const [explorerCollapsed, setExplorerCollapsed] = useState(false);
  const [explorerFilter, setExplorerFilter] = useState<ExplorerFilter>("all");

  // ─── Focus Mode (⌘.) ───
  // Hides explorer + properties + footer + editor toolbar so only the
  // document content + breadcrumb remain.  Saves the prior collapse state
  // so toggling off restores whatever the user had before — never just
  // "explorer back open" by default.
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

  // Derived state from bridge (with safe defaults). Title / isDirty now live
  // in each pane's `PaneHeader` row (folded from `PaneTitle` in SHELL-1.12,
  // 2026-04-26) and don't need lifting to the shell — only the confirm-
  // popover stays here because it's shell chrome that overlays the whole
  // viewport.
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
  }, [fileExplorer.dirHandleRef, fileExplorer.renameFile, panes.renamePanePath, linkManager, reportError]);

  const handleDeleteFileWithLinks = useCallback((path: string, event: React.MouseEvent) => {
    if (diagramBridgeRef.current) {
      diagramBridgeRef.current.handleDeleteFile(path, event);
      if (path.endsWith(".md") && fileExplorer.dirHandleRef.current) {
        void linkManager.removeDocumentFromIndex(fileExplorer.dirHandleRef.current, path).catch(
          (e) => reportError(e, `Updating link index after deleting ${path}`)
        );
      }
    } else {
      setShellConfirmAction({ type: "delete-file", path, x: event.clientX, y: event.clientY });
    }
  }, [fileExplorer.dirHandleRef, linkManager, reportError]);

  const handleMoveItemWithLinks = useCallback(async (sourcePath: string, targetFolderPath: string) => {
    // Capture tree snapshot before the FS move triggers a rescan
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

    // Strip wiki-links from all backlink sources (deduplicated)
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

    // Remove from link index
    await linkManager.removeDocumentFromIndex(rootHandle, docPath);

    // Delete the file via fileExplorer (handles drafts + localStorage)
    await fileExplorer.deleteFile(docPath);

    // Remove from documents state
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
  // DiagramView auto-loads its file via useEffect on activeFile change,
  // so we only need to open the pane here.
  const handleSelectFile = useCallback((path: string) => {
    if (path.endsWith(".md")) {
      handleOpenDocument(path);
    } else {
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
                linkManager.updateDocumentLinks(rootHandle, docBridge.filePath, docBridge.content)
                  .catch((e) => reportError(e, `Updating link index for ${docBridge.filePath}`));
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

  // ─── ⌘K global handler — opens command palette ───
  const { setOpen: setPaletteOpen } = useCommandRegistry();
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        // Guard: don't fire when focus is inside an input, textarea, or contenteditable.
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
        // Guard: don't steal from inputs/textareas/contenteditable
        const el = document.activeElement as HTMLElement | null;
        if (el) {
          const tag = el.tagName;
          if (tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable) return;
        }
        e.preventDefault();
        // Expand explorer if collapsed
        if (explorerCollapsed) setExplorerCollapsed(false);
        // Focus search after a tick (in case explorer was just expanded)
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
  // Skip the GRAPH_SENTINEL — the virtual graph pane has no on-disk file,
  // so pushing "__graph__" into Recents would render an unresolvable
  // entry users can click. (Phase 3 PR 2.)
  useEffect(() => {
    const path = panes.activeEntry?.filePath;
    if (path && path !== GRAPH_SENTINEL) addToRecents(path);
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
        // Entering — capture current chrome state so we can restore it.
        focusRestoreRef.current = {
          explorer: explorerCollapsed,
          properties: false, // properties state lives in DocumentView; we
                             // can't read it here, so on exit we just leave
                             // DocumentView's local state alone.
        };
        setExplorerCollapsed(true);
      } else {
        // Exiting — restore explorer to whatever the user had.
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

  // ─── Theme (Phase 3 PR 1) ──────────────────────────────────────────────
  // `useTheme` needs RepositoryContext to persist the user's choice into
  // `vaultConfig.theme` and to read it back on first mount. We wrap the
  // rendered shell in a `ThemedShell` child component (defined below)
  // that lives INSIDE the `RepositoryProvider` and exposes `theme` +
  // `toggleTheme` as props to the JSX subtree. The palette command + the
  // ⌘⇧L global handler also live in `ThemedShell` so they fire against
  // the same hook instance the data-theme attribute reads from.

  // Raw ⌘. handler — guards against firing while typing in inputs/contenteditable
  // exactly like the existing ⌘K and ⌘F handlers above.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ".") {
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
      // Validate saved files still exist in tree
      const allPaths = new Set<string>();
      const walk = (items: typeof fileExplorer.tree) => {
        for (const it of items) {
          if (it.type === "file") allPaths.add(it.path);
          if (it.children) walk(it.children);
        }
      };
      walk(fileExplorer.tree);

      // The graph pane has no on-disk file — the GRAPH_SENTINEL filePath
      // won't be in `allPaths`, so we accept it explicitly. Other panes
      // still validate against the tree to avoid restoring deleted files.
      const isValidEntry = (e: PaneEntry | null): boolean =>
        !!e && (e.fileType === "graph" || allPaths.has(e.filePath));
      const validLeft = isValidEntry(savedLayout.leftPane) ? savedLayout.leftPane : null;
      const validRight = isValidEntry(savedLayout.rightPane) ? savedLayout.rightPane : null;

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
      const vaultRepo = createVaultConfigRepository(rootHandle);
      try {
        // Phase 5c: readOrNull maps "not a vault folder" (no .archdesigner
        // config) to null → we create one. Any other failure (permission,
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

  // ─── Graph pane: open-graph + open-from-graph helpers ───
  // Opening the graph from the palette: replace the focused pane with the
  // virtual graph entry. (Same as `panes.openFile` for any other type —
  // the sentinel just signals "no on-disk file".)
  // Pin the openFile callback identity (it's already a useCallback inside
  // usePaneManager, but `panes` itself is a fresh object every render —
  // so depending on `panes` here would cause `handleOpenGraph` to flip
  // identity each render, which would re-register the palette command
  // every render and feedback-loop through `useRegisterCommands` ➜
  // setVersion ➜ re-render. Pinning the individual callbacks gives us
  // a stable identity for the cmd registration.
  const panesOpenFile = panes.openFile;
  const panesEnterSplit = panes.enterSplit;
  const panesSetFocusedSide = panes.setFocusedSide;
  const handleOpenGraph = useCallback(() => {
    panesOpenFile(GRAPH_SENTINEL, "graph");
  }, [panesOpenFile]);

  // Click-from-graph: open the file in the OPPOSITE pane so the graph
  // never gets replaced by the click. Three sub-cases:
  //   (a) Single pane = graph → split: graph stays left, file opens right.
  //   (b) Split with graph on focused side → flip focus to other side, then
  //       openFile (which targets the focused pane).
  //   (c) Split with graph on the unfocused side → openFile on the
  //       currently focused (non-graph) side, no flip needed.
  // Reads pane state via refs at call time to keep this callback identity
  // stable across renders (otherwise GraphView's `onSelectNode` prop would
  // flip every keystroke and the canvas would re-mount).
  const panesRef = useRef(panes);
  panesRef.current = panes;
  const handleSelectFromGraph = useCallback((path: string) => {
    const p = panesRef.current;
    const fileType: "document" | "diagram" = path.endsWith(".json") ? "diagram" : "document";
    if (!p.isSplit) {
      // Case (a): keep graph on the left, open target on the right.
      panesEnterSplit(path, fileType);
      return;
    }
    const focusedIsGraph = p.focusedSide === "left"
      ? p.leftPane?.fileType === "graph"
      : p.rightPane?.fileType === "graph";
    if (focusedIsGraph) {
      // Case (b): flip focus to non-graph side first, then open.
      panesSetFocusedSide(p.focusedSide === "left" ? "right" : "left");
      // openFile targets the (newly) focused side via state-after-flip;
      // the next tick is fine because openFile is itself a state setter.
      setTimeout(() => panesOpenFile(path, fileType), 0);
      return;
    }
    // Case (c): focused pane is already non-graph — straight open.
    panesOpenFile(path, fileType);
  }, [panesEnterSplit, panesSetFocusedSide, panesOpenFile]);

  // Register the "Open Graph View" command + ⌘⇧G global handler.
  // ⌘⇧G (instead of ⌘G) avoids colliding with the diagram editor's
  // existing Ctrl+G shortcut that creates a flow from a multi-line
  // selection (DIAG-3.14-05). Both shortcuts coexist cleanly because
  // the modifier set is distinct.
  const openGraphCommands = useMemo(() => [{
    id: "view.open-graph",
    title: "Open Graph View",
    group: "View",
    shortcut: "⌘⇧G",
    run: handleOpenGraph,
  }], [handleOpenGraph]);
  useRegisterCommands(openGraphCommands);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "g" || e.key === "G")) {
        const el = document.activeElement as HTMLElement | null;
        if (el) {
          const tag = el.tagName;
          if (tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable) return;
        }
        e.preventDefault();
        handleOpenGraph();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleOpenGraph]);

  // ─── Render pane callback for PaneManager ───
  const renderPane = useCallback((entry: PaneEntry, focused: boolean, side: "left" | "right") => {
    if (entry.fileType === "graph") {
      return (
        <GraphView
          focused={focused}
          tree={fileExplorer.tree}
          linkIndex={linkManager.linkIndex}
          onSelectNode={handleSelectFromGraph}
        />
      );
    }
    if (entry.fileType === "diagram") {
      return (
        <DiagramView
          focused={focused}
          side={side}
          activeFile={entry.filePath}
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
        />
      );
    }

    return (
      <DocumentView
        focused={focused}
        filePath={entry.filePath}
        dirHandleRef={fileExplorer.dirHandleRef}
        // On mobile, force focus-mode treatment so the markdown toolbar
        // and Properties panel collapse — Phase 3 PR 3 §5 (reader-first
        // mobile chrome).  The explorer/footer chrome focus-mode would
        // also strip is already absent in MobileShell, so re-using the
        // existing `focusMode` flag is the cleanest path.
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
  }, [fileExplorer, docManager, linkManager, handleOpenDocument, handleDiagramBridge, handleNavigateWikiLink, handleCreateAndAttach, focusMode, isMobile, handleLeftDocDirty, handleRightDocDirty]);

  // ─── Empty state when no file is open ───
  const emptyState = (
    <div className="flex-1 flex items-center justify-center bg-surface-2">
      <div className="flex flex-col items-center gap-3 text-mute">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-mute opacity-60"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M9 21V9" /></svg>
        <p className="text-sm font-medium">No file open</p>
        <p className="text-xs text-mute">Open a file from the explorer to start editing</p>
      </div>
    </div>
  );

  // ─── Mobile read pane content ───
  // When the viewport collapses to MobileShell, the "Read" tab needs to
  // display whatever the focused pane would normally show. We reuse the
  // same renderPane that the desktop PaneManager uses; the diagram's
  // touch hook activates because `isMobile && readOnly` is true on
  // mobile boot (read-only is the default for both file types). Graph
  // is handled inside MobileShell directly.
  const mobileReadPane = panes.activeEntry && panes.activeEntry.fileType !== "graph"
    ? renderPane(panes.activeEntry, true, panes.focusedSide)
    : null;

  return (
    <RepositoryProvider rootHandle={fileExplorer.rootHandle}>
    <ThemedShell>
    {(themeCtx) => (
    <>
    <ServiceWorkerRegister />
    {isMobile ? (
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
            panes.activeEntry && panes.activeEntry.fileType !== "graph"
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
            if (result) handleSelectFile(result.path);
            return result?.path ?? null;
          }}
          onCreateDocument={async (parentPath) => {
            const resultPath = await fileExplorer.createDocument(parentPath);
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
        {/* Hidden fallback input for browsers without File System Access API */}
        <input
          ref={fileExplorer.inputRef}
          type="file"
          /* @ts-expect-error webkitdirectory is non-standard */
          webkitdirectory=""
          className="hidden"
          onChange={(e) => fileExplorer.handleFallbackInput(e.target.files)}
        />
        <CommandPalette />
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
        {/* Left sidebar: Explorer (fully hidden in Focus Mode — even the
            36px collapsed bar is gone so reading lines aren't cramped). */}
        <div
          className="flex-shrink-0 bg-surface border-r border-line flex flex-col transition-[width] duration-200 overflow-hidden"
          style={{ width: focusMode ? 0 : explorerCollapsed ? 36 : 260, borderRightWidth: focusMode ? 0 : 1 }}
          data-testid="explorer-container"
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

      {/* Global footer — reads info from the focused pane.  Unmounted in
          Focus Mode so the document content fills the full vertical
          space. */}
      {!focusMode && <Footer focusedEntry={panes.activeEntry} isSplit={panes.isSplit} />}

      {/* ⌘K Command Palette — overlays the entire viewport */}
      <CommandPalette />

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
 * Render-prop wrapper that mounts `useTheme` *inside* `RepositoryProvider`,
 * registers the palette command + ⌘⇧L global keyboard handler, and exposes
 * `{ theme, toggleTheme }` to the child render function. Lifting these into
 * a dedicated component is the only way `useTheme.setTheme` can persist
 * the user's choice into `vaultConfig.theme` — the hook reads
 * `useContext(RepositoryContext)`, which is null at the level of
 * `KnowledgeBaseInner` because that component declares `RepositoryProvider`
 * itself. (Phase 3 PR 1, 2026-04-26.)
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

  // Raw ⌘⇧L handler — same input/contenteditable guard pattern as the
  // existing ⌘., ⌘K, ⌘F handlers.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "l" || e.key === "L")) {
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
