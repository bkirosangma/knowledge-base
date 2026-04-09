import { useCallback } from "react";
import type { NodeData, LayerDef, Connection, Selection } from "../utils/types";

interface DeletionSetters {
  setNodes: React.Dispatch<React.SetStateAction<NodeData[]>>;
  setConnections: React.Dispatch<React.SetStateAction<Connection[]>>;
  setLayerDefs: React.Dispatch<React.SetStateAction<LayerDef[]>>;
  setLayerManualSizes: React.Dispatch<React.SetStateAction<Record<string, { left?: number; width?: number; top?: number; height?: number }>>>;
  setMeasuredSizes: React.Dispatch<React.SetStateAction<Record<string, { w: number; h: number }>>>;
  setSelection: React.Dispatch<React.SetStateAction<Selection>>;
}

/**
 * Shared deletion logic used by keyboard handler and context menu.
 * Handles cascading: layers → nodes → connections, plus cleanup of
 * measured sizes, manual layer sizes, and selection.
 */
export function useDeletion(
  nodesRef: React.RefObject<NodeData[]>,
  {
    setNodes, setConnections, setLayerDefs, setLayerManualSizes,
    setMeasuredSizes, setSelection,
  }: DeletionSetters,
) {
  const performDeletion = useCallback((
    nodeIdsToDelete: string[],
    layerIdsToDelete: string[],
    lineIdsToDelete: string[],
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

    setSelection(null);
  }, [nodesRef, setNodes, setConnections, setLayerDefs, setLayerManualSizes, setMeasuredSizes, setSelection]);

  const deleteNodes = useCallback((nodeIds: string[]) => {
    performDeletion(nodeIds, [], []);
  }, [performDeletion]);

  const deleteLayer = useCallback((layerId: string) => {
    performDeletion([], [layerId], []);
  }, [performDeletion]);

  const deleteSelection = useCallback((sel: Selection) => {
    if (!sel) return;
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
    }

    performDeletion(nodeIds, layerIds, lineIds);
  }, [performDeletion]);

  return { deleteNodes, deleteLayer, deleteSelection };
}
