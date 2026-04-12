import { useState, useCallback, useEffect, useRef } from "react";
import type { AnchorId } from "../utils/anchors";
import { getAnchorPosition, findNearestAnchor } from "../utils/anchors";
import type { NodeData, Connection } from "../../../shared/utils/types";
import { getNodeDims } from "../utils/geometry";
import { validateConnection } from "../utils/connectionConstraints";

interface UseLineDragOptions {
  nodes: NodeData[];
  connections: Connection[];
  measuredSizes: Record<string, { w: number; h: number }>;
  layerShiftsRef: React.RefObject<Record<string, number>>;
  toCanvasCoords: (clientX: number, clientY: number) => { x: number; y: number };
  setConnections: React.Dispatch<React.SetStateAction<Connection[]>>;
  isBlocked: boolean;
  onAnchorClick?: (nodeId: string, anchorId: AnchorId, clientX: number, clientY: number) => void;
  onConnectedAnchorDrag?: (connectionId: string, end: "from" | "to", e: MouseEvent) => void;
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

export function useLineDrag({
  nodes,
  connections,
  measuredSizes,
  layerShiftsRef,
  toCanvasCoords,
  setConnections,
  isBlocked,
  onAnchorClick,
  onConnectedAnchorDrag,
}: UseLineDragOptions) {
  const [creatingLine, setCreatingLine] = useState<CreatingLine | null>(null);
  const creatingLineRef = useRef(creatingLine);
  creatingLineRef.current = creatingLine;

  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const measuredSizesRef = useRef(measuredSizes);
  measuredSizesRef.current = measuredSizes;
  const connectionsRef = useRef(connections);
  connectionsRef.current = connections;
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anchorClickRef = useRef(onAnchorClick);
  anchorClickRef.current = onAnchorClick;
  const connectedDragRef = useRef(onConnectedAnchorDrag);
  connectedDragRef.current = onConnectedAnchorDrag;

  const handleAnchorDragStart = useCallback(
    (nodeId: string, anchorId: AnchorId, e: React.MouseEvent) => {
      if (isBlocked) return;

      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;

      const shift = layerShiftsRef.current[node.layer] || 0;
      const dims = getNodeDims(node, measuredSizes);
      const fromPos = getAnchorPosition(anchorId, node.x, node.y + shift, dims.w, dims.h);

      // Track mouseDown position + time for click detection
      const downX = e.clientX;
      const downY = e.clientY;
      const downTime = Date.now();

      // Delay drag initiation by 150ms to avoid accidental drags
      if (holdTimer.current) clearTimeout(holdTimer.current);
      holdTimer.current = setTimeout(() => {
        holdTimer.current = null;
        // Check if this anchor has an existing connection — if so, trigger endpoint drag
        const connAsFrom = connectionsRef.current.find((c) => c.from === nodeId && c.fromAnchor === anchorId);
        const connAsTo = connectionsRef.current.find((c) => c.to === nodeId && c.toAnchor === anchorId);
        if ((connAsFrom || connAsTo) && connectedDragRef.current) {
          // Create a synthetic MouseEvent at the anchor position for endpoint drag
          const conn = connAsFrom ?? connAsTo!;
          const end = connAsFrom ? "from" : "to";
          const syntheticEvent = new MouseEvent("mousedown", { clientX: downX, clientY: downY });
          connectedDragRef.current(conn.id, end, syntheticEvent);
        } else {
          setCreatingLine({
            fromNodeId: nodeId,
            fromAnchorId: anchorId,
            fromPos,
            currentPos: fromPos,
            snappedAnchor: null,
          });
        }
      }, 150);

      // Cancel if mouse released before timer fires — detect click vs drag
      const cancelOnUp = (upEvent: MouseEvent) => {
        if (holdTimer.current) {
          clearTimeout(holdTimer.current);
          holdTimer.current = null;

          // Check if this qualifies as a click (short time, small movement)
          const elapsed = Date.now() - downTime;
          const dx = upEvent.clientX - downX;
          const dy = upEvent.clientY - downY;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (elapsed < 300 && distance < 5 && anchorClickRef.current) {
            anchorClickRef.current(nodeId, anchorId, upEvent.clientX, upEvent.clientY);
          }
        }
        window.removeEventListener("mouseup", cancelOnUp);
      };
      window.addEventListener("mouseup", cancelOnUp);
    },
    [nodes, measuredSizes, layerShiftsRef, isBlocked]
  );

  useEffect(() => {
    if (!creatingLine) return;

    const handleMouseMove = (e: MouseEvent) => {
      const cur = creatingLineRef.current;
      if (!cur) return;
      const { x: mx, y: my } = toCanvasCoords(e.clientX, e.clientY);

      const nodesWithHeight = nodesRef.current
        .filter((n) => n.id !== cur.fromNodeId)
        .map((n) => {
          const dims = getNodeDims(n, measuredSizesRef.current);
          const shift = layerShiftsRef.current[n.layer] || 0;
          return { id: n.id, x: n.x, y: n.y + shift, w: dims.w, h: dims.h, shape: n.shape, conditionOutCount: n.conditionOutCount, rotation: n.rotation };
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
      const cur = creatingLineRef.current;
      if (!cur) return;

      if (cur.snappedAnchor && cur.snappedAnchor.nodeId !== cur.fromNodeId) {
        const fromNode = nodesRef.current.find((n) => n.id === cur.fromNodeId);
        const toNode = nodesRef.current.find((n) => n.id === cur.snappedAnchor!.nodeId);
        const { valid } = validateConnection(fromNode, cur.fromAnchorId, toNode, cur.snappedAnchor.anchorId, connectionsRef.current);
        if (!valid) {
          setCreatingLine(null);
          return;
        }
        const newConnection: Connection = {
          id: `dl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          from: cur.fromNodeId,
          to: cur.snappedAnchor.nodeId,
          fromAnchor: cur.fromAnchorId,
          toAnchor: cur.snappedAnchor.anchorId,
          color: "#3b82f6",
          label: "",
        };
        setConnections((conns) => [...conns, newConnection]);
      }

      setCreatingLine(null);
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
  // Only attach/detach listeners when creatingLine goes from null↔non-null
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!creatingLine]);

  return { creatingLine, handleAnchorDragStart };
}
