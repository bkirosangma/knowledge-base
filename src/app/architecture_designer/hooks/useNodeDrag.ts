import { useState, useCallback, useRef, useEffect } from "react";
import type { NodeData } from "../utils/types";
import { LAYER_GAP } from "./useLayerDrag";

const NODE_GAP = 8;

interface RegionBounds {
  id: string;
  left: number;
  width: number;
  top: number;
  height: number;
  empty: boolean;
}

interface NodeRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function nodeRectsOverlap(a: NodeRect, b: NodeRect): boolean {
  return (
    a.left < b.left + b.width + NODE_GAP &&
    a.left + a.width + NODE_GAP > b.left &&
    a.top < b.top + b.height + NODE_GAP &&
    a.top + a.height + NODE_GAP > b.top
  );
}

function between(val: number, a: number, b: number): boolean {
  return a <= b ? a <= val && val <= b : b <= val && val <= a;
}

/**
 * Clamp a node position so it can't overlap any sibling node.
 * Mirrors the layer drag's clampDelta algorithm but operates on
 * center-based coordinates (x, y) converted to rects.
 */
function clampNodePosition(
  x: number,
  y: number,
  halfW: number,
  halfH: number,
  prevX: number,
  prevY: number,
  siblings: NodeRect[],
): { x: number; y: number } {
  if (siblings.length === 0) return { x, y };

  const toRect = (cx: number, cy: number): NodeRect => ({
    left: cx - halfW,
    top: cy - halfH,
    width: halfW * 2,
    height: halfH * 2,
  });

  const anyOverlap = (cx: number, cy: number) => {
    const r = toRect(cx, cy);
    return siblings.some((s) => nodeRectsOverlap(r, s));
  };

  // Fast path — no collision
  if (!anyOverlap(x, y)) return { x, y };

  // Collect exclusion-zone edges in position-space
  const draggedRect = toRect(prevX, prevY);
  const xEdges: number[] = [x, prevX];
  const yEdges: number[] = [y, prevY];

  for (const obs of siblings) {
    // Edges in left/top space, converted back to center coords
    const exL = obs.left - NODE_GAP - draggedRect.width + halfW;
    const exR = obs.left + obs.width + NODE_GAP + halfW;
    const exT = obs.top - NODE_GAP - draggedRect.height + halfH;
    const exB = obs.top + obs.height + NODE_GAP + halfH;

    if (between(exL, prevX, x)) xEdges.push(exL);
    if (between(exR, prevX, x)) xEdges.push(exR);
    if (between(exT, prevY, y)) yEdges.push(exT);
    if (between(exB, prevY, y)) yEdges.push(exB);
  }

  // Try every combination of X edge × Y edge, pick closest valid one
  let bestX = prevX, bestY = prevY, bestDist = Infinity;
  let found = false;

  for (const ex of xEdges) {
    for (const ey of yEdges) {
      if (anyOverlap(ex, ey)) continue;
      const dist = (ex - x) ** 2 + (ey - y) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        bestX = ex;
        bestY = ey;
        found = true;
      }
    }
  }

  if (found) return { x: bestX, y: bestY };

  // Binary search fallback along the vector from previous to target
  let lo = 0;
  let hi = 1;
  const vecX = x - prevX;
  const vecY = y - prevY;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (anyOverlap(prevX + vecX * mid, prevY + vecY * mid)) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return { x: prevX + vecX * lo, y: prevY + vecY * lo };
}

interface UseNodeDragOptions {
  nodes: NodeData[];
  layerShiftsRef: React.RefObject<Record<string, number>>;
  toCanvasCoords: (clientX: number, clientY: number) => { x: number; y: number };
  isBlocked: boolean;
  setNodes: React.Dispatch<React.SetStateAction<NodeData[]>>;
  regionsRef: React.RefObject<RegionBounds[] | null>;
  getNodeDimensions: (node: { id: string; w: number }) => { w: number; h: number };
  layerPadding: number;
  layerTitleOffset: number;
}

export function useNodeDrag({
  nodes, layerShiftsRef, toCanvasCoords, isBlocked, setNodes,
  regionsRef, getNodeDimensions, layerPadding, layerTitleOffset,
}: UseNodeDragOptions) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [elementDragPos, setElementDragPos] = useState<{ x: number; y: number } | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  // Snapshot the dragged node's layer and dimensions at drag start
  const dragNodeInfo = useRef<{ layer: string; halfW: number; halfH: number } | null>(null);
  // Snapshot sibling node rects at drag start for stable collision bounds
  const siblingRects = useRef<NodeRect[]>([]);
  // Track last valid position for edge-snapping navigation
  const lastValidPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const handleDragStart = useCallback((id: string, e: React.MouseEvent) => {
    if (isBlocked) return;
    const node = nodes.find((n) => n.id === id);
    if (!node) return;

    const mouse = toCanvasCoords(e.clientX, e.clientY);
    const shift = layerShiftsRef.current[node.layer] || 0;
    const displayY = node.y + shift;
    dragOffset.current = {
      x: mouse.x - node.x,
      y: mouse.y - displayY,
    };
    const dims = getNodeDimensions(node);
    dragNodeInfo.current = { layer: node.layer, halfW: dims.w / 2, halfH: dims.h / 2 };

    // Snapshot sibling nodes in the same layer
    siblingRects.current = nodes
      .filter((n) => n.id !== id && n.layer === node.layer)
      .map((n) => {
        const d = getNodeDimensions(n);
        const sy = n.y + (layerShiftsRef.current[n.layer] || 0);
        return { left: n.x - d.w / 2, top: sy - d.h / 2, width: d.w, height: d.h };
      });

    lastValidPos.current = { x: node.x, y: displayY };
    setDraggingId(id);
    setElementDragPos({ x: node.x, y: displayY });
  }, [nodes, isBlocked, toCanvasCoords, layerShiftsRef, getNodeDimensions]);

  useEffect(() => {
    if (!draggingId) return;

    const handleMouseMove = (e: MouseEvent) => {
      const mouse = toCanvasCoords(e.clientX, e.clientY);
      let x = mouse.x - dragOffset.current.x;
      let y = mouse.y - dragOffset.current.y;

      // Clamp: allow layer expansion but prevent collision with other layers
      const info = dragNodeInfo.current;
      const regions = regionsRef.current;
      if (info && regions) {
        const region = regions.find((r) => r.id === info.layer);
        if (region && !region.empty) {
          const others = regions.filter(r => r.id !== info.layer && !r.empty);

          let maxRight = Infinity;
          let minLeft = -Infinity;
          let maxBottom = Infinity;
          let minTop = -Infinity;

          for (const obs of others) {
            // Horizontal expansion limits (obstacles overlapping in Y)
            if (obs.top < region.top + region.height && obs.top + obs.height > region.top) {
              if (obs.left >= region.left + region.width) {
                maxRight = Math.min(maxRight, obs.left - LAYER_GAP - layerPadding - info.halfW);
              }
              if (obs.left + obs.width <= region.left) {
                minLeft = Math.max(minLeft, obs.left + obs.width + LAYER_GAP + layerPadding + info.halfW);
              }
            }
            // Vertical expansion limits (obstacles overlapping in X)
            if (obs.left < region.left + region.width && obs.left + obs.width > region.left) {
              if (obs.top >= region.top + region.height) {
                maxBottom = Math.min(maxBottom, obs.top - LAYER_GAP - layerPadding - info.halfH);
              }
              if (obs.top + obs.height <= region.top) {
                minTop = Math.max(minTop, obs.top + obs.height + LAYER_GAP + layerTitleOffset + layerPadding + info.halfH);
              }
            }
          }

          x = Math.max(minLeft, Math.min(maxRight, x));
          y = Math.max(minTop, Math.min(maxBottom, y));
        }
      }

      // Clamp: prevent collision with sibling nodes in the same layer
      if (info && siblingRects.current.length > 0) {
        const prev = lastValidPos.current;
        const clamped = clampNodePosition(x, y, info.halfW, info.halfH, prev.x, prev.y, siblingRects.current);
        x = clamped.x;
        y = clamped.y;
      }

      lastValidPos.current = { x, y };
      setElementDragPos({ x, y });
    };

    const handleMouseUp = () => {
      setElementDragPos((pos) => {
        if (pos) {
          setNodes((prev) =>
            prev.map((n) => (n.id === draggingId ? { ...n, x: pos.x, y: pos.y } : n))
          );
        }
        return null;
      });
      setDraggingId(null);
      dragNodeInfo.current = null;
      siblingRects.current = [];
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [draggingId, toCanvasCoords, setNodes, regionsRef, layerPadding, layerTitleOffset]);

  return { draggingId, elementDragPos, handleDragStart };
}
