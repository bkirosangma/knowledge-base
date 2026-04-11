import React, { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo } from "react";
import Canvas, {
  type CanvasPatch,
  fitToContent,
  getWorldSize,
} from "./components/Canvas";
import Layer from "./components/Layer";
import Element from "./components/Element";
import DataLine, { interpolatePoints, closestT } from "./components/DataLine";
import { rectsOverlap } from "./utils/collisionUtils";
import FlowDots from "./components/FlowDots";
import { getAnchorPosition, getAnchors, getNodeAnchorPosition, getNodeAnchorDirection, getAnchorEdge } from "./utils/anchors";
import { buildObstacles } from "./utils/orthogonalRouter";
import { computePath } from "./utils/pathRouter";
import { getNodeHeight } from "./utils/types";
import type { LineCurveAlgorithm, Selection, FlowDef, ViewMode, ExplorerFilter } from "./utils/types";
import SplitPane from "./components/SplitPane";
import MarkdownPane from "./components/MarkdownPane";
import { isItemSelected } from "./utils/selectionUtils";
import { useSelectionRect } from "./hooks/useSelectionRect";
import PropertiesPanel from "./components/properties/PropertiesPanel";
import { loadDefaults, serializeNodes } from "./utils/persistence";
import { computeLevelMap, type LevelMap } from "./utils/levelModel";
import { Map } from "lucide-react";
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
import { hierarchicalLayout, forceDirectedLayout } from "./utils/autoArrange";
import { useLineDrag } from "./hooks/useLineDrag";
import Minimap from "./components/Minimap";
import ContextMenu, { type ContextMenuTarget } from "./components/ContextMenu";
import { useContextMenuActions } from "./hooks/useContextMenuActions";
import { useZoom } from "./hooks/useZoom";
import { useDeletion, type PendingDeletion } from "./hooks/useDeletion";
import { findBrokenFlowsByReconnect } from "./utils/flowUtils";
import { useFlowManagement } from "./hooks/useFlowManagement";
import { useLabelEditing } from "./hooks/useLabelEditing";
import { useAnchorConnections } from "./hooks/useAnchorConnections";
import { useCanvasInteraction } from "./hooks/useCanvasInteraction";
import { useFileActions } from "./hooks/useFileActions";
import { useCanvasEffects } from "./hooks/useCanvasEffects";
import { detectContextMenuTarget } from "./utils/geometry";
import DiagramControls from "./components/DiagramControls";
import ExplorerPanel from "./components/explorer/ExplorerPanel";
import ConfirmPopover from "./components/explorer/ConfirmPopover";
import AnchorPopupMenu from "./components/AnchorPopupMenu";
import ConditionElement from "./components/ConditionElement";
import FlowBreakWarningModal from "./components/FlowBreakWarningModal";
import Header from "./components/Header";
import { getConditionAnchors, getConditionDimensions } from "./utils/conditionGeometry";
import HistoryPanel from "./components/HistoryPanel";
import { useFileExplorer } from "./hooks/useFileExplorer";
import { loadDiagramFromData } from "./utils/persistence";
import { useActionHistory } from "./hooks/useActionHistory";
import type { DiagramSnapshot } from "./hooks/useActionHistory";
import { useSyncRef } from "./hooks/useSyncRef";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useDragEndRecorder } from "./hooks/useDragEndRecorder";
import type { SortField, SortDirection, SortGrouping } from "./components/explorer/ExplorerPanel";
import { useDocuments } from "./hooks/useDocuments";
import { useLinkIndex } from "./hooks/useLinkIndex";
import DocumentPicker from "./components/DocumentPicker";
import { readVaultConfig, initVault, updateVaultLastOpened } from "./utils/vaultConfig";

const SKIP_DISCARD_CONFIRM_KEY = "architecture-designer-skip-discard-confirm";
const DEFAULT_PATCHES: CanvasPatch[] = [{ id: "main", col: 0, row: 0, widthUnits: 1, heightUnits: 1 }];

export default function ArchitectureDesigner() {
  const [isLive, setIsLive] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [showMinimap, setShowMinimap] = useState(true);
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

  const [explorerCollapsed, setExplorerCollapsed] = useState(false);
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const [editingLabel, setEditingLabel] = useState<{ type: "node" | "layer" | "line"; id: string } | null>(null);
  const [editingLabelValue, setEditingLabelValue] = useState("");
  const editingLabelBeforeRef = useRef("");
  const labelDragStartT = useRef<number | null>(null);
  const labelDragNodeRects = useRef<{ left: number; top: number; width: number; height: number }[]>([]);
  const labelLastValidT = useRef<number>(0.5);
  const [labelDragGhost, setLabelDragGhost] = useState<{ lineId: string; rawT: number } | null>(null);
  const [titleInputValue, setTitleInputValue] = useState(title);
  const [titleWidth, setTitleWidth] = useState<number | string>("auto");
  const [viewMode, setViewMode] = useState<ViewMode>("diagram");
  const [explorerFilter, setExplorerFilter] = useState<ExplorerFilter>("all");
  const fileExplorer = useFileExplorer();
  const history = useActionHistory();
  const docManager = useDocuments();
  const linkManager = useLinkIndex();
  const [pickerTarget, setPickerTarget] = useState<{ type: string; id: string } | null>(null);

  // Sort preferences (single state instead of 3 separate)
  const SORT_PREFS_KEY = "architecture-designer-sort-prefs";
  const [sortPrefs, setSortPrefs] = useState<{ field: SortField; direction: SortDirection; grouping: SortGrouping }>(() => {
    if (typeof window === "undefined") return { field: "name", direction: "asc", grouping: "folders-first" };
    try {
      const raw = JSON.parse(localStorage.getItem(SORT_PREFS_KEY) || "{}");
      return { field: raw.field ?? "name", direction: raw.direction ?? "asc", grouping: raw.grouping ?? "folders-first" };
    } catch { return { field: "name", direction: "asc", grouping: "folders-first" }; }
  });
  const handleSortChange = useCallback((field: SortField, direction: SortDirection, grouping: SortGrouping) => {
    setSortPrefs({ field, direction, grouping });
    try { localStorage.setItem(SORT_PREFS_KEY, JSON.stringify({ field, direction, grouping })); } catch { /* ignore */ }
  }, []);

  const [confirmAction, setConfirmAction] = useState<{
    type: "delete-file" | "delete-folder" | "discard";
    path?: string;
    x: number;
    y: number;
  } | null>(null);

  /* ── History recording helpers ── */
  const pendingRecord = useRef<string | null>(null);
  const isRestoringRef = useRef(false);

  const scheduleRecord = useCallback((description: string) => {
    if (isRestoringRef.current) return;
    pendingRecord.current = description;
  }, []);

  // Fire after render so all state is settled
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
      // Always use computed dimensions for conditions — measured height includes arc sagitta
      // which getConditionAnchors adds internally, causing double-counting
      const dims = getConditionDimensions(node.conditionSize, node.conditionOutCount);
      return dims;
    }
    return {
      w: measured?.w ?? node.w,
      h: measured?.h ?? getNodeHeight(node.w),
    };
  }, [measuredSizes]);

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

  // Sync title → titleInputValue on external changes (file load, undo)
  useEffect(() => { setTitleInputValue(title); }, [title]);
  useEffect(() => { registerSetIsZooming(setIsZooming); }, [registerSetIsZooming]);

  const { toCanvasCoords, setWorldOffset } = useCanvasCoords(canvasRef, zoomRef);
  const { scrollToRect } = useCanvasEffects(canvasRef, worldRef, zoomRef);

  const { draggingEndpoint, handleLineClick, handleConnectedAnchorDrag, endpointDragDidMove } = useEndpointDrag({
    connections, nodes, measuredSizes, layerShiftsRef, toCanvasCoords, setConnections,
  });

  const { handleSegmentDragStart } = useSegmentDrag({
    toCanvasCoords, setConnections, scheduleRecord,
  });

  const onAnchorClick = useCallback((nodeId: string, anchorId: import("./utils/anchors").AnchorId, clientX: number, clientY: number) => {
    // For condition out-anchors or any anchor on regular elements, show popup
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    if (node.shape === "condition" && anchorId === "cond-in") return; // No popup for in-anchor
    setAnchorPopup({ clientX, clientY, nodeId, anchorId, edge: getAnchorEdge(anchorId) });
  }, [nodes]);

  const handleAnchorHover = useCallback((nodeId: string, anchorId: import("./utils/anchors").AnchorId, clientX: number, clientY: number) => {
    if (anchorDismissTimer.current) { clearTimeout(anchorDismissTimer.current); anchorDismissTimer.current = null; }
    if (anchorHoverTimer.current) clearTimeout(anchorHoverTimer.current);
    anchorHoverTimer.current = setTimeout(() => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;
      if (node.shape === "condition" && anchorId === "cond-in") return;
      setAnchorPopup({ clientX, clientY, nodeId, anchorId, edge: getAnchorEdge(anchorId) });
    }, 100);
  }, [nodes]);

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
    isBlocked: !!draggingEndpoint,
    onAnchorClick,
    onConnectedAnchorDrag: handleConnectedAnchorDrag,
  });

  const { draggingId, elementDragPos, elementDragRawPos, handleDragStart,
    isMultiDrag, multiDragIds, multiDragDelta, multiDragRawDelta,
    nodeDragDidMove, multiDragDidMove } = useNodeDrag({
    nodes, layerShiftsRef, toCanvasCoords,
    isBlocked: !!draggingEndpoint || !!creatingLine,
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
    isBlocked: !!draggingId || !!draggingEndpoint || !!creatingLine || isMultiDrag,
    initialManualSizes: defaults.current.layerManualSizes,
    nodes, levelMapRef, getNodeDimensions, layerShiftsRef,
  });

  const { draggingLayerId, draggingLayerIds, layerDragDelta, layerDragRawDelta, handleLayerDragStart, layerDragDidMove } = useLayerDrag({
    toCanvasCoords,
    isBlocked: !!draggingEndpoint || !!creatingLine || !!draggingId || isMultiDrag,
    setNodes,
    regionsRef,
    setLayerManualSizes,
    selection,
    nodes, levelMapRef, getNodeDimensions, layerShiftsRef,
  });

  const { isDirty, setLoadSnapshot } = useDiagramPersistence(
    setTitle, setLayerDefs, setNodes, setConnections, setLayerManualSizes, setLineCurve, setFlows,
    title, layerDefs, nodes, connections, layerManualSizes, lineCurve, flows,
    fileExplorer.activeFile,
    fileExplorer.markDirty,
  );

  /** Apply a loaded/restored diagram to all state in one call. */
  const applyDiagramToState = useCallback((
    data: ReturnType<typeof loadDiagramFromData>,
    opts?: { setSnapshot?: boolean; snapshotSource?: ReturnType<typeof loadDiagramFromData> },
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
      setLoadSnapshot(src.title, src.layers, src.nodes, src.connections, src.layerManualSizes, src.lineCurve, src.flows);
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

  // File operation handlers
  const {
    handleLoadFile, handleSave, handleCreateFile, handleCreateFolder,
    handleDeleteFile, handleDeleteFolder, handleRenameFile, handleRenameFolder,
    handleDuplicateFile, handleMoveItem, handleDiscard, handleConfirmAction,
  } = useFileActions(
    fileExplorer, history, applyDiagramToState, isRestoringRef, isDirty, setLoadSnapshot,
    confirmAction, setConfirmAction, canvasRef,
    title, layerDefs, nodes, connections, layerManualSizes, lineCurve, flows,
    docManager.documents,
    docManager.setDocuments,
  );

  // Document open handler — auto-saves dirty doc, opens new doc, switches to split view
  const handleOpenDocument = useCallback(async (path: string) => {
    const rootHandle = fileExplorer.dirHandleRef.current;
    if (!rootHandle) return;
    // Auto-save current dirty doc before switching
    if (docManager.docDirty && docManager.activeDocPath) {
      await docManager.saveDocument(rootHandle);
    }
    // Open the new document
    await docManager.openDocument(rootHandle, path);
    // Switch to split mode if currently in diagram mode
    if (viewMode === "diagram") setViewMode("split");
  }, [fileExplorer.dirHandleRef, docManager.docDirty, docManager.activeDocPath, docManager.saveDocument, docManager.openDocument, viewMode]);

  // Cmd+S / Ctrl+S keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (viewMode === "diagram") {
          handleSave();
        } else {
          // Save document in split/document modes
          const rootHandle = fileExplorer.dirHandleRef.current;
          if (rootHandle && docManager.docDirty && docManager.activeDocPath) {
            docManager.saveDocument(rootHandle).then(() => {
              // Also update link index for the saved document
              linkManager.updateDocumentLinks(rootHandle, docManager.activeDocPath!, docManager.activeDocContent);
            });
          }
          // Also save diagram if in split mode
          if (viewMode === "split") handleSave();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave, viewMode, fileExplorer.dirHandleRef, docManager.docDirty, docManager.activeDocPath, docManager.activeDocContent, docManager.saveDocument, linkManager.updateDocumentLinks]);

  // Auto-load last opened file on restore
  useEffect(() => {
    if (fileExplorer.pendingFile) {
      handleLoadFile(fileExplorer.pendingFile);
      fileExplorer.clearPendingFile();
    }
  }, [fileExplorer.pendingFile, fileExplorer.clearPendingFile, handleLoadFile]);

  // Vault initialization — check/init vault config and load link index when a directory is opened
  useEffect(() => {
    const rootHandle = fileExplorer.dirHandleRef.current;
    if (!rootHandle || fileExplorer.tree.length === 0) return;
    (async () => {
      const config = await readVaultConfig(rootHandle);
      if (config) {
        await updateVaultLastOpened(rootHandle);
      } else if (fileExplorer.directoryName) {
        await initVault(rootHandle, fileExplorer.directoryName);
      }
      // Load link index
      await linkManager.loadIndex(rootHandle);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileExplorer.directoryName]);

  const { deleteSelection, confirmDeletion } = useDeletion(nodesRef, connectionsRef, flowsRef, {
    setNodes, setConnections, setLayerDefs, setLayerManualSizes, setMeasuredSizes, setSelection, setFlows,
  }, scheduleRecord);

  // Pending deletion state for the warning modal
  const [pendingDeletion, setPendingDeletion] = useState<PendingDeletion | null>(null);

  // Pending reconnection state for flow break warning
  const [pendingReconnect, setPendingReconnect] = useState<{
    oldId: string;
    updates: Record<string, unknown>;
    brokenFlows: FlowDef[];
  } | null>(null);

  // Flow-related callbacks
  const flowCounter = useRef(0);
  const { handleCreateFlow, handleSelectFlow, handleUpdateFlow, handleDeleteFlow, handleSelectLine } = useFlowManagement(
    connectionsRef, flowsRef, flowCounter, setFlows, setSelection, scheduleRecord,
  );

  const handleCreateLayer = useCallback((layerTitle: string): string => {
    const newId = `ly-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setLayerDefs((prev) => [...prev, { id: newId, title: layerTitle.toUpperCase(), bg: "#eff3f9", border: "#cdd6e4", textColor: "#334155" }]);
    setLayerManualSizes((prev) => ({ ...prev, [newId]: { left: 0, width: 400, top: 0, height: 200 } }));
    scheduleRecord("Create layer from property");
    return newId;
  }, [scheduleRecord]);

  const handleDeleteAnchor = useCallback((nodeId: string, anchorIndex: number) => {
    const anchorId = `cond-out-${anchorIndex}`;
    // Remove connections attached to this anchor
    setConnections((prev) => prev
      .filter((c) => !(c.from === nodeId && c.fromAnchor === anchorId))
      .map((c) => {
        // Renumber higher-indexed out-anchors
        if (c.from === nodeId && c.fromAnchor.startsWith("cond-out-")) {
          const idx = parseInt(c.fromAnchor.split("-")[2]);
          if (idx > anchorIndex) return { ...c, fromAnchor: `cond-out-${idx - 1}` as import("./utils/anchors").AnchorId };
        }
        return c;
      })
    );
    // Decrement out count
    setNodes((prev) => prev.map((n) =>
      n.id === nodeId ? { ...n, conditionOutCount: Math.max(2, (n.conditionOutCount ?? 2) - 1) } : n
    ));
    scheduleRecord("Delete condition anchor");
  }, [scheduleRecord]);

  const handleAutoArrange = useCallback((algorithm: "hierarchical-tb" | "hierarchical-lr" | "force") => {
    let newPositions: Map<string, { x: number; y: number }>;
    if (algorithm === "force") {
      newPositions = forceDirectedLayout(nodes, connections);
    } else {
      const direction = algorithm === "hierarchical-lr" ? "LR" : "TB";
      newPositions = hierarchicalLayout(nodes, connections, { direction });
    }
    setNodes((prev) =>
      prev.map((n) => {
        const pos = newPositions.get(n.id);
        return pos ? { ...n, x: pos.x, y: pos.y } : n;
      })
    );
    // Clear user waypoints so lines re-route automatically
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

  // Flow dimming: compute which items are "included" in the selected or hovered flow
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

  // Type focus: compute which items are included when a type is hovered
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

  // Clear focus states when selection changes (e.g. clicking empty canvas)
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

  // Canvas interaction handlers (rotation, drag, double-click, hover)
  const { handleRotationDragStart, handleNodeDragStart, handleNodeDoubleClick, handleNodeMouseEnter, handleNodeMouseLeave } = useCanvasInteraction(
    nodesRef, editingLabelBeforeRef, setNodes, setHoveredNodeId,
    setEditingLabel, setEditingLabelValue, pendingSelection,
    handleSelectionRectStart, handleDragStart, scheduleRecord,
  );

  useKeyboardShortcuts({
    cancelSelectionRect, setSelection, setContextMenu,
    deleteSelection, setPendingDeletion,
    handleCreateFlow, handleUndo, handleRedo,
    selectionRef, pendingSelectionRef: pendingSelection, nodesRef,
  });

  // ── Drag-end watchers for history recording (only record if something actually changed) ──
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

  const { VIEWPORT_KEY } = useViewportPersistence(canvasRef, worldRef, zoomRef, zoom, setZoom, fileExplorer.activeFile);

  // Compensate scroll when world origin shifts (canvas expands left/top)
  // useLayoutEffect runs before paint, preventing visible jumps
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

  // Shared node lookup map (used by lines computation and ghost line)
  const nodeMap = useMemo(() => Object.fromEntries(displayNodes.map((n) => [n.id, n])), [displayNodes]);

  /** Resolve anchor position for a node, handling conditions. */
  const resolveAnchorPos = useCallback((anchorId: string, node: typeof displayNodes[0], dims: { w: number; h: number }) => {
    if (node.shape === "condition") {
      return getNodeAnchorPosition(anchorId, node.x, node.y, dims.w, dims.h, node.shape, node.conditionOutCount, node.rotation);
    }
    return getAnchorPosition(anchorId as import("./utils/anchors").AnchorId, node.x, node.y, dims.w, dims.h);
  }, []);

  // Compute lines (memoized — path computation is expensive)
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


  // Sorted lines — used in both the main SVG and the label overlay SVG
  const sortedLines = useMemo(() => [...lines].sort((a, b) => {
    const aFront = (a.id === hoveredLine?.id || isItemSelected(selection, 'line', a.id)) ? 1 : 0;
    const bFront = (b.id === hoveredLine?.id || isItemSelected(selection, 'line', b.id)) ? 1 : 0;
    return aFront - bFront;
  }), [lines, hoveredLine?.id, selection]);

  return (
    <div className="w-full h-screen bg-[#f4f7f9] font-sans flex flex-col overflow-hidden relative">
      <Header
        title={title}
        titleInputValue={titleInputValue}
        setTitleInputValue={setTitleInputValue}
        titleWidth={titleWidth}
        setTitleWidth={setTitleWidth}
        onTitleCommit={(v) => { setTitle(v); scheduleRecord("Edit title"); }}
        isDirty={isDirty}
        hasActiveFile={!!fileExplorer.activeFile}
        isLive={isLive}
        showLabels={showLabels}
        showMinimap={showMinimap}
        zoom={zoom}
        onToggleLive={() => setIsLive(!isLive)}
        onToggleLabels={() => setShowLabels(!showLabels)}
        onToggleMinimap={() => setShowMinimap(!showMinimap)}
        onZoomChange={setZoomTo}
        onDiscard={handleDiscard}
        onSave={handleSave}
        onAutoArrange={handleAutoArrange}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      {/* Hidden fallback input for browsers without File System Access API */}
      <input
        ref={fileExplorer.inputRef}
        type="file"
        /* @ts-expect-error webkitdirectory is non-standard */
        webkitdirectory=""
        className="hidden"
        onChange={(e) => fileExplorer.handleFallbackInput(e.target.files)}
      />

      {/* Explorer + Viewport + Properties */}
      <div className="flex-1 flex min-h-0">
      {/* Left sidebar: Explorer + History */}
      <div
        className="flex-shrink-0 bg-white border-r border-slate-200 flex flex-col transition-[width] duration-200 overflow-hidden"
        style={{ width: explorerCollapsed ? 36 : 260 }}
      >
        <ExplorerPanel
          collapsed={explorerCollapsed}
          onToggleCollapse={() => setExplorerCollapsed((c) => !c)}
          directoryName={fileExplorer.directoryName}
          tree={fileExplorer.tree}
          activeFile={fileExplorer.activeFile}
          dirtyFiles={fileExplorer.dirtyFiles}
          onOpenFolder={fileExplorer.openFolder}
          onSelectFile={handleLoadFile}
          onCreateFile={handleCreateFile}
          onCreateFolder={handleCreateFolder}
          onDeleteFile={handleDeleteFile}
          onDeleteFolder={handleDeleteFolder}
          onRenameFile={handleRenameFile}
          onRenameFolder={handleRenameFolder}
          onDuplicateFile={handleDuplicateFile}
          onMoveItem={handleMoveItem}
          isLoading={fileExplorer.isLoading}
          onRefresh={fileExplorer.refresh}
          sortField={sortPrefs.field}
          sortDirection={sortPrefs.direction}
          sortGrouping={sortPrefs.grouping}
          onSortChange={handleSortChange}
          explorerFilter={explorerFilter}
          onFilterChange={setExplorerFilter}
          onSelectDocument={handleOpenDocument}
        />
        <HistoryPanel
          entries={history.entries}
          currentIndex={history.currentIndex}
          savedIndex={history.savedIndex}
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onGoToEntry={handleGoToEntry}
          collapsed={historyCollapsed}
          sidebarCollapsed={explorerCollapsed}
          onToggleCollapse={() => {
            if (explorerCollapsed) {
              setExplorerCollapsed(false);
              setHistoryCollapsed(false);
            } else {
              setHistoryCollapsed((c) => !c);
            }
          }}
        />
      </div>
      {/* Viewport */}
      {viewMode === "diagram" && <div
        ref={canvasRef}
        className={`flex-1 overflow-auto bg-[#e8ecf0] relative ${draggingId || draggingLayerId || isMultiDrag ? "cursor-grabbing" : ""}`}
        style={{ scrollbarWidth: 'none' }}
        onMouseDown={(e) => { handleCanvasMouseDown(e); }}
        onPointerMove={hoveredLine ? () => setHoveredLine(null) : undefined}
        onScroll={() => setContextMenu(null)}
        onContextMenu={(e) => {
          e.preventDefault();
          const coords = toCanvasCoords(e.clientX, e.clientY);
          const cx = coords.x;
          const cy = coords.y;

          const target = detectContextMenuTarget(cx, cy, nodes, getNodeDimensions, regions);

          setContextMenu({ clientX: e.clientX, clientY: e.clientY, canvasX: cx, canvasY: cy, target });
        }}
      >
        {!fileExplorer.activeFile ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#e8ecf0] z-50">
            <div className="flex flex-col items-center gap-3 text-slate-400">
              <Map size={48} strokeWidth={1} className="text-slate-300" />
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
                    onResizeStart={(id, edge, e) => { e.stopPropagation(); pendingSelection.current = { type: 'layer', id, x: e.clientX, y: e.clientY }; handleLayerResizeStart(id, edge, e); }}
                    isDragging={isThisLayerDragged}
                    isResizing={resizingLayer?.layerId === r.id}
                    isSelected={isItemSelected(selection, 'layer', r.id)}
                    dimmed={dimmed}
                    onDoubleClick={(layerId) => {
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
                    onSegmentDragStart={handleSegmentDragStart}
                    isLive={isLive}
                    isHovered={hoveredLine?.id === line.id}
                    showLabels={showLabels}
                    isDraggingEndpoint={isBeingDragged}
                    isSelected={isItemSelected(selection, 'line', line.id)}
                    dimmed={dimmed}
                    suppressLabel={showLabels}
                    onHoverStart={(id, label, x, y) => { setHoveredLine({ id, label, x, y }); }}
                    onHoverMove={(id, x, y) => { setHoveredLine((prev) => (prev?.id === id ? { ...prev, x, y } : prev)); }}
                    onHoverEnd={() => { setHoveredLine((prev) => prev?.id === line.id ? null : prev); }}
                    onLineClick={(id, e) => { pendingSelection.current = { type: 'line', id, x: e.clientX, y: e.clientY }; handleLineClick(id, e); }}
                    onLabelPositionChange={(connId, t) => {
                      if (labelDragStartT.current === null) {
                        const conn = connections.find((c) => c.id === connId);
                        labelDragStartT.current = conn?.labelPosition ?? 0.5;
                      }
                      setConnections((prev) => prev.map((c) => c.id === connId ? { ...c, labelPosition: t } : c));
                    }}
                    onLabelDragEnd={(connId) => {
                      const conn = connections.find((c) => c.id === connId);
                      const endT = conn?.labelPosition ?? 0.5;
                      if (labelDragStartT.current !== null && endT !== labelDragStartT.current) {
                        scheduleRecord("Move label");
                      }
                      labelDragStartT.current = null;
                    }}
                    onDoubleClick={(connId) => {
                      const conn = connections.find((c) => c.id === connId);
                      if (conn) {
                        setEditingLabel({ type: "line", id: connId });
                        setEditingLabelValue(conn.label);
                        editingLabelBeforeRef.current = conn.label;
                      }
                    }}
                    hasDocuments={docManager.hasDocuments("connection", line.id)}
                    documentPaths={docManager.getDocumentsForEntity("connection", line.id).map(d => d.filename)}
                    onDocNavigate={handleOpenDocument}
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

            {/* Animated flow dots — memoized to avoid restart on hover */}
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
            {displayNodes.map((node) => {
              const isThisSingleDragged = draggingId === node.id;
              const isThisMultiDragged = isMultiDrag && multiDragIds.includes(node.id);
              const isThisDragged = isThisSingleDragged || isThisMultiDragged;
              const dims = getNodeDimensions(node);
              const isCondition = node.shape === "condition";
              const anchors = isCondition
                ? getConditionAnchors(node.x, node.y, dims.w, dims.h, node.conditionOutCount ?? 2, node.rotation ?? 0).map((a) => ({ id: a.id as import("./utils/anchors").AnchorId, x: a.x, y: a.y }))
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
              };

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
                      onAddOutAnchor={() => {
                        setNodes((prev) => prev.map((n) => n.id === node.id ? { ...n, conditionOutCount: (n.conditionOutCount ?? 2) + 1 } : n));
                        scheduleRecord("Add out anchor");
                      }}
                      onRotationDragStart={handleRotationDragStart}
                      borderColor={node.borderColor}
                      bgColor={node.bgColor}
                      textColor={node.textColor}
                      hasDocuments={docManager.hasDocuments("node", node.id)}
                      documentPaths={docManager.getDocumentsForEntity("node", node.id).map(d => d.filename)}
                      onDocNavigate={handleOpenDocument}
                    />
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
                    hasDocuments={docManager.hasDocuments("node", node.id)}
                    documentPaths={docManager.getDocumentsForEntity("node", node.id).map(d => d.filename)}
                    onDocNavigate={handleOpenDocument}
                  />
                </React.Fragment>
              );
            })}
            {/* Data line label overlay — rendered above elements for z-order */}
            {showLabels && (
              <svg
                className="absolute pointer-events-none"
                style={{ zIndex: 15, left: world.x, top: world.y, width: world.w, height: world.h }}
                viewBox={`${world.x} ${world.y} ${world.w} ${world.h}`}
              >
                {sortedLines.map((line) => {
                  if (!line.label) return null;
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
                        const svg = (e.target as SVGElement).closest("svg");
                        if (!svg) return;
                        const startT = line.labelPosition;
                        labelLastValidT.current = startT;
                        // Cache element/condition rects for collision
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

                          // Check collision at rawT
                          const rawPt = interpolatePoints(linePoints, rawT);
                          const labelRect = { left: rawPt.x - labelW / 2, top: rawPt.y - 10, width: labelW, height: 18 };
                          const hasOverlap = labelDragNodeRects.current.some(r => rectsOverlap(labelRect, r, 4));

                          if (!hasOverlap) {
                            setConnections(prev => prev.map(c => c.id === lineId ? { ...c, labelPosition: rawT } : c));
                            labelLastValidT.current = rawT;
                            setLabelDragGhost(null);
                          } else {
                            // Binary search for nearest valid T between last valid and raw
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
                  const ghostLine = sortedLines.find(l => l.id === labelDragGhost.lineId);
                  if (!ghostLine?.label) return null;
                  const gpt = interpolatePoints(ghostLine.points, labelDragGhost.rawT);
                  const gw = ghostLine.label.length * 6.5 + 8;
                  return (
                    <g style={{ opacity: 0.35, pointerEvents: "none" }}>
                      <rect x={gpt.x - gw / 2} y={gpt.y - 10} width={gw} height={18} rx={4} fill="white" fillOpacity={0.9} stroke="#e2e8f0" strokeWidth={0.8} />
                      <text x={gpt.x} y={gpt.y + 3} textAnchor="middle" fontSize="11" fontWeight="600" fontFamily="system-ui, sans-serif" fill={ghostLine.color} style={{ pointerEvents: "none", userSelect: "none" }}>{ghostLine.label}</text>
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
            {editingLabel && (() => {
              let editX = 0, editY = 0;
              if (editingLabel.type === "node") {
                const n = nodes.find((nd) => nd.id === editingLabel.id);
                if (n) { editX = n.x; editY = n.y; }
              } else if (editingLabel.type === "layer") {
                const r = regions.find((rg) => rg.id === editingLabel.id);
                if (r) { editX = r.left + 12; editY = r.top + 12; }
              } else if (editingLabel.type === "line") {
                const line = lines.find((l) => l.id === editingLabel.id);
                if (line) {
                  const t = connections.find((c) => c.id === editingLabel.id)?.labelPosition ?? 0.5;
                  // Interpolate along points
                  const pts = line.points;
                  if (pts.length >= 2) {
                    let totalLen = 0;
                    const segs: number[] = [];
                    for (let i = 1; i < pts.length; i++) {
                      const dx = pts[i].x - pts[i-1].x, dy = pts[i].y - pts[i-1].y;
                      segs.push(Math.sqrt(dx*dx + dy*dy));
                      totalLen += segs[i-1];
                    }
                    const target = t * totalLen;
                    let acc = 0;
                    for (let i = 0; i < segs.length; i++) {
                      if (acc + segs[i] >= target) {
                        const f = (target - acc) / segs[i];
                        editX = pts[i].x + (pts[i+1].x - pts[i].x) * f;
                        editY = pts[i].y + (pts[i+1].y - pts[i].y) * f;
                        break;
                      }
                      acc += segs[i];
                    }
                  }
                }
              }
              const doCommit = () => commitLabel(editingLabel, editingLabelValue);
              return (
                <div
                  className="absolute"
                  style={{ left: editX, top: editY, transform: editingLabel.type === "node" ? "translate(-50%, -50%)" : undefined, zIndex: 60 }}
                >
                  <input
                    autoFocus
                    value={editingLabelValue}
                    onChange={(e) => setEditingLabelValue(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    onBlur={doCommit}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                      else if (e.key === "Escape") { setEditingLabelValue(editingLabelBeforeRef.current); e.currentTarget.blur(); }
                    }}
                    maxLength={80}
                    className="text-sm font-semibold bg-white/90 backdrop-blur-sm border-none outline-none px-1.5 py-0.5 rounded shadow-sm ring-1 ring-blue-300 focus:ring-2 focus:ring-blue-400 transition-shadow min-w-[60px]"
                    style={{ width: Math.max(60, editingLabelValue.length * 8 + 16) }}
                    onMouseDown={(e) => e.stopPropagation()}
                  />
                </div>
              );
            })()}
        </Canvas>
        </div>
        </div>
        </>}

      </div>}

      {viewMode === "split" && (
        <div className="flex-1 flex min-h-0">
          <div className="flex-1 overflow-auto bg-[#e8ecf0]">
            {/* Canvas will be wired here in Task 13 */}
            <div className="flex items-center justify-center h-full text-slate-400 text-sm">
              Canvas (split view)
            </div>
          </div>
          <div className="w-px bg-slate-300 flex-shrink-0" />
          <div className="flex-1 min-h-0">
            <MarkdownPane
              filePath={docManager.activeDocPath}
              content={docManager.activeDocContent}
              title={docManager.activeDocPath?.split("/").pop()?.replace(".md", "") ?? ""}
              onChange={docManager.updateContent}
            />
          </div>
        </div>
      )}

      {viewMode === "document" && (
        <div className="flex-1 min-h-0">
          <MarkdownPane
            filePath={docManager.activeDocPath}
            content={docManager.activeDocContent}
            title={docManager.activeDocPath?.split("/").pop()?.replace(".md", "") ?? ""}
            onChange={docManager.updateContent}
          />
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.clientX}
          y={contextMenu.clientY}
          target={contextMenu.target}
          onAddElement={handleAddElement}
          onAddLayer={handleAddLayer}
          onDeleteElement={(nodeId) => { const p = deleteSelection({ type: 'node', id: nodeId }); if (p) setPendingDeletion(p); }}
          onDeleteLayer={(layerId) => { const p = deleteSelection({ type: 'layer', id: layerId }); if (p) setPendingDeletion(p); }}
          onClose={() => setContextMenu(null)}
        />
      )}

      {anchorPopup && (
        <AnchorPopupMenu
          x={anchorPopup.clientX}
          y={anchorPopup.clientY}
          sourceNodeId={anchorPopup.nodeId}
          nodes={nodes}
          onClose={() => setAnchorPopup(null)}
          onConnectToElement={handleAnchorConnectToElement}
          onCreateCondition={handleAnchorCreateCondition}
          onConnectToType={handleAnchorConnectToType}
          anchorEdge={anchorPopup.edge}
          onMenuEnter={handleAnchorMenuEnter}
          onMenuLeave={handleAnchorMenuLeave}
        />
      )}

      {/* Properties Panel */}
      <PropertiesPanel
        selection={selection}
        title={title}
        nodes={nodes}
        connections={connections}
        regions={regions}
        layerDefs={layerDefs}
        levelMap={levelMap}
        onSelectLayer={(layerId) => {
          setSelection({ type: 'layer', id: layerId });
          const region = regions.find((r) => r.id === layerId);
          if (region) scrollToRect({ x: region.left, y: region.top, w: region.width, h: region.height });
        }}
        onSelectNode={(nodeId) => {
          setSelection({ type: 'node', id: nodeId });
          const node = nodes.find((n) => n.id === nodeId);
          if (node) {
            const dims = getNodeDimensions(node);
            scrollToRect({ x: node.x - dims.w / 2, y: node.y - dims.h / 2, w: dims.w, h: dims.h });
          }
        }}
        onUpdateTitle={(t) => { setTitle(t); scheduleRecord("Edit title"); }}
        onUpdateNode={(oldId, updates) => {
          const newId = updates.id;
          setNodes((prev) => prev.map((n) => n.id === oldId ? { ...n, ...updates } : n));
          if (newId && newId !== oldId) {
            setConnections((prev) => prev.map((c) => ({
              ...c,
              from: c.from === oldId ? newId : c.from,
              to: c.to === oldId ? newId : c.to,
            })));
            setMeasuredSizes((prev) => {
              if (!(oldId in prev)) return prev;
              const { [oldId]: val, ...rest } = prev;
              return { ...rest, [newId]: val };
            });
            setSelection({ type: 'node', id: newId });
          }
          const editLabel = nodes.find(n => n.id === oldId)?.shape === "condition" ? "Edit conditional" : "Edit element";
          scheduleRecord(editLabel);
        }}
        onUpdateLayer={(oldId, updates) => {
          const newId = updates.id;
          setLayerDefs((prev) => prev.map((l) => l.id === oldId ? { ...l, ...updates } : l));
          if (newId && newId !== oldId) {
            setNodes((prev) => prev.map((n) => n.layer === oldId ? { ...n, layer: newId } : n));
            setLayerManualSizes((prev) => {
              if (!(oldId in prev)) return prev;
              const { [oldId]: val, ...rest } = prev;
              return { ...rest, [newId]: val };
            });
            setSelection({ type: 'layer', id: newId });
          }
          scheduleRecord("Edit layer");
        }}
        onUpdateConnection={(oldId, updates) => {
          const newId = updates.id;
          // Check if reconnection would break flows
          if (updates.from !== undefined || updates.to !== undefined) {
            const broken = findBrokenFlowsByReconnect(flows, oldId, updates.from as string | undefined, updates.to as string | undefined, connections);
            if (broken.length > 0) {
              setPendingReconnect({ oldId, updates, brokenFlows: broken });
              return;
            }
          }
          setConnections((prev) => prev.map((c) => c.id === oldId ? { ...c, ...updates } : c));
          if (newId && newId !== oldId) {
            // Update flow references for renamed connection
            setFlows((prev) => prev.map((f) => ({
              ...f,
              connectionIds: f.connectionIds.map((cid) => cid === oldId ? newId : cid),
            })));
            setSelection({ type: 'line', id: newId });
          }
          scheduleRecord("Edit connection");
        }}
        lineCurve={lineCurve}
        onUpdateLineCurve={(alg) => { setLineCurve(alg); scheduleRecord("Change line curve"); }}
        flows={flows}
        onSelectFlow={handleSelectFlow}
        onHoverFlow={setHoveredFlowId}
        onUpdateFlow={handleUpdateFlow}
        onDeleteFlow={handleDeleteFlow}
        onCreateFlow={handleCreateFlow}
        onSelectLine={handleSelectLine}
        onCreateLayer={handleCreateLayer}
        onDeleteAnchor={handleDeleteAnchor}
        onSelectType={handleSelectType}
        onHoverType={setHoveredType}
        expandedType={expandedTypeInPanel}
        onExpandType={(type) => { setExpandedTypeInPanel(type); setHoveredType(type); }}
        documents={docManager.documents}
        onOpenDocument={handleOpenDocument}
        onAttachDocument={(entityType, entityId) => {
          setPickerTarget({ type: entityType, id: entityId });
        }}
        onDetachDocument={(docPath, entityType, entityId) => {
          docManager.detachDocument(docPath, entityType, entityId);
        }}
      />
      </div>

      {/* Minimap — overlays viewport from outside the scroll container */}
      {showMinimap && fileExplorer.activeFile && (
        <div className="absolute bottom-16 z-30 transition-[left] duration-200" style={{ left: explorerCollapsed ? 52 : 276 }}>
          <Minimap
            world={world}
            viewportRef={canvasRef}
            regions={regions}
            nodes={displayNodes}
            zoomRef={zoomRef}
          />
        </div>
      )}

      {/* Tooltip — only when labels are hidden (when labels visible, they're on the line itself) */}
      {hoveredLine && !showLabels && (
        <div
          className="fixed z-50 bg-slate-800 text-white text-xs font-semibold px-3 py-1.5 rounded shadow-lg pointer-events-none transform -translate-x-1/2 -translate-y-full"
          style={{ left: hoveredLine.x, top: hoveredLine.y - 15 }}
        >
          {hoveredLine.label}
        </div>
      )}

      {/* Footer status */}
      <DiagramControls
        world={world} patches={patches} zoom={zoom}
      />

      {/* Confirmation popover */}
      {confirmAction && (
        <ConfirmPopover
          message={
            confirmAction.type === "delete-file"
              ? `Delete "${confirmAction.path?.split("/").pop()}"?`
              : confirmAction.type === "delete-folder"
                ? `Delete folder "${confirmAction.path?.split("/").pop()}" and all its contents?`
                : "Discard all unsaved changes?"
          }
          confirmLabel={confirmAction.type === "discard" ? "Discard" : "Delete"}
          confirmColor={confirmAction.type === "discard" ? "blue" : "red"}
          showDontAsk={confirmAction.type === "discard"}
          onDontAskChange={(checked) => {
            if (checked) localStorage.setItem(SKIP_DISCARD_CONFIRM_KEY, "true");
            else localStorage.removeItem(SKIP_DISCARD_CONFIRM_KEY);
          }}
          position={{ x: confirmAction.x, y: confirmAction.y }}
          onConfirm={handleConfirmAction}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      {pendingDeletion && (
        <FlowBreakWarningModal
          description="The following flows will be deleted because their connections would no longer be contiguous:"
          brokenFlows={pendingDeletion.brokenFlows}
          onCancel={() => setPendingDeletion(null)}
          onConfirm={() => { confirmDeletion(pendingDeletion); setPendingDeletion(null); }}
        />
      )}

      {pendingReconnect && (
        <FlowBreakWarningModal
          description="Reconnecting this endpoint will break the contiguity of these flows, which will be deleted:"
          brokenFlows={pendingReconnect.brokenFlows}
          onCancel={() => setPendingReconnect(null)}
          onConfirm={() => {
            const { oldId, updates, brokenFlows } = pendingReconnect;
            const brokenIds = new Set(brokenFlows.map((f) => f.id));
            setConnections((prev) => prev.map((c) => c.id === oldId ? { ...c, ...updates } : c));
            setFlows((prev) => prev.filter((f) => !brokenIds.has(f.id)));
            scheduleRecord("Edit connection");
            setPendingReconnect(null);
          }}
        />
      )}

      {/* Document Picker */}
      {pickerTarget && (
        <DocumentPicker
          allDocPaths={docManager.collectDocPaths(fileExplorer.tree)}
          attachedPaths={docManager.getDocumentsForEntity(pickerTarget.type, pickerTarget.id).map(d => d.filename)}
          onAttach={(path) => {
            docManager.attachDocument(path, pickerTarget.type as "node" | "connection", pickerTarget.id);
          }}
          onCreate={async (path) => {
            const rootHandle = fileExplorer.dirHandleRef.current;
            if (rootHandle) {
              await docManager.createDocument(rootHandle, path);
              docManager.attachDocument(path, pickerTarget.type as "node" | "connection", pickerTarget.id);
            }
          }}
          onClose={() => setPickerTarget(null)}
        />
      )}
    </div>
  );
}
