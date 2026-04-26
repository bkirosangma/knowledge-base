"use client";

import React, { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import BottomNav, { type MobileTab } from "./BottomNav";
import ExplorerPanel from "../shared/components/explorer/ExplorerPanel";
import type {
  SortField,
  SortDirection,
  SortGrouping,
} from "../shared/components/explorer/ExplorerPanel";
import GraphView from "../features/graph/GraphView";
import { GRAPH_SENTINEL } from "./ToolbarContext";
import type { ExplorerFilter } from "../shared/utils/types";
import type { TreeNode } from "../shared/hooks/useFileExplorer";
import type { LinkIndex } from "../features/document/types";
import type { Theme } from "../shared/hooks/useTheme";
import { useCommandRegistry } from "../shared/context/CommandRegistry";

/**
 * Top-level mobile shell — replaces the desktop split-pane layout when
 * the viewport is at-or-below the 900 px breakpoint. Phase 3 PR 3
 * (SHELL-1.14, 2026-04-26).
 *
 * Composition: thin Header strip + active tab content + BottomNav.
 * - Files tab: full-screen `<ExplorerPanel>`. Tapping a file auto-
 *   switches to the Read tab and opens the file via the host's
 *   `onSelectFile`.
 * - Read tab: when a file is open, host renders the pane content via
 *   `readPane`. When no file is open, an empty state with a deep-link
 *   button to the Files tab.
 * - Graph tab: `<GraphView>` in single-pane mode. Clicking a node
 *   switches to Read.
 *
 * State for the active tab is owned here so the host doesn't need to
 * thread one more piece of cross-cutting state. The default-tab rules
 * mirror the spec: "files" when nothing is open, otherwise "read".
 */

export interface MobileShellProps {
  // ─── Files tab — explorer wiring ─────────────────────────────────
  directoryName: string | null;
  tree: TreeNode[];
  leftPaneFile: string | null;
  rightPaneFile: string | null;
  dirtyFiles: Set<string>;
  onOpenFolder: () => void;
  onSelectFile: (path: string) => void;
  onCreateFile: (parentPath?: string) => Promise<string | null>;
  onCreateDocument: (parentPath?: string) => Promise<string | null>;
  onCreateFolder: (parentPath?: string) => Promise<string | null>;
  onDeleteFile: (path: string, event: React.MouseEvent) => void;
  onDeleteFolder: (path: string, event: React.MouseEvent) => void;
  onRenameFile: (oldPath: string, newName: string) => Promise<void>;
  onRenameFolder: (oldPath: string, newName: string) => Promise<void> | undefined;
  onDuplicateFile: (path: string) => void;
  onMoveItem: (sourcePath: string, targetFolderPath: string) => Promise<void>;
  isLoading: boolean;
  onRefresh: () => void;
  sortField: SortField;
  sortDirection: SortDirection;
  sortGrouping: SortGrouping;
  onSortChange: (field: SortField, direction: SortDirection, grouping: SortGrouping) => void;
  explorerFilter: ExplorerFilter;
  onFilterChange: (filter: ExplorerFilter) => void;
  onSelectDocument: (path: string) => void;
  recentFiles: string[];
  searchInputRef: React.RefObject<HTMLInputElement | null>;

  // ─── Read tab — currently-open pane ─────────────────────────────
  /**
   * Path of the file currently open (drives the Read tab tile + thin
   * Header file name). Null when no file is open.
   */
  activeFilePath: string | null;
  /**
   * Render-prop returning the Read pane content (DocumentView /
   * DiagramView). Host owns the actual JSX; we just place it in the
   * Read tab slot. Returning null surfaces the empty state.
   */
  readPane: React.ReactNode;

  // ─── Graph tab ──────────────────────────────────────────────────
  /** Vault link index (passed to GraphView). */
  linkIndex: LinkIndex;
  /**
   * Click handler for graph nodes. Mobile shell intercepts this so
   * the tab also flips to "read" — host's actual behaviour still runs.
   */
  onSelectFromGraph: (path: string) => void;
  /** Vault root handle — forwarded to GraphView for the knowledge-graph mode. */
  dirHandleRef: React.MutableRefObject<FileSystemDirectoryHandle | null>;

  // ─── Header chrome ──────────────────────────────────────────────
  theme: Theme;
  onToggleTheme: () => void;
  /** Number of unsaved files for the dirty-stack pill (mirrors desktop). */
  dirtyCount: number;
}

/**
 * Truncates a path to the last segment for display in the thin header.
 * `docs/architecture/foo.md` → `foo.md`. Empty string when null.
 */
function basename(path: string | null): string {
  if (!path) return "";
  if (path === GRAPH_SENTINEL) return "Vault graph";
  return path.split("/").pop() ?? path;
}

export default function MobileShell(props: MobileShellProps) {
  const {
    activeFilePath,
    readPane,
    onSelectFile,
    onSelectFromGraph,
    theme,
    onToggleTheme,
    dirtyCount,
    linkIndex,
    dirHandleRef,
    tree,
  } = props;

  // Default tab — "files" when nothing's open (boot state), else "read".
  // Initialised lazily so we don't recompute on every render.
  const [activeTab, setActiveTab] = useState<MobileTab>(() =>
    activeFilePath ? "read" : "files",
  );

  // When the host opens a file (from anywhere), bias toward Read so the
  // user sees the content land. Skip on first paint when activeFilePath
  // is null (boot defaults to "files").
  const hadFileRef = React.useRef<boolean>(!!activeFilePath);
  useEffect(() => {
    if (activeFilePath && !hadFileRef.current) {
      setActiveTab("read");
    }
    hadFileRef.current = !!activeFilePath;
  }, [activeFilePath]);

  const { setOpen: setPaletteOpen } = useCommandRegistry();

  // ─── Selection wrappers — flip tab on action ───────────────────────
  const handleSelectFileFromExplorer = React.useCallback(
    (path: string) => {
      // Flip to Read first so the new pane mounts inside the visible tab.
      setActiveTab("read");
      onSelectFile(path);
    },
    [onSelectFile],
  );

  const handleSelectFromGraphMobile = React.useCallback(
    (path: string) => {
      setActiveTab("read");
      onSelectFromGraph(path);
    },
    [onSelectFromGraph],
  );

  // Empty state for Read tab — mostly hit on first launch.
  const readEmpty = (
    <div className="flex-1 flex flex-col items-center justify-center bg-surface-2 px-6 text-center">
      <p className="text-sm font-medium text-ink-2">No file open</p>
      <p className="text-xs text-mute mt-1 mb-4">Pick a file to start reading</p>
      <button
        type="button"
        onClick={() => setActiveTab("files")}
        className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-2 transition-colors"
        data-testid="mobile-empty-files-link"
      >
        Open Files
      </button>
    </div>
  );

  return (
    <div
      data-testid="mobile-shell"
      data-theme={theme}
      className="w-full h-screen bg-surface-2 flex flex-col overflow-hidden font-sans"
    >
      {/* ─── Thin header ───────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 bg-surface border-b border-line z-20">
        {/* File name (or app name when nothing is open). */}
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span
            className="text-sm font-semibold text-ink truncate"
            data-testid="mobile-header-title"
            title={activeFilePath ?? "Knowledge Base"}
          >
            {activeFilePath ? basename(activeFilePath) : "Knowledge Base"}
          </span>
          {dirtyCount > 0 && (
            <span
              data-testid="dirty-stack-indicator"
              className="bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5 text-[11px] font-medium leading-none"
              title={`${dirtyCount} unsaved file${dirtyCount === 1 ? "" : "s"}`}
            >
              {dirtyCount}
            </span>
          )}
        </div>

        {/* ⌘K → command palette (also reachable via the search button below). */}
        <button
          onClick={() => setPaletteOpen(true)}
          className="w-9 h-9 flex items-center justify-center rounded-lg border border-line bg-surface-2 text-mute hover:text-ink-2"
          aria-label="Search commands"
          data-testid="command-palette-trigger"
          title="Search commands"
        >
          <span className="text-xs font-mono">⌘K</span>
        </button>

        <button
          onClick={onToggleTheme}
          className="w-9 h-9 flex items-center justify-center rounded-lg text-mute hover:bg-surface-2 hover:text-ink-2"
          aria-label="Toggle theme"
          aria-pressed={theme === "dark"}
          data-testid="theme-toggle"
          title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        >
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>

      {/* ─── Active tab content ────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {activeTab === "files" && (
          <div
            className="flex-1 min-h-0 flex flex-col bg-surface"
            data-testid="mobile-tab-files"
          >
            <ExplorerPanel
              collapsed={false}
              onToggleCollapse={() => {}}
              directoryName={props.directoryName}
              tree={tree}
              leftPaneFile={props.leftPaneFile}
              rightPaneFile={props.rightPaneFile}
              dirtyFiles={props.dirtyFiles}
              onOpenFolder={props.onOpenFolder}
              onSelectFile={handleSelectFileFromExplorer}
              onCreateFile={async (parentPath) => {
                const path = await props.onCreateFile(parentPath);
                if (path) handleSelectFileFromExplorer(path);
                return path;
              }}
              onCreateDocument={async (parentPath) => {
                const path = await props.onCreateDocument(parentPath);
                if (path) handleSelectFileFromExplorer(path);
                return path;
              }}
              onCreateFolder={props.onCreateFolder}
              onDeleteFile={props.onDeleteFile}
              onDeleteFolder={props.onDeleteFolder}
              onRenameFile={props.onRenameFile}
              onRenameFolder={props.onRenameFolder}
              onDuplicateFile={props.onDuplicateFile}
              onMoveItem={props.onMoveItem}
              isLoading={props.isLoading}
              onRefresh={props.onRefresh}
              sortField={props.sortField}
              sortDirection={props.sortDirection}
              sortGrouping={props.sortGrouping}
              onSortChange={props.onSortChange}
              explorerFilter={props.explorerFilter}
              onFilterChange={props.onFilterChange}
              onSelectDocument={(path) => {
                setActiveTab("read");
                props.onSelectDocument(path);
              }}
              recentFiles={props.recentFiles}
              searchInputRef={props.searchInputRef}
            />
          </div>
        )}

        {activeTab === "read" && (
          <div
            className="flex-1 min-h-0 flex flex-col bg-surface-2"
            data-testid="mobile-tab-read"
          >
            {activeFilePath ? readPane : readEmpty}
          </div>
        )}

        {activeTab === "graph" && (
          <div
            className="flex-1 min-h-0 flex flex-col"
            data-testid="mobile-tab-graph"
          >
            <GraphView
              focused
              tree={tree}
              linkIndex={linkIndex}
              onSelectNode={handleSelectFromGraphMobile}
              dirHandleRef={dirHandleRef}
            />
          </div>
        )}
      </div>

      {/* ─── Bottom nav ────────────────────────────────────────────── */}
      <BottomNav active={activeTab} onChange={setActiveTab} />
    </div>
  );
}
