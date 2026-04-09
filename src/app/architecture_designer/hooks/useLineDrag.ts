import { useState, useCallback, useEffect } from "react";
import type { AnchorId } from "../utils/anchors";
import { getAnchorPosition, findNearestAnchor } from "../utils/anchors";
import type { NodeData, Connection } from "../utils/types";
import { getNodeHeight } from "../utils/types";

interface UseLineDragOptions {
  nodes: NodeData[];
  connections: Connection[];
  measuredSizes: Record<string, { w: number; h: number }>;
  layerShiftsRef: React.RefObject<Record<string, number>>;
  toCanvasCoords: (clientX: number, clientY: number) => { x: number; y: number };
  setConnections: React.Dispatch<React.SetStateAction<Connection[]>>;
  isBlocked: boolean;
}

export interface CreatingLine {
  fromNodeId: string;
  fromAnchorId: AnchorId;
  fromPos: { x: number; y: number };
  currentPos: { x: number; y: number };
  snappedAnchor: {
    nodeId: string;
    anchorId: AnchorId;
    x: number;
    y: number;
  } | null;
}

function getNodeDims(node: NodeData, measuredSizes: Record<string, { w: number; h: number }>) {
  const measured = measuredSizes[node.id];
  return {
    w: measured?.w ?? node.w,
    h: measured?.h ?? getNodeHeight(node.w),
  };
}

export function useLineDrag({
  nodes,
  connections,
  measuredSizes,
  layerShiftsRef,
  toCanvasCoords,
  setConnections,
  isBlocked,
}: UseLineDragOptions) {
  const [creatingLine, setCreatingLine] = useState<CreatingLine | null>(null);

  const handleAnchorDragStart = useCallback(
    (nodeId: string, anchorId: AnchorId, e: React.MouseEvent) => {
      if (isBlocked) return;

      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;

      const shift = layerShiftsRef.current[node.layer] || 0;
      const dims = getNodeDims(node, measuredSizes);
      const fromPos = getAnchorPosition(anchorId, node.x, node.y + shift, dims.w, dims.h);

      setCreatingLine({
        fromNodeId: nodeId,
        fromAnchorId: anchorId,
        fromPos,
        currentPos: fromPos,
        snappedAnchor: null,
      });
    },
    [nodes, measuredSizes, layerShiftsRef, isBlocked]
  );

  useEffect(() => {
    if (!creatingLine) return;

    const handleMouseMove = (e: MouseEvent) => {
      const { x: mx, y: my } = toCanvasCoords(e.clientX, e.clientY);

      const nodesWithHeight = nodes
        .filter((n) => n.id !== creatingLine.fromNodeId)
        .map((n) => {
          const dims = getNodeDims(n, measuredSizes);
          const shift = layerShiftsRef.current[n.layer] || 0;
          return { id: n.id, x: n.x, y: n.y + shift, w: dims.w, h: dims.h };
        });

      const nearest = findNearestAnchor(mx, my, nodesWithHeight, 25);

      setCreatingLine((prev) =>
        prev
          ? {
              ...prev,
              currentPos: { x: mx, y: my },
              snappedAnchor: nearest
                ? {
                    nodeId: nearest.nodeId,
                    anchorId: nearest.anchorId,
                    x: nearest.x,
                    y: nearest.y,
                  }
                : null,
            }
          : null
      );
    };

    const handleMouseUp = () => {
      setCreatingLine((prev) => {
        if (!prev) return null;

        if (prev.snappedAnchor && prev.snappedAnchor.nodeId !== prev.fromNodeId) {
          const newConnection: Connection = {
            id: `dl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            from: prev.fromNodeId,
            to: prev.snappedAnchor.nodeId,
            fromAnchor: prev.fromAnchorId,
            toAnchor: prev.snappedAnchor.anchorId,
            color: "#3b82f6",
            label: "",
          };
          setConnections((conns) => [...conns, newConnection]);
        }

        return null;
      });
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setCreatingLine(null);
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [creatingLine, nodes, measuredSizes, layerShiftsRef, toCanvasCoords, setConnections]);

  return { creatingLine, handleAnchorDragStart };
}
