"use client";

import { useCallback } from "react";
import { createElementId } from "../utils/idFactory";
import type { NodeData, Selection } from "../types";
import type { PendingDeletion } from "./useDeletion";
import type { EditingLabelTarget } from "../state/DiagramInteractionContext";

interface UseDiagramQuickInspectorInput {
  nodesRef: React.MutableRefObject<NodeData[]>;
  setNodes: (updater: (prev: NodeData[]) => NodeData[]) => void;
  setSelection: (s: Selection) => void;
  setEditingLabel: (v: EditingLabelTarget | null) => void;
  setEditingLabelValue: (v: string) => void;
  editingLabelBeforeRef: React.MutableRefObject<string>;
  scheduleRecord: (description: string) => void;
  deleteSelection: (target: { type: "node"; id: string }) => PendingDeletion | null;
  setPendingDeletion: (p: PendingDeletion | null) => void;
}

/**
 * The four callbacks the canvas QuickInspector wires up. Pre-KB-020
 * these were defined inline; extracted as one hook so the inspector's
 * action surface stays cohesive.
 */
export function useDiagramQuickInspectorActions({
  nodesRef,
  setNodes,
  setSelection,
  setEditingLabel,
  setEditingLabelValue,
  editingLabelBeforeRef,
  scheduleRecord,
  deleteSelection,
  setPendingDeletion,
}: UseDiagramQuickInspectorInput) {
  const handleDuplicateNode = useCallback(
    (nodeId: string) => {
      const node = nodesRef.current.find((n) => n.id === nodeId);
      if (!node) return;
      const newId = createElementId();
      setNodes((prev) => [...prev, { ...node, id: newId, x: node.x + 30, y: node.y + 30 }]);
      setSelection({ type: "node", id: newId });
      scheduleRecord("Duplicate node");
    },
    [nodesRef, setNodes, setSelection, scheduleRecord],
  );

  const handleQuickInspectorColorChange = useCallback(
    (nodeId: string, fill: string, border: string, text: string) => {
      setNodes((prev) =>
        prev.map((n) =>
          n.id === nodeId ? { ...n, bgColor: fill, borderColor: border, textColor: text } : n,
        ),
      );
      scheduleRecord("Change node colour");
    },
    [setNodes, scheduleRecord],
  );

  const handleQuickInspectorLabelEdit = useCallback(
    (nodeId: string) => {
      const node = nodesRef.current.find((n) => n.id === nodeId);
      if (!node) return;
      setEditingLabel({ type: "node", id: nodeId });
      setEditingLabelValue(node.label);
      editingLabelBeforeRef.current = node.label;
    },
    [nodesRef, setEditingLabel, setEditingLabelValue, editingLabelBeforeRef],
  );

  const handleQuickInspectorDelete = useCallback(
    (nodeId: string) => {
      const pending = deleteSelection({ type: "node", id: nodeId });
      if (pending) setPendingDeletion(pending);
    },
    [deleteSelection, setPendingDeletion],
  );

  return {
    handleDuplicateNode,
    handleQuickInspectorColorChange,
    handleQuickInspectorLabelEdit,
    handleQuickInspectorDelete,
  };
}
