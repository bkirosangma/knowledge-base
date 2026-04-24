"use client";

import React, { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo } from "react";
import Canvas, {
  type CanvasPatch,
  fitToContent,
  getWorldSize,
} from "./components/Canvas";
import Layer from "./components/Layer";
import { interpolatePoints, closestT } from "./components/DataLine";
import { rectsOverlap } from "./utils/collisionUtils";
import FlowDots from "./components/FlowDots";
import { getAnchorPosition, getNodeAnchorPosition, getNodeAnchorDirection, getAnchorEdge } from "./utils/anchors";
import { buildObstacles } from "./utils/orthogonalRouter";
import { computePath } from "./utils/pathRouter";
import { getNodeHeight } from "./utils/geometry";
import { hasDocuments as hasDocsFor, getDocumentsForEntity as getDocsForEntity } from "./utils/documentAttachments";
import type { LineCurveAlgorithm, Selection, FlowDef } from "./types";
import { isItemSelected } from "./utils/selectionUtils";
import { useSelectionRect } from "./hooks/useSelectionRect";
import { loadDefaults, serializeNodes } from "../../shared/utils/persistence";
import { computeLevelMap } from "./utils/levelModel";
import { computeRegions } from "./utils/layerBounds";
import { LAYER_PADDING, LAYER_TITLE_OFFSET } from "./utils/constants";
import { useCanvasCoords, VIEWPORT_PADDING } from "./hooks/useCanvasCoords";
import { useDiagramPersistence } from "./hooks/useDiagramPersistence";
import { useViewportPersistence } from "./hooks/useViewportPersistence";
import { useNodeDrag } from "./hooks/useNodeDrag";
import { useLayerDrag } from "./hooks/useLayerDrag";
import { useLayerResize } from "./hooks/useLayerResize";
import { useEndpointDrag } from "./hooks/useEndpointDrag";
import { useSegmentDrag } from "./hooks/useSegmentDrag";
import { computeLayout, type ArrangeAlgorithm } from "./utils/autoArrange";
import { createLayerId } from "./utils/idFactory";
import { useLineDrag } from "./hooks/useLineDrag";
import { type ContextMenuTarget } from "./components/ContextMenu";
import { useContextMenuActions } from "./hooks/useContextMenuActions";
import { useZoom } from "./hooks/useZoom";
import { useDeletion, type PendingDeletion } from "./hooks/useDeletion";
import { useFlowManagement } from "./hooks/useFlowManagement";
import { useLabelEditing } from "./hooks/useLabelEditing";
import { useAnchorConnections } from "./hooks/useAnchorConnections";
import { useCanvasInteraction } from "./hooks/useCanvasInteraction";
import { useCanvasEffects } from "./hooks/useCanvasEffects";
import { detectContextMenuTarget } from "./utils/geometry";
import { useFooterContext } from "../../shell/FooterContext";
import { getConditionDimensions } from "./utils/conditionGeometry";
import { loadDiagramFromData } from "../../shared/utils/persistence";
import { useDiagramHistory } from "../../shared/hooks/useDiagramHistory";
import type { DiagramSnapshot } from "../../shared/hooks/useDiagramHistory";
import { useSyncRef } from "../../shared/hooks/useSyncRef";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useDragEndRecorder } from "./hooks/useDragEndRecorder";
import PaneHeader from "../../shared/components/PaneHeader";
import PaneTitle from "../../shared/components/PaneTitle";
import type { DocumentMeta } from "../document/types";
import { useFileActions } from "../../shared/hooks/useFileActions";
import { useFileExplorer } from "../../shared/hooks/useFileExplorer";
import { Activity, Tag, Map as MapIcon } from "lucide-react";
import AutoArrangeDropdown from "./components/AutoArrangeDropdown";
import { toggleClass } from "./utils/toolbarClass";
import { useDiagramLayoutState } from "./hooks/useDiagramLayoutState";
import { useReadOnlyState } from "./hooks/useReadOnlyState";
import DiagramOverlays from "./components/DiagramOverlays";
import DiagramLabelEditor from "./components/DiagramLabelEditor";
import DiagramNodeLayer from "./components/DiagramNodeLayer";
import DiagramLinesOverlay from "./components/DiagramLinesOverlay";
import { computeFlowRoles } from "./utils/flowUtils";

const DEFAULT_PATCHES: CanvasPatch[] = [{ id: "main", col: 0, row: 0, widthUnits: 1, heightUnits: 1 }];

/** Title + save/discard surface consumed by the Header. */
export interface HeaderBridge {
  isDirty: boolean;
  title: string;
  titleInputValue: string;
  setTitleInputValue: (v: string) => void;
  titleWidth: number | string;
  setTitleWidth: (w: number | string) => void;
  onTitleCommit: (value: string) => void;
  onSave: () => void;
  onDiscard: (e: React.MouseEvent) => void;
}

/** File-ops + confirm-popover surface consumed by the explorer tree and rename/delete wrappers. */
export interface ExplorerBridge {
  handleLoadFile: (fileName: string) => Promise<void>;
  handleCreateFile: (parentPath?: string) => Promise<string | null>;
  handleCreateFolder: (parentPath?: string) => Promise<string | null>;
  handleDeleteFile: (path: string, event: React.MouseEvent) => void;
  handleDeleteFolder: (path: string, event: React.MouseEvent) => void;
  handleRenameFile: (oldPath: string, newName: string) => Promise<void>;
  handleRenameFolder: (oldPath: string, newName: string) => Promise<void>;
  handleDuplicateFile: (path: string) => Promise<void>;
  handleMoveItem: (sourcePath: string, targetFolderPath: string) => Promise<void>;
  handleConfirmAction: () => Promise<void>;
  confirmAction: { type: "delete-file" | "delete-folder" | "discard"; path?: string; x: number; y: number } | null;
  setConfirmAction: React.Dispatch<React.SetStateAction<{ type: "delete-file" | "delete-folder" | "discard"; path?: string; x: number; y: number } | null>>;
}

/**
 * Bridge object that DiagramView exposes to the shell.
 * Consumers that only need one slice should prefer `HeaderBridge` or
 * `ExplorerBridge` in their own parameter types.
 */
export type DiagramBridge = HeaderBridge & ExplorerBridge;

export interface DiagramViewProps {
  focused: boolean;
  /** Which pane this diagram is rendered in — used to push footer info to the right slot. */
  side: "left" | "right";
  activeFile: string | null;
  /** Full file explorer — DiagramView owns file operations for diagram files. */
  fileExplorer: ReturnType<typeof useFileExplorer>;
  /** Called when a document should be opened (the shell routes to DocumentView). */
  onOpenDocument: (path: string) => void;
  documents: DocumentMeta[];
  onAttachDocument: (docPath: string, entityType: string, entityId: string) => void;
  onDetachDocument: (docPath: string, entityType: string, entityId: string) => void;
  onCreateDocument: (rootHandle: FileSystemDirectoryHandle, path: string) => Promise<void>;
  /** Called when a loaded diagram contains document attachments. */
  onLoadDocuments: (docs: DocumentMeta[]) => void;
  /** Backlinks from the link index for the current diagram file */
  backlinks?: { sourcePath: string; section?: string }[];
  /** Bridge: notify the shell when isDirty or save/discard callbacks change */
  onDiagramBridge: (bridge: DiagramBridge) => void;
  readDocument: (path: string) => Promise<string | null>;
  getDocumentReferences: (docPath: string, exclude?: { entityType: string; entityId: string }) => {
    attachments: Array<{ entityType: string; entityId: string }>;
    wikiBacklinks: string[];
  };
  deleteDocumentWithCleanup: (path: string) => Promise<void>;
  onCreateAndAttach: (flowId: string, filename: string, editNow: boolean) => Promise<void>;
}

export default function DiagramView({
  side,
  activeFile,
  fileExplorer,
  onOpenDocument,
  documents,
  onAttachDocument,
  onDetachDocument,
  onCreateDocument,
  onLoadDocuments,
  backlinks,
  onDiagramBridge,
  readDocument,
  getDocumentReferences,
  deleteDocumentWithCleanup,
  onCreateAndAttach,
}: DiagramViewProps) {
  // ─── Diagram State ───
  const {
    state: { isLive, showLabels, showMinimap, historyCollapsed, propertiesCollapsed },
    actions: { setIsLive, setShowLabels, setShowMinimap, setHistoryCollapsed, toggleProperties },
  } = useDiagramLayoutState();

  // Per-file Read Mode state. Persisted to localStorage keyed by activeFile.
  const { readOnly, toggleReadOnly } = useReadOnlyState(activeFile);

  // Clear stale overlays when entering Read Mode so nothing lingers.
  useEffect(() => {
    if (readOnly) {
      setEditingLabel(null);
      setContextMenu(null);
      setAnchorPopup(null);
    }
  }, [readOnly]);

  const [hoveredLine, setHoveredLine] = useState<{
    id: string;
    label: string;
    x: number;
    y: number;
  } | null>(null);
  const defaults = useRef(loadDefaults());
  const [title, setTitle] = useState(defaults.current.title);
  const [layerDefs, setLayerDefs] = useState(defaults.current.layers);
  const [nodes, setNodes] = useState(defaults.current.nodes);
  const [connections, setConnections] = useState(defaults.current.connections);
  const [lineCurve, setLineCurve] = useState<LineCurveAlgorithm>(defaults.current.lineCurve);
  const [flows, setFlows] = useState<FlowDef[]>(defaults.current.flows);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const pendingSelection = useRef<{ type: 'node' | 'layer' | 'line'; id: string; x: number; y: number } | null>(null);
  const [measuredSizes, setMeasuredSizes] = useState<Record<string, { w: number; h: number }>>({});
  const [contextMenu, setContextMenu] = useState<{ clientX: number; clientY: number; canvasX: number; canvasY: number; target: ContextMenuTarget } | null>(null);
  const [anchorPopup, setAnchorPopup] = useState<{ clientX: number; clientY: number; nodeId: string; anchorId: import("./utils/anchors").AnchorId; edge: "top" | "right" | "bottom" | "left" } | null>(null);
  const anchorHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anchorDismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hoveredFlowId, setHoveredFlowId] = useState<string | null>(null);
  const [hoveredType, setHoveredType] = useState<string | null>(null);
  const [expandedTypeInPanel, setExpandedTypeInPanel] = useState<string | null>(null);
  const [patches, setPatches] = useState<CanvasPatch[]>(DEFAULT_PATCHES);

  const [editingLabel, setEditingLabel] = useState<{ type: "node" | "layer" | "line"; id: string } | null>(null);
  const [editingLabelValue, setEditingLabelValue] = useState("");
  const editingLabelBeforeRef = useRef("");
  const labelDragStartT = useRef<number | null>(null);
  const labelDragNodeRects = useRef<{ left: number; top: number; width: number; height: number }[]>([]);
  const labelLastValidT = useRef<number>(0.5);
  const [labelDragGhost, setLabelDragGhost] = useState<{ lineId: string; rawT: number } | null>(null);
  const [titleInputValue, setTitleInputValue] = useState(title);
  const [titleWidth, setTitleWidth] = useState<number | string>("auto");
  const [pickerTarget, setPickerTarget] = useState<{ type: string; id: string } | null>(null);
  const [previewDocPath, setPreviewDocPath] = useState<string | null>(null);
  const [previewEntityName, setPreviewEntityName] = useState<string | undefined>(undefined);

  // ─── Pending deletion / reconnect state ───
  const [pendingDeletion, setPendingDeletion] = useState<PendingDeletion | null>(null);
  const [pendingReconnect, setPendingReconnect] = useState<{
    oldId: string;
    updates: Record<string, unknown>;
    brokenFlows: FlowDef[];
  } | null>(null);

  // ─── Confirm action state (for delete/discard popovers) ───
  const [confirmAction, setConfirmAction] = useState<{
    type: "delete-file" | "delete-folder" | "discard";
    path?: string;
    x: number;
    y: number;
  } | null>(null);

  // ─── History ───
  const history = useDiagramHistory();
  const pendingRecord = useRef<string | null>(null);
  const isRestoringRef = useRef(false);

  const scheduleRecord = useCallback((description: string) => {
    if (isRestoringRef.current) return;
    pendingRecord.current = description;
  }, []);

  const handleAttachDocument = useCallback((docPath: string, entityType: string, entityId: string) => {
    onAttachDocument(docPath, entityType, entityId);
    scheduleRecord(`Attach document to ${entityType}`);
  }, [onAttachDocument, scheduleRecord]);

  const handleDetachDocument = useCallback((docPath: string, entityType: string, entityId: string) => {
    onDetachDocument(docPath, entityType, entityId);
    scheduleRecord(`Detach document from ${entityType}`);
  }, [onDetachDocument, scheduleRecord]);

  const handleCreateAndAttach = useCallback(async (flowId: string, filename: string, editNow: boolean) => {
    await onCreateAndAttach(flowId, filename, editNow);
    scheduleRecord("Create and attach document to flow");
  }, [onCreateAndAttach, scheduleRecord]);

  // ─── Refs ───
  const canvasRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const prevWorldOriginRef = useRef<{ x: number; y: number } | null>(null);
  const layerShiftsRef = useRef<Record<string, number>>({});
  const nodesRef = useSyncRef(nodes);
  const connectionsRef = useSyncRef(connections);
  const flowsRef = useSyncRef(flows);
  const selectionRef = useSyncRef(selection);
  const linesForSelection = useRef<{ id: string; points: { x: number; y: number }[] }[]>([]);
  const regionsRef = useRef<{ id: string; left: number; width: number; top: number; height: number; empty: boolean }[] | null>(null);

  const [zoom, setZoom] = useState(1);
  const [isZooming, setIsZooming] = useState(false);
  const { zoomRef, registerSetZoom, registerSetIsZooming, setZoomTo } = useZoom(canvasRef, worldRef);
  useEffect(() => { registerSetZoom(setZoom); }, [registerSetZoom]);

  // Sync title -> titleInputValue on external changes (file load, undo)
  useEffect(() => { setTitleInputValue(title); }, [title]);
  useEffect(() => { registerSetIsZooming(setIsZooming); }, [registerSetIsZooming]);

  // Fire pending record after render so all state is settled
  useEffect(() => {
    if (pendingRecord.current && !isRestoringRef.current) {
      const desc = pendingRecord.current;
      pendingRecord.current = null;
      history.recordAction(desc, {
        title,
        layerDefs,
        nodes: serializeNodes(nodes),
        connections,
        layerManualSizes,
        lineCurve,
        flows,
        documents,
      });
    }
  });

  const handleElementResize = useCallback((id: string, width: number, height: number) => {
    setMeasuredSizes((prev) => {
      const existing = prev[id];
      if (existing && existing.w === width && existing.h === height) return prev;
      return { ...prev, [id]: { w: width, h: height } };
    });
  }, []);

  const getNodeDimensions = useCallback((node: { id: string; w: number; shape?: string; conditionSize?: number; conditionOutCount?: number }) => {
    const measured = measuredSizes[node.id];
    if (node.shape === "condition") {
      const dims = getConditionDimensions(node.conditionSize, node.conditionOutCount);
      return dims;
    }
    return {
      w: measured?.w ?? node.w,
      h: measured?.h ?? getNodeHeight(node.w),
    };
  }, [measuredSizes]);

  // ─── Canvas hooks ───
  const { toCanvasCoords, setWorldOffset } = useCanvasCoords(canvasRef, zoomRef);
  const { scrollToRect } = useCanvasEffects(canvasRef, worldRef, zoomRef);

  const { draggingEndpoint, handleLineClick, handleConnectedAnchorDrag, endpointDragDidMove } = useEndpointDrag({
    connections, nodes, measuredSizes, layerShiftsRef, toCanvasCoords, setConnections,
  });

  const { handleSegmentDragStart } = useSegmentDrag({
    toCanvasCoords, setConnections, scheduleRecord,
  });

  const onAnchorClick = useCallback((nodeId: string, anchorId: import("./utils/anchors").AnchorId, clientX: number, clientY: number) => {
    if (readOnly) return;
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    if (node.shape === "condition" && anchorId === "cond-in") return;
    setAnchorPopup({ clientX, clientY, nodeId, anchorId, edge: getAnchorEdge(anchorId) });
  }, [nodes, readOnly]);

  const handleAnchorHover = useCallback((nodeId: string, anchorId: import("./utils/anchors").AnchorId, clientX: number, clientY: number) => {
    if (readOnly) return;
    if (anchorDismissTimer.current) { clearTimeout(anchorDismissTimer.current); anchorDismissTimer.current = null; }
    if (anchorHoverTimer.current) clearTimeout(anchorHoverTimer.current);
    anchorHoverTimer.current = setTimeout(() => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;
      if (node.shape === "condition" && anchorId === "cond-in") return;
      setAnchorPopup({ clientX, clientY, nodeId, anchorId, edge: getAnchorEdge(anchorId) });
    }, 100);
  }, [nodes, readOnly]);

  const handleAnchorHoverEnd = useCallback(() => {
    if (anchorHoverTimer.current) { clearTimeout(anchorHoverTimer.current); anchorHoverTimer.current = null; }
    anchorDismissTimer.current = setTimeout(() => setAnchorPopup(null), 200);
  }, []);

  const handleAnchorMenuEnter = useCallback(() => {
    if (anchorDismissTimer.current) { clearTimeout(anchorDismissTimer.current); anchorDismissTimer.current = null; }
  }, []);

  const handleAnchorMenuLeave = useCallback(() => {
    anchorDismissTimer.current = setTimeout(() => setAnchorPopup(null), 200);
  }, []);

  const levelMap = useMemo(() => computeLevelMap(nodes, connections), [nodes, connections]);
  const levelMapRef = useRef(levelMap);
  levelMapRef.current = levelMap;

  const { creatingLine, handleAnchorDragStart } = useLineDrag({
    nodes, connections, measuredSizes, layerShiftsRef, toCanvasCoords, setConnections,
    isBlocked: readOnly || !!draggingEndpoint,
    onAnchorClick,
    onConnectedAnchorDrag: handleConnectedAnchorDrag,
  });

  const { draggingId, elementDragPos, elementDragRawPos, handleDragStart,
    isMultiDrag, multiDragIds, multiDragDelta, multiDragRawDelta,
    nodeDragDidMove, multiDragDidMove } = useNodeDrag({
    nodes, layerShiftsRef, toCanvasCoords,
    isBlocked: readOnly || !!draggingEndpoint || !!creatingLine,
    setNodes,
    regionsRef,
    levelMapRef,
    getNodeDimensions,
    layerPadding: LAYER_PADDING,
    layerTitleOffset: LAYER_TITLE_OFFSET,
    selection,
  });

  const { layerManualSizes, setLayerManualSizes, resizingLayer, handleLayerResizeStart, resizeDidChange } = useLayerResize({
    regionsRef, toCanvasCoords,
    isBlocked: readOnly || !!draggingId || !!draggingEndpoint || !!creatingLine || isMultiDrag,
    initialManualSizes: defaults.current.layerManualSizes,
    nodes, levelMapRef, getNodeDimensions, layerShiftsRef,
  });

  const { draggingLayerId, draggingLayerIds, layerDragDelta, layerDragRawDelta, handleLayerDragStart, layerDragDidMove } = useLayerDrag({
    toCanvasCoords,
    isBlocked: readOnly || !!draggingEndpoint || !!creatingLine || !!draggingId || isMultiDrag,
    setNodes,
    regionsRef,
    setLayerManualSizes,
    selection,
    nodes, levelMapRef, getNodeDimensions, layerShiftsRef,
  });

  const { isDirty, setLoadSnapshot } = useDiagramPersistence(
    setTitle, setLayerDefs, setNodes, setConnections, setLayerManualSizes, setLineCurve, setFlows,
    title, layerDefs, nodes, connections, layerManualSizes, lineCurve, flows,
    documents,
    activeFile,
    fileExplorer.markDirty,
  );

  /** Apply a loaded/restored diagram to all state in one call. */
  const applyDiagramToState = useCallback((
    data: ReturnType<typeof loadDiagramFromData>,
    opts?: { setSnapshot?: boolean; snapshotSource?: ReturnType<typeof loadDiagramFromData>; documents?: DocumentMeta[] },
  ) => {
    setTitle(data.title);
    setLayerDefs(data.layers);
    setNodes(data.nodes);
    setConnections(data.connections);
    setLayerManualSizes(data.layerManualSizes);
    setLineCurve(data.lineCurve);
    setFlows(data.flows);
    setSelection(null);
    setMeasuredSizes({});
    setPatches(DEFAULT_PATCHES);
    if (opts?.setSnapshot) {
      const src = opts.snapshotSource ?? data;
      setLoadSnapshot(src.title, src.layers, src.nodes, src.connections, src.layerManualSizes, src.lineCurve, src.flows, opts.documents ?? []);
    }
  }, [setLayerManualSizes, setLoadSnapshot]);

  const applySnapshot = useCallback((snapshot: DiagramSnapshot | null) => {
    if (!snapshot) return;
    isRestoringRef.current = true;
    const diagram = loadDiagramFromData({
      title: snapshot.title,
      layers: snapshot.layerDefs,
      nodes: snapshot.nodes,
      connections: snapshot.connections,
      layerManualSizes: snapshot.layerManualSizes,
      lineCurve: snapshot.lineCurve,
      flows: snapshot.flows,
    });
    applyDiagramToState(diagram);
    if (snapshot.documents !== undefined) onLoadDocuments(snapshot.documents);
    requestAnimationFrame(() => { isRestoringRef.current = false; });
  }, [applyDiagramToState]);

  const handleUndo = useCallback(() => {
    applySnapshot(history.undo());
  }, [history.undo, applySnapshot]);

  const handleRedo = useCallback(() => {
    applySnapshot(history.redo());
  }, [history.redo, applySnapshot]);

  const handleGoToEntry = useCallback((index: number) => {
    applySnapshot(history.goToEntry(index));
  }, [history.goToEntry, applySnapshot]);

  // ─── Deferred document deletion (delete-on-detach queued until save) ───
  const pendingDeletesRef = useRef<string[]>([]);
  const documentsRef = useRef(documents);
  documentsRef.current = documents;

  const handleDeleteDocumentWithCleanup = useCallback(async (path: string) => {
    if (!pendingDeletesRef.current.includes(path)) {
      pendingDeletesRef.current = [...pendingDeletesRef.current, path];
    }
  }, []);

  const flushPendingDeletes = useCallback(async () => {
    const paths = pendingDeletesRef.current.slice();
    pendingDeletesRef.current = [];
    for (const path of paths) {
      // Skip if the document was re-attached (e.g. via undo) before save
      const doc = documentsRef.current.find(d => d.filename === path);
      if (doc && (doc.attachedTo?.length ?? 0) > 0) continue;
      await deleteDocumentWithCleanup(path);
    }
  }, [deleteDocumentWithCleanup]);

  const clearPendingDeletes = useCallback(() => {
    pendingDeletesRef.current = [];
  }, []);

  // ─── File Actions (save, load, create, delete, etc.) ───
  const {
    handleLoadFile, handleSave, handleCreateFile, handleCreateFolder,
    handleDeleteFile, handleDeleteFolder, handleRenameFile, handleRenameFolder,
    handleDuplicateFile, handleMoveItem, handleDiscard, handleConfirmAction,
  } = useFileActions(
    fileExplorer, history, applyDiagramToState, isRestoringRef, isDirty, setLoadSnapshot,
    confirmAction, setConfirmAction, canvasRef,
    title, layerDefs, nodes, connections, layerManualSizes, lineCurve, flows,
    documents,
    onLoadDocuments,
    flushPendingDeletes,
    clearPendingDeletes,
  );

  // ─── Auto-load diagram when activeFile changes (mount, restore-on-refresh, pane switch) ───
  const handleLoadFileRef = useRef(handleLoadFile);
  handleLoadFileRef.current = handleLoadFile;
  const prevActiveFileRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevActiveFileRef.current;
    prevActiveFileRef.current = activeFile;
    if (activeFile && activeFile !== prev) {
      handleLoadFileRef.current(activeFile);
    }
  }, [activeFile]);

  // ─── Bridge: expose state to shell ───
  const bridgeRef = useRef<DiagramBridge | null>(null);
  useEffect(() => {
    const bridge: DiagramBridge = {
      isDirty,
      title,
      titleInputValue,
      setTitleInputValue,
      titleWidth,
      setTitleWidth,
      onTitleCommit: (v: string) => { setTitle(v); scheduleRecord("Edit title"); },
      onSave: handleSave,
      onDiscard: handleDiscard,
      handleLoadFile,
      handleCreateFile,
      handleCreateFolder,
      handleDeleteFile,
      handleDeleteFolder,
      handleRenameFile,
      handleRenameFolder,
      handleDuplicateFile,
      handleMoveItem,
      handleConfirmAction,
      confirmAction,
      setConfirmAction,
    };
    bridgeRef.current = bridge;
    onDiagramBridge(bridge);
  }, [isDirty, title, titleInputValue, titleWidth, handleSave, handleDiscard,
      handleLoadFile, handleCreateFile, handleCreateFolder, handleDeleteFile,
      handleDeleteFolder, handleRenameFile, handleRenameFolder, handleDuplicateFile,
      handleMoveItem, handleConfirmAction, confirmAction, onDiagramBridge, scheduleRecord]);

  const { deleteSelection, confirmDeletion } = useDeletion(nodesRef, connectionsRef, flowsRef, {
    setNodes, setConnections, setLayerDefs, setLayerManualSizes, setMeasuredSizes, setSelection, setFlows,
  }, scheduleRecord);

  // Flow-related callbacks
  const flowCounter = useRef(0);
  const { handleCreateFlow, handleSelectFlow, handleUpdateFlow, handleDeleteFlow: rawHandleDeleteFlow, handleSelectLine } = useFlowManagement(
    connectionsRef, flowsRef, flowCounter, setFlows, setSelection, scheduleRecord,
  );

  // Detach all documents attached to the flow before deleting it so orphaned
  // attachedTo references don't get persisted. Both the flows update and the
  // documents update are in-memory — they're both finalised on the next save.
  const handleDeleteFlow = useCallback((flowId: string) => {
    for (const doc of documents) {
      if (doc.attachedTo?.some(a => a.type === 'flow' && a.id === flowId)) {
        onDetachDocument(doc.filename, 'flow', flowId);
      }
    }
    rawHandleDeleteFlow(flowId);
  }, [documents, onDetachDocument, rawHandleDeleteFlow]);

  const handleCreateLayer = useCallback((layerTitle: string): string => {
    const newId = createLayerId();
    setLayerDefs((prev) => [...prev, { id: newId, title: layerTitle.toUpperCase(), bg: "#eff3f9", border: "#cdd6e4", textColor: "#334155" }]);
    setLayerManualSizes((prev) => ({ ...prev, [newId]: { left: 0, width: 400, top: 0, height: 200 } }));
    scheduleRecord("Create layer from property");
    return newId;
  }, [scheduleRecord, setLayerManualSizes]);

  const handleDeleteAnchor = useCallback((nodeId: string, anchorIndex: number) => {
    const anchorId = `cond-out-${anchorIndex}`;
    setConnections((prev) => prev
      .filter((c) => !(c.from === nodeId && c.fromAnchor === anchorId))
      .map((c) => {
        if (c.from === nodeId && c.fromAnchor.startsWith("cond-out-")) {
          const idx = parseInt(c.fromAnchor.split("-")[2]);
          if (idx > anchorIndex) return { ...c, fromAnchor: `cond-out-${idx - 1}` as import("./utils/anchors").AnchorId };
        }
        return c;
      })
    );
    setNodes((prev) => prev.map((n) => {
      if (n.id !== nodeId || n.shape !== "condition") return n;
      return { ...n, conditionOutCount: Math.max(2, n.conditionOutCount - 1) };
    }));
    scheduleRecord("Delete condition anchor");
  }, [scheduleRecord]);

  const handleAutoArrange = useCallback((algorithm: ArrangeAlgorithm) => {
    const newPositions = computeLayout(algorithm, nodes, connections);
    setNodes((prev) =>
      prev.map((n) => {
        const pos = newPositions.get(n.id);
        return pos ? { ...n, x: pos.x, y: pos.y } : n;
      })
    );
    setConnections((prev) => prev.map((c) => ({ ...c, waypoints: undefined })));
    scheduleRecord(`Auto-arrange: ${algorithm}`);
  }, [nodes, connections, scheduleRecord]);

  const { commitLabel } = useLabelEditing(
    editingLabelBeforeRef, setNodes, setLayerDefs, setConnections, setEditingLabel, scheduleRecord,
  );

  // Anchor popup handlers
  const { handleAnchorConnectToElement, handleAnchorCreateCondition, handleAnchorConnectToType } = useAnchorConnections(
    anchorPopup, nodesRef, layerShiftsRef, getNodeDimensions,
    setNodes, setConnections, setSelection, scheduleRecord, regionsRef, levelMapRef,
  );

  // Flow dimming
  const flowDimSets = useMemo(() => {
    const activeFlowId = hoveredFlowId ?? (selection?.type === 'flow' ? selection.id : null);
    if (!activeFlowId) return null;
    const flow = flows.find((f) => f.id === activeFlowId);
    if (!flow) return null;
    const connIds = new Set(flow.connectionIds);
    const nodeIds = new Set<string>();
    const layerIds = new Set<string>();
    for (const cid of flow.connectionIds) {
      const conn = connections.find((c) => c.id === cid);
      if (conn) { nodeIds.add(conn.from); nodeIds.add(conn.to); }
    }
    for (const nid of nodeIds) {
      const node = nodes.find((n) => n.id === nid);
      if (node?.layer) layerIds.add(node.layer);
    }
    return { connIds, nodeIds, layerIds };
  }, [selection, hoveredFlowId, flows, connections, nodes]);

  const flowOrderData = useMemo(() => {
    const activeFlowId = hoveredFlowId ?? (selection?.type === 'flow' ? selection.id : null);
    if (!activeFlowId) return null;
    const flow = flows.find((f) => f.id === activeFlowId);
    if (!flow) return null;
    return computeFlowRoles(flow.connectionIds, connections);
  }, [selection, hoveredFlowId, flows, connections]);

  // Type focus
  const typeDimSets = useMemo(() => {
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

  const handleSelectType = useCallback((type: string) => {
    const typeNodes = nodes.filter((n) => n.type === type);
    if (typeNodes.length === 0) return;
    if (typeNodes.length === 1) {
      setSelection({ type: 'node', id: typeNodes[0].id });
    } else {
      setSelection({ type: 'multi-node', ids: typeNodes.map((n) => n.id), layer: typeNodes[0].layer });
    }
  }, [nodes]);

  // Clear focus states when selection changes
  useEffect(() => {
    if (selection === null) {
      setHoveredType(null);
      setExpandedTypeInPanel(null);
    }
  }, [selection]);

  // Compute layer bounds from contained nodes (memoized)
  const regions = useMemo(
    () => computeRegions(layerDefs, nodes, getNodeDimensions, layerManualSizes, draggingId, elementDragPos, multiDragIds, multiDragDelta),
    [layerDefs, nodes, getNodeDimensions, layerManualSizes, draggingId, elementDragPos, multiDragIds, multiDragDelta],
  );

  const layerShifts: Record<string, number> = useMemo(() => {
    const shifts: Record<string, number> = {};
    for (const r of regions) shifts[r.id] = 0;
    return shifts;
  }, [regions]);

  layerShiftsRef.current = layerShifts;
  regionsRef.current = regions;

  const { selectionRect, handleCanvasMouseDown, handleSelectionRectStart, cancelSelectionRect } = useSelectionRect({
    toCanvasCoords,
    isBlocked: !!draggingId || !!draggingLayerId || !!draggingEndpoint || !!creatingLine || !!resizingLayer || isMultiDrag,
    nodes, regions, lines: linesForSelection.current, getNodeDimensions, setSelection,
    pendingSelectionRef: pendingSelection,
  });

  // Canvas interaction handlers
  const { handleRotationDragStart, handleNodeDragStart, handleNodeDoubleClick, handleNodeMouseEnter, handleNodeMouseLeave } = useCanvasInteraction({
    nodesRef,
    editingLabelBeforeRef,
    setNodes,
    setHoveredNodeId,
    setEditingLabel,
    setEditingLabelValue,
    pendingSelection,
    handleSelectionRectStart,
    handleDragStart,
    scheduleRecord,
    readOnly,
  });

  useKeyboardShortcuts({
    cancelSelectionRect, setSelection, setContextMenu,
    deleteSelection, setPendingDeletion,
    handleCreateFlow, handleUndo, handleRedo,
    selectionRef, pendingSelectionRef: pendingSelection, nodesRef,
    readOnly, onToggleReadOnly: toggleReadOnly,
  });

  // Drag-end watchers for history recording
  const dragNodeLabelRef = useRef("Move element");
  if (draggingId) {
    dragNodeLabelRef.current = nodes.find(n => n.id === draggingId)?.shape === "condition"
      ? "Move conditional" : "Move element";
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

  // Auto-fit canvas patches
  const contentBounds = useMemo(() => {
    const MARGIN = 40;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      const dims = getNodeDimensions(n);
      const shift = layerShifts[n.layer] || 0;
      const ny = n.y + shift;
      const left = n.x - dims.w / 2;
      const top = ny - dims.h / 2;
      const right = n.x + dims.w / 2;
      const bottom = ny + dims.h / 2;
      if (left < minX) minX = left;
      if (top < minY) minY = top;
      if (right > maxX) maxX = right;
      if (bottom > maxY) maxY = bottom;
    }
    for (const r of regions) {
      if (r.empty && r.width === 0) continue;
      if (r.left < minX) minX = r.left;
      if (r.top < minY) minY = r.top;
      if (r.left + r.width > maxX) maxX = r.left + r.width;
      if (r.top + r.height > maxY) maxY = r.top + r.height;
    }
    if (minX === Infinity) return null;
    return { x: minX - MARGIN, y: minY - MARGIN, w: maxX - minX + MARGIN * 2, h: maxY - minY + MARGIN * 2 };
  }, [nodes, regions, layerShifts, getNodeDimensions]);

  useEffect(() => {
    if (!contentBounds) return;
    setPatches((prev) => {
      const next = fitToContent(prev, contentBounds);
      return next === prev ? prev : next;
    });
  }, [contentBounds]);

  const world = getWorldSize(patches);
  worldRef.current = world;
  setWorldOffset(world.x, world.y);

  // Push world/patches/zoom into the global footer context for this pane side.
  const { setLeftInfo, setRightInfo } = useFooterContext();
  const pushFooterInfo = side === "right" ? setRightInfo : setLeftInfo;
  useEffect(() => {
    pushFooterInfo({ kind: "diagram", world: { w: world.w, h: world.h }, patches: patches.length, zoom });
  }, [pushFooterInfo, world.w, world.h, patches.length, zoom]);
  useEffect(() => () => pushFooterInfo(null), [pushFooterInfo]);

  useViewportPersistence(canvasRef, worldRef, zoomRef, zoom, setZoom, activeFile);

  // Compensate scroll when world origin shifts
  useLayoutEffect(() => {
    const prev = prevWorldOriginRef.current;
    if (prev !== null) {
      const dx = prev.x - world.x;
      const dy = prev.y - world.y;
      if ((dx !== 0 || dy !== 0) && canvasRef.current) {
        canvasRef.current.scrollLeft += dx * zoomRef.current;
        canvasRef.current.scrollTop += dy * zoomRef.current;
      }
    }
    prevWorldOriginRef.current = { x: world.x, y: world.y };
  }, [world.x, world.y]);

  // Display nodes with layer shifts applied (memoized)
  const displayNodes = useMemo(() => nodes.map((n) => {
    const shift = layerShifts[n.layer] || 0;
    return shift !== 0 ? { ...n, y: n.y + shift } : n;
  }), [nodes, layerShifts]);

  // Shared node lookup map
  const nodeMap = useMemo(() => Object.fromEntries(displayNodes.map((n) => [n.id, n])), [displayNodes]);

  /** Resolve anchor position for a node, handling conditions. */
  const resolveAnchorPos = useCallback((anchorId: string, node: typeof displayNodes[0], dims: { w: number; h: number }) => {
    if (node.shape === "condition") {
      return getNodeAnchorPosition(anchorId, node.x, node.y, dims.w, dims.h, node.shape, node.conditionOutCount, node.rotation);
    }
    return getAnchorPosition(anchorId as import("./utils/anchors").AnchorId, node.x, node.y, dims.w, dims.h);
  }, []);

  // Compute lines
  const lines = useMemo(() => {
    const allNodeRects = displayNodes.map((n) => {
      const dims = getNodeDimensions(n);
      return { id: n.id, x: n.x, y: n.y, w: dims.w, h: dims.h };
    });
    return connections.map((conn) => {
      const fromNode = nodeMap[conn.from];
      const toNode = nodeMap[conn.to];
      const fromDims = getNodeDimensions(fromNode);
      const toDims = getNodeDimensions(toNode);
      const fromPos = resolveAnchorPos(conn.fromAnchor, fromNode, fromDims);
      const toPos = resolveAnchorPos(conn.toAnchor, toNode, toDims);
      const obstacles = buildObstacles(allNodeRects, [conn.from, conn.to]);
      const fromDir = getNodeAnchorDirection(conn.fromAnchor, fromNode.x, fromNode.y, fromDims.w, fromDims.h, fromNode.shape, fromNode.conditionOutCount, fromNode.rotation);
      const toDir = getNodeAnchorDirection(conn.toAnchor, toNode.x, toNode.y, toDims.w, toDims.h, toNode.shape, toNode.conditionOutCount, toNode.rotation);
      const { path, points } = computePath(lineCurve, fromPos, toPos, conn.fromAnchor, conn.toAnchor, obstacles, conn.waypoints, fromDir, toDir);
      return {
        id: conn.id, path, points, color: conn.color, label: conn.label,
        biDirectional: conn.biDirectional, flowDuration: conn.flowDuration,
        labelPosition: conn.labelPosition ?? 0.5, connectionType: conn.connectionType,
        fromPos, toPos,
      };
    });
  }, [connections, displayNodes, nodeMap, lineCurve, getNodeDimensions, resolveAnchorPos]);

  linesForSelection.current = lines;

  // Ghost line
  let ghostLine: { path: string; color: string; fromPos: { x: number; y: number }; toPos: { x: number; y: number } } | null = null;
  if (draggingEndpoint) {
    const conn = connections.find((c) => c.id === draggingEndpoint.connectionId);
    if (conn) {
      const fromNode = nodeMap[conn.from];
      const toNode = nodeMap[conn.to];
      const fromDims = getNodeDimensions(fromNode);
      const toDims = getNodeDimensions(toNode);
      const fixedPos = draggingEndpoint.end === "from"
        ? resolveAnchorPos(conn.toAnchor, toNode, toDims)
        : resolveAnchorPos(conn.fromAnchor, fromNode, fromDims);
      const dragPos = draggingEndpoint.snappedAnchor
        ? { x: draggingEndpoint.snappedAnchor.x, y: draggingEndpoint.snappedAnchor.y }
        : draggingEndpoint.currentPos;
      const gFrom = draggingEndpoint.end === "from" ? dragPos : fixedPos;
      const gTo = draggingEndpoint.end === "from" ? fixedPos : dragPos;
      ghostLine = { path: `M ${gFrom.x} ${gFrom.y} L ${gTo.x} ${gTo.y}`, color: conn.color, fromPos: gFrom, toPos: gTo };
    }
  }
  if (creatingLine) {
    const dragPos = creatingLine.snappedAnchor
      ? { x: creatingLine.snappedAnchor.x, y: creatingLine.snappedAnchor.y }
      : creatingLine.currentPos;
    ghostLine = {
      path: `M ${creatingLine.fromPos.x} ${creatingLine.fromPos.y} L ${dragPos.x} ${dragPos.y}`,
      color: "#3b82f6",
      fromPos: creatingLine.fromPos,
      toPos: dragPos,
    };
  }

  const { handleAddElement, handleAddLayer } = useContextMenuActions(
    contextMenu, regions, nodes, getNodeDimensions, layerManualSizes,
    setNodes, setLayerDefs, setLayerManualSizes, setSelection, setContextMenu,
    scheduleRecord, levelMapRef,
  );

  // Sorted lines
  const sortedLines = useMemo(() => [...lines].sort((a, b) => {
    const aFront = (a.id === hoveredLine?.id || isItemSelected(selection, 'line', a.id)) ? 1 : 0;
    const bFront = (b.id === hoveredLine?.id || isItemSelected(selection, 'line', b.id)) ? 1 : 0;
    return aFront - bFront;
  }), [lines, hoveredLine?.id, selection]);

  // ─── Expose diagram state for the shell's header ───
  // The shell reads these via a ref-based bridge or callback in a future task.
  // For now, the diagram view renders its own canvas and properties panel.

  const hasDocuments = useCallback(
    (entityType: string, entityId: string) => hasDocsFor(documents, entityType, entityId),
    [documents],
  );

  const getDocumentsForEntity = useCallback(
    (entityType: string, entityId: string) => getDocsForEntity(documents, entityType, entityId),
    [documents],
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 h-full">
      {activeFile && (
        <>
          {/* Breadcrumb row */}
          <PaneHeader
            filePath={activeFile}
            readOnly={readOnly}
            onToggleReadOnly={toggleReadOnly}
          />

          {/* Title row — editable diagram title + save / discard */}
          <PaneTitle
            title={title}
            onTitleChange={(v) => { setTitle(v); scheduleRecord("Edit title"); }}
            isDirty={isDirty}
            hasActiveFile={!!activeFile}
            onSave={handleSave}
            onDiscard={handleDiscard}
          />

          {/* Diagram toolbar */}
          <div className="flex-shrink-0 flex items-center gap-3 px-3 py-1 bg-slate-50 border-b border-slate-200 z-10">
            <div className="flex items-center gap-0.5 bg-white rounded-lg p-0.5 border border-slate-100">
              <button onClick={() => setIsLive(l => !l)} className={toggleClass(isLive)} title="Toggle live data flow animation">
                <Activity size={13} />
                <span className="hidden xl:inline">Live</span>
              </button>
              <button onClick={() => setShowLabels(l => !l)} className={toggleClass(showLabels)} title="Toggle data line labels">
                <Tag size={13} />
                <span className="hidden xl:inline">Labels</span>
              </button>
            </div>
            <button
              onClick={() => setShowMinimap(m => !m)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all border ${
                showMinimap ? "bg-white shadow-sm text-blue-600 border-slate-200" : "bg-white text-slate-500 hover:text-slate-700 border-slate-100"
              }`}
              title="Toggle minimap"
            >
              <MapIcon size={13} />
              <span className="hidden xl:inline">Minimap</span>
            </button>

            <div className="flex items-center gap-1 bg-white rounded-lg p-0.5 border border-slate-100">
              <button onClick={() => setZoomTo(Math.max(0.1, zoom - 0.25))} className="px-1.5 py-1 rounded-md text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-all" title="Zoom out">&minus;</button>
              <button
                onClick={() => setZoomTo(1)}
                className={`px-2 py-1 rounded-md text-xs font-semibold transition-all ${
                  Math.abs(zoom - 1) < 0.01 ? "text-blue-600 bg-white shadow-sm border border-slate-200" : "text-slate-600 hover:text-blue-600 hover:bg-white border border-transparent"
                }`}
                title="Reset zoom to 100%"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button onClick={() => setZoomTo(Math.min(3, zoom + 0.25))} className="px-1.5 py-1 rounded-md text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-all" title="Zoom in">+</button>
            </div>

            {!readOnly && (
              <>
                <div className="h-5 w-px bg-slate-200" />
                <AutoArrangeDropdown onSelect={handleAutoArrange} />
              </>
            )}
          </div>
        </>
      )}

      <div className="flex-1 flex min-h-0 relative">
      {/* Canvas viewport */}
      <div
        ref={canvasRef}
        className={`flex-1 min-w-0 overflow-auto bg-[#e8ecf0] relative ${draggingId || draggingLayerId || isMultiDrag ? "cursor-grabbing" : ""}${previewDocPath ? " blur-sm pointer-events-none select-none" : ""}`}
        style={{ scrollbarWidth: 'none' }}
        onMouseDown={(e) => { if (e.button === 0 && selection?.type === 'flow') setSelection(null); handleCanvasMouseDown(e); }}
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
        {!activeFile ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#e8ecf0] z-50">
            <div className="flex flex-col items-center gap-3 text-slate-400">
              <MapIcon size={48} strokeWidth={1} className="text-slate-300" />
              <p className="text-sm font-medium">No file open</p>
              <p className="text-xs text-slate-400">Open a file from the explorer to start editing</p>
            </div>
          </div>
        ) : <>
        <div style={{
          width: VIEWPORT_PADDING * 2 + world.w * zoom,
          height: VIEWPORT_PADDING * 2 + world.h * zoom,
          position: 'relative',
        }}>
        <div style={{ position: 'absolute', left: VIEWPORT_PADDING, top: VIEWPORT_PADDING, transform: `scale(${zoom})`, transformOrigin: '0 0', willChange: isZooming ? 'transform' : 'auto' }}>
        <Canvas patches={patches}>
            {/* Layers */}
            {regions.map((r) => {
              const isThisLayerDragged = draggingLayerIds.includes(r.id);
              const dimmed = (draggingLayerIds.length > 0 && !isThisLayerDragged) || !!draggingId || isMultiDrag || (flowDimSets != null && !flowDimSets.layerIds.has(r.id)) || (typeDimSets != null && !typeDimSets.layerIds.has(r.id));
              return (
                <React.Fragment key={r.id}>
                  {isThisLayerDragged && layerDragRawDelta && (
                    <Layer id={`${r.id}-ghost`} title={r.title} left={r.left + layerDragRawDelta.dx} width={r.width} top={r.top + layerDragRawDelta.dy} height={r.height} bg={r.bg} border={r.border} textColor={r.textColor} dimmed />
                  )}
                  <Layer
                    {...r}
                    left={isThisLayerDragged && layerDragDelta ? r.left + layerDragDelta.dx : r.left}
                    top={isThisLayerDragged && layerDragDelta ? r.top + layerDragDelta.dy : r.top}
                    onDragStart={(id, e) => { e.stopPropagation(); if (e.metaKey || e.ctrlKey) { handleSelectionRectStart(e); return; } pendingSelection.current = { type: 'layer', id, x: e.clientX, y: e.clientY }; handleLayerDragStart(id, e); }}
                    onResizeStart={readOnly ? undefined : (id, edge, e) => { e.stopPropagation(); pendingSelection.current = { type: 'layer', id, x: e.clientX, y: e.clientY }; handleLayerResizeStart(id, edge, e); }}
                    isDragging={isThisLayerDragged}
                    isResizing={resizingLayer?.layerId === r.id}
                    isSelected={isItemSelected(selection, 'layer', r.id)}
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
              const selectedLineIds = selection?.type === 'line' ? [selection.id]
                : selection?.type === 'multi-line' ? selection.ids
                : selection?.type === 'flow' ? (flows.find((f) => f.id === selection.id)?.connectionIds ?? [])
                : [];
              return (isLive || hoveredLine || selectedLineIds.length > 0) && (
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
              setNodes={setNodes}
              scheduleRecord={scheduleRecord}
              getNodeDimensions={getNodeDimensions}
              hasDocuments={hasDocuments}
              getDocumentsForEntity={getDocumentsForEntity}
              onOpenDocument={onOpenDocument}
            />
            {/* Data line label overlay */}
            {showLabels && (
              <svg
                className="absolute pointer-events-none"
                style={{ zIndex: 15, left: world.x, top: world.y, width: world.w, height: world.h }}
                viewBox={`${world.x} ${world.y} ${world.w} ${world.h}`}
              >
                {sortedLines.map((line) => {
                  if (!line.label) return null;
                  if (flowDimSets != null && !flowDimSets.connIds.has(line.id)) return null;
                  const pt = interpolatePoints(line.points, line.labelPosition);
                  const isHovered = hoveredLine?.id === line.id;
                  const isSelected = isItemSelected(selection, 'line', line.id);
                  const w = line.label.length * 6.5 + 8;
                  return (
                    <g
                      key={line.id}
                      style={{ pointerEvents: "auto", cursor: "grab" }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        if (readOnly) return;
                        const svg = (e.target as SVGElement).closest("svg");
                        if (!svg) return;
                        const startT = line.labelPosition;
                        labelLastValidT.current = startT;
                        labelDragNodeRects.current = nodes.map(n => {
                          const dims = getNodeDimensions(n);
                          const sy = n.y + (layerShiftsRef.current[n.layer] || 0);
                          return { left: n.x - dims.w / 2, top: sy - dims.h / 2, width: dims.w, height: dims.h };
                        });
                        const labelW = line.label!.length * 6.5 + 8;
                        const linePoints = line.points;
                        const lineId = line.id;

                        const onMove = (ev: MouseEvent) => {
                          const pt = svg.createSVGPoint();
                          pt.x = ev.clientX;
                          pt.y = ev.clientY;
                          const svgPt = pt.matrixTransform(svg.getScreenCTM()!.inverse());
                          const rawT = Math.max(0.05, Math.min(0.95, closestT(linePoints, svgPt.x, svgPt.y)));

                          const rawPt = interpolatePoints(linePoints, rawT);
                          const labelRect = { left: rawPt.x - labelW / 2, top: rawPt.y - 10, width: labelW, height: 18 };
                          const hasOverlap = labelDragNodeRects.current.some(r => rectsOverlap(labelRect, r, 4));

                          if (!hasOverlap) {
                            setConnections(prev => prev.map(c => c.id === lineId ? { ...c, labelPosition: rawT } : c));
                            labelLastValidT.current = rawT;
                            setLabelDragGhost(null);
                          } else {
                            let loT = labelLastValidT.current, hiT = rawT;
                            for (let i = 0; i < 15; i++) {
                              const midT = (loT + hiT) / 2;
                              const midPt = interpolatePoints(linePoints, midT);
                              const midRect = { left: midPt.x - labelW / 2, top: midPt.y - 10, width: labelW, height: 18 };
                              if (labelDragNodeRects.current.some(r => rectsOverlap(midRect, r, 4))) {
                                hiT = midT;
                              } else {
                                loT = midT;
                              }
                            }
                            const clampedT = Math.max(0.05, Math.min(0.95, loT));
                            setConnections(prev => prev.map(c => c.id === lineId ? { ...c, labelPosition: clampedT } : c));
                            labelLastValidT.current = clampedT;
                            setLabelDragGhost({ lineId, rawT });
                          }
                        };
                        const onUp = () => {
                          const conn = connections.find((c) => c.id === lineId);
                          const endT = conn?.labelPosition ?? startT;
                          if (endT !== startT) scheduleRecord("Move label");
                          setLabelDragGhost(null);
                          labelDragNodeRects.current = [];
                          window.removeEventListener("mousemove", onMove);
                          window.removeEventListener("mouseup", onUp);
                        };
                        window.addEventListener("mousemove", onMove);
                        window.addEventListener("mouseup", onUp);
                      }}
                    >
                      <rect
                        x={pt.x - w / 2}
                        y={pt.y - 10}
                        width={w}
                        height={18}
                        rx={4}
                        fill="white"
                        fillOpacity={0.9}
                        stroke={isSelected || isHovered ? line.color : "#e2e8f0"}
                        strokeWidth={0.8}
                      />
                      <text
                        x={pt.x}
                        y={pt.y + 3}
                        textAnchor="middle"
                        fontSize="11"
                        fontWeight="600"
                        fontFamily="system-ui, sans-serif"
                        fill={line.color}
                        style={{ pointerEvents: "none", userSelect: "none" }}
                      >
                        {line.label}
                      </text>
                    </g>
                  );
                })}
                {labelDragGhost && (() => {
                  const ghostLineForLabel = sortedLines.find(l => l.id === labelDragGhost.lineId);
                  if (!ghostLineForLabel?.label) return null;
                  const gpt = interpolatePoints(ghostLineForLabel.points, labelDragGhost.rawT);
                  const gw = ghostLineForLabel.label.length * 6.5 + 8;
                  return (
                    <g style={{ opacity: 0.35, pointerEvents: "none" }}>
                      <rect x={gpt.x - gw / 2} y={gpt.y - 10} width={gw} height={18} rx={4} fill="white" fillOpacity={0.9} stroke="#e2e8f0" strokeWidth={0.8} />
                      <text x={gpt.x} y={gpt.y + 3} textAnchor="middle" fontSize="11" fontWeight="600" fontFamily="system-ui, sans-serif" fill={ghostLineForLabel.color} style={{ pointerEvents: "none", userSelect: "none" }}>{ghostLineForLabel.label}</text>
                    </g>
                  );
                })()}
              </svg>
            )}
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
        </>}

      </div>

      <DiagramOverlays
        activeFile={activeFile}
        readOnly={readOnly}
        selection={selection}
        title={title}
        nodes={nodes}
        connections={connections}
        flows={flows}
        layerDefs={layerDefs}
        displayNodes={displayNodes}
        regions={regions}
        levelMap={levelMap}
        lineCurve={lineCurve}
        measuredSizes={measuredSizes}
        propertiesCollapsed={propertiesCollapsed}
        historyCollapsed={historyCollapsed}
        showMinimap={showMinimap}
        showLabels={showLabels}
        expandedTypeInPanel={expandedTypeInPanel}
        contextMenu={contextMenu}
        anchorPopup={anchorPopup}
        hoveredLine={hoveredLine}
        pendingDeletion={pendingDeletion}
        pendingReconnect={pendingReconnect}
        pickerTarget={pickerTarget}
        canvasRef={canvasRef}
        zoomRef={zoomRef}
        world={world}
        backlinks={backlinks}
        documents={documents}
        fileExplorer={fileExplorer}
        onOpenDocument={onOpenDocument}
        onAttachDocument={handleAttachDocument}
        onDetachDocument={handleDetachDocument}
        onCreateDocument={onCreateDocument}
        onCreateAndAttach={handleCreateAndAttach}
        history={history}
        setSelection={setSelection}
        setNodes={setNodes}
        setLayerDefs={setLayerDefs}
        setLayerManualSizes={setLayerManualSizes}
        setConnections={setConnections}
        setFlows={setFlows}
        setMeasuredSizes={setMeasuredSizes}
        setTitle={setTitle}
        setLineCurve={setLineCurve}
        setPendingDeletion={setPendingDeletion}
        setPendingReconnect={setPendingReconnect}
        setPickerTarget={setPickerTarget}
        setContextMenu={setContextMenu}
        setAnchorPopup={setAnchorPopup}
        setHoveredFlowId={setHoveredFlowId}
        setHoveredType={setHoveredType}
        setExpandedTypeInPanel={setExpandedTypeInPanel}
        setHistoryCollapsed={setHistoryCollapsed}
        toggleProperties={toggleProperties}
        handleAddElement={handleAddElement}
        handleAddLayer={handleAddLayer}
        deleteSelection={deleteSelection}
        confirmDeletion={confirmDeletion}
        handleAnchorConnectToElement={handleAnchorConnectToElement}
        handleAnchorCreateCondition={handleAnchorCreateCondition}
        handleAnchorConnectToType={handleAnchorConnectToType}
        handleAnchorMenuEnter={handleAnchorMenuEnter}
        handleAnchorMenuLeave={handleAnchorMenuLeave}
        handleCreateLayer={handleCreateLayer}
        handleDeleteAnchor={handleDeleteAnchor}
        handleSelectType={handleSelectType}
        handleUndo={handleUndo}
        handleRedo={handleRedo}
        handleGoToEntry={handleGoToEntry}
        handleSelectFlow={handleSelectFlow}
        handleUpdateFlow={handleUpdateFlow}
        handleDeleteFlow={handleDeleteFlow}
        handleCreateFlow={handleCreateFlow}
        handleSelectLine={handleSelectLine}
        scheduleRecord={scheduleRecord}
        scrollToRect={scrollToRect}
        getNodeDimensions={getNodeDimensions}
        getDocumentsForEntity={getDocumentsForEntity}
        previewDocPath={previewDocPath}
        previewEntityName={previewEntityName}
        setPreviewDocPath={setPreviewDocPath}
        setPreviewEntityName={setPreviewEntityName}
        readDocument={readDocument}
        getDocumentReferences={getDocumentReferences}
        deleteDocumentWithCleanup={handleDeleteDocumentWithCleanup}
      />
      </div>
    </div>
  );
}
