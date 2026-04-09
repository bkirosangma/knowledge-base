import { useState, useCallback, useRef, useEffect } from "react";
import type { NodeData } from "../utils/types";

interface UseLayerDragOptions {
  toCanvasCoords: (clientX: number, clientY: number) => { x: number; y: number };
  isBlocked: boolean;
  setNodes: React.Dispatch<React.SetStateAction<NodeData[]>>;
}

export function useLayerDrag({ toCanvasCoords, isBlocked, setNodes }: UseLayerDragOptions) {
  const [draggingLayerId, setDraggingLayerId] = useState<string | null>(null);
  const [layerDragDelta, setLayerDragDelta] = useState<{ dx: number; dy: number } | null>(null);
  const layerDragStart = useRef({ x: 0, y: 0 });

  const handleLayerDragStart = useCallback((layerId: string, e: React.MouseEvent) => {
    if (isBlocked) return;
    layerDragStart.current = toCanvasCoords(e.clientX, e.clientY);
    setDraggingLayerId(layerId);
    setLayerDragDelta({ dx: 0, dy: 0 });
  }, [isBlocked, toCanvasCoords]);

  useEffect(() => {
    if (!draggingLayerId) return;

    const handleMouseMove = (e: MouseEvent) => {
      const mouse = toCanvasCoords(e.clientX, e.clientY);
      const dx = mouse.x - layerDragStart.current.x;
      const dy = mouse.y - layerDragStart.current.y;
      setLayerDragDelta({ dx, dy });
    };

    const handleMouseUp = () => {
      setLayerDragDelta((delta) => {
        if (delta) {
          setNodes((prev) =>
            prev.map((n) =>
              n.layer === draggingLayerId
                ? { ...n, x: n.x + delta.dx, y: n.y + delta.dy }
                : n
            )
          );
        }
        return null;
      });
      setDraggingLayerId(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [draggingLayerId, toCanvasCoords, setNodes]);

  return { draggingLayerId, layerDragDelta, handleLayerDragStart };
}
