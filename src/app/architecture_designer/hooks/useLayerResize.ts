import { useState, useCallback, useEffect } from "react";
import type { ResizeEdge } from "../components/Layer";

interface RegionBounds {
  id: string;
  left: number;
  width: number;
  top: number;
  height: number;
}

interface UseLayerResizeOptions {
  regionsRef: React.RefObject<RegionBounds[] | null>;
  toCanvasCoords: (clientX: number, clientY: number) => { x: number; y: number };
  isBlocked: boolean;
}

export function useLayerResize({ regionsRef, toCanvasCoords, isBlocked }: UseLayerResizeOptions) {
  const [layerManualSizes, setLayerManualSizes] = useState<
    Record<string, { left?: number; width?: number; top?: number; height?: number }>
  >({});

  const [resizingLayer, setResizingLayer] = useState<{
    layerId: string;
    edge: ResizeEdge;
    startMousePos: number;
    startBounds: { left: number; width: number; top: number; height: number };
  } | null>(null);

  const handleLayerResizeStart = useCallback(
    (layerId: string, edge: ResizeEdge, e: React.MouseEvent) => {
      if (isBlocked) return;

      const region = regionsRef.current?.find((r) => r.id === layerId);
      if (!region) return;

      const mouse = toCanvasCoords(e.clientX, e.clientY);
      const isHorizontal = edge === "left" || edge === "right";
      const startMousePos = isHorizontal ? mouse.x : mouse.y;

      setResizingLayer({
        layerId,
        edge,
        startMousePos,
        startBounds: { left: region.left, width: region.width, top: region.top, height: region.height },
      });
    },
    [isBlocked, toCanvasCoords, regionsRef]
  );

  useEffect(() => {
    if (!resizingLayer) return;

    const handleMouseMove = (e: MouseEvent) => {
      const { edge, startMousePos, startBounds, layerId } = resizingLayer;
      const mouse = toCanvasCoords(e.clientX, e.clientY);
      const isHorizontal = edge === "left" || edge === "right";
      const mousePos = isHorizontal ? mouse.x : mouse.y;
      const delta = mousePos - startMousePos;

      setLayerManualSizes((prev) => {
        const existing = prev[layerId] || {};
        const next = { ...existing };

        if (edge === "right") {
          next.width = Math.max(100, startBounds.width + delta);
        } else if (edge === "left") {
          const newLeft = startBounds.left + delta;
          const newWidth = startBounds.width - delta;
          if (newWidth >= 100) {
            next.left = newLeft;
            next.width = newWidth;
          }
        } else if (edge === "bottom") {
          next.height = Math.max(60, startBounds.height + delta);
        } else if (edge === "top") {
          const newTop = startBounds.top + delta;
          const newHeight = startBounds.height - delta;
          if (newHeight >= 60) {
            next.top = newTop;
            next.height = newHeight;
          }
        }

        return { ...prev, [layerId]: next };
      });
    };

    const handleMouseUp = () => {
      setResizingLayer(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [resizingLayer, toCanvasCoords]);

  return { layerManualSizes, setLayerManualSizes, resizingLayer, handleLayerResizeStart };
}
