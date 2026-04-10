import { useRef, useCallback, useEffect, useState } from "react";

/** Interpolate a point along a polyline at parameter t (0..1) */
export function interpolatePoints(points: { x: number; y: number }[], t: number): { x: number; y: number } {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1 || t <= 0) return points[0];
  if (t >= 1) return points[points.length - 1];

  // Compute total length
  const segments: number[] = [];
  let totalLen = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    const len = Math.sqrt(dx * dx + dy * dy);
    segments.push(len);
    totalLen += len;
  }
  if (totalLen === 0) return points[0];

  const targetDist = t * totalLen;
  let accum = 0;
  for (let i = 0; i < segments.length; i++) {
    if (accum + segments[i] >= targetDist) {
      const frac = (targetDist - accum) / segments[i];
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * frac,
        y: points[i].y + (points[i + 1].y - points[i].y) * frac,
      };
    }
    accum += segments[i];
  }
  return points[points.length - 1];
}

/** Find the closest t parameter on a polyline to a given point */
export function closestT(points: { x: number; y: number }[], px: number, py: number): number {
  if (points.length < 2) return 0.5;

  const segments: number[] = [];
  let totalLen = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    segments.push(Math.sqrt(dx * dx + dy * dy));
    totalLen += segments[i - 1];
  }
  if (totalLen === 0) return 0.5;

  let bestDist = Infinity;
  let bestT = 0.5;
  let accum = 0;

  for (let i = 0; i < segments.length; i++) {
    const ax = points[i].x, ay = points[i].y;
    const bx = points[i + 1].x, by = points[i + 1].y;
    const dx = bx - ax, dy = by - ay;
    const len = segments[i];
    if (len === 0) { accum += len; continue; }

    // Project point onto segment
    let frac = ((px - ax) * dx + (py - ay) * dy) / (len * len);
    frac = Math.max(0, Math.min(1, frac));
    const cx = ax + dx * frac;
    const cy = ay + dy * frac;
    const dist = Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy));

    if (dist < bestDist) {
      bestDist = dist;
      bestT = (accum + frac * len) / totalLen;
    }
    accum += len;
  }
  return bestT;
}

interface DataLineProps {
  id: string;
  path: string;
  color: string;
  label: string;
  points: { x: number; y: number }[];
  labelPosition: number;
  hideDot?: boolean;
  isLive: boolean;
  isHovered: boolean;
  showLabels: boolean;
  onHoverStart: (id: string, label: string, x: number, y: number) => void;
  onHoverMove: (id: string, x: number, y: number) => void;
  onHoverEnd: () => void;
  fromPos: { x: number; y: number };
  toPos: { x: number; y: number };
  onLineClick: (connectionId: string, e: React.MouseEvent) => void;
  onLabelPositionChange?: (connectionId: string, t: number) => void;
  onLabelDragEnd?: (connectionId: string) => void;
  onDoubleClick?: (connectionId: string) => void;
  isDraggingEndpoint?: boolean;
  isSelected?: boolean;
  dimmed?: boolean;
  suppressLabel?: boolean;
}

export default function DataLine({
  id,
  path,
  color,
  hideDot,
  isLive,
  isHovered,
  showLabels,
  onHoverStart,
  onHoverMove,
  onHoverEnd,
  label,
  points,
  labelPosition,
  fromPos,
  toPos,
  onLineClick,
  onLabelPositionChange,
  onLabelDragEnd,
  onDoubleClick,
  isDraggingEndpoint,
  isSelected,
  dimmed,
  suppressLabel,
}: DataLineProps) {
  const [isDraggingLabel, setIsDraggingLabel] = useState(false);
  const dragRef = useRef({ startT: labelPosition, points });
  dragRef.current.points = points;

  const handleLabelMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsDraggingLabel(true);
    dragRef.current.startT = labelPosition;

    const onMove = (ev: MouseEvent) => {
      // Get the SVG element and transform client coords to SVG coords
      const svg = (e.target as SVGElement).closest("svg");
      if (!svg) return;
      const pt = svg.createSVGPoint();
      pt.x = ev.clientX;
      pt.y = ev.clientY;
      const svgPt = pt.matrixTransform(svg.getScreenCTM()!.inverse());
      const newT = closestT(dragRef.current.points, svgPt.x, svgPt.y);
      onLabelPositionChange?.(id, Math.max(0.05, Math.min(0.95, newT)));
    };

    const onUp = () => {
      setIsDraggingLabel(false);
      onLabelDragEnd?.(id);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [id, labelPosition, onLabelPositionChange]);

  // Compute label position
  const labelPt = showLabels && label && !suppressLabel ? interpolatePoints(points, labelPosition) : null;

  return (
    <g
      style={{ pointerEvents: dimmed ? "none" : "auto", cursor: "pointer" }}
      onMouseEnter={(e) => onHoverStart(id, label, e.clientX, e.clientY)}
      onMouseMove={(e) => onHoverMove(id, e.clientX, e.clientY)}
      onMouseLeave={onHoverEnd}
      onMouseDown={(e) => {
        e.stopPropagation();
        onLineClick(id, e);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick?.(id);
      }}
    >
      {/* Wide invisible hit area for hover + click */}
      <path d={path} fill="none" stroke="transparent" strokeWidth="20" />
      {/* Visible line */}
      <path
        id={id}
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={
          isDraggingEndpoint
            ? "1.5"
            : isSelected
              ? "3"
              : isHovered
                ? "3"
                : "1.5"
        }
        style={{ transitionProperty: "opacity, stroke-width", transitionDuration: "150ms", transitionDelay: dimmed ? "0.15s" : "0s" }}
        opacity={
          dimmed
            ? 0.1
            : isDraggingEndpoint
              ? 0.25
              : isSelected
                ? 1
                : isHovered
                  ? 1
                  : 0.7
        }
        strokeDasharray={isDraggingEndpoint ? "4 3" : "none"}
      />
      {/* Animated dots are rendered in a separate SVG layer for performance */}
      {/* Visible endpoint dots (hidden during drag — ghost line shows its own) */}
      {!isDraggingEndpoint && (
        <>
          <circle
            cx={fromPos.x}
            cy={fromPos.y}
            r={isHovered ? 6 : 4}
            fill={isHovered ? color : "transparent"}
            stroke={isHovered ? "white" : "transparent"}
            strokeWidth={1.5}
            style={{ pointerEvents: "none" }}
          />
          <circle
            cx={toPos.x}
            cy={toPos.y}
            r={isHovered ? 6 : 4}
            fill={isHovered ? color : "transparent"}
            stroke={isHovered ? "white" : "transparent"}
            strokeWidth={1.5}
            style={{ pointerEvents: "none" }}
          />
        </>
      )}
      {/* Label rendered on the path */}
      {labelPt && (
        <g
          style={{ cursor: isDraggingLabel ? "grabbing" : "grab", pointerEvents: "auto" }}
          onMouseDown={handleLabelMouseDown}
        >
          <rect
            x={labelPt.x - (label.length * 6.5 + 8) / 2}
            y={labelPt.y - 10}
            width={label.length * 6.5 + 8}
            height={18}
            rx={4}
            fill="white"
            fillOpacity={0.9}
            stroke={isSelected || isHovered ? color : "#e2e8f0"}
            strokeWidth={0.8}
          />
          <text
            x={labelPt.x}
            y={labelPt.y + 3}
            textAnchor="middle"
            fontSize="11"
            fontWeight="600"
            fontFamily="system-ui, sans-serif"
            fill={color}
            style={{ pointerEvents: "none", userSelect: "none" }}
          >
            {label}
          </text>
        </g>
      )}
    </g>
  );
}
