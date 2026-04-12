import { useState, useCallback, useEffect, useRef } from "react";
import type { ResizeEdge } from "../components/Layer";
import type { NodeData } from "../../../shared/utils/types";
import type { LevelMap } from "../utils/levelModel";
import { LAYER_GAP } from "../utils/constants";
import { snapToGrid } from "../utils/gridSnap";

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
  initialManualSizes?: Record<string, { left?: number; width?: number; top?: number; height?: number }>;
  nodes: NodeData[];
  levelMapRef: React.RefObject<LevelMap>;
  getNodeDimensions: (node: { id: string; w: number }) => { w: number; h: number };
  layerShiftsRef: React.RefObject<Record<string, number>>;
}

export function useLayerResize({ regionsRef, toCanvasCoords, isBlocked, initialManualSizes, nodes, levelMapRef, getNodeDimensions, layerShiftsRef }: UseLayerResizeOptions) {
  const [layerManualSizes, setLayerManualSizes] = useState<
    Record<string, { left?: number; width?: number; top?: number; height?: number }>
  >(initialManualSizes ?? {});

  const [resizingLayer, setResizingLayer] = useState<{
    layerId: string;
    edge: ResizeEdge;
    startMousePos: number;
    startBounds: { left: number; width: number; top: number; height: number };
  } | null>(null);

  const resizeDidChange = useRef(false);

  const handleLayerResizeStart = useCallback(
    (layerId: string, edge: ResizeEdge, e: React.MouseEvent) => {
      if (isBlocked) return;

      const region = regionsRef.current?.find((r) => r.id === layerId);
      if (!region) return;

      const mouse = toCanvasCoords(e.clientX, e.clientY);
      const isHorizontal = edge === "left" || edge === "right";
      const startMousePos = isHorizontal ? mouse.x : mouse.y;

      resizeDidChange.current = false;
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
      if (delta !== 0) resizeDidChange.current = true;

      setLayerManualSizes((prev) => {
        const existing = prev[layerId] || {};
        const next = { ...existing };

        const obstacles = getObstacles(regionsRef.current ?? [], layerId, startBounds, edge);
        // Include level 1/canvas nodes as obstacles
        for (const n of nodes) {
          const nLevel = levelMapRef.current.get(n.id);
          if (nLevel && nLevel.level === 1 && nLevel.base === "canvas") {
            const d = getNodeDimensions(n);
            const sy = n.y + (layerShiftsRef.current[n.layer] || 0);
            const rect = { id: n.id, left: n.x - d.w / 2, top: sy - d.h / 2, width: d.w, height: d.h, empty: false, title: "" };
            // Apply same directional + perpendicular filter as getObstacles
            if (edge === "left" || edge === "right") {
              if (!(rect.top < startBounds.top + startBounds.height && rect.top + rect.height > startBounds.top)) continue;
            } else {
              if (!(rect.left < startBounds.left + startBounds.width && rect.left + rect.width > startBounds.left)) continue;
            }
            const passDir = edge === "right" ? rect.left >= startBounds.left + startBounds.width
              : edge === "left" ? rect.left + rect.width <= startBounds.left
              : edge === "bottom" ? rect.top >= startBounds.top + startBounds.height
              : rect.top + rect.height <= startBounds.top;
            if (passDir) obstacles.push(rect);
          }
        }

        if (edge === "right") {
          const rawRight = startBounds.left + startBounds.width + delta;
          const maxRight = obstacles.reduce((acc, obs) => Math.min(acc, obs.left - LAYER_GAP), rawRight);
          next.width = snapToGrid(Math.max(100, maxRight - startBounds.left));
        } else if (edge === "left") {
          const rawLeft = startBounds.left + delta;
          const minLeft = obstacles.reduce((acc, obs) => Math.max(acc, obs.left + obs.width + LAYER_GAP), rawLeft);
          const snappedLeft = snapToGrid(minLeft);
          const newWidth = startBounds.left + startBounds.width - snappedLeft;
          if (newWidth >= 100) {
            next.left = snappedLeft;
            next.width = newWidth;
          }
        } else if (edge === "bottom") {
          const rawBottom = startBounds.top + startBounds.height + delta;
          const maxBottom = obstacles.reduce((acc, obs) => Math.min(acc, obs.top - LAYER_GAP), rawBottom);
          next.height = snapToGrid(Math.max(60, maxBottom - startBounds.top));
        } else if (edge === "top") {
          const rawTop = startBounds.top + delta;
          const minTop = obstacles.reduce((acc, obs) => Math.max(acc, obs.top + obs.height + LAYER_GAP), rawTop);
          const snappedTop = snapToGrid(minTop);
          const newHeight = startBounds.top + startBounds.height - snappedTop;
          if (newHeight >= 60) {
            next.top = snappedTop;
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

  return { layerManualSizes, setLayerManualSizes, resizingLayer, handleLayerResizeStart, resizeDidChange };
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
