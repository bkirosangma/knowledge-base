"use client";

import React from "react";
import Element from "./Element";
import ConditionElement from "./ConditionElement";
import { getAnchors, type AnchorId } from "../utils/anchors";
import { getConditionAnchors, getConditionDimensions } from "../utils/conditionGeometry";
import { isItemSelected } from "../utils/selectionUtils";
import type { NodeData, Connection, Selection } from "../types";
import type { EdgeHandleDirection } from "../hooks/useDragToConnect";

interface DragDelta { dx: number; dy: number }
interface DragPos { x: number; y: number }

type DimSets = { nodeIds: Set<string>; connIds: Set<string>; layerIds: Set<string> } | null;

export interface DiagramNodeLayerProps {
  // Data
  displayNodes: NodeData[];
  connections: Connection[];
  selection: Selection;

  // Drag state
  draggingId: string | null;
  elementDragPos: DragPos | null;
  elementDragRawPos: DragPos | null;
  isMultiDrag: boolean;
  multiDragIds: string[];
  multiDragDelta: DragDelta | null;
  multiDragRawDelta: DragDelta | null;
  draggingLayerIds: string[];
  layerDragDelta: DragDelta | null;

  // Connection drag state
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  draggingEndpoint: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  creatingLine: any;

  // Hover + read mode
  hoveredNodeId: string | null;
  readOnly: boolean;

  // Dim sets (selection-driven de-emphasis)
  flowDimSets: DimSets;
  typeDimSets: DimSets;

  // Flow order overlays
  flowOrderData?: Map<string, { role: 'start' | 'end' | 'middle' }> | null;

  // Handlers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleAnchorDragStart: (...args: any[]) => void;
  handleAnchorHover: (nodeId: string, anchorId: AnchorId, clientX: number, clientY: number) => void;
  handleAnchorHoverEnd: () => void;
  handleElementResize: (id: string, width: number, height: number) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleNodeMouseEnter: (...args: any[]) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleNodeMouseLeave: (...args: any[]) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleNodeDoubleClick: (...args: any[]) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleNodeDragStart: (...args: any[]) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleRotationDragStart: (...args: any[]) => void;
  onEdgeHandleDrag?: (nodeId: string, direction: EdgeHandleDirection, e: React.MouseEvent) => void;
  setNodes: React.Dispatch<React.SetStateAction<NodeData[]>>;
  scheduleRecord: (description: string) => void;

  // Utility accessors
  getNodeDimensions: (n: { id: string; w: number; shape?: string; conditionSize?: number; conditionOutCount?: number }) => { w: number; h: number };
  hasDocuments: (entityType: string, entityId: string) => boolean;
  getDocumentsForEntity: (entityType: string, entityId: string) => { filename: string }[];
  onOpenDocument: (path: string) => void;
}

/** The four persistent edge-handle dots shown on a selected, non-read-only node. */
function EdgeHandles({
  nodeId,
  x,
  y,
  w,
  h,
  onMouseDown,
}: {
  nodeId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  onMouseDown: (nodeId: string, dir: EdgeHandleDirection, e: React.MouseEvent) => void;
}) {
  const handles: { dir: EdgeHandleDirection; cx: number; cy: number }[] = [
    { dir: "n", cx: x,         cy: y - h / 2 },
    { dir: "e", cx: x + w / 2, cy: y         },
    { dir: "s", cx: x,         cy: y + h / 2 },
    { dir: "w", cx: x - w / 2, cy: y         },
  ];
  return (
    <>
      {handles.map(({ dir, cx, cy }) => (
        <div
          key={dir}
          data-testid={`edge-handle-${nodeId}-${dir}`}
          style={{
            position: "absolute",
            left: cx,
            top: cy,
            transform: "translate(-50%, -50%)",
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "#3b82f6",
            border: "2px solid white",
            cursor: "crosshair",
            zIndex: 20,
            pointerEvents: "auto",
          }}
          onMouseDown={(e) => onMouseDown(nodeId, dir, e)}
        />
      ))}
    </>
  );
}

/**
 * Renders every diagram node (rectangle or diamond-shaped condition) plus
 * drag-ghost previews. Extracted from DiagramView so the hundreds of lines
 * of per-node styling/drag/dim logic live in one focused file.
 */
export default function DiagramNodeLayer(props: DiagramNodeLayerProps) {
  const {
    displayNodes,
    connections,
    selection,
    draggingId,
    elementDragPos,
    elementDragRawPos,
    isMultiDrag,
    multiDragIds,
    multiDragDelta,
    multiDragRawDelta,
    draggingLayerIds,
    layerDragDelta,
    draggingEndpoint,
    creatingLine,
    hoveredNodeId,
    readOnly,
    flowDimSets,
    typeDimSets,
    flowOrderData,
    handleAnchorDragStart,
    handleAnchorHover,
    handleAnchorHoverEnd,
    handleElementResize,
    handleNodeMouseEnter,
    handleNodeMouseLeave,
    handleNodeDoubleClick,
    handleNodeDragStart,
    handleRotationDragStart,
    onEdgeHandleDrag,
    setNodes,
    scheduleRecord,
    getNodeDimensions,
    hasDocuments,
    getDocumentsForEntity,
    onOpenDocument,
  } = props;

  return (
    <>
      {displayNodes.map((node) => {
        const isThisSingleDragged = draggingId === node.id;
        const isThisMultiDragged = isMultiDrag && multiDragIds.includes(node.id);
        const isThisDragged = isThisSingleDragged || isThisMultiDragged;
        const dims = getNodeDimensions(node);
        const isCondition = node.shape === "condition";
        const anchors = isCondition
          ? getConditionAnchors(node.x, node.y, dims.w, dims.h, node.conditionOutCount ?? 2, node.rotation ?? 0).map((a) => ({ id: a.id as AnchorId, x: a.x, y: a.y }))
          : getAnchors(node.x, node.y, dims.w, dims.h);
        const isSnapTarget = draggingEndpoint?.snappedAnchor?.nodeId === node.id
          || creatingLine?.snappedAnchor?.nodeId === node.id;

        let dimmed = false;
        let showAnchors = hoveredNodeId === node.id;
        if (draggingEndpoint) {
          const dragConn = connections.find((c) => c.id === draggingEndpoint.connectionId);
          const fixedNodeId = dragConn ? (draggingEndpoint.end === "from" ? dragConn.to : dragConn.from) : null;
          dimmed = node.id !== fixedNodeId && hoveredNodeId !== node.id;
          showAnchors = hoveredNodeId === node.id;
        }
        if (creatingLine) {
          dimmed = node.id !== creatingLine.fromNodeId && hoveredNodeId !== node.id;
          showAnchors = hoveredNodeId === node.id || node.id === creatingLine.fromNodeId;
        }
        if (draggingId || isMultiDrag) { showAnchors = false; if (!isThisDragged) dimmed = true; }
        const isInDraggedLayer = draggingLayerIds.length > 0 && draggingLayerIds.includes(node.layer);
        if (draggingLayerIds.length > 0) { showAnchors = false; if (!isInDraggedLayer) dimmed = true; }
        if (flowDimSets != null && !flowDimSets.nodeIds.has(node.id)) { dimmed = true; showAnchors = false; }
        if (typeDimSets != null && !typeDimSets.nodeIds.has(node.id)) { dimmed = true; showAnchors = false; }
        if (readOnly) { showAnchors = false; }

        let visualX = node.x;
        let visualY = node.y;
        if (isThisSingleDragged && elementDragPos) {
          visualX = elementDragPos.x;
          visualY = elementDragPos.y;
        } else if (isThisMultiDragged && multiDragDelta) {
          visualX = node.x + multiDragDelta.dx;
          visualY = node.y + multiDragDelta.dy;
        } else if (isInDraggedLayer && layerDragDelta) {
          visualX = node.x + layerDragDelta.dx;
          visualY = node.y + layerDragDelta.dy;
        }

        const flowEntry = flowOrderData?.get(node.id);

        const commonProps = {
          isDragging: isThisDragged,
          isSelected: isItemSelected(selection, 'node', node.id),
          showAnchors,
          highlightedAnchor: isSnapTarget ? (draggingEndpoint?.snappedAnchor?.anchorId ?? creatingLine?.snappedAnchor?.anchorId ?? null) : null,
          onAnchorDragStart: handleAnchorDragStart,
          onAnchorHover: handleAnchorHover,
          onAnchorHoverEnd: handleAnchorHoverEnd,
          onResize: handleElementResize,
          onMouseEnter: handleNodeMouseEnter,
          onMouseLeave: handleNodeMouseLeave,
          dimmed,
          onDoubleClick: handleNodeDoubleClick,
          flowRole: flowEntry?.role,
        };

        const showEdgeHandles =
          !readOnly &&
          !isThisDragged &&
          onEdgeHandleDrag != null &&
          isItemSelected(selection, 'node', node.id);

        if (isCondition) {
          const condDims = getConditionDimensions(node.conditionSize, node.conditionOutCount);
          return (
            <React.Fragment key={node.id}>
              {isThisSingleDragged && elementDragRawPos && (
                <ConditionElement
                  id={`${node.id}-ghost`}
                  label={node.label}
                  icon={node.icon}
                  x={elementDragRawPos.x}
                  y={elementDragRawPos.y}
                  w={condDims.w}
                  h={condDims.h}
                  outCount={node.conditionOutCount ?? 2}
                  rotation={node.rotation ?? 0}
                  showLabels
                  dimmed
                />
              )}
              {isThisMultiDragged && multiDragRawDelta && (
                <ConditionElement
                  id={`${node.id}-ghost`}
                  label={node.label}
                  icon={node.icon}
                  x={node.x + multiDragRawDelta.dx}
                  y={node.y + multiDragRawDelta.dy}
                  w={condDims.w}
                  h={condDims.h}
                  outCount={node.conditionOutCount ?? 2}
                  rotation={node.rotation ?? 0}
                  showLabels
                  dimmed
                />
              )}
              <ConditionElement
                id={node.id}
                label={node.label}
                icon={node.icon}
                x={visualX}
                y={visualY}
                w={condDims.w}
                h={condDims.h}
                outCount={node.conditionOutCount ?? 2}
                rotation={node.rotation ?? 0}
                showLabels
                onDragStart={handleNodeDragStart}
                {...commonProps}
                onAddOutAnchor={readOnly ? undefined : () => {
                  setNodes((prev) => prev.map((n) => {
                    if (n.id !== node.id || n.shape !== "condition") return n;
                    return { ...n, conditionOutCount: n.conditionOutCount + 1 };
                  }));
                  scheduleRecord("Add out anchor");
                }}
                onRotationDragStart={readOnly ? undefined : handleRotationDragStart}
                borderColor={node.borderColor}
                bgColor={node.bgColor}
                textColor={node.textColor}
                hasDocuments={hasDocuments("node", node.id)}
                documentPaths={getDocumentsForEntity("node", node.id).map(d => d.filename)}
                onDocNavigate={onOpenDocument}
              />
              {showEdgeHandles && (
                <EdgeHandles
                  nodeId={node.id}
                  x={visualX}
                  y={visualY}
                  w={condDims.w}
                  h={condDims.h}
                  onMouseDown={onEdgeHandleDrag}
                />
              )}
            </React.Fragment>
          );
        }

        return (
          <React.Fragment key={node.id}>
            {isThisSingleDragged && elementDragRawPos && (
              <Element id={`${node.id}-ghost`} label={node.label} sub={node.sub} icon={node.icon} x={elementDragRawPos.x} y={elementDragRawPos.y} w={node.w} showLabels dimmed measuredHeight={dims.h} />
            )}
            {isThisMultiDragged && multiDragRawDelta && (
              <Element id={`${node.id}-ghost`} label={node.label} sub={node.sub} icon={node.icon} x={node.x + multiDragRawDelta.dx} y={node.y + multiDragRawDelta.dy} w={node.w} showLabels dimmed measuredHeight={dims.h} />
            )}
            <Element
              {...node}
              x={visualX}
              y={visualY}
              showLabels
              onDragStart={handleNodeDragStart}
              {...commonProps}
              anchors={anchors}
              measuredHeight={dims.h}
              hasDocuments={hasDocuments("node", node.id)}
              documentPaths={getDocumentsForEntity("node", node.id).map(d => d.filename)}
              onDocNavigate={onOpenDocument}
            />
            {showEdgeHandles && (
              <EdgeHandles
                nodeId={node.id}
                x={visualX}
                y={visualY}
                w={dims.w}
                h={dims.h}
                onMouseDown={onEdgeHandleDrag}
              />
            )}
          </React.Fragment>
        );
      })}
    </>
  );
}
