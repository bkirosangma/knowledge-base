"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { fitToContent, type CanvasPatch } from "../components/Canvas";
import { computeRegions } from "../utils/layerBounds";
import { computeLevelMap } from "../utils/levelModel";
import { getNodeHeight } from "../utils/geometry";
import { getConditionDimensions } from "../utils/conditionGeometry";
import { getAnchorPosition, getNodeAnchorPosition, getNodeAnchorDirection } from "../utils/anchors";
import { buildObstacles } from "../utils/orthogonalRouter";
import { computePath } from "../utils/pathRouter";
import { isItemSelected } from "../utils/selectionUtils";
import { LAYER_PADDING, LAYER_TITLE_OFFSET } from "../utils/constants";
import type { AnchorId } from "../utils/anchors";
import type { Connection, NodeData, RegionBounds, Selection } from "../types";
import type { LevelMap } from "../utils/levelModel";
import type { DiagramDoc, LayerManualSize } from "./useDiagramDocument";

interface DraggingEndpoint {
  connectionId: string;
  end: "from" | "to";
  currentPos: { x: number; y: number };
  snappedAnchor: { x: number; y: number } | null;
}

interface CreatingLine {
  fromPos: { x: number; y: number };
  currentPos: { x: number; y: number };
  snappedAnchor: { x: number; y: number } | null;
}

interface UseDiagramGeometryInput {
  doc: DiagramDoc;
  measuredSizes: Record<string, { w: number; h: number }>;
  layerManualSizes: Record<string, LayerManualSize>;
  // Drag state — these influence regions / displayNodes / ghostLine
  draggingId: string | null;
  elementDragPos: { x: number; y: number } | null;
  multiDragIds: string[];
  multiDragDelta: { dx: number; dy: number } | null;
  draggingEndpoint: DraggingEndpoint | null;
  creatingLine: CreatingLine | null;
  // Selection / hover for sort order
  hoveredLine: { id: string } | null;
  selection: Selection;
  // Owner of patches state — receives the fitToContent updates
  setPatches: (updater: (prev: CanvasPatch[]) => CanvasPatch[]) => void;
  // Refs shared with the drag hooks. The geometry hook OWNS the
  // computed values and writes them into `.current` each render so the
  // drag-handler closures (which read at event-time) see fresh data.
  layerShiftsRef: React.MutableRefObject<Record<string, number>>;
  regionsRef: React.MutableRefObject<RegionBounds[] | null>;
  levelMapRef: React.MutableRefObject<LevelMap>;
}

/**
 * Bundle of every memoised geometric value DiagramView used to compute
 * inline. Extracted for KB-020 so the orchestrator stays under 300 lines
 * and so KB-021 / KB-022 can reason about the derived-state pipeline as
 * one unit. Pure function of inputs — no interaction state lives here.
 */
export function useDiagramGeometry(input: UseDiagramGeometryInput) {
  const {
    doc,
    measuredSizes,
    layerManualSizes,
    draggingId,
    elementDragPos,
    multiDragIds,
    multiDragDelta,
    draggingEndpoint,
    creatingLine,
    hoveredLine,
    selection,
    setPatches,
    layerShiftsRef,
    regionsRef,
    levelMapRef,
  } = input;

  const { layers, nodes, connections, lineCurve } = doc;

  // ─── Level map (for connection routing depth) ────────────────────
  const levelMap = useMemo(() => computeLevelMap(nodes, connections), [nodes, connections]);
  levelMapRef.current = levelMap;

  // ─── Per-node measured/derived dimensions ────────────────────────
  const getNodeDimensions = useCallback(
    (node: { id: string; w: number; shape?: string; conditionSize?: number; conditionOutCount?: number }) => {
      const measured = measuredSizes[node.id];
      if (node.shape === "condition") {
        return getConditionDimensions(node.conditionSize, node.conditionOutCount);
      }
      return {
        w: measured?.w ?? node.w,
        h: measured?.h ?? getNodeHeight(node.w),
      };
    },
    [measuredSizes],
  );

  // ─── Layer regions ───────────────────────────────────────────────
  const regions = useMemo(
    () => computeRegions(layers, nodes, getNodeDimensions, layerManualSizes, draggingId, elementDragPos, multiDragIds, multiDragDelta),
    [layers, nodes, getNodeDimensions, layerManualSizes, draggingId, elementDragPos, multiDragIds, multiDragDelta],
  );

  // Pre-KB-020 this was always {<id>: 0}. Kept identically so any caller
  // that reaches into layerShiftsRef still gets the same shape/identity.
  const layerShifts: Record<string, number> = useMemo(() => {
    const shifts: Record<string, number> = {};
    for (const r of regions) shifts[r.id] = 0;
    return shifts;
  }, [regions]);

  layerShiftsRef.current = layerShifts;
  regionsRef.current = regions;

  // ─── Display-time nodes (with shift applied) ─────────────────────
  const displayNodes = useMemo(
    () =>
      nodes.map((n) => {
        const shift = layerShifts[n.layer] || 0;
        return shift !== 0 ? { ...n, y: n.y + shift } : n;
      }),
    [nodes, layerShifts],
  );

  const nodeMap = useMemo(
    () => Object.fromEntries(displayNodes.map((n) => [n.id, n])) as Record<string, NodeData>,
    [displayNodes],
  );

  /** Resolve anchor position for a node, handling conditions. */
  const resolveAnchorPos = useCallback(
    (anchorId: string, node: NodeData, dims: { w: number; h: number }) => {
      if (node.shape === "condition") {
        return getNodeAnchorPosition(anchorId, node.x, node.y, dims.w, dims.h, node.shape, node.conditionOutCount, node.rotation);
      }
      return getAnchorPosition(anchorId as AnchorId, node.x, node.y, dims.w, dims.h);
    },
    [],
  );

  // ─── Connection lines ────────────────────────────────────────────
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
        id: conn.id,
        path,
        points,
        color: conn.color,
        label: conn.label,
        biDirectional: conn.biDirectional,
        flowDuration: conn.flowDuration,
        labelPosition: conn.labelPosition ?? 0.5,
        connectionType: conn.connectionType,
        fromPos,
        toPos,
      };
    });
  }, [connections, displayNodes, nodeMap, lineCurve, getNodeDimensions, resolveAnchorPos]);

  // Keep mutable ref of lines for selection-rect hit-testing.
  const linesForSelection = useRef<{ id: string; points: { x: number; y: number }[] }[]>([]);
  linesForSelection.current = lines;

  // ─── Sort: hovered/selected lines render on top ──────────────────
  const sortedLines = useMemo(
    () =>
      [...lines].sort((a, b) => {
        const aFront = a.id === hoveredLine?.id || isItemSelected(selection, "line", a.id) ? 1 : 0;
        const bFront = b.id === hoveredLine?.id || isItemSelected(selection, "line", b.id) ? 1 : 0;
        return aFront - bFront;
      }),
    [lines, hoveredLine?.id, selection],
  );

  // ─── Ghost line (endpoint drag or new-connection drag) ───────────
  let ghostLine: { path: string; color: string; fromPos: { x: number; y: number }; toPos: { x: number; y: number } } | null = null;
  if (draggingEndpoint) {
    const conn = connections.find((c) => c.id === draggingEndpoint.connectionId);
    if (conn) {
      const fromNode = nodeMap[conn.from];
      const toNode = nodeMap[conn.to];
      const fromDims = getNodeDimensions(fromNode);
      const toDims = getNodeDimensions(toNode);
      const fixedPos =
        draggingEndpoint.end === "from"
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

  // ─── Auto-fit content bounds → patches ───────────────────────────
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
  }, [contentBounds, setPatches]);

  return {
    levelMap,
    levelMapRef,
    regions,
    regionsRef,
    layerShifts,
    layerShiftsRef,
    displayNodes,
    nodeMap,
    resolveAnchorPos,
    lines,
    sortedLines,
    ghostLine,
    contentBounds,
    getNodeDimensions,
    linesForSelection,
    LAYER_PADDING,
    LAYER_TITLE_OFFSET,
  };
}

export type DiagramGeometry = ReturnType<typeof useDiagramGeometry>;
