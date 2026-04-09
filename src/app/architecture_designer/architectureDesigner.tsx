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
import { loadDefaults, clearDiagram } from "./utils/persistence";
import { computeRegions } from "./utils/layerBounds";
import { LAYER_PADDING, LAYER_TITLE_OFFSET } from "./utils/layerBounds";
import { useCanvasCoords, VIEWPORT_PADDING } from "./hooks/useCanvasCoords";
import { useDiagramPersistence } from "./hooks/useDiagramPersistence";
import { useViewportPersistence } from "./hooks/useViewportPersistence";
import { useNodeDrag } from "./hooks/useNodeDrag";
import { useLayerDrag } from "./hooks/useLayerDrag";
import { useLayerResize } from "./hooks/useLayerResize";
import { useEndpointDrag } from "./hooks/useEndpointDrag";
import { useLineDrag } from "./hooks/useLineDrag";
import Minimap, { MINIMAP_WIDTH, MINIMAP_MAX_HEIGHT } from "./components/Minimap";
import ContextMenu, { type ContextMenuTarget } from "./components/ContextMenu";
import { findNonOverlappingLayerPosition, clampElementToAvoidLayerCollision } from "./utils/collisionUtils";
import { predictLayerBounds } from "./utils/layerBounds";
import { useZoom } from "./hooks/useZoom";
import { Box } from "lucide-react";

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

  const scrollToRect = useCallback((rect: { x: number; y: number; w: number; h: number }) => {
    const el = canvasRef.current;
    if (!el) return;
    const w = worldRef.current;
    const z = zoomRef.current;
    const pad = 20 * z;

    const compLeft = (rect.x - w.x) * z + VIEWPORT_PADDING - pad;
    const compRight = (rect.x + rect.w - w.x) * z + VIEWPORT_PADDING + pad;
    const compTop = (rect.y - w.y) * z + VIEWPORT_PADDING - pad;
    const compBottom = (rect.y + rect.h - w.y) * z + VIEWPORT_PADDING + pad;

    const vpW = el.clientWidth;
    const vpH = el.clientHeight;

    let targetSL = el.scrollLeft;
    let targetST = el.scrollTop;

    if (compRight - compLeft > vpW) {
      targetSL = compLeft;
    } else if (compLeft < el.scrollLeft) {
      targetSL = compLeft;
    } else if (compRight > el.scrollLeft + vpW) {
      targetSL = compRight - vpW;
    }

    if (compBottom - compTop > vpH) {
      targetST = compTop;
    } else if (compTop < el.scrollTop) {
      targetST = compTop;
    } else if (compBottom > el.scrollTop + vpH) {
      targetST = compBottom - vpH;
    }

    if (targetSL === el.scrollLeft && targetST === el.scrollTop) return;

    const startSL = el.scrollLeft;
    const startST = el.scrollTop;
    const startTime = performance.now();
    const duration = 100;

    const animate = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      const ease = t * (2 - t);
      el.scrollLeft = startSL + (targetSL - startSL) * ease;
      el.scrollTop = startST + (targetST - startST) * ease;
      if (t < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, []);

  // Prevent browser zoom (Ctrl/Cmd + scroll, Ctrl/Cmd + +/-/0)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "+" || e.key === "-" || e.key === "=" || e.key === "0")) {
        e.preventDefault();
      }
    };
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("wheel", onWheel);
    };
  }, []);

  // Clamp scroll bounds
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onScroll = () => {
      const w = worldRef.current;
      const z = zoomRef.current;
      const vpWidth = el.clientWidth;
      const vpHeight = el.clientHeight;

      // Ensure the minimap viewport indicator stays at least 2px visible
      const minimapScale = (w.w > 0 && w.h > 0)
        ? Math.min(MINIMAP_WIDTH / w.w, MINIMAP_MAX_HEIGHT / w.h)
        : 1;
      const minOverlap = 2 * z / minimapScale;

      const minSL = VIEWPORT_PADDING - vpWidth + minOverlap;
      const maxSL = VIEWPORT_PADDING + w.w * z - minOverlap;
      const minST = VIEWPORT_PADDING - vpHeight + minOverlap;
      const maxST = VIEWPORT_PADDING + w.h * z - minOverlap;

      if (el.scrollLeft < minSL) { el.scrollLeft = minSL; }
      if (el.scrollLeft > maxSL) { el.scrollLeft = maxSL; }
      if (el.scrollTop < minST) { el.scrollTop = minST; }
      if (el.scrollTop > maxST) { el.scrollTop = maxST; }
    };
    el.addEventListener("scroll", onScroll, { passive: false });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

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

  useDiagramPersistence(
    setTitle, setLayerDefs, setNodes, setConnections, setLayerManualSizes, setLineCurve,
    title, layerDefs, nodes, connections, layerManualSizes, lineCurve,
  );

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

        const sel = selectionRef.current;
        let nodeIdsToDelete: string[] = [];
        let layerIdsToDelete: string[] = [];
        let lineIdsToDelete: string[] = [];

        switch (sel.type) {
          case "node":
            nodeIdsToDelete = [sel.id];
            break;
          case "multi-node":
            nodeIdsToDelete = sel.ids;
            break;
          case "layer":
            layerIdsToDelete = [sel.id];
            break;
          case "multi-layer":
            layerIdsToDelete = sel.ids;
            break;
          case "line":
            lineIdsToDelete = [sel.id];
            break;
          case "multi-line":
            lineIdsToDelete = sel.ids;
            break;
        }

        // Cascade: layers → collect their nodes
        if (layerIdsToDelete.length > 0) {
          const layerSet = new Set(layerIdsToDelete);
          const nodesInLayers = nodesRef.current.filter((n) => layerSet.has(n.layer)).map((n) => n.id);
          nodeIdsToDelete = [...new Set([...nodeIdsToDelete, ...nodesInLayers])];
          setLayerDefs((prev) => prev.filter((l) => !layerSet.has(l.id)));
          setLayerManualSizes((prev) => {
            const next = { ...prev };
            for (const id of layerIdsToDelete) delete next[id];
            return next;
          });
        }

        // Cascade: nodes → remove referencing connections
        if (nodeIdsToDelete.length > 0) {
          const nodeSet = new Set(nodeIdsToDelete);
          setNodes((prev) => prev.filter((n) => !nodeSet.has(n.id)));
          setConnections((prev) => prev.filter((c) => !nodeSet.has(c.from) && !nodeSet.has(c.to)));
          setMeasuredSizes((prev) => {
            const next = { ...prev };
            for (const id of nodeIdsToDelete) delete next[id];
            return next;
          });
        }

        // Direct line deletion
        if (lineIdsToDelete.length > 0) {
          const lineSet = new Set(lineIdsToDelete);
          setConnections((prev) => prev.filter((c) => !lineSet.has(c.id)));
        }

        setSelection(null);
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
  }, [cancelSelectionRect]);

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

  const { VIEWPORT_KEY } = useViewportPersistence(canvasRef, worldRef, zoomRef, zoom, setZoom);

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

  const handleAddElement = () => {
    if (!contextMenu) return;
    const cx = contextMenu.canvasX;
    const cy = contextMenu.canvasY;
    const newW = 210;
    const newH = getNodeHeight(newW);
    const halfW = newW / 2;
    const halfH = newH / 2;

    // If right-clicked inside a layer, assign the element to that layer
    let targetLayer = "";
    for (const r of regions) {
      if (!r.empty && cx >= r.left && cx <= r.left + r.width && cy >= r.top && cy <= r.top + r.height) {
        targetLayer = r.id;
        break;
      }
    }

    let finalX = cx;
    let finalY = cy;
    if (targetLayer) {
      // Layer collision avoidance: ensure layer expansion doesn't overlap other layers
      // Also checks node overlap internally so the element doesn't land on existing nodes
      const result = clampElementToAvoidLayerCollision(
        cx, cy, halfW, halfH,
        targetLayer, nodes, getNodeDimensions,
        layerManualSizes, regions,
        predictLayerBounds,
      );
      finalX = result.x;
      finalY = result.y;
      if (result.layerShift) {
        const { dx, dy } = result.layerShift;
        // Shift all existing nodes in the layer by the same delta
        setNodes((prev) => prev.map((n) =>
          n.layer === targetLayer ? { ...n, x: n.x + dx, y: n.y + dy } : n,
        ));
        // Also shift the new element position
        finalX += dx;
        finalY += dy;
        // Update manual sizes if present
        setLayerManualSizes((prev) => {
          const existing = prev[targetLayer];
          if (!existing) return prev;
          return {
            ...prev,
            [targetLayer]: {
              ...existing,
              left: existing.left !== undefined ? existing.left + dx : undefined,
              top: existing.top !== undefined ? existing.top + dy : undefined,
            },
          };
        });
      }
    } else {
      // No layer: simple collision avoidance — shift down until no overlap with existing nodes
      const maxAttempts = 50;
      for (let i = 0; i < maxAttempts; i++) {
        const overlaps = nodes.some((n) => {
          const dims = getNodeDimensions(n);
          const nHalfW = dims.w / 2;
          const nHalfH = dims.h / 2;
          return Math.abs(finalX - n.x) < halfW + nHalfW && Math.abs(finalY - n.y) < halfH + nHalfH;
        });
        if (!overlaps) break;
        finalY += 20;
      }
    }

    const newId = `el-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setNodes((prev) => [...prev, { id: newId, label: "New Element", icon: Box, x: finalX, y: finalY, w: newW, layer: targetLayer }]);
    setSelection({ type: "node", id: newId });
    setContextMenu(null);
  };

  const handleAddLayer = () => {
    if (!contextMenu) return;
    const cx = contextMenu.canvasX;
    const cy = contextMenu.canvasY;
    const newW = 400;
    const newH = 200;

    // Use the same edge-snapping collision logic as layer drag clamping
    const pos = findNonOverlappingLayerPosition(
      { left: cx - newW / 2, top: cy - newH / 2, width: newW, height: newH },
      regions,
    );
    const placeLeft = pos.left;
    const placeTop = pos.top;

    const newId = `ly-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setLayerDefs((prev) => [...prev, { id: newId, title: "NEW LAYER", bg: "#eff3f9", border: "#cdd6e4", textColor: "#334155" }]);
    setLayerManualSizes((prev) => ({ ...prev, [newId]: { left: placeLeft, width: newW, top: placeTop, height: newH } }));
    setSelection({ type: "layer", id: newId });
    setContextMenu(null);
  };

  return (
    <div className="w-full h-screen bg-[#f4f7f9] font-sans flex flex-col overflow-hidden relative">
      {/* Header */}
      <div className="flex-shrink-0 flex flex-col md:flex-row justify-between items-start md:items-end px-8 pt-6 pb-4 bg-white border-b border-slate-200 gap-4 z-20">
        <div className="flex items-center gap-4">
          <Link href="/" className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-lg text-sm transition-colors">
            &larr; Back
          </Link>
          <h1 className="text-2xl font-semibold text-slate-800 tracking-tight">
            {title}
          </h1>
        </div>
        <div className="flex flex-wrap gap-8 text-sm">
          <div>
            <div className="text-slate-500 font-bold text-[10px] tracking-wider uppercase mb-1">Regional Clusters</div>
            <div className="font-semibold text-slate-800">EU, US (HA)</div>
          </div>
          <div>
            <div className="text-slate-500 font-bold text-[10px] tracking-wider uppercase mb-1">Global Endpoint</div>
            <div className="font-semibold text-slate-800">Thanos Querier</div>
          </div>
          <div>
            <div className="text-slate-500 font-bold text-[10px] tracking-wider uppercase mb-1">Lake</div>
            <div className="font-semibold text-slate-800">S3 Metrics</div>
          </div>
          <div>
            <div className="text-slate-500 font-bold text-[10px] tracking-wider uppercase mb-1">Status</div>
            <div className="font-semibold flex items-center gap-2 text-slate-800">
              <span className="w-2 h-2 rounded-full bg-emerald-500 block shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>
              Production
            </div>
          </div>
        </div>
      </div>

      {/* Viewport + Properties */}
      <div className="flex-1 flex min-h-0">
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

          // Detect what's under the click: element > layer > canvas
          let target: ContextMenuTarget = { type: "canvas" };
          for (const n of nodes) {
            const dims = getNodeDimensions(n);
            const halfW = dims.w / 2;
            const halfH = dims.h / 2;
            if (cx >= n.x - halfW && cx <= n.x + halfW && cy >= n.y - halfH && cy <= n.y + halfH) {
              target = { type: "element", id: n.id };
              break;
            }
          }
          if (target.type === "canvas") {
            for (const r of regions) {
              if (!r.empty && cx >= r.left && cx <= r.left + r.width && cy >= r.top && cy <= r.top + r.height) {
                target = { type: "layer", id: r.id };
                break;
              }
            }
          }

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
          onDeleteElement={(nodeId) => {
            const nodeIdsToDelete = [nodeId];
            setConnections((prev) => prev.filter((c) => c.from !== nodeId && c.to !== nodeId));
            setNodes((prev) => prev.filter((n) => !nodeIdsToDelete.includes(n.id)));
            setMeasuredSizes((prev) => { const next = { ...prev }; delete next[nodeId]; return next; });
            setSelection(null);
          }}
          onDeleteLayer={(layerId) => {
            const nodeIds = nodes.filter((n) => n.layer === layerId).map((n) => n.id);
            const nodeSet = new Set(nodeIds);
            setConnections((prev) => prev.filter((c) => !nodeSet.has(c.from) && !nodeSet.has(c.to)));
            setNodes((prev) => prev.filter((n) => n.layer !== layerId));
            setLayerDefs((prev) => prev.filter((l) => l.id !== layerId));
            setLayerManualSizes((prev) => { const next = { ...prev }; delete next[layerId]; return next; });
            setMeasuredSizes((prev) => { const next = { ...prev }; for (const id of nodeIds) delete next[id]; return next; });
            setSelection(null);
          }}
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
        onUpdateTitle={(t) => setTitle(t)}
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
        }}
        onUpdateConnection={(oldId, updates) => {
          const newId = updates.id;
          setConnections((prev) => prev.map((c) => c.id === oldId ? { ...c, ...updates } : c));
          if (newId && newId !== oldId) {
            setSelection({ type: 'line', id: newId });
          }
        }}
        lineCurve={lineCurve}
        onUpdateLineCurve={(alg) => setLineCurve(alg)}
      />
      </div>

      {/* Minimap — overlays viewport from outside the scroll container */}
      {showMinimap && (
        <div className="absolute bottom-16 left-4 z-30">
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
      <div className="flex-shrink-0 bg-white border-t border-slate-200 px-6 py-4 z-20">
        <div className="flex flex-col sm:flex-row items-center justify-between">
          <div className="flex items-center gap-8 mb-4 sm:mb-0">
            <div className="flex items-center gap-3 cursor-pointer group" onClick={() => setIsLive(!isLive)}>
              <span className="text-sm font-semibold text-slate-700 group-hover:text-blue-600 transition-colors">Live Data Flow</span>
              <div className={`w-11 h-6 rounded-full flex items-center p-1 transition-colors ${isLive ? "bg-blue-600" : "bg-slate-300"}`}>
                <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${isLive ? "translate-x-5" : ""}`} />
              </div>
            </div>
            <div className="flex items-center gap-3 cursor-pointer group" onClick={() => setShowLabels(!showLabels)}>
              <span className="text-sm font-semibold text-slate-700 group-hover:text-blue-600 transition-colors">Show Labels</span>
              <div className={`w-11 h-6 rounded-full flex items-center p-1 transition-colors ${showLabels ? "bg-blue-600" : "bg-slate-300"}`}>
                <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${showLabels ? "translate-x-5" : ""}`} />
              </div>
            </div>
            <div className="flex items-center gap-3 cursor-pointer group" onClick={() => setShowMinimap(!showMinimap)}>
              <span className="text-sm font-semibold text-slate-700 group-hover:text-blue-600 transition-colors">Minimap</span>
              <div className={`w-11 h-6 rounded-full flex items-center p-1 transition-colors ${showMinimap ? "bg-blue-600" : "bg-slate-300"}`}>
                <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${showMinimap ? "translate-x-5" : ""}`} />
              </div>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              {world.w}&times;{world.h}px ({patches.length} patch{patches.length !== 1 ? "es" : ""}) {Math.round(zoom * 100)}%
            </span>
          </div>
          <button
            onClick={() => {
              clearDiagram();
              try { localStorage.removeItem(VIEWPORT_KEY); } catch { /* ignore */ }
              const defaults = loadDefaults();
              setIsLive(true);
              setShowLabels(true);
              setLayerDefs(defaults.layers);
              setNodes(defaults.nodes);
              setConnections(defaults.connections);
              setPatches([{ id: "main", col: 0, row: 0, widthUnits: 3, heightUnits: 3 }]);
              setLayerManualSizes({});
              zoomRef.current = 1;
              setZoom(1);
            }}
            className="px-6 py-2 bg-[#e2e8f0] hover:bg-[#cbd5e1] text-slate-700 font-semibold rounded-full text-sm transition-colors shadow-sm"
          >
            Reset View
          </button>
        </div>
      </div>
    </div>
  );
}
