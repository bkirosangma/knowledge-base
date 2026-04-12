import { useState, useCallback, useEffect, useRef } from "react";
import type { Connection } from "../types";
import { snapToGrid } from "../utils/gridSnap";

interface DraggingSegment {
  connectionId: string;
  /** Index of the first point of the segment in the points array */
  segmentIndex: number;
  orientation: "h" | "v";
  startMouse: number;
  startValue: number;
  /** The full points array at drag start */
  originalPoints: { x: number; y: number }[];
}

interface UseSegmentDragOptions {
  toCanvasCoords: (clientX: number, clientY: number) => { x: number; y: number };
  setConnections: React.Dispatch<React.SetStateAction<Connection[]>>;
  scheduleRecord: (desc: string) => void;
}

/** Remove collinear intermediate points */
function simplifyWaypoints(pts: { x: number; y: number }[]): { x: number; y: number }[] {
  if (pts.length < 3) return pts;
  const result = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = result[result.length - 1];
    const curr = pts[i];
    const next = pts[i + 1];
    const sameX = Math.abs(prev.x - curr.x) < 1 && Math.abs(curr.x - next.x) < 1;
    const sameY = Math.abs(prev.y - curr.y) < 1 && Math.abs(curr.y - next.y) < 1;
    if (!sameX && !sameY) result.push(curr);
  }
  result.push(pts[pts.length - 1]);
  return result;
}

export function useSegmentDrag({ toCanvasCoords, setConnections, scheduleRecord }: UseSegmentDragOptions) {
  const [draggingSegment, setDraggingSegment] = useState<DraggingSegment | null>(null);

  const handleSegmentDragStart = useCallback(
    (connectionId: string, points: { x: number; y: number }[], segmentIndex: number, e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const p1 = points[segmentIndex];
      const p2 = points[segmentIndex + 1];
      const isHorizontal = Math.abs(p1.y - p2.y) < Math.abs(p1.x - p2.x);
      const mouse = toCanvasCoords(e.clientX, e.clientY);
      setDraggingSegment({
        connectionId,
        segmentIndex,
        orientation: isHorizontal ? "h" : "v",
        startMouse: isHorizontal ? mouse.y : mouse.x,
        startValue: isHorizontal ? p1.y : p1.x,
        originalPoints: points.map((p) => ({ ...p })),
      });
    },
    [toCanvasCoords]
  );

  const draggingRef = useRef(draggingSegment);
  draggingRef.current = draggingSegment;

  useEffect(() => {
    if (!draggingSegment) return;

    const handleMouseMove = (e: MouseEvent) => {
      const seg = draggingRef.current;
      if (!seg) return;
      const mouse = toCanvasCoords(e.clientX, e.clientY);
      const currentVal = seg.orientation === "h" ? mouse.y : mouse.x;
      const delta = currentVal - seg.startMouse;
      const newValue = snapToGrid(seg.startValue + delta);

      // Build new waypoints: take the interior points (skip first 2 and last 2 which are anchor+stub),
      // then update the segment's points
      const pts = seg.originalPoints.map((p) => ({ ...p }));
      const i = seg.segmentIndex;
      if (seg.orientation === "h") {
        pts[i] = { ...pts[i], y: newValue };
        pts[i + 1] = { ...pts[i + 1], y: newValue };
      } else {
        pts[i] = { ...pts[i], x: newValue };
        pts[i + 1] = { ...pts[i + 1], x: newValue };
      }

      // Extract waypoints (skip first 2: anchor+stub, and last 2: stub+anchor)
      const waypoints = pts.slice(2, pts.length - 2);

      setConnections((prev) =>
        prev.map((c) => (c.id === seg.connectionId ? { ...c, waypoints } : c))
      );
    };

    const handleMouseUp = () => {
      // Simplify waypoints after drag
      setConnections((prev) =>
        prev.map((c) => {
          if (c.id !== draggingRef.current?.connectionId) return c;
          const wp = c.waypoints;
          if (!wp || wp.length === 0) return c;
          const simplified = simplifyWaypoints(wp);
          if (simplified.length === 0) return { ...c, waypoints: undefined };
          return { ...c, waypoints: simplified };
        })
      );
      scheduleRecord("Move line segment");
      setDraggingSegment(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [!!draggingSegment, toCanvasCoords, setConnections, scheduleRecord]);

  return { draggingSegment, handleSegmentDragStart };
}
