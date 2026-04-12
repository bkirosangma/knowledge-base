import { type AnchorId, getAnchorDirection } from "./anchors";
import { computeOrthogonalPath } from "./orthogonalRouter";
import type { LineCurveAlgorithm } from "./types";

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface Point {
  x: number;
  y: number;
}

function computeStraightPath(from: Point, to: Point): string {
  return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
}

function computeBezierControlPoints(
  from: Point,
  to: Point,
  fromAnchor: AnchorId,
  toAnchor: AnchorId,
  fromDirOverride?: { dx: number; dy: number },
  toDirOverride?: { dx: number; dy: number },
): { cp1: Point; cp2: Point } {
  const fromDir = fromDirOverride ?? getAnchorDirection(fromAnchor);
  const toDir = toDirOverride ?? getAnchorDirection(toAnchor);

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const ext = Math.min(dist * 0.4, 150);

  return {
    cp1: { x: from.x + fromDir.dx * ext, y: from.y + fromDir.dy * ext },
    cp2: { x: to.x + toDir.dx * ext, y: to.y + toDir.dy * ext },
  };
}

function computeBezierPath(
  from: Point,
  to: Point,
  fromAnchor: AnchorId,
  toAnchor: AnchorId,
  fromDirOverride?: { dx: number; dy: number },
  toDirOverride?: { dx: number; dy: number },
): string {
  const { cp1, cp2 } = computeBezierControlPoints(from, to, fromAnchor, toAnchor, fromDirOverride, toDirOverride);
  return `M ${from.x} ${from.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${to.x} ${to.y}`;
}

function sampleCubicBezier(p0: Point, cp1: Point, cp2: Point, p3: Point, segments: number): Point[] {
  const points: Point[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const u = 1 - t;
    points.push({
      x: u * u * u * p0.x + 3 * u * u * t * cp1.x + 3 * u * t * t * cp2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * cp1.y + 3 * u * t * t * cp2.y + t * t * t * p3.y,
    });
  }
  return points;
}

export function computePath(
  algorithm: LineCurveAlgorithm,
  fromPos: Point,
  toPos: Point,
  fromAnchor: AnchorId,
  toAnchor: AnchorId,
  obstacles: Rect[],
  waypoints?: { x: number; y: number }[],
  fromDir?: { dx: number; dy: number },
  toDir?: { dx: number; dy: number },
): { path: string; points: Point[] } {
  switch (algorithm) {
    case "straight":
      return { path: computeStraightPath(fromPos, toPos), points: [fromPos, toPos] };
    case "bezier": {
      const { cp1, cp2 } = computeBezierControlPoints(fromPos, toPos, fromAnchor, toAnchor, fromDir, toDir);
      return {
        path: computeBezierPath(fromPos, toPos, fromAnchor, toAnchor, fromDir, toDir),
        points: sampleCubicBezier(fromPos, cp1, cp2, toPos, 16),
      };
    }
    case "orthogonal":
    default:
      return computeOrthogonalPath(fromPos, toPos, fromAnchor, toAnchor, obstacles, waypoints, fromDir, toDir);
  }
}
