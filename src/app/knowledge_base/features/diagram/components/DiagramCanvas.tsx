"use client";

import React from "react";
import { Map as MapIcon } from "lucide-react";
import Canvas, { type CanvasPatch } from "./Canvas";
import Layer, { type ResizeEdge } from "./Layer";
import FlowDots from "./FlowDots";
import DiagramLinesOverlay from "./DiagramLinesOverlay";
import DiagramNodeLayer from "./DiagramNodeLayer";
import DiagramLabelEditor from "./DiagramLabelEditor";
import DiagramLabelOverlay from "./DiagramLabelOverlay";
import CanvasLiveRegion from "./CanvasLiveRegion";
import { VIEWPORT_PADDING } from "../hooks/useCanvasCoords";
import { isItemSelected } from "../utils/selectionUtils";
import { detectContextMenuTarget } from "../utils/geometry";
import type {
  Connection,
  FlowDef,
  LayerDef,
  LineCurveAlgorithm,
  NodeData,
  RegionBounds,
  Selection,
} from "../types";
import type { DocumentMeta } from "../../document/types";
import type { ContextMenuTarget } from "./ContextMenu";
import type { AnchorId } from "../utils/anchors";

interface SortedLine {
  id: string;
  path: string;
  points: { x: number; y: number }[];
  color: string;
  label?: string;
  biDirectional?: boolean;
  flowDuration?: number;
  labelPosition: number;
  connectionType?: string;
  fromPos: { x: number; y: number };
  toPos: { x: number; y: number };
}

interface DimSets {
  connIds: Set<string>;
  nodeIds: Set<string>;
  layerIds: Set<string>;
}

interface GhostLine {
  path: string;
  color: string;
  fromPos: { x: number; y: number };
  toPos: { x: number; y: number };
}

interface DraggingEndpoint {
  connectionId: string;
  end: "from" | "to";
  currentPos: { x: number; y: number };
  snappedAnchor: { x: number; y: number; nodeId: string; anchorId: AnchorId } | null;
}

interface CreatingLine {
  fromPos: { x: number; y: number };
  currentPos: { x: number; y: number };
  snappedAnchor: { x: number; y: number; nodeId: string; anchorId: AnchorId } | null;
}

export interface DiagramCanvasProps {
  // Refs / containers
  canvasRef: React.RefObject<HTMLDivElement | null>;
  activeFile: string | null;
  // World / patches / zoom
  patches: CanvasPatch[];
  world: { x: number; y: number; w: number; h: number };
  zoom: number;
  isZooming: boolean;
  // Document slices
  layerDefs: LayerDef[];
  regions: RegionBounds[];
  displayNodes: NodeData[];
  connections: Connection[];
  flows: FlowDef[];
  lineCurve: LineCurveAlgorithm;
  // Lines
  lines: SortedLine[];
  sortedLines: SortedLine[];
  ghostLine: GhostLine | null;
  // Drag state
  draggingId: string | null;
  draggingLayerId: string | null;
  draggingLayerIds: string[];
  layerDragDelta: { dx: number; dy: number } | null;
  layerDragRawDelta: { dx: number; dy: number } | null;
  resizingLayer: { layerId: string } | null;
  isMultiDrag: boolean;
  multiDragIds: string[];
  multiDragDelta: { dx: number; dy: number } | null;
  multiDragRawDelta: { dx: number; dy: number } | null;
  elementDragPos: { x: number; y: number } | null;
  elementDragRawPos: { x: number; y: number } | null;
  draggingEndpoint: DraggingEndpoint | null;
  creatingLine: CreatingLine | null;
  // Selection / interaction state
  selection: Selection;
  selectionRect: { x: number; y: number; w: number; h: number } | null;
  hoveredNodeId: string | null;
  hoveredLine: { id: string; label: string; x: number; y: number } | null;
  setHoveredLine: React.Dispatch<React.SetStateAction<{ id: string; label: string; x: number; y: number } | null>>;
  setSelection: React.Dispatch<React.SetStateAction<Selection>>;
  setContextMenu: React.Dispatch<React.SetStateAction<
    | { clientX: number; clientY: number; canvasX: number; canvasY: number; target: ContextMenuTarget }
    | null
  >>;
  setEditingLabel: React.Dispatch<React.SetStateAction<{ type: "node" | "layer" | "line"; id: string } | null>>;
  setEditingLabelValue: React.Dispatch<React.SetStateAction<string>>;
  editingLabelBeforeRef: React.MutableRefObject<string>;
  editingLabel: { type: "node" | "layer" | "line"; id: string } | null;
  editingLabelValue: string;
  // Mode
  readOnly: boolean;
  isLive: boolean;
  showLabels: boolean;
  // Dimming
  flowDimSets: DimSets | null;
  typeDimSets: DimSets | null;
  flowOrderData: ReturnType<typeof import("../utils/flowUtils").computeFlowRoles> | null;
  // Canvas / coord helpers
  toCanvasCoords: (clientX: number, clientY: number) => { x: number; y: number };
  // Mutations / events plumbed through to children
  setNodes: React.Dispatch<React.SetStateAction<NodeData[]>>;
  setConnections: React.Dispatch<React.SetStateAction<Connection[]>>;
  setLayerDefs: React.Dispatch<React.SetStateAction<LayerDef[]>>;
  scheduleRecord: (description: string) => void;
  pendingSelection: React.MutableRefObject<{ type: "node" | "layer" | "line"; id: string; x: number; y: number } | null>;
  layerShiftsRef: React.MutableRefObject<Record<string, number>>;
  labelDragStartT: React.MutableRefObject<number | null>;
  // Layer drag / resize / selection-rect handlers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleSelectionRectStart: (...args: any[]) => void;
  handleLayerDragStart: (id: string, e: React.MouseEvent) => void;
  handleLayerResizeStart: (id: string, edge: ResizeEdge, e: React.MouseEvent) => void;
  handleCanvasMouseDown: (e: React.MouseEvent) => void;
  // Endpoint / segment / connect handlers (relaxed types match upstream
  // DiagramLinesOverlay / DiagramNodeLayer; see those components for the
  // actual call shapes used at the leaves).
  /* eslint-disable @typescript-eslint/no-explicit-any */
  handleSegmentDragStart: (...args: any[]) => void;
  handleLineClick: (...args: any[]) => void;
  startEdgeHandleDrag: (...args: any[]) => void;
  handleAnchorDragStart: (...args: any[]) => void;
  handleAnchorHover: (...args: any[]) => void;
  handleAnchorHoverEnd: () => void;
  // Node interaction handlers
  handleElementResize: (id: string, width: number, height: number) => void;
  handleNodeMouseEnter: (...args: any[]) => void;
  handleNodeMouseLeave: (...args: any[]) => void;
  handleNodeDoubleClick: (...args: any[]) => void;
  handleNodeDragStart: (...args: any[]) => void;
  handleRotationDragStart: (...args: any[]) => void;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  // Label commit
  commitLabel: (label: { type: "node" | "layer" | "line"; id: string }, value: string) => void;
  // Document attachments
  hasDocuments: (entityType: string, entityId: string) => boolean;
  getDocumentsForEntity: (entityType: string, entityId: string) => DocumentMeta[];
  onOpenDocument: (path: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getNodeDimensions: (n: any) => { w: number; h: number };
  // Geometry inputs needed for context-menu computation
  nodes: NodeData[];
  // CSS state hints
  previewDocPath: string | null;
}

/**
 * The kb-diagram-viewport — the actual scrollable canvas area, including
 * Layers, Lines, FlowDots, Nodes, the data-line label SVG overlay, the
 * selection rectangle, and the inline label editor.
 *
 * Extracted from DiagramView for KB-020. This component is purely
 * presentational: it owns no state itself and does not register any
 * effects. All controllers, drag hooks, and document state live in the
 * parent. Extraction is therefore behavior-preserving by construction.
 */
export default function DiagramCanvas(props: DiagramCanvasProps) {
  const {
    canvasRef,
    activeFile,
    patches,
    world,
    zoom,
    isZooming,
    layerDefs,
    regions,
    displayNodes,
    connections,
    flows,
    lineCurve,
    lines,
    sortedLines,
    ghostLine,
    draggingId,
    draggingLayerId,
    draggingLayerIds,
    layerDragDelta,
    layerDragRawDelta,
    resizingLayer,
    isMultiDrag,
    multiDragIds,
    multiDragDelta,
    multiDragRawDelta,
    elementDragPos,
    elementDragRawPos,
    draggingEndpoint,
    creatingLine,
    selection,
    selectionRect,
    hoveredNodeId,
    hoveredLine,
    setHoveredLine,
    setSelection,
    setContextMenu,
    setEditingLabel,
    setEditingLabelValue,
    editingLabelBeforeRef,
    editingLabel,
    editingLabelValue,
    readOnly,
    isLive,
    showLabels,
    flowDimSets,
    typeDimSets,
    flowOrderData,
    toCanvasCoords,
    setNodes,
    setConnections,
    setLayerDefs,
    scheduleRecord,
    pendingSelection,
    layerShiftsRef,
    labelDragStartT,
    handleSelectionRectStart,
    handleLayerDragStart,
    handleLayerResizeStart,
    handleCanvasMouseDown,
    handleSegmentDragStart,
    handleLineClick,
    startEdgeHandleDrag,
    handleAnchorDragStart,
    handleAnchorHover,
    handleAnchorHoverEnd,
    handleElementResize,
    handleNodeMouseEnter,
    handleNodeMouseLeave,
    handleNodeDoubleClick,
    handleNodeDragStart,
    handleRotationDragStart,
    commitLabel,
    hasDocuments,
    getDocumentsForEntity,
    onOpenDocument,
    getNodeDimensions,
    nodes,
    previewDocPath,
  } = props;

  return (
    <div
      ref={canvasRef}
      // KB-030: canvas root is a focus-visible WAI-ARIA "application"
      // region. tabindex=0 makes it reachable via Tab; role + aria-label
      // tell screen readers that this is an interactive canvas; the
      // *:focus-visible rule in globals.css gives the visible ring.
      tabIndex={0}
      role="application"
      aria-label="Diagram canvas. Tab to walk nodes, arrows to move."
      data-testid="diagram-canvas-root"
      className={`kb-diagram-viewport flex-1 min-w-0 overflow-auto bg-surface-2 relative ${draggingId || draggingLayerId || isMultiDrag ? "cursor-grabbing" : ""}${previewDocPath ? " blur-sm pointer-events-none select-none" : ""}`}
      style={{ scrollbarWidth: "none" }}
      onMouseDown={(e) => {
        if (e.button === 0 && selection?.type === "flow") setSelection(null);
        handleCanvasMouseDown(e);
      }}
      onPointerMove={hoveredLine ? () => setHoveredLine(null) : undefined}
      onScroll={() => setContextMenu(null)}
      onContextMenu={(e) => {
        e.preventDefault();
        if (readOnly) return;
        const coords = toCanvasCoords(e.clientX, e.clientY);
        const cx = coords.x;
        const cy = coords.y;
        const target = detectContextMenuTarget(cx, cy, nodes, getNodeDimensions, regions);
        setContextMenu({ clientX: e.clientX, clientY: e.clientY, canvasX: cx, canvasY: cy, target });
      }}
    >
      <CanvasLiveRegion selection={selection} nodes={nodes} layers={layerDefs} />
      {!activeFile ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface-2 z-50">
          <div className="flex flex-col items-center gap-3 text-mute">
            <MapIcon size={48} strokeWidth={1} className="text-mute" />
            <p className="text-sm font-medium">No file open</p>
            <p className="text-xs text-mute">Open a file from the explorer to start editing</p>
          </div>
        </div>
      ) : (
        <>
          <div
            style={{
              width: VIEWPORT_PADDING * 2 + world.w * zoom,
              height: VIEWPORT_PADDING * 2 + world.h * zoom,
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: VIEWPORT_PADDING,
                top: VIEWPORT_PADDING,
                transform: `scale(${zoom})`,
                transformOrigin: "0 0",
                willChange: isZooming ? "transform" : "auto",
              }}
            >
              <Canvas patches={patches}>
                {/* Layers */}
                {regions.map((r) => {
                  const isThisLayerDragged = draggingLayerIds.includes(r.id);
                  const dimmed =
                    (draggingLayerIds.length > 0 && !isThisLayerDragged) ||
                    !!draggingId ||
                    isMultiDrag ||
                    (flowDimSets != null && !flowDimSets.layerIds.has(r.id)) ||
                    (typeDimSets != null && !typeDimSets.layerIds.has(r.id));
                  return (
                    <React.Fragment key={r.id}>
                      {isThisLayerDragged && layerDragRawDelta && (
                        <Layer
                          id={`${r.id}-ghost`}
                          title={r.title}
                          left={r.left + layerDragRawDelta.dx}
                          width={r.width}
                          top={r.top + layerDragRawDelta.dy}
                          height={r.height}
                          bg={r.bg}
                          border={r.border}
                          textColor={r.textColor}
                          dimmed
                        />
                      )}
                      <Layer
                        {...r}
                        left={isThisLayerDragged && layerDragDelta ? r.left + layerDragDelta.dx : r.left}
                        top={isThisLayerDragged && layerDragDelta ? r.top + layerDragDelta.dy : r.top}
                        onDragStart={(id, e) => {
                          e.stopPropagation();
                          if (e.metaKey || e.ctrlKey) {
                            handleSelectionRectStart(e);
                            return;
                          }
                          pendingSelection.current = { type: "layer", id, x: e.clientX, y: e.clientY };
                          handleLayerDragStart(id, e);
                        }}
                        onResizeStart={
                          readOnly
                            ? undefined
                            : (id, edge, e) => {
                                e.stopPropagation();
                                pendingSelection.current = { type: "layer", id, x: e.clientX, y: e.clientY };
                                handleLayerResizeStart(id, edge, e);
                              }
                        }
                        isDragging={isThisLayerDragged}
                        isResizing={resizingLayer?.layerId === r.id}
                        isSelected={isItemSelected(selection, "layer", r.id)}
                        dimmed={dimmed}
                        onDoubleClick={(layerId) => {
                          if (readOnly) return;
                          const ld = layerDefs.find((l) => l.id === layerId);
                          if (ld) {
                            setEditingLabel({ type: "layer", id: layerId });
                            setEditingLabelValue(ld.title);
                            editingLabelBeforeRef.current = ld.title;
                          }
                        }}
                      />
                    </React.Fragment>
                  );
                })}

                {/* SVG Lines */}
                <DiagramLinesOverlay
                  sortedLines={sortedLines}
                  connections={connections}
                  selection={selection}
                  world={world}
                  isZooming={isZooming}
                  lineCurve={lineCurve}
                  readOnly={readOnly}
                  isLive={isLive}
                  showLabels={showLabels}
                  hoveredLine={hoveredLine}
                  draggingEndpoint={draggingEndpoint}
                  creatingLine={creatingLine}
                  draggingId={draggingId}
                  draggingLayerId={draggingLayerId}
                  isMultiDrag={isMultiDrag}
                  flowDimSets={flowDimSets}
                  typeDimSets={typeDimSets}
                  ghostLine={ghostLine}
                  pendingSelection={pendingSelection}
                  labelDragStartT={labelDragStartT}
                  editingLabelBeforeRef={editingLabelBeforeRef}
                  setHoveredLine={setHoveredLine}
                  handleSegmentDragStart={handleSegmentDragStart}
                  handleLineClick={handleLineClick}
                  setConnections={setConnections}
                  scheduleRecord={scheduleRecord}
                  setEditingLabel={setEditingLabel}
                  setEditingLabelValue={setEditingLabelValue}
                  hasDocuments={hasDocuments}
                  getDocumentsForEntity={getDocumentsForEntity}
                  onOpenDocument={onOpenDocument}
                />

                {/* Animated flow dots */}
                {(() => {
                  const selectedLineIds =
                    selection?.type === "line"
                      ? [selection.id]
                      : selection?.type === "multi-line"
                      ? selection.ids
                      : selection?.type === "flow"
                      ? flows.find((f) => f.id === selection.id)?.connectionIds ?? []
                      : [];
                  return (
                    (isLive || hoveredLine || selectedLineIds.length > 0) && (
                      <FlowDots
                        lines={lines}
                        world={world}
                        isZooming={isZooming}
                        draggingEndpointId={draggingEndpoint?.connectionId ?? null}
                        draggingId={draggingId}
                        draggingLayerId={draggingLayerId}
                        isLive={isLive}
                        hoveredLineId={hoveredLine?.id ?? null}
                        selectedLineIds={selectedLineIds}
                      />
                    )
                  );
                })()}

                {/* Nodes */}
                <DiagramNodeLayer
                  displayNodes={displayNodes}
                  connections={connections}
                  selection={selection}
                  draggingId={draggingId}
                  elementDragPos={elementDragPos}
                  elementDragRawPos={elementDragRawPos}
                  isMultiDrag={isMultiDrag}
                  multiDragIds={multiDragIds}
                  multiDragDelta={multiDragDelta}
                  multiDragRawDelta={multiDragRawDelta}
                  draggingLayerIds={draggingLayerIds}
                  layerDragDelta={layerDragDelta}
                  draggingEndpoint={draggingEndpoint}
                  creatingLine={creatingLine}
                  hoveredNodeId={hoveredNodeId}
                  readOnly={readOnly}
                  flowDimSets={flowDimSets}
                  typeDimSets={typeDimSets}
                  flowOrderData={flowOrderData}
                  handleAnchorDragStart={handleAnchorDragStart}
                  handleAnchorHover={handleAnchorHover}
                  handleAnchorHoverEnd={handleAnchorHoverEnd}
                  handleElementResize={handleElementResize}
                  handleNodeMouseEnter={handleNodeMouseEnter}
                  handleNodeMouseLeave={handleNodeMouseLeave}
                  handleNodeDoubleClick={handleNodeDoubleClick}
                  handleNodeDragStart={handleNodeDragStart}
                  handleRotationDragStart={handleRotationDragStart}
                  onEdgeHandleDrag={startEdgeHandleDrag}
                  setNodes={setNodes}
                  scheduleRecord={scheduleRecord}
                  getNodeDimensions={getNodeDimensions}
                  hasDocuments={hasDocuments}
                  getDocumentsForEntity={getDocumentsForEntity}
                  onOpenDocument={onOpenDocument}
                />

                {/* Data line label overlay */}
                <DiagramLabelOverlay
                  show={showLabels}
                  world={world}
                  sortedLines={sortedLines}
                  connections={connections}
                  selection={selection}
                  hoveredLine={hoveredLine}
                  readOnly={readOnly}
                  flowDimSets={flowDimSets}
                  nodes={nodes}
                  getNodeDimensions={getNodeDimensions}
                  layerShiftsRef={layerShiftsRef}
                  setConnections={setConnections}
                  scheduleRecord={scheduleRecord}
                />

                {/* Selection Rectangle */}
                {selectionRect && (
                  <div
                    className="absolute border-2 border-blue-400 bg-blue-400/10 pointer-events-none rounded-sm"
                    style={{
                      left: selectionRect.x,
                      top: selectionRect.y,
                      width: selectionRect.w,
                      height: selectionRect.h,
                      zIndex: 50,
                    }}
                  />
                )}

                {/* Inline label editor */}
                <DiagramLabelEditor
                  readOnly={readOnly}
                  editingLabel={editingLabel}
                  editingLabelValue={editingLabelValue}
                  setEditingLabelValue={setEditingLabelValue}
                  editingLabelBeforeRef={editingLabelBeforeRef}
                  commitLabel={commitLabel}
                  nodes={nodes}
                  regions={regions}
                  lines={lines}
                  connections={connections}
                />
              </Canvas>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
