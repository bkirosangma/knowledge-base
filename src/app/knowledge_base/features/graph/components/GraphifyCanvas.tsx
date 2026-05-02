"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { Settings } from "lucide-react";
import type { RawGraphifyNode, RawGraphifyLink, RawGraphifyData, RawHyperedge } from "../hooks/useRawGraphify";
import { edgeColor, RELATION_COLORS_DARK, RELATION_COLORS_LIGHT } from "../graphifyColors";
import { DEFAULT_PHYSICS, PHYSICS_SLIDERS, type PhysicsConfig } from "../graphifyPhysics";
import { Tooltip } from "../../../shared/components/Tooltip";

export type { PhysicsConfig };

interface GraphifyCanvasProps {
  nodes: RawGraphifyNode[];
  links: RawGraphifyData["links"];
  hyperedges: RawHyperedge[];
  nodeColorMap: Map<string, string>;
  nodeDegreeMap: Map<string, number>;
  /** Node IDs to show at full opacity; null = all visible. */
  visibleNodeIds: Set<string> | null;
  /** Node ID to highlight; null = no selection. */
  highlightedNode: string | null;
  onNodeClick: (node: RawGraphifyNode) => void;
  /** Called when the user clicks inside a hyperedge hull. */
  onHyperedgeClick?: (he: RawHyperedge) => void;
  /** Called when the user clicks the empty canvas background — use to deselect. */
  onBackgroundClick?: () => void;
  physicsConfig: PhysicsConfig;
  onPhysicsChange: (c: PhysicsConfig) => void;
  theme?: "light" | "dark";
}

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


// Ray-casting point-in-polygon for convex hull click detection.
function pointInPolygon(pt: Pt, polygon: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const { x: xi, y: yi } = polygon[i];
    const { x: xj, y: yj } = polygon[j];
    if ((yi > pt.y) !== (yj > pt.y) && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// ── Per-node gravity force ────────────────────────────────────────────────
// Replaces d3's forceCenter. forceCenter only anchors the CENTRE OF MASS —
// it applies zero net force when two disconnected clusters are symmetrically
// placed around the origin, so they drift apart under repulsion.
// Per-node gravity (vx -= x * α * strength) pulls every node individually
// toward the origin; the restoring force scales with distance, so distant
// clusters are always pulled back.
function createGravityForce(strength: number) {
  let nodes: D3Node[] = [];
  function force(alpha: number) {
    for (const n of nodes) {
      n.vx -= n.x * strength * alpha;
      n.vy -= n.y * strength * alpha;
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (force as any).initialize = (ns: D3Node[]) => { nodes = ns; };
  return force;
}

// ── Hyperedge regular-polygon force ──────────────────────────────────────
// Gently nudges the N nodes of each hyperedge toward the N vertices of a
// regular polygon (equal sides, equal angles) centred on their centroid.
// Uses circular-mean to find the polygon orientation that minimises total
// angular displacement so the shape doesn't spin to a different face.
type D3Node = { id: string; x: number; y: number; vx: number; vy: number };

function createHyperedgeForce(hyperedges: RawHyperedge[], strength: number) {
  let nodeById = new Map<string, D3Node>();

  function force(alpha: number) {
    for (const he of hyperedges) {
      const members = he.nodes.map(id => nodeById.get(id)).filter((n): n is D3Node => n != null);
      const N = members.length;
      if (N < 2) continue;

      const cx = members.reduce((s, n) => s + n.x, 0) / N;
      const cy = members.reduce((s, n) => s + n.y, 0) / N;
      const R = members.reduce((s, n) => s + Math.hypot(n.x - cx, n.y - cy), 0) / N;
      if (R < 0.001) continue;

      // Sort by current polar angle so vertex assignment is stable.
      const sorted = members
        .map(n => ({ n, angle: Math.atan2(n.y - cy, n.x - cx) }))
        .sort((a, b) => a.angle - b.angle);

      // Circular mean of (angle_i − i·2π/N) gives the polygon rotation offset
      // that minimises total angular displacement across all members.
      const step = (2 * Math.PI) / N;
      let sinSum = 0, cosSum = 0;
      for (let i = 0; i < N; i++) {
        const diff = sorted[i].angle - i * step;
        sinSum += Math.sin(diff);
        cosSum += Math.cos(diff);
      }
      const offset = Math.atan2(sinSum, cosSum);

      for (let i = 0; i < N; i++) {
        const tx = cx + R * Math.cos(offset + i * step);
        const ty = cy + R * Math.sin(offset + i * step);
        sorted[i].n.vx += (tx - sorted[i].n.x) * strength * alpha;
        sorted[i].n.vy += (ty - sorted[i].n.y) * strength * alpha;
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (force as any).initialize = (nodes: D3Node[]) => {
    nodeById = new Map(nodes.map(n => [n.id, n]));
  };

  return force;
}

export default function GraphifyCanvas({
  nodes,
  links,
  hyperedges,
  nodeColorMap,
  nodeDegreeMap,
  visibleNodeIds,
  highlightedNode,
  onNodeClick,
  onHyperedgeClick,
  onBackgroundClick,
  physicsConfig,
  onPhysicsChange,
  theme = "dark",
}: GraphifyCanvasProps) {
  const isDark = theme === "dark";
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

  const [physicsOpen, setPhysicsOpen] = useState(false);

  // true once ForceGraph2D has mounted (size became non-zero).
  // Used as a dep so the physics effect fires on first mount, not just on
  // config changes — otherwise graphRef.current is null at component mount
  // and the effect exits early, leaving d3 defaults in place forever.
  const graphMounted = size.w > 0;

  // ── Apply d3-force parameters whenever physicsConfig changes or graph mounts
  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    graph.d3Force("link")?.distance(physicsConfig.linkDistance).strength(physicsConfig.linkStrength);
    graph.d3Force("charge")?.strength(-physicsConfig.repelForce);
    graph.d3Force("center", null); // forceCenter only anchors CoM — use per-node gravity instead
    graph.d3Force("gravity", createGravityForce(physicsConfig.centerForce));
    graph.d3ReheatSimulation();
  // graphMounted transitions false→true exactly once when ForceGraph2D mounts.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [physicsConfig, graphMounted]);

  // ── Register hyperedge regular-polygon force ──────────────────────────────
  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    if (hyperedges.length === 0) {
      graph.d3Force("hyperedge", null);
      return;
    }
    graph.d3Force("hyperedge", createHyperedgeForce(hyperedges, physicsConfig.hyperedgeForce));
    graph.d3ReheatSimulation();
    return () => { graph.d3Force("hyperedge", null); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hyperedges, physicsConfig.hyperedgeForce]);

  // ── Pan to centroid of visible nodes when selection changes ──────────────
  // d3 mutates the original node objects in place with x/y — same pattern
  // used by onRenderFramePost for hull rendering.
  useEffect(() => {
    if (!visibleNodeIds || visibleNodeIds.size === 0) return;
    const graph = graphRef.current;
    if (!graph) return;
    type PN = RawGraphifyNode & { x?: number; y?: number };
    const members = (nodes as PN[]).filter(
      n => visibleNodeIds.has(n.id) && n.x != null && n.y != null,
    );
    if (!members.length) return;
    const cx = members.reduce((s, n) => s + (n.x ?? 0), 0) / members.length;
    const cy = members.reduce((s, n) => s + (n.y ?? 0), 0) / members.length;
    graph.centerAt(cx, cy, 500);
  // nodes is stable (same array reference); visibleNodeIds change drives panning.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleNodeIds]);

  // ── Pinch-to-zoom + two-finger pan ───────────────────────────────────────
  // Intercept in capture phase so d3-zoom's bubble-phase handlers never fire
  // for multi-touch gestures.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let pinchActive = false;
    let pinchStartDist = 0;
    let pinchStartZoom = 1;
    // Graph-space anchor under the initial pinch midpoint — kept fixed on screen
    // as zoom and pan evolve, giving the natural "zoom to fingers" feel.
    let anchorGx = 0;
    let anchorGy = 0;

    function touchDist(a: Touch, b: Touch) {
      const dx = a.clientX - b.clientX;
      const dy = a.clientY - b.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }

    function onTouchStart(e: TouchEvent) {
      if (!el || e.touches.length < 2) return;
      e.preventDefault();
      const graph = graphRef.current;
      const [a, b] = [e.touches[0], e.touches[1]];
      pinchStartDist = touchDist(a, b);
      pinchStartZoom = graph?.zoom() ?? 1;
      const rect = el.getBoundingClientRect();
      const sx = (a.clientX + b.clientX) / 2 - rect.left;
      const sy = (a.clientY + b.clientY) / 2 - rect.top;
      const g = graph?.screen2GraphCoords(sx, sy) ?? { x: 0, y: 0 };
      anchorGx = g.x;
      anchorGy = g.y;
      pinchActive = true;
    }

    function onTouchMove(e: TouchEvent) {
      if (!el || !pinchActive || e.touches.length < 2) return;
      e.preventDefault();
      const graph = graphRef.current;
      if (!graph) return;

      const [a, b] = [e.touches[0], e.touches[1]];
      const newDist = touchDist(a, b);
      const rect = el.getBoundingClientRect();
      const sx = (a.clientX + b.clientX) / 2 - rect.left;
      const sy = (a.clientY + b.clientY) / 2 - rect.top;

      const z2 = Math.max(0.1, Math.min(10, pinchStartZoom * (newDist / pinchStartDist)));
      graph.zoom(z2, 0);

      // Where did the anchor land after zoom? Correct center to put it at finger midpoint.
      const { x: ax, y: ay } = graph.graph2ScreenCoords(anchorGx, anchorGy);
      const { x: cx, y: cy } = graph.centerAt();
      graph.centerAt(cx + (ax - sx) / z2, cy + (ay - sy) / z2, 0);
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

  // ── Wheel: pinch (ctrlKey) → zoom, two-finger scroll → pan ───────────────
  // Captured before d3-zoom's bubble-phase handler so we own all wheel events.
  // deltaMode: 0 = pixels (trackpad), 1 = lines (mouse), 2 = pages.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      e.stopPropagation(); // prevent d3-zoom from also reacting
      const graph = graphRef.current;
      if (!el || !graph) return;

      const lineScale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 200 : 1;
      const dx = e.deltaX * lineScale;
      const dy = e.deltaY * lineScale;

      if (e.ctrlKey) {
        // Pinch on trackpad, or Ctrl+scroll → zoom towards cursor, no snap.
        const z1: number = graph.zoom();
        const z2 = Math.max(0.1, Math.min(10, z1 * Math.pow(2, -dy * 0.02)));
        const rect = el.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        // Snapshot anchor before zoom, then measure where it lands after.
        // Correcting with that delta avoids any canvas-dimension math.
        const { x: gx, y: gy } = graph.screen2GraphCoords(sx, sy);
        graph.zoom(z2, 0);
        const { x: ax, y: ay } = graph.graph2ScreenCoords(gx, gy);
        const { x: cx, y: cy } = graph.centerAt();
        graph.centerAt(cx + (ax - sx) / z2, cy + (ay - sy) / z2, 0);
      } else {
        // Two-finger scroll (trackpad) or mouse wheel → pan.
        const z: number = graph.zoom();
        const { x, y }: { x: number; y: number } = graph.centerAt();
        graph.centerAt(x + dx / z, y + dy / z, 0);
      }
    }

    el.addEventListener("wheel", onWheel, { capture: true, passive: false });
    return () => el.removeEventListener("wheel", onWheel, { capture: true } as EventListenerOptions);
  }, []);

  const graphData = useMemo(() => ({ nodes, links }), [nodes, links]);

  const nodeColor = useCallback(
    (node: RawGraphifyNode) => nodeColorMap.get(node.id) ?? "#888",
    [nodeColorMap],
  );

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

  // Draw a ring around the selected node, on top of the default fill.
  const nodeCanvasObject = useCallback(
    (node: RawGraphifyNode & { x?: number; y?: number }, ctx: CanvasRenderingContext2D) => {
      if (node.id !== highlightedNode) return;
      const val = Math.max(1, nodeDegreeMap.get(node.id) ?? 1);
      const r = Math.sqrt(val) * 4 + 2; // mirror ForceGraph2D's radius formula
      ctx.beginPath();
      ctx.arc(node.x ?? 0, node.y ?? 0, r, 0, 2 * Math.PI);
      ctx.strokeStyle = isDark ? "#ffffff" : "#0f172a";
      ctx.lineWidth = 2;
      ctx.stroke();
    },
    [highlightedNode, nodeDegreeMap, isDark],
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
        ctx.fillStyle = isDark ? "rgba(148,163,184,0.07)" : "rgba(51,65,85,0.06)";
        ctx.fill();
        ctx.strokeStyle = isDark ? "rgba(148,163,184,0.3)" : "rgba(51,65,85,0.2)";
        ctx.lineWidth = 1 / globalScale;
        ctx.setLineDash([3 / globalScale, 3 / globalScale]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Label above the hull
        const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
        const cy = Math.min(...padded.map((p) => p.y)) - 4 / globalScale;
        ctx.font = `${10 / globalScale}px sans-serif`;
        ctx.fillStyle = isDark ? "rgba(203,213,225,0.7)" : "rgba(30,41,59,0.65)";
        ctx.textAlign = "center";
        ctx.fillText(he.label, cx, cy);
      }
    },
    [hyperedges, nodes, isDark],
  );

  const handleNodeClick = useCallback(
    (node: RawGraphifyNode) => { onNodeClick(node); },
    [onNodeClick],
  );

  // Background click: test if the click falls inside a hyperedge hull first.
  const handleBackgroundClick = useCallback((event: MouseEvent) => {
    if (onHyperedgeClick && hyperedges.length > 0 && graphRef.current && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const sx = event.clientX - rect.left;
      const sy = event.clientY - rect.top;
      const { x: gx, y: gy } = graphRef.current.screen2GraphCoords(sx, sy);

      type PN = RawGraphifyNode & { x?: number; y?: number };
      const posMap = new Map<string, Pt>();
      for (const n of nodes as PN[]) {
        if (n.x != null && n.y != null) posMap.set(n.id, { x: n.x, y: n.y });
      }

      for (const he of hyperedges) {
        const pts = he.nodes.flatMap(id => { const p = posMap.get(id); return p ? [p] : []; });
        if (pts.length < 2) continue;
        const padded = padHull(convexHull(pts), 12);
        if (padded.length >= 3 && pointInPolygon({ x: gx, y: gy }, padded)) {
          onHyperedgeClick(he);
          break; // don't return — still fall through to deselect node below
        }
      }
    }
    onBackgroundClick?.(); // always fires — background click always deselects the active node
  }, [onHyperedgeClick, onBackgroundClick, hyperedges, nodes]);

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
          backgroundColor={isDark ? "#0f172a" : "#f1f5f9"}
          nodeId="id"
          nodeLabel={nodeLabelAccessor}
          nodeColor={nodeColor}
          nodeVal={nodeVal}
          nodeRelSize={4}
          nodeVisibility={nodeVisibility}
          linkVisibility={linkVisibility}
          linkColor={(link) => edgeColor((link as RawGraphifyLink).relation, isDark)}
          linkLabel={(link) => (link as RawGraphifyLink).relation ?? ""}
          linkDirectionalArrowLength={4}
          linkDirectionalArrowRelPos={1}
          linkDirectionalArrowColor={(link) => edgeColor((link as RawGraphifyLink).relation, isDark)}
          linkWidth={1.2}
          nodeCanvasObject={nodeCanvasObject}
          nodeCanvasObjectMode={() => "after"}
          onRenderFramePost={onRenderFramePost}
          onNodeClick={handleNodeClick}
          onBackgroundClick={handleBackgroundClick}
          enableNodeDrag
          cooldownTicks={120}
        />
      )}

      {/* Physics settings — top-right overlay */}
      <div className="absolute top-3 right-3 flex flex-col items-end gap-1 z-10">
        <Tooltip label="Graph physics">
          <button
            onClick={() => setPhysicsOpen(v => !v)}
            className="rounded-lg p-1.5"
            style={{
              background: isDark ? "rgba(15,23,42,0.78)" : "rgba(255,255,255,0.88)",
              backdropFilter: "blur(4px)",
              border: isDark ? "none" : "1px solid rgba(148,163,184,0.35)",
            }}
            aria-label="Toggle physics settings"
          >
            <Settings size={13} style={{ color: isDark ? "#94a3b8" : "#64748b" }} />
          </button>
        </Tooltip>
        {physicsOpen && (
          <div
            className="rounded-lg px-3 py-2 w-48"
            style={{
              background: isDark ? "rgba(15,23,42,0.88)" : "rgba(255,255,255,0.93)",
              backdropFilter: "blur(4px)",
              border: isDark ? "none" : "1px solid rgba(148,163,184,0.35)",
            }}
          >
            <p className="text-[9px] font-semibold uppercase tracking-wider mb-2"
              style={{ color: isDark ? "#94a3b8" : "#64748b" }}>
              Physics
            </p>
            {PHYSICS_SLIDERS.map(({ key, label, min, max, step }) => (
              <div key={key} className="mb-2">
                <div className="flex justify-between mb-0.5">
                  <span className="text-[10px]" style={{ color: isDark ? "#cbd5e1" : "#334155" }}>{label}</span>
                  <span className="text-[10px] font-mono" style={{ color: isDark ? "#94a3b8" : "#64748b" }}>
                    {physicsConfig[key]}
                  </span>
                </div>
                <input
                  type="range"
                  min={min} max={max} step={step}
                  value={physicsConfig[key]}
                  onChange={e => onPhysicsChange({ ...physicsConfig, [key]: Number(e.target.value) })}
                  className="w-full h-1 accent-blue-400"
                />
              </div>
            ))}
            <button
              onClick={() => onPhysicsChange(DEFAULT_PHYSICS)}
              className="text-[10px] mt-1 w-full text-center hover:opacity-100 opacity-60"
              style={{ color: isDark ? "#94a3b8" : "#64748b" }}
            >
              Reset defaults
            </button>
          </div>
        )}
      </div>

      {/* Edge type legend — bottom-right overlay */}
      <div className="absolute bottom-3 right-3 rounded-lg px-3 py-2 pointer-events-none"
        style={{
          background: isDark ? "rgba(15,23,42,0.78)" : "rgba(255,255,255,0.88)",
          backdropFilter: "blur(4px)",
          border: isDark ? "none" : "1px solid rgba(148,163,184,0.35)",
        }}
      >
        <p className="text-[9px] font-semibold uppercase tracking-wider mb-1.5"
          style={{ color: isDark ? "#94a3b8" : "#64748b" }}>
          Edge types
        </p>
        <ul className="space-y-1">
          {Object.entries(isDark ? RELATION_COLORS_DARK : RELATION_COLORS_LIGHT).map(([relation, color]) => (
            <li key={relation} className="flex items-center gap-2">
              <span className="inline-block w-4 flex-shrink-0" style={{ height: 2, background: color, borderRadius: 1 }} />
              <span className="text-[10px] whitespace-nowrap" style={{ color: isDark ? "#cbd5e1" : "#334155" }}>
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
