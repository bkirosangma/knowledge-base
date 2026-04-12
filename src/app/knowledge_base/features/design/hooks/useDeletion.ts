import { useCallback } from "react";
import type { NodeData, LayerDef, Connection, Selection, FlowDef } from "../../../shared/utils/types";
import { findBrokenFlows } from "../utils/flowUtils";

interface DeletionSetters {
  setNodes: React.Dispatch<React.SetStateAction<NodeData[]>>;
  setConnections: React.Dispatch<React.SetStateAction<Connection[]>>;
  setLayerDefs: React.Dispatch<React.SetStateAction<LayerDef[]>>;
  setLayerManualSizes: React.Dispatch<React.SetStateAction<Record<string, { left?: number; width?: number; top?: number; height?: number }>>>;
  setMeasuredSizes: React.Dispatch<React.SetStateAction<Record<string, { w: number; h: number }>>>;
  setSelection: React.Dispatch<React.SetStateAction<Selection>>;
  setFlows: React.Dispatch<React.SetStateAction<FlowDef[]>>;
}

export interface PendingDeletion {
  description: string;
  nodeIds: string[];
  layerIds: string[];
  lineIds: string[];
  brokenFlows: FlowDef[];
}

/**
 * Shared deletion logic used by keyboard handler and context menu.
 * Handles cascading: layers → nodes → connections, plus cleanup of
 * measured sizes, manual layer sizes, flows, and selection.
 *
 * Returns broken flows info so the caller can show a warning modal
 * before confirming the deletion.
 */
export function useDeletion(
  nodesRef: React.RefObject<NodeData[]>,
  connectionsRef: React.RefObject<Connection[]>,
  flowsRef: React.RefObject<FlowDef[]>,
  {
    setNodes, setConnections, setLayerDefs, setLayerManualSizes,
    setMeasuredSizes, setSelection, setFlows,
  }: DeletionSetters,
  onActionComplete?: (description: string) => void,
) {
  /** Compute which connection IDs would be removed by a deletion. */
  const computeRemovedConnections = useCallback((
    nodeIdsToDelete: string[],
    lineIdsToDelete: string[],
    layerIdsToDelete: string[],
  ): Set<string> => {
    const removed = new Set(lineIdsToDelete);

    // Cascade: layers → nodes
    let allNodeIds = [...nodeIdsToDelete];
    if (layerIdsToDelete.length > 0) {
      const layerSet = new Set(layerIdsToDelete);
      const nodesInLayers = nodesRef.current.filter((n) => layerSet.has(n.layer)).map((n) => n.id);
      allNodeIds = [...new Set([...allNodeIds, ...nodesInLayers])];
    }

    // Cascade: nodes → connections
    if (allNodeIds.length > 0) {
      const nodeSet = new Set(allNodeIds);
      for (const c of connectionsRef.current) {
        if (nodeSet.has(c.from) || nodeSet.has(c.to)) {
          removed.add(c.id);
        }
      }
    }

    return removed;
  }, [nodesRef, connectionsRef]);

  /** Execute the actual deletion + remove broken flows. */
  const executeDeletion = useCallback((
    nodeIdsToDelete: string[],
    layerIdsToDelete: string[],
    lineIdsToDelete: string[],
    brokenFlowIds: Set<string>,
  ) => {
    // Cascade: layers → collect their nodes
    if (layerIdsToDelete.length > 0) {
      const layerSet = new Set(layerIdsToDelete);
      const nodesInLayers = nodesRef.current.filter((n) => layerSet.has(n.layer)).map((n) => n.id);
      nodeIdsToDelete = [...new Set([...nodeIdsToDelete, ...nodesInLayers])];
      setLayerDefs((prev) => prev.filter((l) => !layerSet.has(l.id)));
      setLayerManualSizes((prev) => {
        const next = { ...prev };
        for (const id of layerIdsToDelete) delete next[id];
        return next;
      });
    }

    // Cascade: nodes → remove referencing connections
    if (nodeIdsToDelete.length > 0) {
      const nodeSet = new Set(nodeIdsToDelete);
      setNodes((prev) => prev.filter((n) => !nodeSet.has(n.id)));
      setConnections((prev) => prev.filter((c) => !nodeSet.has(c.from) && !nodeSet.has(c.to)));
      setMeasuredSizes((prev) => {
        const next = { ...prev };
        for (const id of nodeIdsToDelete) delete next[id];
        return next;
      });
    }

    // Direct line deletion
    if (lineIdsToDelete.length > 0) {
      const lineSet = new Set(lineIdsToDelete);
      setConnections((prev) => prev.filter((c) => !lineSet.has(c.id)));
    }

    // Remove broken flows
    if (brokenFlowIds.size > 0) {
      setFlows((prev) => prev.filter((f) => !brokenFlowIds.has(f.id)));
    }

    setSelection(null);

    const parts: string[] = [];
    if (layerIdsToDelete.length > 0) parts.push(`${layerIdsToDelete.length} layer(s)`);
    if (nodeIdsToDelete.length > 0) parts.push(`${nodeIdsToDelete.length} element(s)`);
    if (lineIdsToDelete.length > 0) parts.push(`${lineIdsToDelete.length} connection(s)`);
    onActionComplete?.(`Delete ${parts.join(", ")}`);
  }, [nodesRef, setNodes, setConnections, setLayerDefs, setLayerManualSizes, setMeasuredSizes, setSelection, setFlows, onActionComplete]);

  /**
   * Attempt deletion. Returns a PendingDeletion if flows would break (caller
   * should show warning modal). Returns null if deletion was executed immediately.
   */
  const tryDeletion = useCallback((
    nodeIds: string[],
    layerIds: string[],
    lineIds: string[],
  ): PendingDeletion | null => {
    const removedConnIds = computeRemovedConnections(nodeIds, lineIds, layerIds);
    const broken = findBrokenFlows(flowsRef.current, removedConnIds, connectionsRef.current);

    if (broken.length > 0) {
      const parts: string[] = [];
      if (layerIds.length > 0) parts.push(`${layerIds.length} layer(s)`);
      if (nodeIds.length > 0) parts.push(`${nodeIds.length} element(s)`);
      if (lineIds.length > 0) parts.push(`${lineIds.length} connection(s)`);
      return {
        description: `Delete ${parts.join(", ")}`,
        nodeIds,
        layerIds,
        lineIds,
        brokenFlows: broken,
      };
    }

    // No broken flows — execute immediately
    executeDeletion(nodeIds, layerIds, lineIds, new Set());
    return null;
  }, [computeRemovedConnections, executeDeletion, flowsRef, connectionsRef]);

  /** Confirm a pending deletion (after user approved the warning modal). */
  const confirmDeletion = useCallback((pending: PendingDeletion) => {
    const brokenIds = new Set(pending.brokenFlows.map((f) => f.id));
    executeDeletion(pending.nodeIds, pending.layerIds, pending.lineIds, brokenIds);
  }, [executeDeletion]);

  const deleteSelection = useCallback((sel: Selection): PendingDeletion | null => {
    if (!sel) return null;
    let nodeIds: string[] = [];
    let layerIds: string[] = [];
    let lineIds: string[] = [];

    switch (sel.type) {
      case "node": nodeIds = [sel.id]; break;
      case "multi-node": nodeIds = sel.ids; break;
      case "layer": layerIds = [sel.id]; break;
      case "multi-layer": layerIds = sel.ids; break;
      case "line": lineIds = [sel.id]; break;
      case "multi-line": lineIds = sel.ids; break;
      case "flow":
        // Deleting a flow itself doesn't affect connections — just remove the flow
        setFlows((prev) => prev.filter((f) => f.id !== sel.id));
        setSelection(null);
        onActionComplete?.("Delete flow");
        return null;
    }

    return tryDeletion(nodeIds, layerIds, lineIds);
  }, [tryDeletion, setFlows, setSelection, onActionComplete]);

  return { deleteSelection, confirmDeletion, tryDeletion };
}
