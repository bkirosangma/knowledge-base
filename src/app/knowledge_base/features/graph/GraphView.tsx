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

import React, { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Network } from "lucide-react";
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
}

export default function GraphView({ tree, linkIndex, onSelectNode }: GraphViewProps) {
  // Read theme from context — propagates dark-mode flips to canvas colors.
  const { theme } = useTheme();
  // ─── Filters ─────────────────────────────────────────────────────────
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
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!repos.vaultConfig) return;
      const cfg = await readOrNull(() => repos.vaultConfig!.read());
      if (!cancelled && cfg?.graph?.layout) setLayout(cfg.graph.layout);
    })();
    return () => { cancelled = true; };
  }, [repos.vaultConfig]);

  // ─── Persist layout writes (debounced inside GraphCanvas) ───────────
  const handleLayoutChange = useCallback(
    (next: Record<string, { x: number; y: number }>) => {
      if (!repos.vaultConfig) return;
      void repos.vaultConfig.update({ graph: { layout: next } }).catch(() => {
        // Layout cache is best-effort UX — never block the pane on a write
        // miss. Vault permission losses are surfaced elsewhere.
      });
    },
    [repos.vaultConfig],
  );

  // ─── Derived graph data ──────────────────────────────────────────────
  const data = useGraphData({ tree, linkIndex, filters, layout });

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
          {data.nodes.length} node{data.nodes.length === 1 ? "" : "s"} · {data.links.length} edge{data.links.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="flex-1 flex min-h-0">
        <GraphFilters allFolders={allFolders} filters={filters} onChange={setFilters} />
        <GraphCanvas
          data={data}
          theme={theme}
          onSelectNode={onSelectNode}
          onLayoutChange={handleLayoutChange}
        />
      </div>
    </div>
  );
}
