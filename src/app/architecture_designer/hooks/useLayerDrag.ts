import { useState, useCallback, useRef, useEffect } from "react";
import type { NodeData, Selection } from "../utils/types";
import { clampLayerDelta, type LayerBounds } from "../utils/collisionUtils";
import type { LevelMap } from "../utils/levelModel";
import { LAYER_GAP } from "../utils/constants";
import { snapToGrid } from "../utils/gridSnap";
import { isItemSelected } from "../utils/selectionUtils";

export type { LayerBounds };

interface UseLayerDragOptions {
  toCanvasCoords: (clientX: number, clientY: number) => { x: number; y: number };
  isBlocked: boolean;
  setNodes: React.Dispatch<React.SetStateAction<NodeData[]>>;
  regionsRef: React.RefObject<LayerBounds[] | null>;
  setLayerManualSizes: React.Dispatch<React.SetStateAction<
    Record<string, { left?: number; width?: number; top?: number; height?: number }>
  >>;
  selection: Selection;
  nodes: NodeData[];
  levelMapRef: React.RefObject<LevelMap>;
  getNodeDimensions: (node: { id: string; w: number }) => { w: number; h: number };
  layerShiftsRef: React.RefObject<Record<string, number>>;
}

export function useLayerDrag({ toCanvasCoords, isBlocked, setNodes, regionsRef, setLayerManualSizes, selection, nodes, levelMapRef, getNodeDimensions, layerShiftsRef }: UseLayerDragOptions) {
  const [draggingLayerIds, setDraggingLayerIds] = useState<string[]>([]);
  const [layerDragDelta, setLayerDragDelta] = useState<{ dx: number; dy: number } | null>(null);
  const [layerDragRawDelta, setLayerDragRawDelta] = useState<{ dx: number; dy: number } | null>(null);
  const layerDragStart = useRef({ x: 0, y: 0 });
  const dragStartRegions = useRef<LayerBounds[] | null>(null);
  const lastClampedDelta = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const layerDragDidMove = useRef(false);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  // Backwards-compatible single-layer accessor
  const draggingLayerId = draggingLayerIds.length > 0 ? draggingLayerIds[0] : null;

  const handleLayerDragStart = useCallback((layerId: string, e: React.MouseEvent) => {
    if (isBlocked) return;
    layerDragStart.current = toCanvasCoords(e.clientX, e.clientY);
    dragStartRegions.current = regionsRef.current ? [...regionsRef.current] : null;
    lastClampedDelta.current = { dx: 0, dy: 0 };
    layerDragDidMove.current = false;

    // Determine which layers to drag
    let ids: string[];
    if (selection?.type === 'multi-layer' && isItemSelected(selection, 'layer', layerId)) {
      ids = selection.ids;
    } else {
      ids = [layerId];
    }

    setDraggingLayerIds(ids);
    setLayerDragDelta({ dx: 0, dy: 0 });
    setLayerDragRawDelta({ dx: 0, dy: 0 });
  }, [isBlocked, toCanvasCoords, regionsRef, selection]);

  useEffect(() => {
    if (draggingLayerIds.length === 0) return;

    const handleMouseMove = (e: MouseEvent) => {
      const mouse = toCanvasCoords(e.clientX, e.clientY);
      const rawDx = mouse.x - layerDragStart.current.x;
      const rawDy = mouse.y - layerDragStart.current.y;

      const regions = dragStartRegions.current;
      const prev = lastClampedDelta.current;

      // Snap raw delta to grid first, then clamp to avoid overlaps.
      // Grid-snapping after clamping can push the layer past obstacle edges,
      // making prev invalid and breaking edge-sliding on subsequent frames.
      let dx = snapToGrid(rawDx);
      let dy = snapToGrid(rawDy);
      for (const lid of draggingLayerIds) {
        const draggedRegion = regions?.find((r) => r.id === lid);
        if (draggedRegion && regions) {
          // For multi-layer drag, exclude all dragged layers from obstacles
          const obstacles: LayerBounds[] = regions.filter(r => !draggingLayerIds.includes(r.id));
          // Include level 1/canvas nodes as obstacles
          for (const n of nodesRef.current) {
            const nLevel = levelMapRef.current.get(n.id);
            if (nLevel && nLevel.level === 1 && nLevel.base === "canvas") {
              const d = getNodeDimensions(n);
              const sy = n.y + (layerShiftsRef.current[n.layer] || 0);
              obstacles.push({ id: n.id, left: n.x - d.w / 2, top: sy - d.h / 2, width: d.w, height: d.h, empty: false });
            }
          }
          const regionsWithObstacles = [draggedRegion, ...obstacles];
          const clamped = clampLayerDelta(draggedRegion, regionsWithObstacles, dx, dy, prev.dx, prev.dy);
          dx = clamped.dx;
          dy = clamped.dy;
        }
      }
      lastClampedDelta.current = { dx, dy };
      setLayerDragDelta({ dx, dy });
      setLayerDragRawDelta({ dx: rawDx, dy: rawDy });
    };

    const handleMouseUp = () => {
      const delta = lastClampedDelta.current;
      layerDragDidMove.current = delta.dx !== 0 || delta.dy !== 0;
      if (layerDragDidMove.current) {
        const draggedSet = new Set(draggingLayerIds);
        setNodes((prev) =>
          prev.map((n) =>
            draggedSet.has(n.layer)
              ? { ...n, x: n.x + delta.dx, y: n.y + delta.dy }
              : n
          )
        );
        setLayerManualSizes((prev) => {
          const next = { ...prev };
          for (const lid of draggingLayerIds) {
            const existing = next[lid];
            if (existing) {
              const updated = { ...existing };
              if (updated.left !== undefined) updated.left += delta.dx;
              if (updated.top !== undefined) updated.top += delta.dy;
              next[lid] = updated;
            }
          }
          return next;
        });
      }
      setLayerDragDelta(null);
      setLayerDragRawDelta(null);
      setDraggingLayerIds([]);
      dragStartRegions.current = null;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [draggingLayerIds, toCanvasCoords, setNodes, setLayerManualSizes]);

  return { draggingLayerId, draggingLayerIds, layerDragDelta, layerDragRawDelta, handleLayerDragStart, layerDragDidMove };
}
