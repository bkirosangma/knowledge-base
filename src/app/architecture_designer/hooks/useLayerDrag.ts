import { useState, useCallback, useRef, useEffect } from "react";
import type { NodeData } from "../utils/types";

interface LayerBounds {
  id: string;
  left: number;
  width: number;
  top: number;
  height: number;
  empty: boolean;
}

export const LAYER_GAP = 10;

/** Check if two rects overlap (with gap) */
function rectsOverlap(a: LayerBounds, b: LayerBounds): boolean {
  return (
    a.left < b.left + b.width + LAYER_GAP &&
    a.left + a.width + LAYER_GAP > b.left &&
    a.top < b.top + b.height + LAYER_GAP &&
    a.top + a.height + LAYER_GAP > b.top
  );
}

/** Is `val` between `a` and `b` (inclusive, order-independent)? */
function between(val: number, a: number, b: number): boolean {
  return a <= b ? a <= val && val <= b : b <= val && val <= a;
}

/**
 * Clamp a drag delta so the dragged layer can't overlap any other layer.
 *
 * For each obstacle, computes the 4 exclusion-zone edges in delta-space
 * (left, right, top, bottom). Generates candidate positions by snapping
 * to each edge (keeping the other axis free) and to each corner (both axes
 * snapped). Picks the candidate closest to the raw delta that doesn't
 * overlap any obstacle.
 */
function clampDelta(
  draggedBounds: LayerBounds,
  others: LayerBounds[],
  rawDx: number,
  rawDy: number,
  prevDx: number,
  prevDy: number,
): { dx: number; dy: number } {
  const obstacles = others.filter((l) => !l.empty && l.id !== draggedBounds.id);
  if (obstacles.length === 0) return { dx: rawDx, dy: rawDy };

  const anyOverlap = (tdx: number, tdy: number) => {
    const b: LayerBounds = { ...draggedBounds, left: draggedBounds.left + tdx, top: draggedBounds.top + tdy };
    return obstacles.some((o) => rectsOverlap(b, o));
  };

  // Fast path — no collision
  if (!anyOverlap(rawDx, rawDy)) return { dx: rawDx, dy: rawDy };

  // Collect all valid edge values from each obstacle's exclusion zone.
  // An edge is valid if it lies between the previous clamped position and
  // the raw target — this lets the layer navigate around obstacles when
  // the user changes direction mid-drag.
  const xEdges: number[] = [rawDx, prevDx];
  const yEdges: number[] = [rawDy, prevDy];

  for (const obs of obstacles) {
    const exL = obs.left - LAYER_GAP - draggedBounds.width - draggedBounds.left;
    const exR = obs.left + obs.width + LAYER_GAP - draggedBounds.left;
    const exT = obs.top - LAYER_GAP - draggedBounds.height - draggedBounds.top;
    const exB = obs.top + obs.height + LAYER_GAP - draggedBounds.top;

    if (between(exL, prevDx, rawDx)) xEdges.push(exL);
    if (between(exR, prevDx, rawDx)) xEdges.push(exR);
    if (between(exT, prevDy, rawDy)) yEdges.push(exT);
    if (between(exB, prevDy, rawDy)) yEdges.push(exB);
  }

  // Try every combination of X edge × Y edge, pick the closest valid one
  let bestDx = prevDx, bestDy = prevDy, bestDist = Infinity;
  let found = false;

  for (const dx of xEdges) {
    for (const dy of yEdges) {
      if (anyOverlap(dx, dy)) continue;
      const dist = (dx - rawDx) ** 2 + (dy - rawDy) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        bestDx = dx;
        bestDy = dy;
        found = true;
      }
    }
  }

  if (found) return { dx: bestDx, dy: bestDy };

  // Binary search along the vector from previous position to raw target
  let lo = 0;
  let hi = 1;
  const vecDx = rawDx - prevDx;
  const vecDy = rawDy - prevDy;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (anyOverlap(prevDx + vecDx * mid, prevDy + vecDy * mid)) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return { dx: prevDx + vecDx * lo, dy: prevDy + vecDy * lo };
}

interface UseLayerDragOptions {
  toCanvasCoords: (clientX: number, clientY: number) => { x: number; y: number };
  isBlocked: boolean;
  setNodes: React.Dispatch<React.SetStateAction<NodeData[]>>;
  regionsRef: React.RefObject<LayerBounds[] | null>;
  setLayerManualSizes: React.Dispatch<React.SetStateAction<
    Record<string, { left?: number; width?: number; top?: number; height?: number }>
  >>;
}

export function useLayerDrag({ toCanvasCoords, isBlocked, setNodes, regionsRef, setLayerManualSizes }: UseLayerDragOptions) {
  const [draggingLayerId, setDraggingLayerId] = useState<string | null>(null);
  const [layerDragDelta, setLayerDragDelta] = useState<{ dx: number; dy: number } | null>(null);
  const [layerDragRawDelta, setLayerDragRawDelta] = useState<{ dx: number; dy: number } | null>(null);
  const layerDragStart = useRef({ x: 0, y: 0 });
  // Snapshot regions at drag start so clamping uses stable bounds
  const dragStartRegions = useRef<LayerBounds[] | null>(null);
  // Synchronously track the last clamped delta so mouseup always commits the exact visual position
  const lastClampedDelta = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });

  const handleLayerDragStart = useCallback((layerId: string, e: React.MouseEvent) => {
    if (isBlocked) return;
    layerDragStart.current = toCanvasCoords(e.clientX, e.clientY);
    dragStartRegions.current = regionsRef.current ? [...regionsRef.current] : null;
    lastClampedDelta.current = { dx: 0, dy: 0 };
    setDraggingLayerId(layerId);
    setLayerDragDelta({ dx: 0, dy: 0 });
    setLayerDragRawDelta({ dx: 0, dy: 0 });
  }, [isBlocked, toCanvasCoords, regionsRef]);

  useEffect(() => {
    if (!draggingLayerId) return;

    const handleMouseMove = (e: MouseEvent) => {
      const mouse = toCanvasCoords(e.clientX, e.clientY);
      const rawDx = mouse.x - layerDragStart.current.x;
      const rawDy = mouse.y - layerDragStart.current.y;

      const regions = dragStartRegions.current;
      const draggedRegion = regions?.find((r) => r.id === draggingLayerId);

      let delta: { dx: number; dy: number };
      const prev = lastClampedDelta.current;
      if (draggedRegion && regions) {
        delta = clampDelta(draggedRegion, regions, rawDx, rawDy, prev.dx, prev.dy);
      } else {
        delta = { dx: rawDx, dy: rawDy };
      }

      lastClampedDelta.current = delta;
      setLayerDragDelta(delta);
      setLayerDragRawDelta({ dx: rawDx, dy: rawDy });
    };

    const handleMouseUp = () => {
      // Use the ref (synchronous) — not React state which may be stale
      const delta = lastClampedDelta.current;
      if (delta.dx !== 0 || delta.dy !== 0) {
        setNodes((prev) =>
          prev.map((n) =>
            n.layer === draggingLayerId
              ? { ...n, x: n.x + delta.dx, y: n.y + delta.dy }
              : n
          )
        );
        // Shift manual layer sizes by the same delta so bounds stay consistent
        setLayerManualSizes((prev) => {
          const existing = prev[draggingLayerId!];
          if (!existing) return prev;
          const next = { ...existing };
          if (next.left !== undefined) next.left += delta.dx;
          if (next.top !== undefined) next.top += delta.dy;
          return { ...prev, [draggingLayerId!]: next };
        });
      }
      setLayerDragDelta(null);
      setLayerDragRawDelta(null);
      setDraggingLayerId(null);
      dragStartRegions.current = null;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [draggingLayerId, toCanvasCoords, setNodes]);

  return { draggingLayerId, layerDragDelta, layerDragRawDelta, handleLayerDragStart };
}
