import { useCallback, type MutableRefObject } from "react";
import type { NodeData, Connection, Selection } from "../../../shared/utils/types";
import type { AnchorId } from "../utils/anchors";
import { getNodeAnchorPosition, getAnchorDirection, pickBestTargetAnchor } from "../utils/anchors";
import { getNodesByType } from "../utils/typeUtils";
import { getConditionDimensions, getEffectiveConditionHeight } from "../utils/conditionGeometry";
import { clampNodePosition, type Rect } from "../utils/collisionUtils";
import type { LevelMap } from "../utils/levelModel";
import { snapToGrid } from "../utils/gridSnap";
import { GitBranch } from "lucide-react";

type RegionBounds = { id: string; left: number; width: number; top: number; height: number; empty: boolean };

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
  getNodeDimensions: (node: { id: string; w: number; shape?: string; conditionSize?: number; conditionOutCount?: number }) => { w: number; h: number },
  setNodes: React.Dispatch<React.SetStateAction<NodeData[]>>,
  setConnections: React.Dispatch<React.SetStateAction<Connection[]>>,
  setSelection: React.Dispatch<React.SetStateAction<Selection>>,
  scheduleRecord: (description: string) => void,
  regionsRef?: MutableRefObject<RegionBounds[] | null>,
  levelMapRef?: MutableRefObject<LevelMap>,
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
    let condX = snapToGrid(fromPos.x + dir.dx * 150);
    let condY = snapToGrid(fromPos.y + dir.dy * 150);

    // Collision avoidance for condition placement
    const condDims = getConditionDimensions(1, 2);
    const condEH = getEffectiveConditionHeight(condDims.h, condDims.w, 2);
    const halfW = condDims.w / 2;
    const halfH = condEH / 2;
    const regions = regionsRef?.current;

    if (sourceNode.layer && regions) {
      // Source is in a layer — use layer-aware collision: check if condition fits within or near the layer
      const region = regions.find((r) => r.id === sourceNode.layer);
      if (region && !region.empty) {
        // Clamp to stay within or near the source layer bounds
        condX = Math.max(region.left + halfW + 10, Math.min(region.left + region.width - halfW - 10, condX));
        condY = Math.max(region.top + halfH + 25, Math.min(region.top + region.height - halfH - 10, condY));
      }
    }

    // Element-level collision: avoid overlapping nodes at same level+base
    const sourceLevel = levelMapRef?.current.get(anchorPopup.nodeId);
    const siblingRects: Rect[] = nodesRef.current
      .filter((n) => {
        if (n.id === anchorPopup.nodeId) return false;
        if (!sourceLevel || !levelMapRef) return true;
        const nLevel = levelMapRef.current.get(n.id);
        return nLevel && nLevel.level === sourceLevel.level && nLevel.base === sourceLevel.base;
      })
      .map((n) => {
        const d = getNodeDimensions(n);
        const sy = n.y + (layerShiftsRef.current[n.layer] || 0);
        return { left: n.x - d.w / 2, top: sy - d.h / 2, width: d.w, height: d.h };
      });

    if (siblingRects.length > 0) {
      const clamped = clampNodePosition(condX, condY, halfW, halfH, condX, condY, siblingRects);
      condX = snapToGrid(clamped.x);
      condY = snapToGrid(clamped.y);
    }

    const condId = `el-cond-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newNode = {
      id: condId,
      label: "Condition",
      icon: GitBranch,
      x: condX,
      y: condY,
      w: condDims.w,
      layer: "",
      shape: "condition" as const,
      conditionOutCount: 2,
      rotation: 0,
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
