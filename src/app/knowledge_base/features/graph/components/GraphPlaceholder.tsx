"use client";

/**
 * GraphPlaceholder — KB-042 node-count guard.
 *
 * Replaces the force-graph canvas when `data.nodes.length` exceeds the
 * `GRAPH_NODE_GUARD_THRESHOLD`. `react-force-graph-2d` is uncapped, so
 * letting a 5k-node vault hit the canvas locks the main thread for tens
 * of seconds. This placeholder is the safety net.
 *
 * Two quick filters surface here:
 *   - "Show recent only" → flips `filters.recentOnly`, narrowing to the
 *     RECENT_LIMIT (100) most-recently-modified files. Always brings the
 *     filtered count below the threshold.
 *   - "Render anyway" → session-scoped escape hatch the parent uses to
 *     bypass the guard until the pane unmounts.
 *
 * The folder rail (`GraphFilters`) stays mounted alongside this view;
 * the body copy points users at it. Tag filtering arrives with KB-050.
 */

import React from "react";
import { AlertTriangle } from "lucide-react";

export interface GraphPlaceholderProps {
  nodeCount: number;
  threshold: number;
  onShowRecentOnly: () => void;
  onRenderAnyway: () => void;
}

export default function GraphPlaceholder({
  nodeCount,
  threshold,
  onShowRecentOnly,
  onRenderAnyway,
}: GraphPlaceholderProps) {
  return (
    <div
      className="flex-1 flex items-center justify-center bg-surface-2 px-6"
      data-testid="graph-guard-placeholder"
      role="region"
      aria-label="Graph rendering paused"
    >
      <div className="max-w-md text-center text-ink">
        <AlertTriangle
          size={28}
          className="mx-auto mb-3 text-warn"
          aria-hidden="true"
        />
        <h3 className="text-base font-semibold mb-2">Filter to render</h3>
        <p className="text-sm text-ink-2 mb-4">
          {nodeCount} nodes is above the {threshold}-node ceiling. Narrow the
          set with the folder rail or one of the quick filters below, then the
          graph will render.
        </p>
        <div className="flex flex-col gap-2 items-stretch sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={onShowRecentOnly}
            data-testid="graph-guard-recent-only"
            className="px-3 py-1.5 text-sm rounded border border-line bg-surface text-ink hover:bg-surface-3 transition-colors"
          >
            Show recent only
          </button>
          <button
            type="button"
            onClick={onRenderAnyway}
            data-testid="graph-guard-render-anyway"
            className="px-3 py-1.5 text-sm rounded border border-line bg-surface text-mute hover:text-ink hover:bg-surface-3 transition-colors"
          >
            Render anyway
          </button>
        </div>
      </div>
    </div>
  );
}
