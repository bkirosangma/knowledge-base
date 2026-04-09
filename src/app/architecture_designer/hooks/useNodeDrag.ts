import { useState, useCallback, useRef, useEffect } from "react";
import type { NodeData, Selection } from "../utils/types";
import { clampNodePosition, clampMultiNodeDelta, type Rect, type LayerBounds } from "../utils/collisionUtils";
import { LAYER_GAP } from "../utils/constants";
import { isItemSelected } from "../utils/selectionUtils";

interface UseNodeDragOptions {
  nodes: NodeData[];
  layerShiftsRef: React.RefObject<Record<string, number>>;
  toCanvasCoords: (clientX: number, clientY: number) => { x: number; y: number };
  isBlocked: boolean;
  setNodes: React.Dispatch<React.SetStateAction<NodeData[]>>;
  regionsRef: React.RefObject<LayerBounds[] | null>;
  getNodeDimensions: (node: { id: string; w: number }) => { w: number; h: number };
  layerPadding: number;
  layerTitleOffset: number;
  selection: Selection;
}

export function useNodeDrag({
  nodes, layerShiftsRef, toCanvasCoords, isBlocked, setNodes,
  regionsRef, getNodeDimensions, layerPadding, layerTitleOffset, selection,
}: UseNodeDragOptions) {
  // Single-node drag state (existing)
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [elementDragPos, setElementDragPos] = useState<{ x: number; y: number } | null>(null);
  const [elementDragRawPos, setElementDragRawPos] = useState<{ x: number; y: number } | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const dragNodeInfo = useRef<{ layer: string; halfW: number; halfH: number } | null>(null);
  const siblingRects = useRef<Rect[]>([]);
  const lastValidPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Multi-node drag state
  const [multiDragIds, setMultiDragIds] = useState<string[]>([]);
  const [multiDragDelta, setMultiDragDelta] = useState<{ dx: number; dy: number } | null>(null);
  const [multiDragRawDelta, setMultiDragRawDelta] = useState<{ dx: number; dy: number } | null>(null);
  const multiDragStart = useRef({ x: 0, y: 0 });
  const multiDragLayer = useRef<string>("");
  const lastClampedDelta = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const multiSiblingRects = useRef<Rect[]>([]);
  // Snapshot of dragged nodes at drag start for bounding box computation
  const multiDragNodesSnapshot = useRef<NodeData[]>([]);

  const isMultiDrag = multiDragIds.length > 0;

  const handleDragStart = useCallback((id: string, e: React.MouseEvent) => {
    if (isBlocked) return;
    const node = nodes.find((n) => n.id === id);
    if (!node) return;

    // Check if this node is part of a multi-node selection
    if (selection?.type === 'multi-node' && isItemSelected(selection, 'node', id)) {
      // Multi-drag mode
      const ids = selection.ids;
      const idsSet = new Set(ids);
      const draggedNodes = nodes.filter(n => idsSet.has(n.id));
      const mouse = toCanvasCoords(e.clientX, e.clientY);
      multiDragStart.current = mouse;
      multiDragLayer.current = selection.layer;
      multiDragNodesSnapshot.current = draggedNodes;
      lastClampedDelta.current = { dx: 0, dy: 0 };

      // Build sibling rects: non-dragged nodes in the same layer
      multiSiblingRects.current = nodes
        .filter(n => !idsSet.has(n.id) && n.layer === selection.layer)
        .map(n => {
          const d = getNodeDimensions(n);
          const sy = n.y + (layerShiftsRef.current[n.layer] || 0);
          return { left: n.x - d.w / 2, top: sy - d.h / 2, width: d.w, height: d.h };
        });

      setMultiDragIds(ids);
      setMultiDragDelta({ dx: 0, dy: 0 });
      setMultiDragRawDelta({ dx: 0, dy: 0 });
      return;
    }

    // Single-node drag (existing logic)
    const mouse = toCanvasCoords(e.clientX, e.clientY);
    const shift = layerShiftsRef.current[node.layer] || 0;
    const displayY = node.y + shift;
    dragOffset.current = {
      x: mouse.x - node.x,
      y: mouse.y - displayY,
    };
    const dims = getNodeDimensions(node);
    dragNodeInfo.current = { layer: node.layer, halfW: dims.w / 2, halfH: dims.h / 2 };

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
    setElementDragRawPos({ x: node.x, y: displayY });
  }, [nodes, isBlocked, toCanvasCoords, layerShiftsRef, getNodeDimensions, selection]);

  // Single-node drag effect (existing)
  useEffect(() => {
    if (!draggingId) return;

    const handleMouseMove = (e: MouseEvent) => {
      const mouse = toCanvasCoords(e.clientX, e.clientY);
      let x = mouse.x - dragOffset.current.x;
      let y = mouse.y - dragOffset.current.y;
      const rawX = x;
      const rawY = y;

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
            if (obs.top < region.top + region.height && obs.top + obs.height > region.top) {
              if (obs.left >= region.left + region.width) {
                maxRight = Math.min(maxRight, obs.left - LAYER_GAP - layerPadding - info.halfW);
              }
              if (obs.left + obs.width <= region.left) {
                minLeft = Math.max(minLeft, obs.left + obs.width + LAYER_GAP + layerPadding + info.halfW);
              }
            }
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
      setElementDragRawPos({ x: rawX, y: rawY });
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
      setElementDragRawPos(null);
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

  // Multi-node drag effect
  useEffect(() => {
    if (multiDragIds.length === 0) return;

    const handleMouseMove = (e: MouseEvent) => {
      const mouse = toCanvasCoords(e.clientX, e.clientY);
      const rawDx = mouse.x - multiDragStart.current.x;
      const rawDy = mouse.y - multiDragStart.current.y;

      // Clamp delta so no dragged node crosses into another layer
      let dx = rawDx;
      let dy = rawDy;
      const regions = regionsRef.current;
      const layer = multiDragLayer.current;
      if (regions) {
        const region = regions.find(r => r.id === layer);
        if (region && !region.empty) {
          const others = regions.filter(r => r.id !== layer && !r.empty);

          // Compute group bounding box at proposed delta
          for (const sn of multiDragNodesSnapshot.current) {
            const dims = getNodeDimensions(sn);
            const hw = dims.w / 2;
            const hh = dims.h / 2;

            let maxRight = Infinity;
            let minLeft = -Infinity;
            let maxBottom = Infinity;
            let minTop = -Infinity;

            for (const obs of others) {
              if (obs.top < region.top + region.height && obs.top + obs.height > region.top) {
                if (obs.left >= region.left + region.width) {
                  maxRight = Math.min(maxRight, obs.left - LAYER_GAP - layerPadding - hw - sn.x);
                }
                if (obs.left + obs.width <= region.left) {
                  minLeft = Math.max(minLeft, obs.left + obs.width + LAYER_GAP + layerPadding + hw - sn.x);
                }
              }
              if (obs.left < region.left + region.width && obs.left + obs.width > region.left) {
                if (obs.top >= region.top + region.height) {
                  maxBottom = Math.min(maxBottom, obs.top - LAYER_GAP - layerPadding - hh - sn.y);
                }
                if (obs.top + obs.height <= region.top) {
                  minTop = Math.max(minTop, obs.top + obs.height + LAYER_GAP + layerTitleOffset + layerPadding + hh - sn.y);
                }
              }
            }

            dx = Math.max(minLeft, Math.min(maxRight, dx));
            dy = Math.max(minTop, Math.min(maxBottom, dy));
          }
        }
      }

      // Clamp: prevent collision with non-dragged sibling nodes
      if (multiSiblingRects.current.length > 0) {
        const draggedNodeRects = multiDragNodesSnapshot.current.map(sn => {
          const dims = getNodeDimensions(sn);
          return { x: sn.x, y: sn.y, halfW: dims.w / 2, halfH: dims.h / 2 };
        });
        const prev = lastClampedDelta.current;
        const clamped = clampMultiNodeDelta(dx, dy, prev.dx, prev.dy, draggedNodeRects, multiSiblingRects.current);
        dx = clamped.dx;
        dy = clamped.dy;
      }

      lastClampedDelta.current = { dx, dy };
      setMultiDragDelta({ dx, dy });
      setMultiDragRawDelta({ dx: rawDx, dy: rawDy });
    };

    const handleMouseUp = () => {
      const delta = lastClampedDelta.current;
      if (delta.dx !== 0 || delta.dy !== 0) {
        const ids = new Set(multiDragIds);
        setNodes((prev) =>
          prev.map((n) => ids.has(n.id) ? { ...n, x: n.x + delta.dx, y: n.y + delta.dy } : n)
        );
      }
      setMultiDragIds([]);
      setMultiDragDelta(null);
      setMultiDragRawDelta(null);
      multiDragNodesSnapshot.current = [];
      multiSiblingRects.current = [];
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [multiDragIds, toCanvasCoords, setNodes, regionsRef, getNodeDimensions, layerPadding, layerTitleOffset]);

  return {
    draggingId, elementDragPos, elementDragRawPos, handleDragStart,
    isMultiDrag, multiDragIds, multiDragDelta, multiDragRawDelta,
  };
}
