"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Connection, FlowDef, NodeData, Selection } from "../types";

interface DimSets {
  connIds: Set<string>;
  nodeIds: Set<string>;
  layerIds: Set<string>;
}

interface UseDiagramFlowFocusInput {
  nodes: NodeData[];
  connections: Connection[];
  flows: FlowDef[];
  selection: Selection;
  setSelection: (s: Selection) => void;
}

/**
 * Owns the "focus mode" state — when the user hovers a flow chip or a
 * node-type chip, every unrelated diagram element dims out. Pre-KB-020
 * this lived as 3 useStates + 3 useMemos + 1 useEffect inline in
 * DiagramView. Behaviour-preserving extract.
 */
export function useDiagramFlowFocus({ nodes, connections, flows, selection, setSelection }: UseDiagramFlowFocusInput) {
  const [hoveredFlowId, setHoveredFlowId] = useState<string | null>(null);
  const [hoveredType, setHoveredType] = useState<string | null>(null);
  const [expandedTypeInPanel, setExpandedTypeInPanel] = useState<string | null>(null);

  const flowDimSets = useMemo<DimSets | null>(() => {
    const activeFlowId = hoveredFlowId ?? (selection?.type === "flow" ? selection.id : null);
    if (!activeFlowId) return null;
    const flow = flows.find((f) => f.id === activeFlowId);
    if (!flow) return null;
    const connIds = new Set(flow.connectionIds);
    const nodeIds = new Set<string>();
    const layerIds = new Set<string>();
    for (const cid of flow.connectionIds) {
      const conn = connections.find((c) => c.id === cid);
      if (conn) {
        nodeIds.add(conn.from);
        nodeIds.add(conn.to);
      }
    }
    for (const nid of nodeIds) {
      const node = nodes.find((n) => n.id === nid);
      if (node?.layer) layerIds.add(node.layer);
    }
    return { connIds, nodeIds, layerIds };
  }, [selection, hoveredFlowId, flows, connections, nodes]);

  const flowOrderData = useMemo(() => {
    const activeFlowId = hoveredFlowId ?? (selection?.type === "flow" ? selection.id : null);
    if (!activeFlowId) return null;
    const flow = flows.find((f) => f.id === activeFlowId);
    if (!flow) return null;

    // Members are nodes that appear as either endpoint of any of the flow's connections.
    const memberIds = new Set<string>();
    for (const cid of flow.connectionIds) {
      const c = connections.find((x) => x.id === cid);
      if (c) {
        memberIds.add(c.from);
        memberIds.add(c.to);
      }
    }

    const starts = new Set(flow.startNodeIds ?? []);
    const ends = new Set(flow.endNodeIds ?? []);
    const orders = flow.nodeOrders ?? {};

    const map = new Map<string, { role: 'start' | 'end' | 'middle'; order: number | undefined }>();
    for (const nid of memberIds) {
      const role = starts.has(nid) ? 'start' : ends.has(nid) ? 'end' : 'middle';
      map.set(nid, { role, order: orders[nid] });
    }
    return map;
  }, [selection, hoveredFlowId, flows, connections]);

  const typeDimSets = useMemo<DimSets | null>(() => {
    if (!hoveredType) return null;
    const nodeIds = new Set(nodes.filter((n) => n.type === hoveredType).map((n) => n.id));
    if (nodeIds.size === 0) return null;
    const connIds = new Set(connections.filter((c) => nodeIds.has(c.from) || nodeIds.has(c.to)).map((c) => c.id));
    const layerIds = new Set<string>();
    for (const nid of nodeIds) {
      const node = nodes.find((n) => n.id === nid);
      if (node?.layer) layerIds.add(node.layer);
    }
    return { connIds, nodeIds, layerIds };
  }, [hoveredType, nodes, connections]);

  const handleSelectType = useCallback(
    (type: string) => {
      const typeNodes = nodes.filter((n) => n.type === type);
      if (typeNodes.length === 0) return;
      if (typeNodes.length === 1) {
        setSelection({ type: "node", id: typeNodes[0].id });
      } else {
        setSelection({ type: "multi-node", ids: typeNodes.map((n) => n.id), layer: typeNodes[0].layer });
      }
    },
    [nodes, setSelection],
  );

  // Clear focus states when selection clears
  useEffect(() => {
    if (selection === null) {
      setHoveredType(null);
      setExpandedTypeInPanel(null);
    }
  }, [selection]);

  return {
    hoveredFlowId,
    setHoveredFlowId,
    hoveredType,
    setHoveredType,
    expandedTypeInPanel,
    setExpandedTypeInPanel,
    flowDimSets,
    flowOrderData,
    typeDimSets,
    handleSelectType,
  };
}
