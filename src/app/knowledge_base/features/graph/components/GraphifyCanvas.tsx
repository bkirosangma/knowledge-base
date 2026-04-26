"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import type { RawGraphifyNode, RawGraphifyLink, RawGraphifyData, RawHyperedge } from "../hooks/useRawGraphify";
import { edgeColor, RELATION_COLORS } from "../graphifyColors";

interface GraphifyCanvasProps {
  nodes: RawGraphifyNode[];
  links: RawGraphifyData["links"];
  hyperedges: RawHyperedge[];
  nodeColorMap: Map<string, string>;
  nodeDegreeMap: Map<string, number>;
  /** Community ID to highlight; null = all visible at full opacity. */
  highlightedCommunity: number | null;
  /** Node ID to highlight; null = no selection. */
  highlightedNode: string | null;
  onNodeClick: (node: RawGraphifyNode) => void;
  /** Called when the user clicks the empty canvas background — use to deselect. */
  onBackgroundClick?: () => void;
}

// Graph canvas always uses a dark background regardless of app theme —
// community-colored nodes and edges are far more legible on dark.
const CANVAS_BG = "#0f172a"; // slate-900

// ── Convex hull (Andrew's monotone chain) ────────────────────────────────
type Pt = { x: number; y: number };
function cross(O: Pt, A: Pt, B: Pt) {
  return (A.x - O.x) * (B.y - O.y) - (A.y - O.y) * (B.x - O.x);
}
function convexHull(pts: Pt[]): Pt[] {
  if (pts.length < 3) return pts;
  const s = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const lo: Pt[] = [];
  for (const p of s) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop();
    lo.push(p);
  }
  const hi: Pt[] = [];
  for (const p of [...s].reverse()) {
    while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop();
    hi.push(p);
  }
  hi.pop(); lo.pop();
  return [...lo, ...hi];
}
// Expand each hull vertex outward from the centroid by `pad` units.
function padHull(hull: Pt[], pad: number): Pt[] {
  if (!hull.length) return hull;
  const cx = hull.reduce((s, p) => s + p.x, 0) / hull.length;
  const cy = hull.reduce((s, p) => s + p.y, 0) / hull.length;
  return hull.map((p) => {
    const dx = p.x - cx, dy = p.y - cy;
    const len = Math.hypot(dx, dy) || 1;
    return { x: p.x + (dx / len) * pad, y: p.y + (dy / len) * pad };
  });
}


export default function GraphifyCanvas({
  nodes,
  links,
  hyperedges,
  nodeColorMap,
  nodeDegreeMap,
  highlightedCommunity,
  highlightedNode,
  onNodeClick,
  onBackgroundClick,
}: GraphifyCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

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

  // ── Pinch-to-zoom + two-finger pan ───────────────────────────────────────
  // Intercept in capture phase so d3-zoom's bubble-phase handlers never fire
  // for multi-touch gestures.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let pinchActive = false;
    let pinchStartDist = 0;
    let pinchStartZoom = 1;
    let lastMidX = 0;
    let lastMidY = 0;

    function touchDist(a: Touch, b: Touch) {
      const dx = a.clientX - b.clientX;
      const dy = a.clientY - b.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length < 2) return;
      e.preventDefault();
      const [a, b] = [e.touches[0], e.touches[1]];
      pinchStartDist = touchDist(a, b);
      pinchStartZoom = graphRef.current?.zoom() ?? 1;
      lastMidX = (a.clientX + b.clientX) / 2;
      lastMidY = (a.clientY + b.clientY) / 2;
      pinchActive = true;
    }

    function onTouchMove(e: TouchEvent) {
      if (!pinchActive || e.touches.length < 2) return;
      e.preventDefault();
      const graph = graphRef.current;
      if (!graph) return;

      const [a, b] = [e.touches[0], e.touches[1]];
      const newDist = touchDist(a, b);
      const midX = (a.clientX + b.clientX) / 2;
      const midY = (a.clientY + b.clientY) / 2;

      // Zoom: ratio of current distance to start distance, applied to start zoom.
      if (pinchStartDist > 0) graph.zoom(pinchStartZoom * (newDist / pinchStartDist), 0);

      // Pan: screen-pixel delta converted to graph units via current zoom.
      const z = graph.zoom();
      const { x: cx, y: cy } = graph.centerAt();
      graph.centerAt(cx - (midX - lastMidX) / z, cy - (midY - lastMidY) / z, 0);

      lastMidX = midX;
      lastMidY = midY;
    }

    function onTouchEnd(e: TouchEvent) {
      if (e.touches.length < 2) pinchActive = false;
    }

    const opts = { capture: true, passive: false } as const;
    const optsPassive = { capture: true } as const;
    el.addEventListener("touchstart", onTouchStart, opts);
    el.addEventListener("touchmove", onTouchMove, opts);
    el.addEventListener("touchend", onTouchEnd, optsPassive);
    el.addEventListener("touchcancel", onTouchEnd, optsPassive);

    return () => {
      el.removeEventListener("touchstart", onTouchStart, opts);
      el.removeEventListener("touchmove", onTouchMove, opts);
      el.removeEventListener("touchend", onTouchEnd, optsPassive);
      el.removeEventListener("touchcancel", onTouchEnd, optsPassive);
    };
  }, []);

  const graphData = useMemo(() => ({ nodes, links }), [nodes, links]);

  const nodeColor = useCallback(
    (node: RawGraphifyNode) => nodeColorMap.get(node.id) ?? "#888",
    [nodeColorMap],
  );

  // Build a Set of visible node IDs when a community is selected.
  // null = all nodes visible (no filter active).
  const visibleNodeIds = useMemo<Set<string> | null>(() => {
    if (highlightedCommunity === null) return null;
    return new Set(nodes.filter((n) => n.community === highlightedCommunity).map((n) => n.id));
  }, [highlightedCommunity, nodes]);

  const nodeVisibility = useCallback(
    (node: RawGraphifyNode) => !visibleNodeIds || visibleNodeIds.has(node.id),
    [visibleNodeIds],
  );

  const linkVisibility = useCallback(
    (link: unknown) => {
      if (!visibleNodeIds) return true;
      const l = link as { source: string | { id: string }; target: string | { id: string } };
      const src = typeof l.source === "object" ? (l.source as { id: string }).id : l.source;
      const tgt = typeof l.target === "object" ? (l.target as { id: string }).id : l.target;
      return visibleNodeIds.has(src) && visibleNodeIds.has(tgt);
    },
    [visibleNodeIds],
  );

  // nodeVal drives the rendered area: radius = sqrt(nodeVal) * nodeRelSize (4).
  // Using raw degree gives a natural sqrt-scaled radius — hub nodes are larger
  // but not excessively so. Minimum 1 so isolated nodes still render.
  const nodeVal = useCallback(
    (node: RawGraphifyNode) => Math.max(1, nodeDegreeMap.get(node.id) ?? 1),
    [nodeDegreeMap],
  );

  // Draw a white ring around the selected node, on top of the default fill.
  const nodeCanvasObject = useCallback(
    (node: RawGraphifyNode & { x?: number; y?: number }, ctx: CanvasRenderingContext2D) => {
      if (node.id !== highlightedNode) return;
      const val = Math.max(1, nodeDegreeMap.get(node.id) ?? 1);
      const r = Math.sqrt(val) * 4 + 2; // mirror ForceGraph2D's radius formula
      ctx.beginPath();
      ctx.arc(node.x ?? 0, node.y ?? 0, r, 0, 2 * Math.PI);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();
    },
    [highlightedNode, nodeDegreeMap],
  );

  const nodeLabelAccessor = useCallback((node: RawGraphifyNode) => node.label, []);

  // ── Hyperedge hull rendering ──────────────────────────────────────────
  const onRenderFramePost = useCallback(
    (ctx: CanvasRenderingContext2D, globalScale: number) => {
      if (!hyperedges.length) return;

      // Nodes get x/y injected by react-force-graph-2d at runtime.
      type PositionedNode = RawGraphifyNode & { x?: number; y?: number };
      const posMap = new Map<string, { x: number; y: number }>();
      for (const n of nodes as PositionedNode[]) {
        if (n.x != null && n.y != null) posMap.set(n.id, { x: n.x, y: n.y });
      }

      for (const he of hyperedges) {
        const pts = he.nodes.flatMap((id) => {
          const p = posMap.get(id);
          return p ? [p] : [];
        });
        if (pts.length < 2) continue;

        const hull = convexHull(pts);
        const padded = padHull(hull, 12);
        if (padded.length < 2) continue;

        ctx.beginPath();
        ctx.moveTo(padded[0].x, padded[0].y);
        for (let i = 1; i < padded.length; i++) ctx.lineTo(padded[i].x, padded[i].y);
        ctx.closePath();
        ctx.fillStyle = "rgba(148,163,184,0.07)";
        ctx.fill();
        ctx.strokeStyle = "rgba(148,163,184,0.3)";
        ctx.lineWidth = 1 / globalScale;
        ctx.setLineDash([3 / globalScale, 3 / globalScale]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Label above the hull
        const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
        const cy = Math.min(...padded.map((p) => p.y)) - 4 / globalScale;
        ctx.font = `${10 / globalScale}px sans-serif`;
        ctx.fillStyle = "rgba(203,213,225,0.7)";
        ctx.textAlign = "center";
        ctx.fillText(he.label, cx, cy);
      }
    },
    [hyperedges, nodes],
  );

  const handleNodeClick = useCallback(
    (node: RawGraphifyNode) => { onNodeClick(node); },
    [onNodeClick],
  );

  return (
    <div
      ref={containerRef}
      className="relative flex-1 min-w-0 min-h-0 bg-surface-2"
      data-testid="graphify-canvas-container"
    >
      {size.w > 0 && size.h > 0 && (
        <ForceGraph2D
          ref={graphRef}
          width={size.w}
          height={size.h}
          graphData={graphData}
          backgroundColor={CANVAS_BG}
          nodeId="id"
          nodeLabel={nodeLabelAccessor}
          nodeColor={nodeColor}
          nodeVal={nodeVal}
          nodeRelSize={4}
          nodeVisibility={nodeVisibility}
          linkVisibility={linkVisibility}
          linkColor={(link) => edgeColor((link as RawGraphifyLink).relation)}
          linkLabel={(link) => (link as RawGraphifyLink).relation ?? ""}
          linkDirectionalArrowLength={4}
          linkDirectionalArrowRelPos={1}
          linkDirectionalArrowColor={(link) => edgeColor((link as RawGraphifyLink).relation)}
          linkWidth={1.2}
          nodeCanvasObject={nodeCanvasObject}
          nodeCanvasObjectMode={() => "after"}
          onRenderFramePost={onRenderFramePost}
          onNodeClick={handleNodeClick}
          onBackgroundClick={onBackgroundClick}
          enableNodeDrag
          cooldownTicks={120}
        />
      )}

      {/* Edge type legend — bottom-right overlay */}
      <div className="absolute bottom-3 right-3 rounded-lg px-3 py-2 pointer-events-none"
        style={{ background: "rgba(15,23,42,0.75)", backdropFilter: "blur(4px)" }}
      >
        <p className="text-[9px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#94a3b8" }}>
          Edge types
        </p>
        <ul className="space-y-1">
          {Object.entries(RELATION_COLORS).map(([relation, color]) => (
            <li key={relation} className="flex items-center gap-2">
              <span className="inline-block w-4 flex-shrink-0" style={{ height: 2, background: color, borderRadius: 1 }} />
              <span className="text-[10px] whitespace-nowrap" style={{ color: "#cbd5e1" }}>
                {relation.replace(/_/g, " ")}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Hidden DOM mirror for Playwright/accessibility */}
      <ul
        data-testid="graphify-debug-list"
        className="sr-only"
        aria-label="Knowledge graph nodes (accessible list)"
      >
        {nodes.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              tabIndex={-1}
              data-testid={`graphify-node-${n.id}`}
              data-community={n.community ?? "none"}
              onClick={() => onNodeClick(n)}
              aria-label={`Select ${n.label}`}
            >
              {n.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
