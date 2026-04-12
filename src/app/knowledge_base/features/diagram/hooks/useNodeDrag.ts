import { useState, useCallback, useRef, useEffect } from "react";
import type { NodeData, Selection } from "../types";
import { clampNodePosition, clampMultiNodeDelta, type Rect, type LayerBounds } from "../utils/collisionUtils";
import type { LevelMap } from "../utils/levelModel";
import { LAYER_GAP } from "../utils/constants";
import { snapToGrid } from "../utils/gridSnap";
import { isItemSelected } from "../utils/selectionUtils";

interface UseNodeDragOptions {
  nodes: NodeData[];
  layerShiftsRef: React.RefObject<Record<string, number>>;
  toCanvasCoords: (clientX: number, clientY: number) => { x: number; y: number };
  isBlocked: boolean;
  setNodes: React.Dispatch<React.SetStateAction<NodeData[]>>;
  regionsRef: React.RefObject<LayerBounds[] | null>;
  levelMapRef: React.RefObject<LevelMap>;
  getNodeDimensions: (node: { id: string; w: number }) => { w: number; h: number };
  layerPadding: number;
  layerTitleOffset: number;
  selection: Selection;
}

export function useNodeDrag({
  nodes, layerShiftsRef, toCanvasCoords, isBlocked, setNodes,
  regionsRef, levelMapRef, getNodeDimensions, layerPadding, layerTitleOffset, selection,
}: UseNodeDragOptions) {
  // Single-node drag state (existing)
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [elementDragPos, setElementDragPos] = useState<{ x: number; y: number } | null>(null);
  const [elementDragRawPos, setElementDragRawPos] = useState<{ x: number; y: number } | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const dragNodeInfo = useRef<{ layer: string; halfW: number; halfH: number } | null>(null);
  const siblingRects = useRef<Rect[]>([]);
  const lastValidPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragStartPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const nodeDragDidMove = useRef(false);

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
  const multiDragDidMove = useRef(false);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

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
      multiDragDidMove.current = false;

      // Build sibling rects: non-dragged nodes at same level+base
      const refLevel = levelMapRef.current.get(ids[0]);
      const multiPeerRects: Rect[] = nodes
        .filter(n => {
          if (idsSet.has(n.id)) return false;
          const nLevel = levelMapRef.current.get(n.id);
          return refLevel && nLevel && nLevel.level === refLevel.level && nLevel.base === refLevel.base;
        })
        .map(n => {
          const d = getNodeDimensions(n);
          const sy = n.y + (layerShiftsRef.current[n.layer] || 0);
          return { left: n.x - d.w / 2, top: sy - d.h / 2, width: d.w, height: d.h };
        });
      // Level 1/canvas nodes also collide with layers
      if (refLevel && refLevel.level === 1 && refLevel.base === "canvas" && regionsRef.current) {
        for (const r of regionsRef.current) {
          if (!r.empty) multiPeerRects.push({ left: r.left, top: r.top, width: r.width, height: r.height });
        }
      }
      multiSiblingRects.current = multiPeerRects;

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

    const dragLevel = levelMapRef.current.get(id);
    const peerRects: Rect[] = nodes
      .filter((n) => {
        if (n.id === id) return false;
        const nLevel = levelMapRef.current.get(n.id);
        return dragLevel && nLevel && nLevel.level === dragLevel.level && nLevel.base === dragLevel.base;
      })
      .map((n) => {
        const d = getNodeDimensions(n);
        const sy = n.y + (layerShiftsRef.current[n.layer] || 0);
        return { left: n.x - d.w / 2, top: sy - d.h / 2, width: d.w, height: d.h };
      });
    // Level 1/canvas nodes also collide with layers (which are level 1/canvas)
    if (dragLevel && dragLevel.level === 1 && dragLevel.base === "canvas" && regionsRef.current) {
      for (const r of regionsRef.current) {
        if (!r.empty) peerRects.push({ left: r.left, top: r.top, width: r.width, height: r.height });
      }
    }
    siblingRects.current = peerRects;

    lastValidPos.current = { x: node.x, y: displayY };
    dragStartPos.current = { x: node.x, y: displayY };
    nodeDragDidMove.current = false;
    setDraggingId(id);
    setElementDragPos({ x: node.x, y: displayY });
    setElementDragRawPos({ x: node.x, y: displayY });
  }, [nodes, isBlocked, toCanvasCoords, layerShiftsRef, getNodeDimensions, selection]);

  // Single-node drag effect (existing)
  useEffect(() => {
    if (!draggingId) return;

    const handleMouseMove = (e: MouseEvent) => {
      const mouse = toCanvasCoords(e.clientX, e.clientY);
      const rawX = mouse.x - dragOffset.current.x;
      const rawY = mouse.y - dragOffset.current.y;
      // Snap to grid before clamping so the clamped position doesn't get
      // pushed past obstacle edges by a post-clamp snap.
      let x = snapToGrid(rawX);
      let y = snapToGrid(rawY);

      // Clamp: allow layer expansion but prevent collision with other layers and canvas-level nodes
      const info = dragNodeInfo.current;
      const regions = regionsRef.current;
      if (info && regions) {
        const region = regions.find((r) => r.id === info.layer);
        if (region && !region.empty) {
          const others: { left: number; top: number; width: number; height: number }[] = regions.filter(r => r.id !== info.layer && !r.empty);
          // Include level 1/canvas nodes as obstacles (they share the same level as layers)
          for (const n of nodesRef.current) {
            if (n.id === draggingId) continue;
            const nLevel = levelMapRef.current.get(n.id);
            if (nLevel && nLevel.level === 1 && nLevel.base === "canvas") {
              const d = getNodeDimensions(n);
              const sy = n.y + (layerShiftsRef.current[n.layer] || 0);
              others.push({ left: n.x - d.w / 2, top: sy - d.h / 2, width: d.w, height: d.h });
            }
          }

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
          const start = dragStartPos.current;
          nodeDragDidMove.current = pos.x !== start.x || pos.y !== start.y;
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

      // Snap raw delta to grid before clamping
      let dx = snapToGrid(rawDx);
      let dy = snapToGrid(rawDy);
      const regions = regionsRef.current;
      const layer = multiDragLayer.current;
      if (regions) {
        const region = regions.find(r => r.id === layer);
        if (region && !region.empty) {
          const others: { left: number; top: number; width: number; height: number }[] = regions.filter(r => r.id !== layer && !r.empty);
          // Include level 1/canvas nodes as obstacles
          const dragSet = new Set(multiDragIds);
          for (const n of nodesRef.current) {
            if (dragSet.has(n.id)) continue;
            const nLevel = levelMapRef.current.get(n.id);
            if (nLevel && nLevel.level === 1 && nLevel.base === "canvas") {
              const d = getNodeDimensions(n);
              const sy = n.y + (layerShiftsRef.current[n.layer] || 0);
              others.push({ left: n.x - d.w / 2, top: sy - d.h / 2, width: d.w, height: d.h });
            }
          }

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
      multiDragDidMove.current = delta.dx !== 0 || delta.dy !== 0;
      if (multiDragDidMove.current) {
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
    nodeDragDidMove, multiDragDidMove,
  };
}
