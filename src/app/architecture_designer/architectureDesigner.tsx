import React, { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo } from "react";
import Link from "next/link";
import Canvas, {
  type CanvasPatch,
  fitToContent,
  getWorldSize,
} from "./components/Canvas";
import Layer from "./components/Layer";
import Element from "./components/Element";
import DataLine, { interpolatePoints, closestT } from "./components/DataLine";
import FlowDots from "./components/FlowDots";
import { getAnchorPosition, getAnchors } from "./utils/anchors";
import { buildObstacles } from "./utils/orthogonalRouter";
import { computePath } from "./utils/pathRouter";
import { getNodeHeight } from "./utils/types";
import type { LineCurveAlgorithm, Selection, FlowDef } from "./utils/types";
import { isItemSelected, toggleItemInSelection } from "./utils/selectionUtils";
import { useSelectionRect } from "./hooks/useSelectionRect";
import PropertiesPanel from "./components/properties/PropertiesPanel";
import { loadDefaults, serializeNodes } from "./utils/persistence";
import { Save, RotateCcw, Undo2, Redo2, Activity, Tag, Map } from "lucide-react";
import { computeRegions } from "./utils/layerBounds";
import { LAYER_PADDING, LAYER_TITLE_OFFSET } from "./utils/constants";
import { useCanvasCoords, VIEWPORT_PADDING } from "./hooks/useCanvasCoords";
import { useDiagramPersistence } from "./hooks/useDiagramPersistence";
import { useViewportPersistence } from "./hooks/useViewportPersistence";
import { useNodeDrag } from "./hooks/useNodeDrag";
import { useLayerDrag } from "./hooks/useLayerDrag";
import { useLayerResize } from "./hooks/useLayerResize";
import { useEndpointDrag } from "./hooks/useEndpointDrag";
import { useLineDrag } from "./hooks/useLineDrag";
import Minimap from "./components/Minimap";
import ContextMenu, { type ContextMenuTarget } from "./components/ContextMenu";
import { useContextMenuActions } from "./hooks/useContextMenuActions";
import { useZoom } from "./hooks/useZoom";
import { useDeletion, type PendingDeletion } from "./hooks/useDeletion";
import { isContiguous, orderConnections, findBrokenFlowsByReconnect } from "./utils/flowUtils";
import { useCanvasEffects } from "./hooks/useCanvasEffects";
import { detectContextMenuTarget } from "./utils/geometry";
import DiagramControls from "./components/DiagramControls";
import ExplorerPanel from "./components/explorer/ExplorerPanel";
import ConfirmPopover from "./components/explorer/ConfirmPopover";
import HistoryPanel from "./components/HistoryPanel";
import { useFileExplorer } from "./hooks/useFileExplorer";
import { loadDiagramFromData } from "./utils/persistence";
import { useActionHistory } from "./hooks/useActionHistory";
import type { DiagramSnapshot } from "./hooks/useActionHistory";

const SKIP_DISCARD_CONFIRM_KEY = "architecture-designer-skip-discard-confirm";

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
  const [patches, setPatches] = useState<CanvasPatch[]>([
    { id: "main", col: 0, row: 0, widthUnits: 1, heightUnits: 1 },
  ]);

  const [explorerCollapsed, setExplorerCollapsed] = useState(false);
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const titleMeasureRef = useRef<HTMLSpanElement>(null);
  const titleBeforeEdit = useRef(title);
  const [editingLabel, setEditingLabel] = useState<{ type: "node" | "layer" | "line"; id: string } | null>(null);
  const [editingLabelValue, setEditingLabelValue] = useState("");
  const editingLabelBeforeRef = useRef("");
  const [titleInputValue, setTitleInputValue] = useState(title);
  const [titleWidth, setTitleWidth] = useState<number | string>("auto");
  const fileExplorer = useFileExplorer();
  const history = useActionHistory();

  // Sort preferences
  const SORT_PREFS_KEY = "architecture-designer-sort-prefs";
  const [sortField, setSortField] = useState<import("./components/explorer/ExplorerPanel").SortField>(() => {
    if (typeof window === "undefined") return "name";
    try {
      const prefs = JSON.parse(localStorage.getItem(SORT_PREFS_KEY) || "{}");
      return prefs.field ?? "name";
    } catch { return "name"; }
  });
  const [sortDirection, setSortDirection] = useState<import("./components/explorer/ExplorerPanel").SortDirection>(() => {
    if (typeof window === "undefined") return "asc";
    try {
      const prefs = JSON.parse(localStorage.getItem(SORT_PREFS_KEY) || "{}");
      return prefs.direction ?? "asc";
    } catch { return "asc"; }
  });
  const [sortGrouping, setSortGrouping] = useState<import("./components/explorer/ExplorerPanel").SortGrouping>(() => {
    if (typeof window === "undefined") return "folders-first";
    try {
      const prefs = JSON.parse(localStorage.getItem(SORT_PREFS_KEY) || "{}");
      return prefs.grouping ?? "folders-first";
    } catch { return "folders-first"; }
  });
  const handleSortChange = useCallback((
    field: import("./components/explorer/ExplorerPanel").SortField,
    direction: import("./components/explorer/ExplorerPanel").SortDirection,
    grouping: import("./components/explorer/ExplorerPanel").SortGrouping,
  ) => {
    setSortField(field);
    setSortDirection(direction);
    setSortGrouping(grouping);
    try {
      localStorage.setItem(SORT_PREFS_KEY, JSON.stringify({ field, direction, grouping }));
    } catch { /* ignore */ }
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

  const applySnapshot = useCallback((snapshot: DiagramSnapshot | null) => {
    if (!snapshot) return;
    isRestoringRef.current = true;
    const asData = {
      title: snapshot.title,
      layers: snapshot.layerDefs,
      nodes: snapshot.nodes,
      connections: snapshot.connections,
      layerManualSizes: snapshot.layerManualSizes,
      lineCurve: snapshot.lineCurve,
    };
    const diagram = loadDiagramFromData(asData);
    setTitle(diagram.title);
    setLayerDefs(diagram.layers);
    setNodes(diagram.nodes);
    setConnections(diagram.connections);
    setLayerManualSizes(diagram.layerManualSizes);
    setLineCurve(diagram.lineCurve);
    setFlows(snapshot.flows ?? []);
    setSelection(null);
    // Clear restoring flag after React processes the state updates
    requestAnimationFrame(() => { isRestoringRef.current = false; });
  }, []);

  const handleUndo = useCallback(() => {
    applySnapshot(history.undo());
  }, [history.undo, applySnapshot]);

  const handleRedo = useCallback(() => {
    applySnapshot(history.redo());
  }, [history.redo, applySnapshot]);

  const handleGoToEntry = useCallback((index: number) => {
    applySnapshot(history.goToEntry(index));
  }, [history.goToEntry, applySnapshot]);

  const handleElementResize = useCallback((id: string, width: number, height: number) => {
    setMeasuredSizes((prev) => {
      const existing = prev[id];
      if (existing && existing.w === width && existing.h === height) return prev;
      return { ...prev, [id]: { w: width, h: height } };
    });
  }, []);

  const getNodeDimensions = useCallback((node: { id: string; w: number }) => {
    const measured = measuredSizes[node.id];
    return {
      w: measured?.w ?? node.w,
      h: measured?.h ?? getNodeHeight(node.w),
    };
  }, [measuredSizes]);

  const canvasRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const prevWorldOriginRef = useRef<{ x: number; y: number } | null>(null);
  const layerShiftsRef = useRef<Record<string, number>>({});
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const connectionsRef = useRef(connections);
  connectionsRef.current = connections;
  const flowsRef = useRef(flows);
  flowsRef.current = flows;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const linesForSelection = useRef<{ id: string; points: { x: number; y: number }[] }[]>([]);
  const regionsRef = useRef<{ id: string; left: number; width: number; top: number; height: number; empty: boolean }[] | null>(null);

  const [zoom, setZoom] = useState(1);
  const [isZooming, setIsZooming] = useState(false);
  const { zoomRef, registerSetZoom, registerSetIsZooming, setZoomTo } = useZoom(canvasRef, worldRef);
  useEffect(() => { registerSetZoom(setZoom); }, [registerSetZoom]);

  // Title input: auto-width from hidden measurer
  useEffect(() => {
    if (titleMeasureRef.current) {
      setTitleWidth(Math.min(400, titleMeasureRef.current.scrollWidth + 4));
    }
  }, [titleInputValue]);

  // Sync title → titleInputValue on external changes (file load, undo)
  useEffect(() => { setTitleInputValue(title); }, [title]);
  useEffect(() => { registerSetIsZooming(setIsZooming); }, [registerSetIsZooming]);

  const { toCanvasCoords, setWorldOffset } = useCanvasCoords(canvasRef, zoomRef);
  const { scrollToRect } = useCanvasEffects(canvasRef, worldRef, zoomRef);

  const { draggingEndpoint, handleLineClick } = useEndpointDrag({
    connections, nodes, measuredSizes, layerShiftsRef, toCanvasCoords, setConnections,
  });

  const { creatingLine, handleAnchorDragStart } = useLineDrag({
    nodes, connections, measuredSizes, layerShiftsRef, toCanvasCoords, setConnections,
    isBlocked: !!draggingEndpoint,
  });

  const { draggingId, elementDragPos, elementDragRawPos, handleDragStart,
    isMultiDrag, multiDragIds, multiDragDelta, multiDragRawDelta } = useNodeDrag({
    nodes, layerShiftsRef, toCanvasCoords,
    isBlocked: !!draggingEndpoint || !!creatingLine,
    setNodes,
    regionsRef,
    getNodeDimensions,
    layerPadding: LAYER_PADDING,
    layerTitleOffset: LAYER_TITLE_OFFSET,
    selection,
  });

  const { layerManualSizes, setLayerManualSizes, resizingLayer, handleLayerResizeStart } = useLayerResize({
    regionsRef, toCanvasCoords,
    isBlocked: !!draggingId || !!draggingEndpoint || !!creatingLine || isMultiDrag,
    initialManualSizes: defaults.current.layerManualSizes,
  });

  const { draggingLayerId, draggingLayerIds, layerDragDelta, layerDragRawDelta, handleLayerDragStart } = useLayerDrag({
    toCanvasCoords,
    isBlocked: !!draggingEndpoint || !!creatingLine || !!draggingId || isMultiDrag,
    setNodes,
    regionsRef,
    setLayerManualSizes,
    selection,
  });

  const { isDirty, setLoadSnapshot } = useDiagramPersistence(
    setTitle, setLayerDefs, setNodes, setConnections, setLayerManualSizes, setLineCurve, setFlows,
    title, layerDefs, nodes, connections, layerManualSizes, lineCurve, flows,
    fileExplorer.activeFile,
    fileExplorer.markDirty,
  );

  const handleLoadFile = useCallback(async (fileName: string) => {
    const data = await fileExplorer.selectFile(fileName);
    if (!data) return;
    const diagramJson = JSON.stringify(data);
    const diagram = loadDiagramFromData(data);
    setTitle(diagram.title);
    setLayerDefs(diagram.layers);
    setNodes(diagram.nodes);
    setConnections(diagram.connections);
    setLayerManualSizes(diagram.layerManualSizes);
    setLineCurve(diagram.lineCurve);
    setFlows(diagram.flows);
    setSelection(null);
    setMeasuredSizes({});
    setPatches([{ id: "main", col: 0, row: 0, widthUnits: 1, heightUnits: 1 }]);
    setLoadSnapshot(diagram.title, diagram.layers, diagram.nodes, diagram.connections, diagram.layerManualSizes, diagram.lineCurve, diagram.flows);
    // Initialize history for this file
    isRestoringRef.current = true;
    await history.initHistory(diagramJson, {
      title: data.title ?? "Untitled",
      layerDefs: data.layers,
      nodes: data.nodes,
      connections: data.connections,
      layerManualSizes: data.layerManualSizes ?? {},
      lineCurve: data.lineCurve ?? "orthogonal",
      flows: data.flows ?? [],
    }, fileExplorer.dirHandleRef.current, fileName);
    requestAnimationFrame(() => { isRestoringRef.current = false; });
  }, [fileExplorer.selectFile, fileExplorer.dirHandleRef, setLoadSnapshot, history.initHistory]);

  const handleSave = useCallback(async () => {
    if (!fileExplorer.activeFile || !isDirty) return;
    const success = await fileExplorer.saveFile(
      fileExplorer.activeFile, title, layerDefs, nodes, connections, layerManualSizes, lineCurve, serializeNodes, flows,
    );
    if (success) {
      setLoadSnapshot(title, layerDefs, nodes, connections, layerManualSizes, lineCurve, flows);
      // Update history checksum to match saved file
      const savedData = { title, layers: layerDefs, nodes: serializeNodes(nodes), connections, layerManualSizes, lineCurve, flows };
      history.onSave(JSON.stringify(savedData));
    }
  }, [fileExplorer.activeFile, fileExplorer.saveFile, isDirty, title, layerDefs, nodes, connections, layerManualSizes, lineCurve, flows, setLoadSnapshot, history.onSave]);

  // Cmd+S / Ctrl+S keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave]);

  // Auto-load last opened file on restore
  useEffect(() => {
    if (fileExplorer.pendingFile) {
      handleLoadFile(fileExplorer.pendingFile);
      fileExplorer.clearPendingFile();
    }
  }, [fileExplorer.pendingFile, fileExplorer.clearPendingFile, handleLoadFile]);

  const handleCreateFile = useCallback(async (parentPath: string = ""): Promise<string | null> => {
    const result = await fileExplorer.createFile(parentPath);
    if (!result) return null;
    const diagram = loadDiagramFromData(result.data);
    setTitle(diagram.title);
    setLayerDefs(diagram.layers);
    setNodes(diagram.nodes);
    setConnections(diagram.connections);
    setLayerManualSizes(diagram.layerManualSizes);
    setLineCurve(diagram.lineCurve);
    setFlows(diagram.flows);
    setSelection(null);
    setMeasuredSizes({});
    setPatches([{ id: "main", col: 0, row: 0, widthUnits: 1, heightUnits: 1 }]);
    setLoadSnapshot(diagram.title, diagram.layers, diagram.nodes, diagram.connections, diagram.layerManualSizes, diagram.lineCurve, diagram.flows);
    // Center canvas for empty diagram
    requestAnimationFrame(() => {
      if (canvasRef.current) {
        const el = canvasRef.current;
        el.scrollTo({
          left: (el.scrollWidth - el.clientWidth) / 2,
          top: (el.scrollHeight - el.clientHeight) / 2,
          behavior: "instant",
        });
      }
    });
    return result.path;
  }, [fileExplorer.createFile, setLoadSnapshot]);

  const handleCreateFolder = useCallback(async (parentPath: string = ""): Promise<string | null> => {
    return fileExplorer.createFolder(parentPath);
  }, [fileExplorer.createFolder]);

  const handleDeleteFile = useCallback((path: string, event: React.MouseEvent) => {
    setConfirmAction({ type: "delete-file", path, x: event.clientX, y: event.clientY });
  }, []);

  const executeDeleteFile = useCallback(async (path: string) => {
    const wasActive = fileExplorer.activeFile === path;
    await fileExplorer.deleteFile(path);
    if (wasActive) {
      const defs = loadDefaults();
      setTitle(defs.title);
      setLayerDefs(defs.layers);
      setNodes(defs.nodes);
      setConnections(defs.connections);
      setLayerManualSizes(defs.layerManualSizes);
      setLineCurve(defs.lineCurve);
      setFlows(defs.flows);
      setSelection(null);
      setMeasuredSizes({});
    }
  }, [fileExplorer.activeFile, fileExplorer.deleteFile]);

  const handleDeleteFolder = useCallback((path: string, event: React.MouseEvent) => {
    setConfirmAction({ type: "delete-folder", path, x: event.clientX, y: event.clientY });
  }, []);

  const handleRenameFile = useCallback(async (oldPath: string, newName: string) => {
    await fileExplorer.renameFile(oldPath, newName);
  }, [fileExplorer.renameFile]);

  const handleRenameFolder = useCallback(async (oldPath: string, newName: string) => {
    await fileExplorer.renameFolder(oldPath, newName);
  }, [fileExplorer.renameFolder]);

  const handleDuplicateFile = useCallback(async (path: string) => {
    const result = await fileExplorer.duplicateFile(path);
    if (!result) return;
    const diagram = loadDiagramFromData(result.data);
    setTitle(diagram.title);
    setLayerDefs(diagram.layers);
    setNodes(diagram.nodes);
    setConnections(diagram.connections);
    setLayerManualSizes(diagram.layerManualSizes);
    setLineCurve(diagram.lineCurve);
    setFlows(diagram.flows);
    setSelection(null);
    setMeasuredSizes({});
    setPatches([{ id: "main", col: 0, row: 0, widthUnits: 1, heightUnits: 1 }]);
    setLoadSnapshot(diagram.title, diagram.layers, diagram.nodes, diagram.connections, diagram.layerManualSizes, diagram.lineCurve, diagram.flows);
  }, [fileExplorer.duplicateFile, setLoadSnapshot]);

  const handleMoveItem = useCallback(async (sourcePath: string, targetFolderPath: string) => {
    await fileExplorer.moveItem(sourcePath, targetFolderPath);
  }, [fileExplorer.moveItem]);

  const executeDiscard = useCallback(async () => {
    if (!fileExplorer.activeFile) return;

    // Try navigating history back to the last saved state
    const savedSnapshot = history.goToSaved();
    if (savedSnapshot) {
      isRestoringRef.current = true;
      const asData = {
        title: savedSnapshot.title,
        layers: savedSnapshot.layerDefs,
        nodes: savedSnapshot.nodes,
        connections: savedSnapshot.connections,
        layerManualSizes: savedSnapshot.layerManualSizes,
        lineCurve: savedSnapshot.lineCurve,
        flows: savedSnapshot.flows,
      };
      const diagram = loadDiagramFromData(asData);
      setTitle(diagram.title);
      setLayerDefs(diagram.layers);
      setNodes(diagram.nodes);
      setConnections(diagram.connections);
      setLayerManualSizes(diagram.layerManualSizes);
      setLineCurve(diagram.lineCurve);
      setFlows(diagram.flows);
      setSelection(null);
      setMeasuredSizes({});
      setPatches([{ id: "main", col: 0, row: 0, widthUnits: 1, heightUnits: 1 }]);
      setLoadSnapshot(diagram.title, diagram.layers, diagram.nodes, diagram.connections, diagram.layerManualSizes, diagram.lineCurve, diagram.flows);
      // Clear draft since we're back to saved state
      fileExplorer.discardFile(fileExplorer.activeFile);
      requestAnimationFrame(() => { isRestoringRef.current = false; });
      return;
    }

    // Fallback: saved state was pruned from history, reload from disk
    const data = await fileExplorer.discardFile(fileExplorer.activeFile);
    if (!data) return;
    const diagram = loadDiagramFromData(data);
    setTitle(diagram.title);
    setLayerDefs(diagram.layers);
    setNodes(diagram.nodes);
    setConnections(diagram.connections);
    setLayerManualSizes(diagram.layerManualSizes);
    setLineCurve(diagram.lineCurve);
    setFlows(diagram.flows);
    setSelection(null);
    setMeasuredSizes({});
    setPatches([{ id: "main", col: 0, row: 0, widthUnits: 1, heightUnits: 1 }]);
    setLoadSnapshot(diagram.title, diagram.layers, diagram.nodes, diagram.connections, diagram.layerManualSizes, diagram.lineCurve, diagram.flows);
  }, [fileExplorer.activeFile, fileExplorer.discardFile, setLoadSnapshot, history.goToSaved]);

  const handleDiscard = useCallback((event: React.MouseEvent) => {
    if (!fileExplorer.activeFile || !isDirty) return;
    // Check "don't ask again" preference
    if (typeof window !== "undefined" && localStorage.getItem(SKIP_DISCARD_CONFIRM_KEY) === "true") {
      executeDiscard();
      return;
    }
    setConfirmAction({ type: "discard", x: event.clientX, y: event.clientY });
  }, [fileExplorer.activeFile, isDirty, executeDiscard]);

  const handleConfirmAction = useCallback(async () => {
    if (!confirmAction) return;
    if (confirmAction.type === "delete-file" && confirmAction.path) {
      await executeDeleteFile(confirmAction.path);
    } else if (confirmAction.type === "delete-folder" && confirmAction.path) {
      await fileExplorer.deleteFolder(confirmAction.path);
    } else if (confirmAction.type === "discard") {
      await executeDiscard();
    }
    setConfirmAction(null);
  }, [confirmAction, executeDeleteFile, fileExplorer.deleteFolder, executeDiscard]);

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
  let flowCounter = useRef(0);
  const handleCreateFlow = useCallback((connectionIds: string[]) => {
    if (!isContiguous(connectionIds, connectionsRef.current)) {
      return;
    }
    const ordered = orderConnections(connectionIds, connectionsRef.current);
    const id = `flow-${++flowCounter.current}`;
    const existingNames = flowsRef.current.map((f) => f.name);
    let n = flowsRef.current.length + 1;
    let name = `Flow ${n}`;
    while (existingNames.includes(name)) { n++; name = `Flow ${n}`; }
    const newFlow: FlowDef = { id, name, connectionIds: ordered };
    setFlows((prev) => [...prev, newFlow]);
    setSelection({ type: 'flow', id });
    scheduleRecord("Create flow");
  }, [scheduleRecord]);

  const handleSelectFlow = useCallback((flowId: string) => {
    setSelection({ type: 'flow', id: flowId });
  }, []);

  const handleUpdateFlow = useCallback((oldId: string, updates: Partial<{ id: string; name: string }>) => {
    const newId = updates.id;
    setFlows((prev) => prev.map((f) => f.id === oldId ? { ...f, ...updates } : f));
    if (newId && newId !== oldId) {
      setSelection({ type: 'flow', id: newId });
    }
    scheduleRecord("Edit flow");
  }, [scheduleRecord]);

  const handleDeleteFlow = useCallback((flowId: string) => {
    setFlows((prev) => prev.filter((f) => f.id !== flowId));
    setSelection(null);
    scheduleRecord("Delete flow");
  }, [scheduleRecord]);

  const handleSelectLine = useCallback((lineId: string) => {
    setSelection({ type: 'line', id: lineId });
  }, []);

  // Flow dimming: compute which items are "included" in the selected flow
  const flowDimSets = useMemo(() => {
    if (selection?.type !== 'flow') return null;
    const flow = flows.find((f) => f.id === selection.id);
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
  }, [selection, flows, connections, nodes]);

  // Compute layer bounds from contained nodes
  const naturalBounds = computeRegions(layerDefs, nodes, getNodeDimensions, layerManualSizes, draggingId, elementDragPos, multiDragIds, multiDragDelta);

  // No render-time collision resolution — layer positions are explicit.
  // Overlap is only resolved on drop (in useLayerDrag).
  const regions = naturalBounds;
  const layerShifts: Record<string, number> = {};
  for (const r of regions) {
    layerShifts[r.id] = 0;
  }

  layerShiftsRef.current = layerShifts;
  regionsRef.current = regions;

  const { selectionRect, handleCanvasMouseDown, handleSelectionRectStart, cancelSelectionRect } = useSelectionRect({
    toCanvasCoords,
    isBlocked: !!draggingId || !!draggingLayerId || !!draggingEndpoint || !!creatingLine || !!resizingLayer || isMultiDrag,
    nodes, regions, lines: linesForSelection.current, getNodeDimensions, setSelection,
    pendingSelectionRef: pendingSelection,
  });

  // Selection keyboard + pending selection resolve
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        cancelSelectionRect();
        setSelection(null);
        setContextMenu(null);
      }

      if ((e.key === "Delete" || e.key === "Backspace") && selectionRef.current) {
        const tag = (document.activeElement as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || (document.activeElement as HTMLElement)?.isContentEditable) return;
        e.preventDefault();
        const pending = deleteSelection(selectionRef.current);
        if (pending) setPendingDeletion(pending);
      }

      // Create Flow (Cmd+G)
      if ((e.metaKey || e.ctrlKey) && e.key === "g") {
        const tag = (document.activeElement as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || (document.activeElement as HTMLElement)?.isContentEditable) return;
        e.preventDefault();
        const sel = selectionRef.current;
        if (sel?.type === "multi-line") {
          handleCreateFlow(sel.ids);
        }
      }

      // Undo/Redo
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        const tag = (document.activeElement as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || (document.activeElement as HTMLElement)?.isContentEditable) return;
        e.preventDefault();
        handleUndo();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && e.shiftKey) {
        const tag = (document.activeElement as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || (document.activeElement as HTMLElement)?.isContentEditable) return;
        e.preventDefault();
        handleRedo();
      }
    };
    const onMouseUp = (e: MouseEvent) => {
      const p = pendingSelection.current;
      if (p) {
        const dx = e.clientX - p.x;
        const dy = e.clientY - p.y;
        if (dx * dx + dy * dy < 25) {
          if (e.metaKey || e.ctrlKey) {
            setSelection((prev) => toggleItemInSelection(prev, { type: p.type, id: p.id }, nodesRef.current));
          } else {
            setSelection({ type: p.type, id: p.id });
          }
        }
        pendingSelection.current = null;
      }
    };
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [cancelSelectionRect, handleUndo, handleRedo]);

  // ── Drag-end watchers for history recording ──
  const prevDraggingId = useRef<string | null>(null);
  useEffect(() => {
    if (prevDraggingId.current && !draggingId) scheduleRecord("Move element");
    prevDraggingId.current = draggingId;
  }, [draggingId, scheduleRecord]);

  const prevMultiDrag = useRef(false);
  useEffect(() => {
    if (prevMultiDrag.current && !isMultiDrag) scheduleRecord("Move elements");
    prevMultiDrag.current = isMultiDrag;
  }, [isMultiDrag, scheduleRecord]);

  const prevDraggingLayerId = useRef<string | null>(null);
  useEffect(() => {
    if (prevDraggingLayerId.current && !draggingLayerId) scheduleRecord("Move layer");
    prevDraggingLayerId.current = draggingLayerId;
  }, [draggingLayerId, scheduleRecord]);

  const prevResizingLayer = useRef<unknown>(null);
  useEffect(() => {
    if (prevResizingLayer.current && !resizingLayer) scheduleRecord("Resize layer");
    prevResizingLayer.current = resizingLayer;
  }, [resizingLayer, scheduleRecord]);

  const prevDraggingEndpoint = useRef<unknown>(null);
  useEffect(() => {
    if (prevDraggingEndpoint.current && !draggingEndpoint) scheduleRecord("Move connection endpoint");
    prevDraggingEndpoint.current = draggingEndpoint;
  }, [draggingEndpoint, scheduleRecord]);

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

  // Display nodes with layer shifts applied
  const displayNodes = nodes.map((n) => {
    const shift = layerShifts[n.layer] || 0;
    return shift !== 0 ? { ...n, y: n.y + shift } : n;
  });

  // Compute lines
  const nodeMap = Object.fromEntries(displayNodes.map((n) => [n.id, n]));
  const allNodeRects = displayNodes.map((n) => {
    const dims = getNodeDimensions(n);
    return { id: n.id, x: n.x, y: n.y, w: dims.w, h: dims.h };
  });

  const lines = connections.map((conn) => {
    const fromNode = nodeMap[conn.from];
    const toNode = nodeMap[conn.to];
    const fromDims = getNodeDimensions(fromNode);
    const toDims = getNodeDimensions(toNode);
    const fromPos = getAnchorPosition(conn.fromAnchor, fromNode.x, fromNode.y, fromDims.w, fromDims.h);
    const toPos = getAnchorPosition(conn.toAnchor, toNode.x, toNode.y, toDims.w, toDims.h);
    const obstacles = buildObstacles(allNodeRects, [conn.from, conn.to]);
    const { path, points } = computePath(lineCurve, fromPos, toPos, conn.fromAnchor, conn.toAnchor, obstacles);
    return {
      id: conn.id,
      path,
      points,
      color: conn.color,
      label: conn.label,
      biDirectional: conn.biDirectional,
      flowDuration: conn.flowDuration,
      labelPosition: conn.labelPosition ?? 0.5,
      fromPos,
      toPos,
    };
  });

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
        ? getAnchorPosition(conn.toAnchor, toNode.x, toNode.y, toDims.w, toDims.h)
        : getAnchorPosition(conn.fromAnchor, fromNode.x, fromNode.y, fromDims.w, fromDims.h);
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
    scheduleRecord,
  );

  return (
    <div className="w-full h-screen bg-[#f4f7f9] font-sans flex flex-col overflow-hidden relative">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2 bg-white border-b border-slate-200 z-20">
        <Link href="/" className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors" title="Back">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>
        </Link>

        <div className="h-5 w-px bg-slate-200" />

        {/* Editable title — invisible input, click to edit, blur to save */}
        <div className="relative flex items-center max-w-[400px]">
          <span
            ref={titleMeasureRef}
            className="invisible absolute whitespace-pre text-sm font-semibold px-0.5"
            aria-hidden="true"
          >
            {titleInputValue || " "}
          </span>
          <input
            ref={titleInputRef}
            value={titleInputValue}
            onChange={(e) => setTitleInputValue(e.target.value)}
            onFocus={(e) => { titleBeforeEdit.current = title; e.target.select(); }}
            onBlur={() => {
              const v = titleInputValue.trim();
              if (v && v !== title) { setTitle(v); scheduleRecord("Edit title"); }
              else { setTitleInputValue(title); }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              else if (e.key === "Escape") { setTitleInputValue(titleBeforeEdit.current); e.currentTarget.blur(); }
            }}
            maxLength={80}
            className="text-sm font-semibold text-slate-800 bg-transparent border-none outline-none px-0.5 rounded hover:bg-slate-50 focus:bg-slate-50 focus:ring-1 focus:ring-blue-200 transition-colors cursor-pointer focus:cursor-text truncate"
            style={{ width: titleWidth }}
            title="Click to edit title"
          />
        </div>

        {isDirty && (
          <span className="w-2 h-2 rounded-full bg-orange-400 flex-shrink-0" title="Unsaved changes" />
        )}

        <div className="flex-1" />

        {/* View toggles */}
        <div className="flex items-center gap-0.5 bg-slate-50 rounded-lg p-0.5 border border-slate-100">
          <button
            onClick={() => setIsLive(!isLive)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              isLive ? "bg-white shadow-sm text-blue-600 border border-slate-200" : "text-slate-500 hover:text-slate-700 border border-transparent"
            }`}
            title="Toggle live data flow animation"
          >
            <Activity size={13} />
            <span className="hidden xl:inline">Live</span>
          </button>
          <button
            onClick={() => setShowLabels(!showLabels)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              showLabels ? "bg-white shadow-sm text-blue-600 border border-slate-200" : "text-slate-500 hover:text-slate-700 border border-transparent"
            }`}
            title="Toggle data line labels"
          >
            <Tag size={13} />
            <span className="hidden xl:inline">Labels</span>
          </button>
        </div>
        <button
          onClick={() => setShowMinimap(!showMinimap)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all border ${
            showMinimap ? "bg-white shadow-sm text-blue-600 border-slate-200" : "bg-slate-50 text-slate-500 hover:text-slate-700 border-slate-100"
          }`}
          title="Toggle minimap"
        >
            <Map size={13} />
            <span className="hidden xl:inline">Minimap</span>
        </button>

        {/* Zoom controls */}
        <div className="flex items-center gap-1 bg-slate-50 rounded-lg p-0.5 border border-slate-100">
          <button
            onClick={() => setZoomTo(Math.max(0.1, zoom - 0.25))}
            className="px-1.5 py-1 rounded-md text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-white transition-all"
            title="Zoom out"
          >
            &minus;
          </button>
          <button
            onClick={() => setZoomTo(1)}
            className={`px-2 py-1 rounded-md text-xs font-semibold transition-all ${
              Math.abs(zoom - 1) < 0.01 ? "text-blue-600 bg-white shadow-sm border border-slate-200" : "text-slate-600 hover:text-blue-600 hover:bg-white border border-transparent"
            }`}
            title="Reset zoom to 100%"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={() => setZoomTo(Math.min(3, zoom + 0.25))}
            className="px-1.5 py-1 rounded-md text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-white transition-all"
            title="Zoom in"
          >
            +
          </button>
        </div>

        <div className="h-5 w-px bg-slate-200" />

        {/* Discard / Save */}
        <button
          onClick={(e) => handleDiscard(e)}
          disabled={!fileExplorer.activeFile || !isDirty}
          className={`p-1.5 rounded-md transition-colors ${
            fileExplorer.activeFile && isDirty
              ? "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              : "text-slate-300 cursor-not-allowed"
          }`}
          title="Discard changes"
        >
          <RotateCcw size={16} />
        </button>
        <button
          onClick={handleSave}
          disabled={!fileExplorer.activeFile || !isDirty}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
            fileExplorer.activeFile && isDirty
              ? "bg-blue-600 hover:bg-blue-700 text-white"
              : "bg-slate-100 text-slate-300 cursor-not-allowed"
          }`}
          title="Save (⌘S)"
        >
          <Save size={14} />
          Save
        </button>
      </div>

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
          sortField={sortField}
          sortDirection={sortDirection}
          sortGrouping={sortGrouping}
          onSortChange={handleSortChange}
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
      <div
        ref={canvasRef}
        className={`flex-1 overflow-auto bg-[#e8ecf0] relative ${draggingId || draggingLayerId || isMultiDrag ? "cursor-grabbing" : ""}`}
        style={{ scrollbarWidth: 'none' }}
        onMouseDown={(e) => { handleCanvasMouseDown(e); }}
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
              const dimmed = (draggingLayerIds.length > 0 && !isThisLayerDragged) || !!draggingId || isMultiDrag || (flowDimSets != null && !flowDimSets.layerIds.has(r.id));
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
              {[...lines].sort((a, b) => {
                const aFront = (a.id === hoveredLine?.id || isItemSelected(selection, 'line', a.id)) ? 1 : 0;
                const bFront = (b.id === hoveredLine?.id || isItemSelected(selection, 'line', b.id)) ? 1 : 0;
                return aFront - bFront;
              }).map((line) => {
                const isBeingDragged = draggingEndpoint?.connectionId === line.id;
                const dimmed = (!!draggingEndpoint && !isBeingDragged) || !!creatingLine || !!draggingId || !!draggingLayerId || isMultiDrag || (flowDimSets != null && !flowDimSets.connIds.has(line.id));
                return (
                  <DataLine
                    key={line.id}
                    {...line}
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
                      setConnections((prev) => prev.map((c) => c.id === connId ? { ...c, labelPosition: t } : c));
                    }}
                    onLabelDragEnd={() => {
                      scheduleRecord("Move label");
                    }}
                    onDoubleClick={(connId) => {
                      const conn = connections.find((c) => c.id === connId);
                      if (conn) {
                        setEditingLabel({ type: "line", id: connId });
                        setEditingLabelValue(conn.label);
                        editingLabelBeforeRef.current = conn.label;
                      }
                    }}
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
              const anchors = getAnchors(node.x, node.y, dims.w, dims.h);
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
                    onDragStart={(id, e) => { e.stopPropagation(); if (e.metaKey || e.ctrlKey) { pendingSelection.current = { type: 'node', id, x: e.clientX, y: e.clientY }; handleSelectionRectStart(e); return; } pendingSelection.current = { type: 'node', id, x: e.clientX, y: e.clientY }; handleDragStart(id, e); }}
                    isDragging={isThisDragged}
                    isSelected={isItemSelected(selection, 'node', node.id)}
                    showAnchors={showAnchors}
                    highlightedAnchor={isSnapTarget ? (draggingEndpoint?.snappedAnchor?.anchorId ?? creatingLine?.snappedAnchor?.anchorId ?? null) : null}
                    anchors={anchors}
                    onAnchorDragStart={handleAnchorDragStart}
                    measuredHeight={dims.h}
                    onResize={handleElementResize}
                    onMouseEnter={() => setHoveredNodeId(node.id)}
                    onMouseLeave={() => setHoveredNodeId(null)}
                    dimmed={dimmed}
                    onDoubleClick={(nodeId) => {
                      const n = nodes.find((nd) => nd.id === nodeId);
                      if (n) {
                        setEditingLabel({ type: "node", id: nodeId });
                        setEditingLabelValue(n.label);
                        editingLabelBeforeRef.current = n.label;
                      }
                    }}
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
                {[...lines].sort((a, b) => {
                  const aFront = (a.id === hoveredLine?.id || isItemSelected(selection, 'line', a.id)) ? 1 : 0;
                  const bFront = (b.id === hoveredLine?.id || isItemSelected(selection, 'line', b.id)) ? 1 : 0;
                  return aFront - bFront;
                }).map((line) => {
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
                        const onMove = (ev: MouseEvent) => {
                          const pt = svg.createSVGPoint();
                          pt.x = ev.clientX;
                          pt.y = ev.clientY;
                          const svgPt = pt.matrixTransform(svg.getScreenCTM()!.inverse());
                          const newT = closestT(line.points, svgPt.x, svgPt.y);
                          setConnections((prev) => prev.map((c) => c.id === line.id ? { ...c, labelPosition: Math.max(0.05, Math.min(0.95, newT)) } : c));
                        };
                        const onUp = () => {
                          scheduleRecord("Move label");
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
              const commitLabel = () => {
                const v = editingLabelValue.trim();
                if (v && v !== editingLabelBeforeRef.current) {
                  if (editingLabel.type === "node") {
                    setNodes((prev) => prev.map((n) => n.id === editingLabel.id ? { ...n, label: v } : n));
                  } else if (editingLabel.type === "layer") {
                    setLayerDefs((prev) => prev.map((l) => l.id === editingLabel.id ? { ...l, title: v } : l));
                  } else if (editingLabel.type === "line") {
                    setConnections((prev) => prev.map((c) => c.id === editingLabel.id ? { ...c, label: v } : c));
                  }
                  scheduleRecord(`Edit ${editingLabel.type} label`);
                }
                setEditingLabel(null);
              };
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
                    onBlur={commitLabel}
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

      </div>

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

      {/* Properties Panel */}
      <PropertiesPanel
        selection={selection}
        title={title}
        nodes={nodes}
        connections={connections}
        regions={regions}
        layerDefs={layerDefs}
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
          scheduleRecord("Edit element");
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
        onUpdateFlow={handleUpdateFlow}
        onDeleteFlow={handleDeleteFlow}
        onCreateFlow={handleCreateFlow}
        onSelectLine={handleSelectLine}
      />
      </div>

      {/* Minimap — overlays viewport from outside the scroll container */}
      {showMinimap && (
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

      {/* Flow break warning modal (deletion) */}
      {pendingDeletion && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/20" onClick={() => setPendingDeletion(null)}>
          <div className="bg-white rounded-lg shadow-xl p-5 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-slate-800 mb-2">This will break {pendingDeletion.brokenFlows.length === 1 ? "a flow" : "flows"}</h3>
            <p className="text-xs text-slate-600 mb-3">The following flows will be deleted because their connections would no longer be contiguous:</p>
            <ul className="mb-4 space-y-1">
              {pendingDeletion.brokenFlows.map((f) => (
                <li key={f.id} className="text-xs text-slate-700 font-medium bg-slate-50 rounded px-2 py-1">{f.name}</li>
              ))}
            </ul>
            <div className="flex justify-end gap-2">
              <button className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer" onClick={() => setPendingDeletion(null)}>Cancel</button>
              <button className="px-3 py-1.5 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded-md transition-colors cursor-pointer" onClick={() => { confirmDeletion(pendingDeletion); setPendingDeletion(null); }}>Continue</button>
            </div>
          </div>
        </div>
      )}

      {/* Flow break warning modal (reconnection) */}
      {pendingReconnect && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/20" onClick={() => setPendingReconnect(null)}>
          <div className="bg-white rounded-lg shadow-xl p-5 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-slate-800 mb-2">This will break {pendingReconnect.brokenFlows.length === 1 ? "a flow" : "flows"}</h3>
            <p className="text-xs text-slate-600 mb-3">Reconnecting this endpoint will break the contiguity of these flows, which will be deleted:</p>
            <ul className="mb-4 space-y-1">
              {pendingReconnect.brokenFlows.map((f) => (
                <li key={f.id} className="text-xs text-slate-700 font-medium bg-slate-50 rounded px-2 py-1">{f.name}</li>
              ))}
            </ul>
            <div className="flex justify-end gap-2">
              <button className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer" onClick={() => setPendingReconnect(null)}>Cancel</button>
              <button className="px-3 py-1.5 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded-md transition-colors cursor-pointer" onClick={() => {
                const { oldId, updates, brokenFlows } = pendingReconnect;
                const brokenIds = new Set(brokenFlows.map((f) => f.id));
                setConnections((prev) => prev.map((c) => c.id === oldId ? { ...c, ...updates } : c));
                setFlows((prev) => prev.filter((f) => !brokenIds.has(f.id)));
                scheduleRecord("Edit connection");
                setPendingReconnect(null);
              }}>Continue</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
