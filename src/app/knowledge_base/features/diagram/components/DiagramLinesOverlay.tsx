"use client";

import React from "react";
import DataLine from "./DataLine";
import { isItemSelected } from "../utils/selectionUtils";
import type { Connection, LineCurveAlgorithm, Selection } from "../types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Line = any;
type DimSets = { nodeIds: Set<string>; connIds: Set<string>; layerIds: Set<string> } | null;

export interface DiagramLinesOverlayProps {
  // Data
  sortedLines: Line[];
  connections: Connection[];
  selection: Selection;

  // World + zoom
  world: { x: number; y: number; w: number; h: number };
  isZooming: boolean;

  // UI flags
  lineCurve: LineCurveAlgorithm;
  readOnly: boolean;
  isLive: boolean;
  showLabels: boolean;
  hoveredLine: { id: string; label: string; x: number; y: number } | null;

  // Drag + creation state
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  draggingEndpoint: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  creatingLine: any;
  draggingId: string | null;
  draggingLayerId: string | null;
  isMultiDrag: boolean;
  flowDimSets: DimSets;
  typeDimSets: DimSets;

  // Ghost-line preview (endpoint drag or line creation)
  ghostLine: {
    path: string;
    color: string;
    fromPos: { x: number; y: number };
    toPos: { x: number; y: number };
  } | null;

  // Refs
  pendingSelection: React.MutableRefObject<{ type: 'node' | 'layer' | 'line'; id: string; x: number; y: number } | null>;
  labelDragStartT: React.MutableRefObject<number | null>;
  editingLabelBeforeRef: React.MutableRefObject<string>;

  // Handlers
  setHoveredLine: React.Dispatch<React.SetStateAction<{ id: string; label: string; x: number; y: number } | null>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleSegmentDragStart: (...args: any[]) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleLineClick: (...args: any[]) => void;
  setConnections: React.Dispatch<React.SetStateAction<Connection[]>>;
  scheduleRecord: (description: string) => void;
  setEditingLabel: React.Dispatch<React.SetStateAction<{ type: "node" | "layer" | "line"; id: string } | null>>;
  setEditingLabelValue: React.Dispatch<React.SetStateAction<string>>;

  // Utility accessors
  hasDocuments: (entityType: string, entityId: string) => boolean;
  getDocumentsForEntity: (entityType: string, entityId: string) => { filename: string }[];
  onOpenDocument: (path: string) => void;
}

/**
 * Renders the main connection-line SVG: a scrolling SVG positioned at the
 * world bounds, containing every DataLine (path + arrow + label) plus the
 * optional ghost-line shown while dragging an endpoint or creating a new
 * connection.
 */
export default function DiagramLinesOverlay(props: DiagramLinesOverlayProps) {
  const {
    sortedLines,
    connections,
    selection,
    world,
    isZooming,
    lineCurve,
    readOnly,
    isLive,
    showLabels,
    hoveredLine,
    draggingEndpoint,
    creatingLine,
    draggingId,
    draggingLayerId,
    isMultiDrag,
    flowDimSets,
    typeDimSets,
    ghostLine,
    pendingSelection,
    labelDragStartT,
    editingLabelBeforeRef,
    setHoveredLine,
    handleSegmentDragStart,
    handleLineClick,
    setConnections,
    scheduleRecord,
    setEditingLabel,
    setEditingLabelValue,
    hasDocuments,
    getDocumentsForEntity,
    onOpenDocument,
  } = props;

  return (
    <svg
      className={`absolute pointer-events-none ${isZooming ? "paused-animations" : ""}`}
      style={{ zIndex: 5, left: world.x, top: world.y, width: world.w, height: world.h }}
      viewBox={`${world.x} ${world.y} ${world.w} ${world.h}`}
    >
      {sortedLines.map((line) => {
        const isBeingDragged = draggingEndpoint?.connectionId === line.id;
        const dimmed = (!!draggingEndpoint && !isBeingDragged) || !!creatingLine || !!draggingId || !!draggingLayerId || isMultiDrag || (flowDimSets != null && !flowDimSets.connIds.has(line.id)) || (typeDimSets != null && !typeDimSets.connIds.has(line.id));
        return (
          <DataLine
            key={line.id}
            {...line}
            isOrthogonal={lineCurve === "orthogonal" || !lineCurve}
            onSegmentDragStart={readOnly ? undefined : handleSegmentDragStart}
            isLive={isLive}
            isHovered={hoveredLine?.id === line.id}
            showLabels={showLabels}
            isDraggingEndpoint={isBeingDragged}
            isSelected={isItemSelected(selection, 'line', line.id)}
            dimmed={dimmed}
            suppressLabel={showLabels}
            onHoverStart={(id: string, label: string, x: number, y: number) => { setHoveredLine({ id, label, x, y }); }}
            onHoverMove={(id: string, x: number, y: number) => { setHoveredLine((prev) => (prev?.id === id ? { ...prev, x, y } : prev)); }}
            onHoverEnd={() => { setHoveredLine((prev) => prev?.id === line.id ? null : prev); }}
            onLineClick={(id: string, e: React.MouseEvent) => { pendingSelection.current = { type: 'line', id, x: e.clientX, y: e.clientY }; if (readOnly) return; handleLineClick(id, e); }}
            onLabelPositionChange={(connId: string, t: number) => {
              if (readOnly) return;
              if (labelDragStartT.current === null) {
                const conn = connections.find((c) => c.id === connId);
                labelDragStartT.current = conn?.labelPosition ?? 0.5;
              }
              setConnections((prev) => prev.map((c) => c.id === connId ? { ...c, labelPosition: t } : c));
            }}
            onLabelDragEnd={(connId: string) => {
              if (readOnly) return;
              const conn = connections.find((c) => c.id === connId);
              const endT = conn?.labelPosition ?? 0.5;
              if (labelDragStartT.current !== null && endT !== labelDragStartT.current) {
                scheduleRecord("Move label");
              }
              labelDragStartT.current = null;
            }}
            onDoubleClick={(connId: string) => {
              if (readOnly) return;
              const conn = connections.find((c) => c.id === connId);
              if (conn) {
                setEditingLabel({ type: "line", id: connId });
                setEditingLabelValue(conn.label);
                editingLabelBeforeRef.current = conn.label;
              }
            }}
            hasDocuments={hasDocuments("connection", line.id)}
            documentPaths={getDocumentsForEntity("connection", line.id).map((d) => d.filename)}
            onDocNavigate={onOpenDocument}
          />
        );
      })}
      {ghostLine && (() => {
        const hasSnap = !!(draggingEndpoint?.snappedAnchor || creatingLine?.snappedAnchor);
        return (
          <g>
            <line x1={ghostLine.fromPos.x} y1={ghostLine.fromPos.y} x2={ghostLine.toPos.x} y2={ghostLine.toPos.y} stroke={ghostLine.color} strokeWidth="2" strokeDasharray="6 4" opacity="0.7" />
            <circle cx={ghostLine.toPos.x} cy={ghostLine.toPos.y} r={hasSnap ? 6 : 5} fill={hasSnap ? ghostLine.color : "white"} stroke={ghostLine.color} strokeWidth={2} />
            <circle cx={ghostLine.fromPos.x} cy={ghostLine.fromPos.y} r={hasSnap ? 6 : 5} fill={hasSnap ? ghostLine.color : "white"} stroke={ghostLine.color} strokeWidth={2} />
          </g>
        );
      })()}
    </svg>
  );
}
