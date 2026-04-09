import { type AnchorId, getAnchorDirection } from "./anchors";

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

const STUB_LENGTH = 20;
const OBSTACLE_PADDING = 15;
const CORNER_RADIUS = 6;

/**
 * Compute an orthogonal (Manhattan-style) path between two anchor points,
 * routing around element bounding boxes.
 */
export function computeOrthogonalPath(
  fromPos: Point,
  toPos: Point,
  fromAnchor: AnchorId,
  toAnchor: AnchorId,
  obstacles: Rect[]
): { path: string; points: Point[] } {
  const fromDir = getAnchorDirection(fromAnchor);
  const toDir = getAnchorDirection(toAnchor);

  // Stub: extend from the anchor outward so the line exits perpendicular to the edge
  const stubFrom: Point = {
    x: fromPos.x + fromDir.dx * STUB_LENGTH,
    y: fromPos.y + fromDir.dy * STUB_LENGTH,
  };
  const stubTo: Point = {
    x: toPos.x + toDir.dx * STUB_LENGTH,
    y: toPos.y + toDir.dy * STUB_LENGTH,
  };

  // Build the waypoints between the two stubs using simple orthogonal routing
  const waypoints = routeBetween(stubFrom, stubTo, fromDir, toDir, obstacles);

  // Full point sequence: start → stubFrom → waypoints → stubTo → end
  const allPoints: Point[] = [fromPos, stubFrom, ...waypoints, stubTo, toPos];

  // Deduplicate consecutive identical points
  const pts = dedup(allPoints);

  if (pts.length < 2) {
    const fallback = [fromPos, toPos];
    return { path: `M ${fromPos.x} ${fromPos.y} L ${toPos.x} ${toPos.y}`, points: fallback };
  }

  return { path: buildRoundedPath(pts, CORNER_RADIUS), points: pts };
}

/**
 * Route between two stub endpoints with axis-aligned segments.
 * Uses a simple heuristic: pick a midpoint that creates two bends,
 * adjusting if it intersects obstacles.
 */
function routeBetween(
  from: Point,
  to: Point,
  fromDir: { dx: number; dy: number },
  toDir: { dx: number; dy: number },
  obstacles: Rect[]
): Point[] {
  const isFromVertical = fromDir.dy !== 0;
  const isToVertical = toDir.dy !== 0;

  // Case 1: Both exit vertically (top/bottom) — standard U or S shape
  if (isFromVertical && isToVertical) {
    return routeVerticalToVertical(from, to, obstacles);
  }

  // Case 2: Both exit horizontally (left/right)
  if (!isFromVertical && !isToVertical) {
    return routeHorizontalToHorizontal(from, to, obstacles);
  }

  // Case 3: One vertical, one horizontal — L-shape or Z-shape
  if (isFromVertical && !isToVertical) {
    // From goes vertical, To goes horizontal
    // Try L-shape: go vertical to to.y, then horizontal to to.x
    const corner: Point = { x: from.x, y: to.y };
    if (!segmentIntersectsAny(from, corner, obstacles) &&
        !segmentIntersectsAny(corner, to, obstacles)) {
      return [corner];
    }
    // Z-shape fallback: go vertical halfway, horizontal, then vertical
    const midY = (from.y + to.y) / 2;
    return [
      { x: from.x, y: midY },
      { x: to.x, y: midY },
    ];
  }

  // From goes horizontal, To goes vertical
  const corner: Point = { x: to.x, y: from.y };
  if (!segmentIntersectsAny(from, corner, obstacles) &&
      !segmentIntersectsAny(corner, to, obstacles)) {
    return [corner];
  }
  const midX = (from.x + to.x) / 2;
  return [
    { x: midX, y: from.y },
    { x: midX, y: to.y },
  ];
}

function routeVerticalToVertical(from: Point, to: Point, obstacles: Rect[]): Point[] {
  // If aligned on X, just need one vertical segment (no extra waypoints)
  if (Math.abs(from.x - to.x) < 1) {
    return [];
  }

  // Try S-shape: vertical to midY, horizontal, vertical
  const midY = (from.y + to.y) / 2;
  const candidate = [
    { x: from.x, y: midY },
    { x: to.x, y: midY },
  ];

  if (!pathIntersectsAny([from, ...candidate, to], obstacles)) {
    return candidate;
  }

  // Try routing around obstacles by shifting the midY
  for (const offset of [0.25, 0.75, -0.1, 1.1]) {
    const tryY = from.y + (to.y - from.y) * offset;
    const tryCandidate = [
      { x: from.x, y: tryY },
      { x: to.x, y: tryY },
    ];
    if (!pathIntersectsAny([from, ...tryCandidate, to], obstacles)) {
      return tryCandidate;
    }
  }

  // U-shape fallback: go out to the side, then over, then back
  const side = findFreeSide(from, to, obstacles);
  return [
    { x: from.x, y: from.y + (from.y < to.y ? -30 : 30) },
    { x: side, y: from.y + (from.y < to.y ? -30 : 30) },
    { x: side, y: to.y + (from.y < to.y ? 30 : -30) },
    { x: to.x, y: to.y + (from.y < to.y ? 30 : -30) },
  ];
}

function routeHorizontalToHorizontal(from: Point, to: Point, obstacles: Rect[]): Point[] {
  if (Math.abs(from.y - to.y) < 1) {
    return [];
  }

  const midX = (from.x + to.x) / 2;
  const candidate = [
    { x: midX, y: from.y },
    { x: midX, y: to.y },
  ];

  if (!pathIntersectsAny([from, ...candidate, to], obstacles)) {
    return candidate;
  }

  for (const offset of [0.25, 0.75, -0.1, 1.1]) {
    const tryX = from.x + (to.x - from.x) * offset;
    const tryCandidate = [
      { x: tryX, y: from.y },
      { x: tryX, y: to.y },
    ];
    if (!pathIntersectsAny([from, ...tryCandidate, to], obstacles)) {
      return tryCandidate;
    }
  }

  const side = findFreeSideY(from, to, obstacles);
  return [
    { x: from.x + (from.x < to.x ? -30 : 30), y: from.y },
    { x: from.x + (from.x < to.x ? -30 : 30), y: side },
    { x: to.x + (from.x < to.x ? 30 : -30), y: side },
    { x: to.x + (from.x < to.x ? 30 : -30), y: to.y },
  ];
}

function findFreeSide(from: Point, to: Point, obstacles: Rect[]): number {
  const baseX = (from.x + to.x) / 2;
  // Try progressively further offsets to the right and left
  for (let offset = 80; offset < 400; offset += 40) {
    const rightX = Math.max(from.x, to.x) + offset;
    if (!pathIntersectsAny([
      from, { x: from.x, y: from.y }, { x: rightX, y: from.y },
      { x: rightX, y: to.y }, { x: to.x, y: to.y }, to
    ], obstacles)) {
      return rightX;
    }
    const leftX = Math.min(from.x, to.x) - offset;
    if (!pathIntersectsAny([
      from, { x: from.x, y: from.y }, { x: leftX, y: from.y },
      { x: leftX, y: to.y }, { x: to.x, y: to.y }, to
    ], obstacles)) {
      return leftX;
    }
  }
  return baseX + 100;
}

function findFreeSideY(from: Point, to: Point, obstacles: Rect[]): number {
  for (let offset = 80; offset < 400; offset += 40) {
    const belowY = Math.max(from.y, to.y) + offset;
    if (!pathIntersectsAny([
      { x: from.x, y: from.y }, { x: from.x, y: belowY },
      { x: to.x, y: belowY }, { x: to.x, y: to.y }
    ], obstacles)) {
      return belowY;
    }
    const aboveY = Math.min(from.y, to.y) - offset;
    if (!pathIntersectsAny([
      { x: from.x, y: from.y }, { x: from.x, y: aboveY },
      { x: to.x, y: aboveY }, { x: to.x, y: to.y }
    ], obstacles)) {
      return aboveY;
    }
  }
  return (from.y + to.y) / 2 + 100;
}

// --- Collision detection ---

function inflateRect(r: Rect): Rect {
  return {
    left: r.left - OBSTACLE_PADDING,
    top: r.top - OBSTACLE_PADDING,
    right: r.right + OBSTACLE_PADDING,
    bottom: r.bottom + OBSTACLE_PADDING,
  };
}

/**
 * Check if an axis-aligned segment intersects any obstacle.
 * Segments are either horizontal or vertical.
 */
function segmentIntersectsAny(a: Point, b: Point, obstacles: Rect[]): boolean {
  for (const obs of obstacles) {
    if (segmentIntersectsRect(a, b, inflateRect(obs))) return true;
  }
  return false;
}

function segmentIntersectsRect(a: Point, b: Point, r: Rect): boolean {
  // Horizontal segment
  if (Math.abs(a.y - b.y) < 0.5) {
    const y = a.y;
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    return y > r.top && y < r.bottom && maxX > r.left && minX < r.right;
  }
  // Vertical segment
  if (Math.abs(a.x - b.x) < 0.5) {
    const x = a.x;
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    return x > r.left && x < r.right && maxY > r.top && minY < r.bottom;
  }
  // Diagonal — shouldn't happen in orthogonal routing, treat as non-intersecting
  return false;
}

function pathIntersectsAny(pts: Point[], obstacles: Rect[]): boolean {
  for (let i = 0; i < pts.length - 1; i++) {
    if (segmentIntersectsAny(pts[i], pts[i + 1], obstacles)) return true;
  }
  return false;
}

// --- Path building with rounded corners ---

function dedup(pts: Point[]): Point[] {
  const result: Point[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const prev = result[result.length - 1];
    if (Math.abs(pts[i].x - prev.x) > 0.5 || Math.abs(pts[i].y - prev.y) > 0.5) {
      result.push(pts[i]);
    }
  }
  return result;
}

function buildRoundedPath(pts: Point[], radius: number): string {
  if (pts.length < 2) return "";
  if (pts.length === 2) {
    return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;
  }

  let d = `M ${pts[0].x} ${pts[0].y}`;

  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const next = pts[i + 1];

    // Vector from prev to curr
    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);

    // Vector from curr to next
    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;
    const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

    if (len1 === 0 || len2 === 0) {
      d += ` L ${curr.x} ${curr.y}`;
      continue;
    }

    // Clamp radius to half the shorter segment
    const r = Math.min(radius, len1 / 2, len2 / 2);

    // Point where the arc starts (on the prev→curr segment, r before curr)
    const startX = curr.x - (dx1 / len1) * r;
    const startY = curr.y - (dy1 / len1) * r;

    // Point where the arc ends (on the curr→next segment, r after curr)
    const endX = curr.x + (dx2 / len2) * r;
    const endY = curr.y + (dy2 / len2) * r;

    // Determine sweep direction
    const cross = dx1 * dy2 - dy1 * dx2;
    const sweep = cross > 0 ? 1 : 0;

    d += ` L ${startX} ${startY}`;
    d += ` A ${r} ${r} 0 0 ${sweep} ${endX} ${endY}`;
  }

  const last = pts[pts.length - 1];
  d += ` L ${last.x} ${last.y}`;

  return d;
}

/**
 * Build obstacle rectangles from node data, excluding the source and target
 * nodes of the connection being routed.
 */
export function buildObstacles(
  nodes: { id: string; x: number; y: number; w: number; h: number }[],
  excludeIds: string[]
): Rect[] {
  return nodes
    .filter((n) => !excludeIds.includes(n.id))
    .map((n) => ({
      left: n.x - n.w / 2,
      top: n.y - n.h / 2,
      right: n.x + n.w / 2,
      bottom: n.y + n.h / 2,
    }));
}
