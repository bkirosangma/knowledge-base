import { useState, useCallback, useEffect, useRef } from "react";
import type { AnchorId } from "../utils/anchors";
import { getAnchorPosition, findNearestAnchor } from "../utils/anchors";
import type { NodeData, Connection } from "../utils/types";
import { getNodeHeight } from "../utils/types";

interface UseEndpointDragOptions {
  connections: Connection[];
  nodes: NodeData[];
  measuredSizes: Record<string, { w: number; h: number }>;
  layerShiftsRef: React.RefObject<Record<string, number>>;
  toCanvasCoords: (clientX: number, clientY: number) => { x: number; y: number };
  setConnections: React.Dispatch<React.SetStateAction<Connection[]>>;
}

export interface DraggingEndpoint {
  connectionId: string;
  end: "from" | "to";
  currentPos: { x: number; y: number };
  snappedAnchor: {
    nodeId: string;
    anchorId: AnchorId;
    x: number;
    y: number;
  } | null;
  originalNodeId: string;
  originalAnchor: AnchorId;
}

function getNodeDims(node: NodeData, measuredSizes: Record<string, { w: number; h: number }>) {
  const measured = measuredSizes[node.id];
  return {
    w: measured?.w ?? node.w,
    h: measured?.h ?? getNodeHeight(node.w),
  };
}

export function useEndpointDrag({
  connections,
  nodes,
  measuredSizes,
  layerShiftsRef,
  toCanvasCoords,
  setConnections,
}: UseEndpointDragOptions) {
  const [draggingEndpoint, setDraggingEndpoint] = useState<DraggingEndpoint | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLineClick = useCallback(
    (connectionId: string, e: React.MouseEvent) => {
      const { x: mx, y: my } = toCanvasCoords(e.clientX, e.clientY);

      const conn = connections.find((c) => c.id === connectionId);
      if (!conn) return;

      const fromNodeRaw = nodes.find((n) => n.id === conn.from);
      const toNodeRaw = nodes.find((n) => n.id === conn.to);
      if (!fromNodeRaw || !toNodeRaw) return;

      const fromShift = layerShiftsRef.current[fromNodeRaw.layer] || 0;
      const toShift = layerShiftsRef.current[toNodeRaw.layer] || 0;
      const fromDims = getNodeDims(fromNodeRaw, measuredSizes);
      const toDims = getNodeDims(toNodeRaw, measuredSizes);
      const fromPos = getAnchorPosition(conn.fromAnchor, fromNodeRaw.x, fromNodeRaw.y + fromShift, fromDims.w, fromDims.h);
      const toPos = getAnchorPosition(conn.toAnchor, toNodeRaw.x, toNodeRaw.y + toShift, toDims.w, toDims.h);

      const distFrom = Math.hypot(mx - fromPos.x, my - fromPos.y);
      const distTo = Math.hypot(mx - toPos.x, my - toPos.y);

      const end = distFrom <= distTo ? "from" : "to";
      const originalNodeId = end === "from" ? conn.from : conn.to;
      const originalAnchor = end === "from" ? conn.fromAnchor : conn.toAnchor;

      // Delay drag initiation by 150ms to avoid accidental drags
      if (holdTimer.current) clearTimeout(holdTimer.current);
      holdTimer.current = setTimeout(() => {
        holdTimer.current = null;
        setDraggingEndpoint({
          connectionId,
          end,
          currentPos: { x: mx, y: my },
          snappedAnchor: null,
          originalNodeId,
          originalAnchor,
        });
      }, 150);

      // Cancel if mouse released before timer fires
      const cancelOnUp = () => {
        if (holdTimer.current) {
          clearTimeout(holdTimer.current);
          holdTimer.current = null;
        }
        window.removeEventListener("mouseup", cancelOnUp);
      };
      window.addEventListener("mouseup", cancelOnUp);
    },
    [connections, nodes, measuredSizes, layerShiftsRef, toCanvasCoords]
  );

  useEffect(() => {
    if (!draggingEndpoint) return;

    const handleMouseMove = (e: MouseEvent) => {
      const { x: mx, y: my } = toCanvasCoords(e.clientX, e.clientY);

      const nodesWithHeight = nodes.map((n) => {
        const dims = getNodeDims(n, measuredSizes);
        const shift = layerShiftsRef.current[n.layer] || 0;
        return { id: n.id, x: n.x, y: n.y + shift, w: dims.w, h: dims.h };
      });

      const nearest = findNearestAnchor(mx, my, nodesWithHeight, 25);

      setDraggingEndpoint((prev) =>
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
      setDraggingEndpoint((prev) => {
        if (!prev) return null;

        const target = prev.snappedAnchor ?? {
          nodeId: prev.originalNodeId,
          anchorId: prev.originalAnchor,
        };

        setConnections((conns) =>
          conns.map((c) => {
            if (c.id !== prev.connectionId) return c;
            if (prev.end === "from") {
              return { ...c, from: target.nodeId, fromAnchor: target.anchorId };
            } else {
              return { ...c, to: target.nodeId, toAnchor: target.anchorId };
            }
          })
        );

        return null;
      });
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [draggingEndpoint, nodes, measuredSizes, layerShiftsRef, toCanvasCoords, setConnections]);

  return { draggingEndpoint, handleLineClick };
}
