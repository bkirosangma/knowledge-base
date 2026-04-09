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

function computeBezierPath(
  from: Point,
  to: Point,
  fromAnchor: AnchorId,
  toAnchor: AnchorId,
): string {
  const fromDir = getAnchorDirection(fromAnchor);
  const toDir = getAnchorDirection(toAnchor);

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const ext = Math.min(dist * 0.4, 150);

  const cp1x = from.x + fromDir.dx * ext;
  const cp1y = from.y + fromDir.dy * ext;
  const cp2x = to.x + toDir.dx * ext;
  const cp2y = to.y + toDir.dy * ext;

  return `M ${from.x} ${from.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${to.x} ${to.y}`;
}

export function computePath(
  algorithm: LineCurveAlgorithm,
  fromPos: Point,
  toPos: Point,
  fromAnchor: AnchorId,
  toAnchor: AnchorId,
  obstacles: Rect[],
): string {
  switch (algorithm) {
    case "straight":
      return computeStraightPath(fromPos, toPos);
    case "bezier":
      return computeBezierPath(fromPos, toPos, fromAnchor, toAnchor);
    case "orthogonal":
    default:
      return computeOrthogonalPath(fromPos, toPos, fromAnchor, toAnchor, obstacles);
  }
}
