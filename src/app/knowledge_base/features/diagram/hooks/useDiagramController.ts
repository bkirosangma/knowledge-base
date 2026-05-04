"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createDiagramRepository } from "../../../infrastructure/diagramRepo";
import { fnv1a } from "../../../shared/utils/historyPersistence";
import { loadDiagramFromData } from "../../../shared/utils/persistence";
import { hasDocuments as hasDocsFor, getDocumentsForEntity as getDocsForEntity } from "../utils/documentAttachments";
import { createLayerId } from "../utils/idFactory";
import { computeLayout, type ArrangeAlgorithm } from "../utils/autoArrange";
import { getAnchorEdge, type AnchorId } from "../utils/anchors";
import { useAnchorPopup, useContextMenu, useEditingLabel, useHovered, useSelection } from "../state/DiagramInteractionContext";
import { useDiagramDocument } from "./useDiagramDocument";
import { useDiagramHistoryStore } from "./useDiagramHistoryStore";
import { useDiagramGeometry } from "./useDiagramGeometry";
import { useDiagramFlowFocus } from "./useDiagramFlowFocus";
import { useDiagramAnchorMenu } from "./useDiagramAnchorMenu";
import { useDiagramAttachments } from "./useDiagramAttachments";
import { useDiagramQuickInspectorActions } from "./useDiagramQuickInspectorActions";
import { useDiagramViewportSync } from "./useDiagramViewportSync";
import { useDiagramFileLoading } from "./useDiagramFileLoading";
import { useDiagramBridge } from "./useDiagramBridge";
import { useDiagramPersistence } from "./useDiagramPersistence";
import { useDiagramFileWatcher } from "./useDiagramFileWatcher";
import { useDiagramLayoutState } from "./useDiagramLayoutState";
import { useReadOnlyState } from "../../../shared/hooks/useReadOnlyState";
import { useToast } from "../../../shell/ToastContext";
import { useViewport } from "../../../shared/hooks/useViewport";
import { useFileActions } from "../../../shared/hooks/useFileActions";
import { useFileExplorer } from "../../../shared/hooks/useFileExplorer";
import { useSyncRef } from "../../../shared/hooks/useSyncRef";
import { useNodeDrag } from "./useNodeDrag";
import { useLayerDrag } from "./useLayerDrag";
import { useLayerResize } from "./useLayerResize";
import { useEndpointDrag } from "./useEndpointDrag";
import { useSegmentDrag } from "./useSegmentDrag";
import { useLineDrag } from "./useLineDrag";
import { useDragToConnect } from "./useDragToConnect";
import { useSelectionRect } from "./useSelectionRect";
import { useCanvasInteraction } from "./useCanvasInteraction";
import { useCanvasEffects } from "./useCanvasEffects";
import { useTouchCanvas } from "./useTouchCanvas";
import { useZoom } from "./useZoom";
import { useDeletion, type PendingDeletion } from "./useDeletion";
import { useFlowManagement } from "./useFlowManagement";
import { useLabelEditing } from "./useLabelEditing";
import { useAnchorConnections } from "./useAnchorConnections";
import { useContextMenuActions } from "./useContextMenuActions";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import { useCanvasKeyboardNav } from "./useCanvasKeyboardNav";
import { useDragEndRecorder } from "./useDragEndRecorder";
import type { DiagramSnapshot } from "../../../shared/hooks/useDiagramHistory";
import type { DocumentMeta } from "../../document/types";
import type { ConfirmAction, FlowDef, RegionBounds } from "../types";
import type { LevelMap } from "../utils/levelModel";
import type { AttachmentLink } from "../../../domain/attachmentLinks";
import type { DiagramCanvasProps } from "../components/DiagramCanvas";

interface DiagramControllerInputs {
  side: "left" | "right";
  activeFile: string | null;
  fileExplorer: ReturnType<typeof useFileExplorer>;
  onOpenDocument: (path: string) => void;
  documents: DocumentMeta[];
  onAttachDocument: (docPath: string, entityType: string, entityId: string) => void;
  onDetachDocument: (docPath: string, entityType: string, entityId: string) => void;
  onCreateDocument: (rootHandle: FileSystemDirectoryHandle, path: string) => Promise<void>;
  onMigrateLegacyDocuments?: (filePath: string, docs: DocumentMeta[]) => Promise<void>;
  backlinks?: { sourcePath: string; section?: string }[];
  onDiagramBridge: (bridge: import("../types").DiagramBridge) => void;
  readDocument: (path: string) => Promise<string | null>;
  getDocumentReferences: (
    docPath: string,
    exclude?: { entityType: string; entityId: string },
  ) => { attachments: Array<{ entityType: string; entityId: string }>; wikiBacklinks: string[] };
  deleteDocumentWithCleanup: (path: string) => Promise<void>;
  onCreateAndAttach: (flowId: string, filename: string, editNow: boolean) => Promise<void>;
  onAfterDiagramSaved?: (diagramPath: string, docs: DocumentMeta[]) => void;
  searchTarget?: { nodeId: string };
  rows: AttachmentLink[];
  setRows: (next: AttachmentLink[] | ((prev: AttachmentLink[]) => AttachmentLink[])) => void;
}

/**
 * KB-020 master orchestration hook. DiagramView calls this once and
 * receives prop bags ready to spread into the layout components
 * (`toolbar`, `canvas`, `quickInspector`, `overlays`) plus the conflict
 * banner state. All state, derived geometry, drag handlers, persistence,
 * history, attachments, and shell-bridge wiring live here.
 *
 * Internally this hook composes the focused sub-hooks under
 * `./useDiagram*` — the controller is a thin orchestrator over those,
 * not a god-hook with inline logic. Adding a new piece of interaction
 * state means touching `DiagramInteractionContext.tsx` (per the spec
 * acceptance criterion); adding a new derived geometry means touching
 * `useDiagramGeometry.ts`; etc.
 */
export function useDiagramController(input: DiagramControllerInputs) {
  const {
    side, activeFile, fileExplorer, onOpenDocument, documents,
    onAttachDocument, onDetachDocument, onCreateDocument, onMigrateLegacyDocuments,
    backlinks, onDiagramBridge, readDocument, getDocumentReferences,
    deleteDocumentWithCleanup, onCreateAndAttach, onAfterDiagramSaved, searchTarget,
    rows, setRows,
  } = input;

  // ─── Layout / mode ───────────────────────────────────────────────
  const {
    state: { isLive, showLabels, showMinimap, historyCollapsed, propertiesCollapsed },
    actions: { setIsLive, setShowLabels, setShowMinimap, setHistoryCollapsed, toggleProperties },
  } = useDiagramLayoutState();
  const { readOnly, toggleReadOnly } = useReadOnlyState(activeFile, "diagram-read-only");
  const { showToast } = useToast();
  const { isMobile, isCompact } = useViewport();

  const hasShownReadModeToast = useRef(false);
  const handleFirstKeystrokeInReadMode = useCallback(() => {
    if (hasShownReadModeToast.current) return;
    hasShownReadModeToast.current = true;
    showToast("Press E to edit");
  }, [showToast]);

  // ─── Document + interaction state ────────────────────────────────
  const { doc, dispatch, defaults, measuredSizes, setMeasuredSizes } = useDiagramDocument();
  const { title, layers, nodes, connections, lineCurve, flows } = doc;
  const { selection, setSelection } = useSelection();
  const { hoveredNodeId, setHoveredNodeId } = useHovered();
  const { contextMenu, setContextMenu } = useContextMenu();
  const { anchorPopup, setAnchorPopup } = useAnchorPopup();
  const { editingLabel, setEditingLabel, editingLabelValue, setEditingLabelValue, editingLabelBeforeRef } = useEditingLabel();

  // Clear stale overlays on entering Read Mode.
  useEffect(() => {
    if (readOnly) {
      setEditingLabel(null);
      setContextMenu(null);
      setAnchorPopup(null);
    }
  }, [readOnly, setEditingLabel, setContextMenu, setAnchorPopup]);

  const [hoveredLine, setHoveredLine] = useState<{ id: string; label: string; x: number; y: number } | null>(null);
  const [pendingDeletion, setPendingDeletion] = useState<PendingDeletion | null>(null);
  const [pendingReconnect, setPendingReconnect] = useState<{ oldId: string; updates: Record<string, unknown>; brokenFlows: FlowDef[] } | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [pickerTarget, setPickerTarget] = useState<{ type: string; id: string } | null>(null);
  const [previewDocPath, setPreviewDocPath] = useState<string | null>(null);
  const [previewEntityName, setPreviewEntityName] = useState<string | undefined>(undefined);
  const labelDragStartT = useRef<number | null>(null);

  // ─── Shared refs (read by drag hooks; written by geometry) ───────
  const canvasRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const layerShiftsRef = useRef<Record<string, number>>({});
  const regionsRef = useRef<RegionBounds[] | null>(null);
  const levelMapRef = useRef<LevelMap>(new Map());
  const nodesRef = useSyncRef(nodes);
  const connectionsRef = useSyncRef(connections);
  const flowsRef = useSyncRef(flows);
  const selectionRef = useSyncRef(selection);
  const pendingSelection = useRef<{ type: "node" | "layer" | "line"; id: string; x: number; y: number } | null>(null);

  // ─── Zoom ────────────────────────────────────────────────────────
  const [zoom, setZoom] = useState(1);
  const [isZooming, setIsZooming] = useState(false);
  const { zoomRef, registerSetZoom, registerSetIsZooming, setZoomTo } = useZoom(canvasRef, worldRef);
  useEffect(() => { registerSetZoom(setZoom); }, [registerSetZoom]);
  useEffect(() => { registerSetIsZooming(setIsZooming); }, [registerSetIsZooming]);

  // ─── Viewport sync ───────────────────────────────────────────────
  const { patches, setPatches, world, canvasToViewport, toCanvasCoords } = useDiagramViewportSync({
    canvasRef, worldRef, zoomRef, zoom, setZoom, side, activeFile,
  });
  const handleTouchLongPress = useCallback((nodeId: string) => setSelection({ type: "node", id: nodeId }), [setSelection]);
  useTouchCanvas({ canvasRef, zoomRef, setZoomTo, enabled: readOnly && isMobile, onLongPress: handleTouchLongPress });
  const { scrollToRect } = useCanvasEffects(canvasRef, worldRef, zoomRef);

  // ─── Drag hooks ──────────────────────────────────────────────────
  const { draggingEndpoint, handleLineClick, handleConnectedAnchorDrag, endpointDragDidMove } = useEndpointDrag({
    connections, nodes, measuredSizes, layerShiftsRef, toCanvasCoords, setConnections: dispatch.setConnections,
  });
  // scheduleRecord lives downstream; forward through a stable wrapper.
  const scheduleRecordRef = useRef<(d: string) => void>(() => {});
  const { handleSegmentDragStart } = useSegmentDrag({
    toCanvasCoords, setConnections: dispatch.setConnections,
    scheduleRecord: (d: string) => scheduleRecordRef.current(d),
  });

  const anchorMenu = useDiagramAnchorMenu({ nodes, readOnly, setAnchorPopup });

  const { creatingLine, handleAnchorDragStart } = useLineDrag({
    nodes, connections, measuredSizes, layerShiftsRef, toCanvasCoords, setConnections: dispatch.setConnections,
    isBlocked: readOnly || !!draggingEndpoint,
    onAnchorClick: anchorMenu.onAnchorClick,
    onConnectedAnchorDrag: handleConnectedAnchorDrag,
    onEmptyDrop: (fromNodeId: string, fromAnchorId: AnchorId, _cx: number, _cy: number, clientX: number, clientY: number) => {
      if (readOnly) return;
      setAnchorPopup({ clientX, clientY, nodeId: fromNodeId, anchorId: fromAnchorId, edge: getAnchorEdge(fromAnchorId) });
    },
  });
  const { startEdgeHandleDrag } = useDragToConnect({ readOnly, handleAnchorDragStart });

  // Forward-bind getNodeDimensions (geometry creates it; drag hooks need it).
  const getNodeDimensionsRef = useRef<(n: { id: string; w: number; shape?: string; conditionSize?: number; conditionOutCount?: number }) => { w: number; h: number }>(
    () => ({ w: 0, h: 0 }),
  );
  const getNodeDimensions = useCallback(
    (n: { id: string; w: number; shape?: string; conditionSize?: number; conditionOutCount?: number }) => getNodeDimensionsRef.current(n),
    [],
  );

  const { draggingId, elementDragPos, elementDragRawPos, handleDragStart, isMultiDrag, multiDragIds, multiDragDelta, multiDragRawDelta, nodeDragDidMove, multiDragDidMove } = useNodeDrag({
    nodes, layerShiftsRef, toCanvasCoords,
    isBlocked: readOnly || !!draggingEndpoint || !!creatingLine,
    setNodes: dispatch.setNodes, regionsRef, levelMapRef,
    getNodeDimensions, layerPadding: 0, layerTitleOffset: 0, selection,
  });

  const { layerManualSizes, setLayerManualSizes, resizingLayer, handleLayerResizeStart, resizeDidChange } = useLayerResize({
    regionsRef, toCanvasCoords,
    isBlocked: readOnly || !!draggingId || !!draggingEndpoint || !!creatingLine || isMultiDrag,
    initialManualSizes: defaults.layerManualSizes,
    nodes, levelMapRef, getNodeDimensions, layerShiftsRef,
  });

  const { draggingLayerId, draggingLayerIds, layerDragDelta, layerDragRawDelta, handleLayerDragStart, layerDragDidMove } = useLayerDrag({
    toCanvasCoords,
    isBlocked: readOnly || !!draggingEndpoint || !!creatingLine || !!draggingId || isMultiDrag,
    setNodes: dispatch.setNodes, regionsRef, setLayerManualSizes, selection,
    nodes, levelMapRef, getNodeDimensions, layerShiftsRef,
  });

  // ─── Geometry ────────────────────────────────────────────────────
  const geometry = useDiagramGeometry({
    doc, measuredSizes, layerManualSizes,
    draggingId, elementDragPos, multiDragIds, multiDragDelta,
    draggingEndpoint, creatingLine, hoveredLine, selection, setPatches,
    layerShiftsRef, regionsRef, levelMapRef,
  });
  getNodeDimensionsRef.current = geometry.getNodeDimensions;

  // ─── Persistence + history ───────────────────────────────────────
  const { isDirty, setLoadSnapshot } = useDiagramPersistence(
    dispatch.setTitle, dispatch.setLayers, dispatch.setNodes, dispatch.setConnections,
    setLayerManualSizes, dispatch.setLineCurve, dispatch.setFlows,
    title, layers, nodes, connections, layerManualSizes, lineCurve, flows,
    documents, activeFile, fileExplorer.markDirty,
  );
  const { history, scheduleRecord, isRestoringRef, applyDiagramToState, applySnapshotFromDisk, handleUndo, handleRedo, handleGoToEntry } = useDiagramHistoryStore({
    doc, dispatch, layerManualSizes, setLayerManualSizes, setMeasuredSizes,
    setPatches, setSelection, rows, setRows, setLoadSnapshot,
  });
  scheduleRecordRef.current = scheduleRecord;

  // ─── File watcher ────────────────────────────────────────────────
  const getJsonFromDisk = useCallback(async () => {
    const rootHandle = fileExplorer.dirHandleRef.current;
    if (!rootHandle || !activeFile) return null;
    try {
      const repo = createDiagramRepository(rootHandle);
      const raw = await repo.read(activeFile);
      const json = JSON.stringify(raw, null, 2);
      const data = loadDiagramFromData(raw);
      const snapshot: DiagramSnapshot = {
        title: data.title, layerDefs: data.layers, nodes: raw.nodes, connections: data.connections,
        layerManualSizes: data.layerManualSizes, lineCurve: data.lineCurve, flows: data.flows,
      };
      return { json, checksum: fnv1a(json), snapshot };
    } catch {
      return null;
    }
  }, [activeFile, fileExplorer.dirHandleRef]);
  const updateDiskChecksum = useCallback((c: string) => { history.diskChecksumRef.current = c; }, [history.diskChecksumRef]);
  const { conflictSnapshot, handleReloadFromDisk, handleKeepEdits } = useDiagramFileWatcher({
    activeFile, dirty: isDirty, diskChecksumRef: history.diskChecksumRef,
    getJsonFromDisk, applySnapshot: applySnapshotFromDisk, history, updateDiskChecksum,
  });

  // ─── Attachments ─────────────────────────────────────────────────
  const attachments = useDiagramAttachments({
    documents, onAttachDocument, onDetachDocument, onCreateAndAttach,
    deleteDocumentWithCleanup, scheduleRecord,
  });

  // ─── File actions ────────────────────────────────────────────────
  const fileActions = useFileActions(
    fileExplorer, history, applyDiagramToState, isRestoringRef, isDirty, setLoadSnapshot,
    confirmAction, setConfirmAction, canvasRef,
    title, layers, nodes, connections, layerManualSizes, lineCurve, flows,
    onMigrateLegacyDocuments,
    attachments.flushPendingDeletes, attachments.clearPendingDeletes, onAfterDiagramSaved,
  );

  // ─── File loading lifecycle (auto-load + searchTarget) ───────────
  useDiagramFileLoading({
    activeFile, nodes, searchTarget,
    handleLoadFile: fileActions.handleLoadFile,
    setSelection, scrollToRect, getNodeDimensions: geometry.getNodeDimensions,
  });

  // ─── Bridge to shell ─────────────────────────────────────────────
  useDiagramBridge({
    isDirty, title, setTitle: dispatch.setTitle, scheduleRecord,
    handleSave: fileActions.handleSave, handleDiscard: fileActions.handleDiscard,
    handleLoadFile: fileActions.handleLoadFile, handleCreateFile: fileActions.handleCreateFile,
    handleCreateFolder: fileActions.handleCreateFolder, handleDeleteFile: fileActions.handleDeleteFile,
    handleDeleteFolder: fileActions.handleDeleteFolder, handleRenameFile: fileActions.handleRenameFile,
    handleRenameFolder: fileActions.handleRenameFolder, handleDuplicateFile: fileActions.handleDuplicateFile,
    handleMoveItem: fileActions.handleMoveItem, handleConfirmAction: fileActions.handleConfirmAction,
    confirmAction, setConfirmAction, onDiagramBridge,
  });

  // ─── Deletion / flow / label / anchor ────────────────────────────
  const { deleteSelection, confirmDeletion } = useDeletion(
    nodesRef, connectionsRef, flowsRef,
    {
      setNodes: dispatch.setNodes, setConnections: dispatch.setConnections, setLayerDefs: dispatch.setLayers,
      setLayerManualSizes, setMeasuredSizes, setSelection, setFlows: dispatch.setFlows,
    },
    scheduleRecord,
  );

  const flowCounter = useRef(0);
  const { handleCreateFlow, handleSelectFlow, handleUpdateFlow, handleDeleteFlow: rawHandleDeleteFlow, handleSelectLine } = useFlowManagement(
    connectionsRef, flowsRef, flowCounter, dispatch.setFlows, setSelection, scheduleRecord,
  );
  const handleDeleteFlow = useCallback((flowId: string) => {
    for (const d of documents) {
      if (d.attachedTo?.some((a) => a.type === "flow" && a.id === flowId)) onDetachDocument(d.filename, "flow", flowId);
    }
    rawHandleDeleteFlow(flowId);
  }, [documents, onDetachDocument, rawHandleDeleteFlow]);

  const { commitLabel } = useLabelEditing(
    editingLabelBeforeRef, dispatch.setNodes, dispatch.setLayers, dispatch.setConnections, setEditingLabel, scheduleRecord,
  );
  const { handleAnchorConnectToElement, handleAnchorCreateCondition, handleAnchorConnectToType } = useAnchorConnections(
    anchorPopup, nodesRef, layerShiftsRef, geometry.getNodeDimensions,
    dispatch.setNodes, dispatch.setConnections, setSelection, scheduleRecord, regionsRef, levelMapRef,
  );

  const flowFocus = useDiagramFlowFocus({ nodes, connections, flows, selection, setSelection });

  // ─── Selection rect + canvas interaction + keyboard ──────────────
  const { selectionRect, handleCanvasMouseDown, handleSelectionRectStart, cancelSelectionRect } = useSelectionRect({
    toCanvasCoords,
    isBlocked: !!draggingId || !!draggingLayerId || !!draggingEndpoint || !!creatingLine || !!resizingLayer || isMultiDrag,
    nodes, regions: geometry.regions, lines: geometry.linesForSelection.current,
    getNodeDimensions: geometry.getNodeDimensions, setSelection, pendingSelectionRef: pendingSelection,
  });
  const { handleRotationDragStart, handleNodeDragStart, handleNodeDoubleClick, handleNodeMouseEnter, handleNodeMouseLeave } = useCanvasInteraction({
    nodesRef, editingLabelBeforeRef, setNodes: dispatch.setNodes,
    setHoveredNodeId, setEditingLabel, setEditingLabelValue,
    pendingSelection, handleSelectionRectStart, handleDragStart, scheduleRecord, readOnly,
  });
  useKeyboardShortcuts({
    cancelSelectionRect, setSelection, setContextMenu, deleteSelection, setPendingDeletion,
    handleCreateFlow, handleUndo, handleRedo,
    selectionRef, pendingSelectionRef: pendingSelection, nodesRef,
    readOnly, onToggleReadOnly: toggleReadOnly,
    onFirstKeystrokeInReadMode: handleFirstKeystrokeInReadMode,
  });

  // KB-030: Tab/Shift+Tab walks nodes; arrows nudge; Enter opens label
  // edit. Bound to the canvas root so document-level shortcuts above
  // (Escape / Delete / Cmd-Z / E / …) keep their global scope.
  useCanvasKeyboardNav({
    canvasRef, nodes, layers,
    selection, setSelection,
    setNodes: dispatch.setNodes, scheduleRecord,
    setEditingLabel, setEditingLabelValue, editingLabelBeforeRef,
    readOnly, editingLabel,
  });

  // ─── Drag-end recorders + connection-create record ───────────────
  const dragNodeLabelRef = useRef("Move element");
  if (draggingId) {
    dragNodeLabelRef.current = nodes.find((n) => n.id === draggingId)?.shape === "condition" ? "Move conditional" : "Move element";
  }
  useDragEndRecorder(draggingId, nodeDragDidMove, dragNodeLabelRef.current, scheduleRecord);
  useDragEndRecorder(isMultiDrag, multiDragDidMove, "Move elements", scheduleRecord);
  useDragEndRecorder(draggingLayerId, layerDragDidMove, "Move layer", scheduleRecord);
  useDragEndRecorder(resizingLayer, resizeDidChange, "Resize layer", scheduleRecord);
  useDragEndRecorder(draggingEndpoint, endpointDragDidMove, "Move connection endpoint", scheduleRecord);

  const prevCreatingLine = useRef<unknown>(null);
  const prevConnectionCount = useRef(connections.length);
  useEffect(() => {
    if (prevCreatingLine.current && !creatingLine && connections.length > prevConnectionCount.current) {
      scheduleRecord("Create connection");
    }
    prevCreatingLine.current = creatingLine;
    prevConnectionCount.current = connections.length;
  }, [creatingLine, connections.length, scheduleRecord]);

  // ─── Quick inspector + remaining handlers ────────────────────────
  const qi = useDiagramQuickInspectorActions({
    nodesRef, setNodes: dispatch.setNodes, setSelection, setEditingLabel, setEditingLabelValue,
    editingLabelBeforeRef, scheduleRecord, deleteSelection, setPendingDeletion,
  });

  const handleCreateLayer = useCallback((layerTitle: string): string => {
    const newId = createLayerId();
    dispatch.setLayers((prev) => [...prev, { id: newId, title: layerTitle.toUpperCase(), bg: "#eff3f9", border: "#cdd6e4", textColor: "#334155" }]);
    setLayerManualSizes((prev) => ({ ...prev, [newId]: { left: 0, width: 400, top: 0, height: 200 } }));
    scheduleRecord("Create layer from property");
    return newId;
  }, [dispatch, scheduleRecord, setLayerManualSizes]);

  const handleDeleteAnchor = useCallback((nodeId: string, anchorIndex: number) => {
    const anchorIdAt = `cond-out-${anchorIndex}`;
    dispatch.setConnections((prev) => prev
      .filter((c) => !(c.from === nodeId && c.fromAnchor === anchorIdAt))
      .map((c) => {
        if (c.from === nodeId && c.fromAnchor.startsWith("cond-out-")) {
          const idx = parseInt(c.fromAnchor.split("-")[2]);
          if (idx > anchorIndex) return { ...c, fromAnchor: `cond-out-${idx - 1}` as AnchorId };
        }
        return c;
      }));
    dispatch.setNodes((prev) => prev.map((n) => {
      if (n.id !== nodeId || n.shape !== "condition") return n;
      return { ...n, conditionOutCount: Math.max(2, n.conditionOutCount - 1) };
    }));
    scheduleRecord("Delete condition anchor");
  }, [dispatch, scheduleRecord]);

  const handleAutoArrange = useCallback((algorithm: ArrangeAlgorithm) => {
    const newPositions = computeLayout(algorithm, nodes, connections);
    dispatch.setNodes((prev) => prev.map((n) => {
      const pos = newPositions.get(n.id);
      return pos ? { ...n, x: pos.x, y: pos.y } : n;
    }));
    dispatch.setConnections((prev) => prev.map((c) => ({ ...c, waypoints: undefined })));
    scheduleRecord(`Auto-arrange: ${algorithm}`);
  }, [nodes, connections, dispatch, scheduleRecord]);

  const handleElementResize = useCallback((id: string, width: number, height: number) => {
    setMeasuredSizes((prev) => {
      const e = prev[id];
      if (e && e.w === width && e.h === height) return prev;
      return { ...prev, [id]: { w: width, h: height } };
    });
  }, [setMeasuredSizes]);

  const { handleAddElement, handleAddLayer } = useContextMenuActions(
    contextMenu, geometry.regions, nodes, geometry.getNodeDimensions, layerManualSizes,
    dispatch.setNodes, dispatch.setLayers, setLayerManualSizes, setSelection, setContextMenu,
    scheduleRecord, levelMapRef,
  );

  const hasDocuments = useCallback((entityType: string, entityId: string) => hasDocsFor(documents, entityType, entityId), [documents]);
  const getDocumentsForEntity = useCallback((entityType: string, entityId: string) => getDocsForEntity(documents, entityType, entityId), [documents]);

  // ─── Build prop bags ─────────────────────────────────────────────
  const toolbar = {
    activeFile, readOnly, onToggleReadOnly: toggleReadOnly,
    title,
    onTitleChange: (v: string) => { dispatch.setTitle(v); scheduleRecord("Edit title"); },
    isDirty, onSave: fileActions.handleSave, onDiscard: fileActions.handleDiscard,
    layers, nodes, connections, flows, layerManualSizes, lineCurve,
    isCompact, isLive, setIsLive, showLabels, setShowLabels, showMinimap, setShowMinimap,
    zoom, setZoomTo, onAutoArrange: handleAutoArrange,
  };

  const canvas: DiagramCanvasProps = {
    canvasRef, activeFile, patches, world, zoom, isZooming,
    layerDefs: layers, regions: geometry.regions, displayNodes: geometry.displayNodes,
    connections, flows, lineCurve,
    lines: geometry.lines, sortedLines: geometry.sortedLines, ghostLine: geometry.ghostLine,
    draggingId, draggingLayerId, draggingLayerIds,
    layerDragDelta, layerDragRawDelta, resizingLayer,
    isMultiDrag, multiDragIds, multiDragDelta, multiDragRawDelta,
    elementDragPos, elementDragRawPos,
    draggingEndpoint, creatingLine,
    selection, selectionRect, hoveredNodeId,
    hoveredLine, setHoveredLine,
    setSelection, setContextMenu,
    setEditingLabel, setEditingLabelValue,
    editingLabelBeforeRef, editingLabel, editingLabelValue,
    readOnly, isLive, showLabels,
    flowDimSets: flowFocus.flowDimSets, typeDimSets: flowFocus.typeDimSets, flowOrderData: flowFocus.flowOrderData,
    toCanvasCoords,
    setNodes: dispatch.setNodes, setConnections: dispatch.setConnections, setLayerDefs: dispatch.setLayers,
    scheduleRecord,
    pendingSelection, layerShiftsRef, labelDragStartT,
    handleSelectionRectStart, handleLayerDragStart, handleLayerResizeStart, handleCanvasMouseDown,
    handleSegmentDragStart, handleLineClick, startEdgeHandleDrag, handleAnchorDragStart,
    handleAnchorHover: anchorMenu.handleAnchorHover, handleAnchorHoverEnd: anchorMenu.handleAnchorHoverEnd,
    handleElementResize,
    handleNodeMouseEnter, handleNodeMouseLeave, handleNodeDoubleClick, handleNodeDragStart, handleRotationDragStart,
    commitLabel,
    hasDocuments, getDocumentsForEntity, onOpenDocument,
    getNodeDimensions: geometry.getNodeDimensions, nodes, previewDocPath,
  };

  const quickInspector = {
    selection, readOnly, nodes,
    draggingId, draggingLayerId, isMultiDrag, draggingEndpoint, creatingLine,
    getNodeDimensions: geometry.getNodeDimensions, canvasToViewport,
    onColorChange: qi.handleQuickInspectorColorChange,
    onDelete: qi.handleQuickInspectorDelete,
    onDuplicate: qi.handleDuplicateNode,
    onStartConnect: startEdgeHandleDrag,
    onLabelEdit: qi.handleQuickInspectorLabelEdit,
  };

  const overlays = {
    activeFile, readOnly, selection, title,
    nodes, connections, flows, layerDefs: layers,
    displayNodes: geometry.displayNodes, regions: geometry.regions, levelMap: geometry.levelMap,
    lineCurve, measuredSizes,
    propertiesCollapsed, historyCollapsed, showMinimap, showLabels,
    expandedTypeInPanel: flowFocus.expandedTypeInPanel,
    contextMenu, anchorPopup, hoveredLine,
    pendingDeletion, pendingReconnect, pickerTarget,
    canvasRef, zoomRef, world, backlinks,
    documents, fileExplorer,
    onOpenDocument,
    onAttachDocument: attachments.handleAttachDocument,
    onDetachDocument: attachments.handleDetachDocument,
    onCreateDocument,
    onCreateAndAttach: attachments.handleCreateAndAttach,
    history, setSelection,
    setNodes: dispatch.setNodes, setLayerDefs: dispatch.setLayers,
    setLayerManualSizes, setConnections: dispatch.setConnections,
    setFlows: dispatch.setFlows, setMeasuredSizes, setTitle: dispatch.setTitle,
    setLineCurve: dispatch.setLineCurve,
    setPendingDeletion, setPendingReconnect, setPickerTarget, setContextMenu, setAnchorPopup,
    setHoveredFlowId: flowFocus.setHoveredFlowId, setHoveredType: flowFocus.setHoveredType,
    setExpandedTypeInPanel: flowFocus.setExpandedTypeInPanel, setHistoryCollapsed,
    toggleProperties,
    handleAddElement, handleAddLayer,
    deleteSelection, confirmDeletion,
    handleAnchorConnectToElement, handleAnchorCreateCondition, handleAnchorConnectToType,
    handleAnchorMenuEnter: anchorMenu.handleAnchorMenuEnter,
    handleAnchorMenuLeave: anchorMenu.handleAnchorMenuLeave,
    handleCreateLayer, handleDeleteAnchor, handleSelectType: flowFocus.handleSelectType,
    handleUndo, handleRedo, handleGoToEntry,
    handleSelectFlow, handleUpdateFlow, handleDeleteFlow, handleCreateFlow, handleSelectLine,
    scheduleRecord, scrollToRect,
    getNodeDimensions: geometry.getNodeDimensions, getDocumentsForEntity,
    previewDocPath, previewEntityName,
    setPreviewDocPath, setPreviewEntityName,
    readDocument, getDocumentReferences,
    deleteDocumentWithCleanup: attachments.handleDeleteDocumentWithCleanup,
  };

  return { toolbar, canvas, quickInspector, overlays, conflictSnapshot, handleReloadFromDisk, handleKeepEdits };
}
