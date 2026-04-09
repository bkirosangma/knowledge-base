import { useState, useCallback, useEffect } from "react";
import type { ResizeEdge } from "../components/Layer";
import { LAYER_GAP } from "./useLayerDrag";

interface RegionBounds {
  id: string;
  left: number;
  width: number;
  top: number;
  height: number;
  empty: boolean;
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

        const obstacles = getObstacles(regionsRef.current ?? [], layerId, startBounds, edge);

        if (edge === "right") {
          const rawRight = startBounds.left + startBounds.width + delta;
          const maxRight = obstacles.reduce((acc, obs) => Math.min(acc, obs.left - LAYER_GAP), rawRight);
          next.width = Math.max(100, maxRight - startBounds.left);
        } else if (edge === "left") {
          const rawLeft = startBounds.left + delta;
          const minLeft = obstacles.reduce((acc, obs) => Math.max(acc, obs.left + obs.width + LAYER_GAP), rawLeft);
          const newWidth = startBounds.left + startBounds.width - minLeft;
          if (newWidth >= 100) {
            next.left = minLeft;
            next.width = newWidth;
          }
        } else if (edge === "bottom") {
          const rawBottom = startBounds.top + startBounds.height + delta;
          const maxBottom = obstacles.reduce((acc, obs) => Math.min(acc, obs.top - LAYER_GAP), rawBottom);
          next.height = Math.max(60, maxBottom - startBounds.top);
        } else if (edge === "top") {
          const rawTop = startBounds.top + delta;
          const minTop = obstacles.reduce((acc, obs) => Math.max(acc, obs.top + obs.height + LAYER_GAP), rawTop);
          const newHeight = startBounds.top + startBounds.height - minTop;
          if (newHeight >= 60) {
            next.top = minTop;
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

function getObstacles(
  regions: RegionBounds[],
  layerId: string,
  startBounds: { left: number; width: number; top: number; height: number },
  edge: ResizeEdge,
): RegionBounds[] {
  return regions.filter((r) => {
    if (r.id === layerId || r.empty) return false;
    // Perpendicular axis overlap check
    if (edge === "left" || edge === "right") {
      if (!(r.top < startBounds.top + startBounds.height && r.top + r.height > startBounds.top)) return false;
    } else {
      if (!(r.left < startBounds.left + startBounds.width && r.left + r.width > startBounds.left)) return false;
    }
    // Directional filter: only include obstacles on the side the edge expands toward
    switch (edge) {
      case "right":  return r.left >= startBounds.left + startBounds.width;
      case "left":   return r.left + r.width <= startBounds.left;
      case "bottom": return r.top >= startBounds.top + startBounds.height;
      case "top":    return r.top + r.height <= startBounds.top;
    }
  });
}
