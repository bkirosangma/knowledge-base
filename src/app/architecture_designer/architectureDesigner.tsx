import React, { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo } from "react";
import Link from "next/link";
import Canvas, {
  type CanvasPatch,
  fitToContent,
  getWorldSize,
} from "./components/Canvas";
import Layer from "./components/Layer";
import Element from "./components/Element";
import DataLine from "./components/DataLine";
import FlowDots from "./components/FlowDots";
import { getAnchorPosition, getAnchors } from "./utils/anchors";
import { buildObstacles } from "./utils/orthogonalRouter";
import { computePath } from "./utils/pathRouter";
import { getNodeHeight } from "./utils/types";
import type { LineCurveAlgorithm, Selection } from "./utils/types";
import { isItemSelected, toggleItemInSelection } from "./utils/selectionUtils";
import { useSelectionRect } from "./hooks/useSelectionRect";
import PropertiesPanel from "./components/properties/PropertiesPanel";
import { loadDefaults, serializeNodes } from "./utils/persistence";
import { Save, RotateCcw, Undo2, Redo2 } from "lucide-react";
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
import { useDeletion } from "./hooks/useDeletion";
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
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const linesForSelection = useRef<{ id: string; points: { x: number; y: number }[] }[]>([]);
  const regionsRef = useRef<{ id: string; left: number; width: number; top: number; height: number; empty: boolean }[] | null>(null);

  const [zoom, setZoom] = useState(1);
  const [isZooming, setIsZooming] = useState(false);
  const { zoomRef, registerSetZoom, registerSetIsZooming } = useZoom(canvasRef, worldRef);
  useEffect(() => { registerSetZoom(setZoom); }, [registerSetZoom]);
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
    setTitle, setLayerDefs, setNodes, setConnections, setLayerManualSizes, setLineCurve,
    title, layerDefs, nodes, connections, layerManualSizes, lineCurve,
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
    setSelection(null);
    setMeasuredSizes({});
    setPatches([{ id: "main", col: 0, row: 0, widthUnits: 1, heightUnits: 1 }]);
    setLoadSnapshot(diagram.title, diagram.layers, diagram.nodes, diagram.connections, diagram.layerManualSizes, diagram.lineCurve);
    // Initialize history for this file
    isRestoringRef.current = true;
    await history.initHistory(diagramJson, {
      title: data.title ?? "Untitled",
      layerDefs: data.layers,
      nodes: data.nodes,
      connections: data.connections,
      layerManualSizes: data.layerManualSizes ?? {},
      lineCurve: data.lineCurve ?? "orthogonal",
    }, fileExplorer.dirHandleRef.current, fileName);
    requestAnimationFrame(() => { isRestoringRef.current = false; });
  }, [fileExplorer.selectFile, fileExplorer.dirHandleRef, setLoadSnapshot, history.initHistory]);

  const handleSave = useCallback(async () => {
    if (!fileExplorer.activeFile || !isDirty) return;
    const success = await fileExplorer.saveFile(
      fileExplorer.activeFile, title, layerDefs, nodes, connections, layerManualSizes, lineCurve, serializeNodes,
    );
    if (success) {
      setLoadSnapshot(title, layerDefs, nodes, connections, layerManualSizes, lineCurve);
      // Update history checksum to match saved file
      const savedData = { title, layers: layerDefs, nodes: serializeNodes(nodes), connections, layerManualSizes, lineCurve };
      history.onSave(JSON.stringify(savedData));
    }
  }, [fileExplorer.activeFile, fileExplorer.saveFile, isDirty, title, layerDefs, nodes, connections, layerManualSizes, lineCurve, setLoadSnapshot, history.onSave]);

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
    setSelection(null);
    setMeasuredSizes({});
    setPatches([{ id: "main", col: 0, row: 0, widthUnits: 1, heightUnits: 1 }]);
    setLoadSnapshot(diagram.title, diagram.layers, diagram.nodes, diagram.connections, diagram.layerManualSizes, diagram.lineCurve);
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
    setSelection(null);
    setMeasuredSizes({});
    setPatches([{ id: "main", col: 0, row: 0, widthUnits: 1, heightUnits: 1 }]);
    setLoadSnapshot(diagram.title, diagram.layers, diagram.nodes, diagram.connections, diagram.layerManualSizes, diagram.lineCurve);
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
      };
      const diagram = loadDiagramFromData(asData);
      setTitle(diagram.title);
      setLayerDefs(diagram.layers);
      setNodes(diagram.nodes);
      setConnections(diagram.connections);
      setLayerManualSizes(diagram.layerManualSizes);
      setLineCurve(diagram.lineCurve);
      setSelection(null);
      setMeasuredSizes({});
      setPatches([{ id: "main", col: 0, row: 0, widthUnits: 1, heightUnits: 1 }]);
      setLoadSnapshot(diagram.title, diagram.layers, diagram.nodes, diagram.connections, diagram.layerManualSizes, diagram.lineCurve);
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
    setSelection(null);
    setMeasuredSizes({});
    setPatches([{ id: "main", col: 0, row: 0, widthUnits: 1, heightUnits: 1 }]);
    setLoadSnapshot(diagram.title, diagram.layers, diagram.nodes, diagram.connections, diagram.layerManualSizes, diagram.lineCurve);
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

  const { deleteNodes, deleteLayer, deleteSelection } = useDeletion(nodesRef, {
    setNodes, setConnections, setLayerDefs, setLayerManualSizes, setMeasuredSizes, setSelection,
  }, scheduleRecord);

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
        deleteSelection(selectionRef.current);
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
      <div className="flex-shrink-0 flex items-center gap-4 px-8 pt-6 pb-4 bg-white border-b border-slate-200 z-20">
        <Link href="/" className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-lg text-sm transition-colors">
          &larr; Back
        </Link>
        <h1 className="text-2xl font-semibold text-slate-800 tracking-tight flex-1">
          {title}
        </h1>
        <button
          onClick={(e) => handleDiscard(e)}
          disabled={!fileExplorer.activeFile || !isDirty}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            fileExplorer.activeFile && isDirty
              ? "bg-slate-200 hover:bg-slate-300 text-slate-700"
              : "bg-slate-100 text-slate-400 cursor-not-allowed"
          }`}
          title="Discard changes"
        >
          <RotateCcw size={16} />
          Discard
        </button>
        <button
          onClick={handleSave}
          disabled={!fileExplorer.activeFile || !isDirty}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            fileExplorer.activeFile && isDirty
              ? "bg-blue-600 hover:bg-blue-700 text-white"
              : "bg-slate-100 text-slate-400 cursor-not-allowed"
          }`}
          title="Save (⌘S)"
        >
          <Save size={16} />
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
          onToggleCollapse={() => setHistoryCollapsed((c) => !c)}
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
              const dimmed = (draggingLayerIds.length > 0 && !isThisLayerDragged) || !!draggingId || isMultiDrag;
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
              {lines.map((line) => {
                const isBeingDragged = draggingEndpoint?.connectionId === line.id;
                const dimmed = (!!draggingEndpoint && !isBeingDragged) || !!creatingLine || !!draggingId || !!draggingLayerId || isMultiDrag;
                return (
                  <DataLine
                    key={line.id}
                    {...line}
                    isLive={isLive}
                    isHovered={hoveredLine?.id === line.id}
                    isDraggingEndpoint={isBeingDragged}
                    isSelected={isItemSelected(selection, 'line', line.id)}
                    dimmed={dimmed}
                    onHoverStart={(id, label, x, y) => setHoveredLine({ id, label, x, y })}
                    onHoverMove={(id, x, y) =>
                      setHoveredLine((prev) => (prev?.id === id ? { ...prev, x, y } : prev))
                    }
                    onHoverEnd={() => setHoveredLine(null)}
                    onLineClick={(id, e) => { pendingSelection.current = { type: 'line', id, x: e.clientX, y: e.clientY }; handleLineClick(id, e); }}
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
                    <Element id={`${node.id}-ghost`} label={node.label} sub={node.sub} icon={node.icon} x={elementDragRawPos.x} y={elementDragRawPos.y} w={node.w} showLabels={showLabels} dimmed measuredHeight={dims.h} />
                  )}
                  {isThisMultiDragged && multiDragRawDelta && (
                    <Element id={`${node.id}-ghost`} label={node.label} sub={node.sub} icon={node.icon} x={node.x + multiDragRawDelta.dx} y={node.y + multiDragRawDelta.dy} w={node.w} showLabels={showLabels} dimmed measuredHeight={dims.h} />
                  )}
                  <Element
                    {...node}
                    x={visualX}
                    y={visualY}
                    showLabels={showLabels}
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
                  />
                </React.Fragment>
              );
            })}
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
          onDeleteElement={(nodeId) => deleteNodes([nodeId])}
          onDeleteLayer={(layerId) => deleteLayer(layerId)}
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
          setConnections((prev) => prev.map((c) => c.id === oldId ? { ...c, ...updates } : c));
          if (newId && newId !== oldId) {
            setSelection({ type: 'line', id: newId });
          }
          scheduleRecord("Edit connection");
        }}
        lineCurve={lineCurve}
        onUpdateLineCurve={(alg) => { setLineCurve(alg); scheduleRecord("Change line curve"); }}
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

      {/* Tooltip */}
      {hoveredLine && (
        <div
          className="fixed z-50 bg-slate-800 text-white text-xs font-semibold px-3 py-1.5 rounded shadow-lg pointer-events-none transform -translate-x-1/2 -translate-y-full"
          style={{ left: hoveredLine.x, top: hoveredLine.y - 15 }}
        >
          {hoveredLine.label}
        </div>
      )}

      {/* Controls */}
      <DiagramControls
        isLive={isLive} setIsLive={setIsLive}
        showLabels={showLabels} setShowLabels={setShowLabels}
        showMinimap={showMinimap} setShowMinimap={setShowMinimap}
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
    </div>
  );
}
