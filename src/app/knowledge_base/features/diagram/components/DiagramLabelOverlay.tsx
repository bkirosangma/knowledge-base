"use client";

import React, { useRef, useState } from "react";
import { interpolatePoints, closestT } from "./DataLine";
import { rectsOverlap } from "../utils/collisionUtils";
import { isItemSelected } from "../utils/selectionUtils";
import type { Connection, NodeData, Selection } from "../types";
import { useObservedTheme } from "../../../shared/hooks/useObservedTheme";
import { adaptUserColor, tokenColors } from "../utils/themeAdapter";

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

interface FlowDimSets {
  connIds: Set<string>;
  nodeIds: Set<string>;
  layerIds: Set<string>;
}

interface DiagramLabelOverlayProps {
  show: boolean;
  world: { x: number; y: number; w: number; h: number };
  sortedLines: SortedLine[];
  connections: Connection[];
  selection: Selection;
  hoveredLine: { id: string } | null;
  readOnly: boolean;
  flowDimSets: FlowDimSets | null;
  nodes: NodeData[];
  getNodeDimensions: (n: NodeData) => { w: number; h: number };
  layerShiftsRef: React.MutableRefObject<Record<string, number>>;
  setConnections: (updater: (prev: Connection[]) => Connection[]) => void;
  scheduleRecord: (description: string) => void;
}

/**
 * SVG overlay rendering data-line labels and the drag-to-reposition gesture.
 * Extracted from DiagramView for KB-020. Behavior preserved 1:1 — the
 * mousedown handler mirrors the original collision-avoidance binary search
 * exactly so the dragged label can't collide with a node rect.
 */
export default function DiagramLabelOverlay({
  show,
  world,
  sortedLines,
  connections,
  selection,
  hoveredLine,
  readOnly,
  flowDimSets,
  nodes,
  getNodeDimensions,
  layerShiftsRef,
  setConnections,
  scheduleRecord,
}: DiagramLabelOverlayProps) {
  // Local drag-state. These were refs/state on DiagramView pre-KB-020.
  const labelDragNodeRects = useRef<{ left: number; top: number; width: number; height: number }[]>([]);
  const labelLastValidT = useRef<number>(0.5);
  const [labelDragGhost, setLabelDragGhost] = useState<{ lineId: string; rawT: number } | null>(null);

  const theme = useObservedTheme();
  const { surface: surfaceColor, line: lineFallback } = tokenColors(theme);

  if (!show) return null;
  return (
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
        const isSelected = isItemSelected(selection, "line", line.id);
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
              labelDragNodeRects.current = nodes.map((n) => {
                const dims = getNodeDimensions(n);
                const sy = n.y + (layerShiftsRef.current[n.layer] || 0);
                return { left: n.x - dims.w / 2, top: sy - dims.h / 2, width: dims.w, height: dims.h };
              });
              const labelW = line.label!.length * 6.5 + 8;
              const linePoints = line.points;
              const lineId = line.id;

              const onMove = (ev: MouseEvent) => {
                const pt2 = svg.createSVGPoint();
                pt2.x = ev.clientX;
                pt2.y = ev.clientY;
                const svgPt = pt2.matrixTransform(svg.getScreenCTM()!.inverse());
                const rawT = Math.max(0.05, Math.min(0.95, closestT(linePoints, svgPt.x, svgPt.y)));

                const rawPt = interpolatePoints(linePoints, rawT);
                const labelRect = { left: rawPt.x - labelW / 2, top: rawPt.y - 10, width: labelW, height: 18 };
                const hasOverlap = labelDragNodeRects.current.some((r) => rectsOverlap(labelRect, r, 4));

                if (!hasOverlap) {
                  setConnections((prev) => prev.map((c) => (c.id === lineId ? { ...c, labelPosition: rawT } : c)));
                  labelLastValidT.current = rawT;
                  setLabelDragGhost(null);
                } else {
                  let loT = labelLastValidT.current, hiT = rawT;
                  for (let i = 0; i < 15; i++) {
                    const midT = (loT + hiT) / 2;
                    const midPt = interpolatePoints(linePoints, midT);
                    const midRect = { left: midPt.x - labelW / 2, top: midPt.y - 10, width: labelW, height: 18 };
                    if (labelDragNodeRects.current.some((r) => rectsOverlap(midRect, r, 4))) {
                      hiT = midT;
                    } else {
                      loT = midT;
                    }
                  }
                  const clampedT = Math.max(0.05, Math.min(0.95, loT));
                  setConnections((prev) => prev.map((c) => (c.id === lineId ? { ...c, labelPosition: clampedT } : c)));
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
              fill={surfaceColor}
              fillOpacity={0.9}
              stroke={isSelected || isHovered ? adaptUserColor(line.color, theme) : lineFallback}
              strokeWidth={0.8}
            />
            <text
              x={pt.x}
              y={pt.y + 3}
              textAnchor="middle"
              fontSize="11"
              fontWeight="600"
              fontFamily="system-ui, sans-serif"
              fill={adaptUserColor(line.color, theme)}
              style={{ pointerEvents: "none", userSelect: "none" }}
            >
              {line.label}
            </text>
          </g>
        );
      })}
      {labelDragGhost && (() => {
        const ghostLineForLabel = sortedLines.find((l) => l.id === labelDragGhost.lineId);
        if (!ghostLineForLabel?.label) return null;
        const gpt = interpolatePoints(ghostLineForLabel.points, labelDragGhost.rawT);
        const gw = ghostLineForLabel.label.length * 6.5 + 8;
        return (
          <g style={{ opacity: 0.35, pointerEvents: "none" }}>
            <rect x={gpt.x - gw / 2} y={gpt.y - 10} width={gw} height={18} rx={4} fill={surfaceColor} fillOpacity={0.9} stroke={lineFallback} strokeWidth={0.8} />
            <text x={gpt.x} y={gpt.y + 3} textAnchor="middle" fontSize="11" fontWeight="600" fontFamily="system-ui, sans-serif" fill={adaptUserColor(ghostLineForLabel.color, theme)} style={{ pointerEvents: "none", userSelect: "none" }}>{ghostLineForLabel.label}</text>
          </g>
        );
      })()}
    </svg>
  );
}
