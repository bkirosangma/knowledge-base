"use client";

import React from "react";
import QuickInspector from "./QuickInspector";
import type { NodeData, Selection } from "../types";

interface DiagramQuickInspectorSlotProps {
  selection: Selection;
  readOnly: boolean;
  nodes: NodeData[];
  draggingId: string | null;
  draggingLayerId: string | null;
  isMultiDrag: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  draggingEndpoint: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  creatingLine: any;
  getNodeDimensions: (n: NodeData) => { w: number; h: number };
  canvasToViewport: (canvasX: number, canvasY: number) => { x: number; y: number };
  onColorChange: (nodeId: string, fill: string, border: string, text: string) => void;
  onDelete: (nodeId: string) => void;
  onDuplicate: (nodeId: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onStartConnect: (...args: any[]) => void;
  onLabelEdit: (nodeId: string) => void;
}

/**
 * Wraps the QuickInspector floating UI with the visibility rules from
 * pre-KB-020 DiagramView: hidden in read-only mode, hidden when any
 * drag is in progress, and only shown for node selections.
 */
export default function DiagramQuickInspectorSlot(props: DiagramQuickInspectorSlotProps) {
  const {
    selection,
    readOnly,
    nodes,
    draggingId,
    draggingLayerId,
    isMultiDrag,
    draggingEndpoint,
    creatingLine,
    getNodeDimensions,
    canvasToViewport,
    onColorChange,
    onDelete,
    onDuplicate,
    onStartConnect,
    onLabelEdit,
  } = props;

  if (readOnly) return null;
  if (selection?.type !== "node") return null;
  if (draggingId || isMultiDrag || draggingLayerId || draggingEndpoint || creatingLine) return null;

  const selectedNode = nodes.find((n) => n.id === selection.id);
  if (!selectedNode) return null;
  const dims = getNodeDimensions(selectedNode);
  const nodeBounds = {
    x: selectedNode.x - dims.w / 2,
    y: selectedNode.y - dims.h / 2,
    w: dims.w,
    h: dims.h,
  };
  return (
    <QuickInspector
      key={selectedNode.id}
      nodeId={selectedNode.id}
      nodeBounds={nodeBounds}
      canvasToViewport={canvasToViewport}
      readOnly={readOnly}
      currentColor={selectedNode.bgColor ?? "#ffffff"}
      onColorChange={onColorChange}
      onDelete={onDelete}
      onDuplicate={onDuplicate}
      onStartConnect={onStartConnect}
      onLabelEdit={onLabelEdit}
    />
  );
}
