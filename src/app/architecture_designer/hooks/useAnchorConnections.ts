import { useCallback, type MutableRefObject } from "react";
import type { NodeData, Connection, Selection } from "../utils/types";
import type { AnchorId } from "../utils/anchors";
import { getNodeAnchorPosition, getAnchorDirection, pickBestTargetAnchor } from "../utils/anchors";
import { getNodesByType } from "../utils/typeUtils";
import { GitBranch } from "lucide-react";

interface AnchorPopup {
  clientX: number;
  clientY: number;
  nodeId: string;
  anchorId: AnchorId;
}

export function useAnchorConnections(
  anchorPopup: AnchorPopup | null,
  nodesRef: MutableRefObject<NodeData[]>,
  layerShiftsRef: MutableRefObject<Record<string, number>>,
  getNodeDimensions: (node: { id: string; w: number; shape?: string; conditionSize?: number }) => { w: number; h: number },
  setNodes: React.Dispatch<React.SetStateAction<NodeData[]>>,
  setConnections: React.Dispatch<React.SetStateAction<Connection[]>>,
  setSelection: React.Dispatch<React.SetStateAction<Selection>>,
  scheduleRecord: (description: string) => void,
) {
  const handleAnchorConnectToElement = useCallback((targetNodeId: string) => {
    if (!anchorPopup) return;
    const sourceNode = nodesRef.current.find((n) => n.id === anchorPopup.nodeId);
    const targetNode = nodesRef.current.find((n) => n.id === targetNodeId);
    if (!sourceNode || !targetNode) return;
    const shift = layerShiftsRef.current[sourceNode.layer] || 0;
    const dims = getNodeDimensions(sourceNode);
    const fromPos = getNodeAnchorPosition(anchorPopup.anchorId, sourceNode.x, sourceNode.y + shift, dims.w, dims.h, sourceNode.shape, sourceNode.conditionOutCount, sourceNode.rotation);
    const targetShift = layerShiftsRef.current[targetNode.layer] || 0;
    const targetDims = getNodeDimensions(targetNode);
    const toAnchor = pickBestTargetAnchor(fromPos, targetNode.x, targetNode.y + targetShift, targetDims.w, targetDims.h);
    const conn = {
      id: `dl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      from: anchorPopup.nodeId,
      to: targetNodeId,
      fromAnchor: anchorPopup.anchorId,
      toAnchor,
      color: "#3b82f6",
      label: "",
    };
    setConnections((prev) => [...prev, conn]);
    scheduleRecord("Connect to element");
  }, [anchorPopup, scheduleRecord, getNodeDimensions]);

  const handleAnchorCreateCondition = useCallback(() => {
    if (!anchorPopup) return;
    const sourceNode = nodesRef.current.find((n) => n.id === anchorPopup.nodeId);
    if (!sourceNode) return;
    const shift = layerShiftsRef.current[sourceNode.layer] || 0;
    const dims = getNodeDimensions(sourceNode);
    const fromPos = getNodeAnchorPosition(anchorPopup.anchorId, sourceNode.x, sourceNode.y + shift, dims.w, dims.h, sourceNode.shape, sourceNode.conditionOutCount, sourceNode.rotation);
    const dir = getAnchorDirection(anchorPopup.anchorId);
    const condX = fromPos.x + dir.dx * 150;
    const condY = fromPos.y + dir.dy * 150;
    const condId = `el-cond-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newNode = {
      id: condId,
      label: "Condition",
      icon: GitBranch,
      x: condX,
      y: condY,
      w: 120,
      layer: "",
      shape: "condition" as const,
      conditionOutCount: 2,
      rotation: 0 as const,
    };
    const conn = {
      id: `dl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      from: anchorPopup.nodeId,
      to: condId,
      fromAnchor: anchorPopup.anchorId,
      toAnchor: "cond-in" as AnchorId,
      color: "#3b82f6",
      label: "",
    };
    setNodes((prev) => [...prev, newNode]);
    setConnections((prev) => [...prev, conn]);
    setSelection({ type: 'node', id: condId });
    scheduleRecord("Add condition");
  }, [anchorPopup, scheduleRecord, getNodeDimensions]);

  const handleAnchorConnectToType = useCallback((type: string) => {
    if (!anchorPopup) return;
    const sourceNode = nodesRef.current.find((n) => n.id === anchorPopup.nodeId);
    if (!sourceNode) return;
    const targets = getNodesByType(nodesRef.current, type).filter((n) => n.id !== anchorPopup.nodeId);
    if (targets.length === 0) return;
    const shift = layerShiftsRef.current[sourceNode.layer] || 0;
    const dims = getNodeDimensions(sourceNode);
    const fromPos = getNodeAnchorPosition(anchorPopup.anchorId, sourceNode.x, sourceNode.y + shift, dims.w, dims.h, sourceNode.shape, sourceNode.conditionOutCount, sourceNode.rotation);
    const newConns = targets.map((t) => {
      const tShift = layerShiftsRef.current[t.layer] || 0;
      const tDims = getNodeDimensions(t);
      const toAnchor = pickBestTargetAnchor(fromPos, t.x, t.y + tShift, tDims.w, tDims.h);
      return {
        id: `dl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${t.id}`,
        from: anchorPopup.nodeId,
        to: t.id,
        fromAnchor: anchorPopup.anchorId,
        toAnchor,
        color: "#3b82f6",
        label: "",
      };
    });
    setConnections((prev) => [...prev, ...newConns]);
    scheduleRecord("Connect to type");
  }, [anchorPopup, scheduleRecord, getNodeDimensions]);

  return { handleAnchorConnectToElement, handleAnchorCreateCondition, handleAnchorConnectToType };
}
