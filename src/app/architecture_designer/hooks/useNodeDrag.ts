import { useState, useCallback, useRef, useEffect } from "react";
import type { NodeData } from "../utils/types";
import { LAYER_GAP } from "./useLayerDrag";

interface RegionBounds {
  id: string;
  left: number;
  width: number;
  top: number;
  height: number;
  empty: boolean;
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
