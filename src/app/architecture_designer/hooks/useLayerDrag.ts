import { useState, useCallback, useRef, useEffect } from "react";
import type { NodeData } from "../utils/types";
import { LAYER_GAP, clampLayerDelta, type LayerBounds } from "../utils/collisionUtils";

export { LAYER_GAP };
export type { LayerBounds };

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
        delta = clampLayerDelta(draggedRegion, regions, rawDx, rawDy, prev.dx, prev.dy);
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
