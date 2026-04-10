import { useState, useCallback, useRef, useEffect } from "react";
import type { NodeData, Selection } from "../utils/types";
import { clampLayerDelta, type LayerBounds } from "../utils/collisionUtils";
import { LAYER_GAP } from "../utils/constants";
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
}

export function useLayerDrag({ toCanvasCoords, isBlocked, setNodes, regionsRef, setLayerManualSizes, selection }: UseLayerDragOptions) {
  const [draggingLayerIds, setDraggingLayerIds] = useState<string[]>([]);
  const [layerDragDelta, setLayerDragDelta] = useState<{ dx: number; dy: number } | null>(null);
  const [layerDragRawDelta, setLayerDragRawDelta] = useState<{ dx: number; dy: number } | null>(null);
  const layerDragStart = useRef({ x: 0, y: 0 });
  const dragStartRegions = useRef<LayerBounds[] | null>(null);
  const lastClampedDelta = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const layerDragDidMove = useRef(false);

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

      // Clamp delta for each dragged layer individually, take the most restrictive
      let dx = rawDx;
      let dy = rawDy;
      for (const lid of draggingLayerIds) {
        const draggedRegion = regions?.find((r) => r.id === lid);
        if (draggedRegion && regions) {
          // For multi-layer drag, exclude all dragged layers from obstacles
          const obstacles = regions.filter(r => !draggingLayerIds.includes(r.id));
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
