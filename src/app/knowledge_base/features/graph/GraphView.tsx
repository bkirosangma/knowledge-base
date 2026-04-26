"use client";

/**
 * GraphView — top-level pane component for the virtual "Vault graph" pane.
 *
 * Receives the file tree + link index (derived in the shell), wires up
 * filter state, and lazy-loads the force-graph canvas. Node clicks open
 * the target file in the OPPOSITE pane (or split out from a single graph
 * pane); the graph itself never gets replaced by the click.
 *
 * Layout positions (post-simulation) are persisted to
 * `vaultConfig.graph.layout` via the `RepositoryContext` so re-opening
 * the pane doesn't re-run the simulation from scratch.
 *
 * Phase 3 PR 2 (2026-04-26).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Network, RefreshCw } from "lucide-react";
import type { TreeNode } from "../../shared/hooks/useFileExplorer";
import type { LinkIndex } from "../document/types";
import { useRepositories } from "../../shell/RepositoryContext";
import { readOrNull } from "../../domain/repositoryHelpers";
import { useTheme } from "../../shared/hooks/useTheme";
import {
  useGraphData,
  listTopFolders,
  type GraphFilters as FiltersState,
} from "./hooks/useGraphData";
import { useGraphifyData } from "./hooks/useGraphifyData";
import GraphFilters from "./components/GraphFilters";

// Lazy-load the canvas wrapper. `ssr: false` because react-force-graph-2d
// touches `window` at import time. Loading state uses tokenized chrome.
const GraphCanvas = dynamic(() => import("./components/GraphCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-surface-2 text-mute text-sm">
      Loading graph…
    </div>
  ),
});

export interface GraphViewProps {
  /**
   * Whether this pane is the focused side. Graph chrome is identical
   * regardless (no per-side editor state), but the prop is part of the
   * standard pane signature — leaving it in keeps the renderPane
   * dispatcher in `knowledgeBase.tsx` symmetric across pane types.
   */
  focused: boolean;
  /** Full vault tree (used to enumerate every node, including orphans). */
  tree: TreeNode[];
  /** Live link index (the source of edges). */
  linkIndex: LinkIndex;
  /** Open a file in the OPPOSITE pane (graph never gets replaced). */
  onSelectNode: (filePath: string) => void;
  /** Trigger a full vault scan to rebuild the link index. */
  onRefresh?: () => Promise<void>;
  /** Vault root handle — used to read graphify-out/graph.json for the knowledge graph mode. */
  dirHandleRef: React.MutableRefObject<FileSystemDirectoryHandle | null>;
}

type GraphMode = "linkIndex" | "graphify";

export default function GraphView({ tree, linkIndex, onSelectNode, onRefresh, dirHandleRef }: GraphViewProps) {
  // Read theme from context — propagates dark-mode flips to canvas colors.
  const { theme } = useTheme();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [graphMode, setGraphMode] = useState<GraphMode>("linkIndex");

  const handleRefresh = useCallback(async () => {
    if (!onRefresh || isRefreshing) return;
    setIsRefreshing(true);
    try { await onRefresh(); } finally { setIsRefreshing(false); }
  }, [onRefresh, isRefreshing]);

  // ─── Filters (link-index mode only) ──────────────────────────────────
  const allFolders = useMemo(() => listTopFolders(tree), [tree]);
  const [filters, setFilters] = useState<FiltersState>(() => ({
    folders: null,
    fileTypes: new Set<"md" | "json">(["md", "json"]),
    orphansOnly: false,
  }));

  // ─── Cached layout from vaultConfig (read once on mount; not reactive
  //     to vault writes — would feedback-loop with our own onLayoutChange) ─
  const repos = useRepositories();
  const [layout, setLayout] = useState<Record<string, { x: number; y: number }> | null>(null);
  // Mirror of the most recently persisted layout. `handleLayoutChange`
  // merges the (possibly filtered) snapshot from GraphCanvas over this
  // ref so positions for nodes hidden by the active filter are NOT lost
  // when the filtered subset settles. Without the merge, an "Orphans
  // only" settle would replace the whole vaultConfig layout map with
  // just the orphan positions, wiping every other node's cached place.
  const persistedLayoutRef = useRef<Record<string, { x: number; y: number }>>({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!repos.vaultConfig) return;
      const cfg = await readOrNull(() => repos.vaultConfig!.read());
      if (!cancelled && cfg?.graph?.layout) {
        setLayout(cfg.graph.layout);
        persistedLayoutRef.current = cfg.graph.layout;
      }
    })();
    return () => { cancelled = true; };
  }, [repos.vaultConfig]);

  // ─── Persist layout writes (debounced inside GraphCanvas) ───────────
  const handleLayoutChange = useCallback(
    (partial: Record<string, { x: number; y: number }>) => {
      if (!repos.vaultConfig) return;
      // Merge over the last-known persisted layout so filtered-out nodes
      // keep their cached positions. The canvas only knows about visible
      // nodes; the merge here is what makes layout cache resilient to
      // filter state.
      const merged = { ...persistedLayoutRef.current, ...partial };
      persistedLayoutRef.current = merged;
      void repos.vaultConfig.update({ graph: { layout: merged } }).catch(() => {
        // Layout cache is best-effort UX — never block the pane on a write
        // miss. Vault permission losses are surfaced elsewhere.
      });
    },
    [repos.vaultConfig],
  );

  // ─── Graph data (both sources) ───────────────────────────────────────
  const linkIndexData = useGraphData({ tree, linkIndex, filters, layout });
  const { data: graphifyData, status: graphifyStatus } = useGraphifyData(
    dirHandleRef,
    graphMode === "graphify",
  );

  const activeData = graphMode === "graphify" ? graphifyData : linkIndexData;

  return (
    <div className="flex-1 flex flex-col min-h-0 h-full" data-testid="graph-view">
      {/* Pane header — uses the standard chrome row sized to match other
          panes. Doesn't reuse PaneHeader because graph has no breadcrumb /
          read mode / save semantics; this row is intentionally minimal. */}
      <div
        className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-line bg-surface"
        data-testid="graph-pane-header"
      >
        <Network size={14} className="text-mute" aria-hidden="true" />
        <span className="text-sm font-semibold text-ink">Vault graph</span>
        <span className="text-xs text-mute">
          {activeData.nodes.length} node{activeData.nodes.length === 1 ? "" : "s"} · {activeData.links.length} edge{activeData.links.length === 1 ? "" : "s"}
        </span>
        <select
          value={graphMode}
          onChange={(e) => setGraphMode(e.target.value as GraphMode)}
          className="ml-2 text-xs bg-surface border border-line rounded px-1 py-0.5 text-ink"
          aria-label="Graph source"
        >
          <option value="linkIndex">Link index</option>
          <option value="graphify">Knowledge graph</option>
        </select>
        {onRefresh && graphMode === "linkIndex" && (
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            aria-label="Rebuild graph index"
            className="ml-auto p-1 rounded text-mute hover:text-ink hover:bg-surface-2 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={13} className={isRefreshing ? "animate-spin" : ""} aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="flex-1 flex min-h-0">
        {graphMode === "linkIndex" ? (
          <>
            <GraphFilters allFolders={allFolders} filters={filters} onChange={setFilters} />
            <GraphCanvas
              data={linkIndexData}
              theme={theme}
              onSelectNode={onSelectNode}
              onLayoutChange={handleLayoutChange}
            />
          </>
        ) : graphifyStatus === "loading" ? (
          <div className="flex-1 flex items-center justify-center bg-surface-2 text-mute text-sm">
            Loading knowledge graph…
          </div>
        ) : graphifyStatus === "missing" ? (
          <div className="flex-1 flex items-center justify-center bg-surface-2 text-mute text-sm px-6 text-center">
            Run <code className="mx-1 px-1 bg-surface rounded font-mono">graphify . --update</code> inside the vault to build the knowledge graph.
          </div>
        ) : graphifyStatus === "error" ? (
          <div className="flex-1 flex items-center justify-center bg-surface-2 text-mute text-sm">
            Could not parse graphify-out/graph.json
          </div>
        ) : (
          <GraphCanvas
            data={graphifyData}
            theme={theme}
            onSelectNode={onSelectNode}
            onLayoutChange={handleLayoutChange}
          />
        )}
      </div>
    </div>
  );
}
