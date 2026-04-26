"use client";

/**
 * GraphCanvas — wraps `react-force-graph-2d` with the vault graph's
 * styling, click handling, and layout-cache hookup.
 *
 * Lazy-loaded via `dynamic(..., { ssr: false })` from `GraphView` so the
 * force-graph dependency stays out of the document/diagram bundles. Reads
 * accent / mute / line colors from CSS vars at runtime so dark-mode flips
 * propagate to the canvas (the canvas is repainted on `theme` change via
 * a tick of state).
 *
 * A hidden `<ul data-testid="graph-debug-list">` mirrors the visible
 * nodes so Playwright can drive node clicks without painting on a real
 * `<canvas>`. Uses the same `onSelectNode` handler as the canvas so
 * production and test paths share semantics.
 *
 * Phase 3 PR 2 (2026-04-26).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import type { GraphData, GraphNode } from "../hooks/useGraphData";

const LAYOUT_DEBOUNCE_MS = 500;

interface GraphCanvasProps {
  data: GraphData;
  /** Token theme — re-reads CSS vars when this changes. */
  theme: "light" | "dark";
  /** Click on a node opens its file in the OTHER pane (graph stays). */
  onSelectNode: (filePath: string) => void;
  /**
   * Engine stop handler — receives current node positions for caching to
   * `vaultConfig.graph.layout`. Debounced upstream so rapid stops don't
   * thrash writes.
   */
  onLayoutChange?: (layout: Record<string, { x: number; y: number }>) => void;
}

interface CssTokens {
  accent: string;
  mute: string;
  line: string;
  surface: string;
  ink: string;
}

function readTokens(): CssTokens {
  if (typeof window === "undefined") {
    return {
      accent: "#047857",
      mute: "#64748b",
      line: "#e2e8f0",
      surface: "#ffffff",
      ink: "#0f172a",
    };
  }
  const cs = getComputedStyle(document.documentElement);
  const get = (name: string, fallback: string) =>
    cs.getPropertyValue(name).trim() || fallback;
  return {
    accent: get("--accent", "#047857"),
    mute: get("--mute", "#64748b"),
    line: get("--line", "#e2e8f0"),
    surface: get("--surface", "#ffffff"),
    ink: get("--ink", "#0f172a"),
  };
}

export default function GraphCanvas({
  data,
  theme,
  onSelectNode,
  onLayoutChange,
}: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  // Re-read CSS vars whenever the theme prop changes. `theme` itself
  // isn't referenced inside the callback — it's a trigger for the
  // `getComputedStyle` re-read. ESLint can't see through that, so the
  // dep is intentional.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const tokens = useMemo<CssTokens>(() => readTokens(), [theme]);

  const layoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onLayoutChangeRef = useRef(onLayoutChange);
  useEffect(() => { onLayoutChangeRef.current = onLayoutChange; }, [onLayoutChange]);

  // Resize observer: keep the canvas in lock-step with the pane size.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setSize({ w: Math.max(0, Math.floor(rect.width)), h: Math.max(0, Math.floor(rect.height)) });
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      if (typeof node.id === "string") onSelectNode(node.id);
    },
    [onSelectNode],
  );

  const handleEngineStop = useCallback(() => {
    if (!onLayoutChangeRef.current) return;
    if (layoutTimerRef.current) clearTimeout(layoutTimerRef.current);
    const snapshot = data.nodes;
    layoutTimerRef.current = setTimeout(() => {
      const layout: Record<string, { x: number; y: number }> = {};
      for (const n of snapshot) {
        if (typeof n.x === "number" && typeof n.y === "number") {
          layout[n.id] = { x: n.x, y: n.y };
        }
      }
      onLayoutChangeRef.current?.(layout);
    }, LAYOUT_DEBOUNCE_MS);
  }, [data.nodes]);

  useEffect(() => () => {
    if (layoutTimerRef.current) clearTimeout(layoutTimerRef.current);
  }, []);

  const nodeColor = useCallback(
    (node: GraphNode) => (node.fileType === "json" ? tokens.mute : tokens.accent),
    [tokens.accent, tokens.mute],
  );

  // Canvas-side rendering of node label on hover. The library's default
  // `nodeLabel` produces an HTML tooltip — fine for our needs.
  const nodeLabelAccessor = useCallback((node: GraphNode) => node.label, []);

  return (
    <div
      ref={containerRef}
      className="relative flex-1 min-w-0 min-h-0 bg-surface-2"
      data-testid="graph-canvas-container"
    >
      {size.w > 0 && size.h > 0 && (
        <ForceGraph2D
          width={size.w}
          height={size.h}
          graphData={data}
          backgroundColor={tokens.surface}
          nodeId="id"
          nodeLabel={nodeLabelAccessor}
          nodeColor={nodeColor}
          nodeRelSize={4}
          linkColor={() => tokens.line}
          linkWidth={1}
          onNodeClick={handleNodeClick}
          onEngineStop={handleEngineStop}
          enableNodeDrag
          cooldownTicks={120}
        />
      )}

      {/* Hidden DOM mirror: lets Playwright click nodes without painting on
          the canvas; also gives screen-readers a fallback list. Buttons
          have `tabIndex={-1}` so keyboard tab navigation doesn't traverse
          every invisible graph node — they remain reachable for SR users
          via the `<ul>` tree and for tests via `data-testid` clicks. */}
      <ul
        data-testid="graph-debug-list"
        className="sr-only"
        aria-label="Graph nodes (accessible list)"
      >
        {data.nodes.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              tabIndex={-1}
              data-testid={`graph-node-${n.id}`}
              data-orphan={n.orphan ? "true" : "false"}
              data-file-type={n.fileType}
              onClick={() => onSelectNode(n.id)}
              aria-label={`Open ${n.label}`}
            >
              {n.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
