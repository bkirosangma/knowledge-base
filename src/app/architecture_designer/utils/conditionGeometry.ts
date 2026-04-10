/** Geometry calculations for condition elements (triangle with convex segmented base). */

/** Rotate a point (px, py) around center (cx, cy) by angleDeg degrees. */
export function rotatePoint(px: number, py: number, cx: number, cy: number, angleDeg: number): { x: number; y: number } {
  if (angleDeg === 0) return { x: px, y: py };
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = px - cx;
  const dy = py - cy;
  return {
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  };
}

/** Rotate a direction vector by angleDeg. */
function rotateDir(dx: number, dy: number, angleDeg: number): { dx: number; dy: number } {
  if (angleDeg === 0) return { dx, dy };
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    dx: dx * cos - dy * sin,
    dy: dx * sin + dy * cos,
  };
}

/** Default condition element dimensions. */
export const CONDITION_WIDTH = 120;
export const CONDITION_HEIGHT = 100;

/** Get the scale factor for a condition size level (1-5). */
export function getConditionScale(size?: number): number {
  const s = size ?? 1;
  return 1 + (s - 1) * 0.25; // 1.0, 1.25, 1.50, 1.75, 2.0
}

/** Get the dimensions for a condition at a given size level. */
export function getConditionDimensions(size?: number): { w: number; h: number } {
  const scale = getConditionScale(size);
  return { w: Math.round(CONDITION_WIDTH * scale), h: Math.round(CONDITION_HEIGHT * scale) };
}

/** Compute the convex bulge amount for a given width and out-anchor count. */
function getBulge(w: number, outCount: number): number {
  if (outCount <= 2) return 0;
  return w * 0.12 * Math.min(outCount - 2, 5);
}

/** Get the effective bounding height including convex bulge. */
export function getEffectiveConditionHeight(h: number, w: number, outCount: number): number {
  return h + getBulge(w, outCount);
}

/**
 * Compute local-space anchor positions along the base (unrotated).
 * Returns points from left to right in local SVG coordinates (0,0 to w,h+bulge).
 */
function getLocalBasePoints(w: number, h: number, outCount: number): { x: number; y: number }[] {
  const count = Math.max(2, outCount);
  const bulge = getBulge(w, outCount);
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1); // 0 = left, 1 = right
    const x = t * w;
    // Convex: y bulges outward (below the base line)
    const y = h + bulge * 4 * t * (1 - t);
    points.push({ x, y });
  }
  return points;
}

/**
 * Get the SVG path for a condition shape in local coordinates.
 * The in-anchor vertex is at the top center. The base has straight-line segments
 * connecting each out-anchor position, with a convex bulge for 3+ anchors.
 */
export function getConditionPath(w: number, h: number, outCount: number): string {
  const topX = w / 2;
  const topY = 0;

  if (outCount <= 2) {
    // Plain isosceles triangle
    return `M ${topX} ${topY} L ${w} ${h} L 0 ${h} Z`;
  }

  // Triangle with straight-line segments along convex base
  const basePoints = getLocalBasePoints(w, h, outCount);
  // Path: top vertex → right corner (last base point) → intermediate points right-to-left → left corner (first base point) → close
  let path = `M ${topX} ${topY}`;
  // Go from rightmost to leftmost
  for (let i = basePoints.length - 1; i >= 0; i--) {
    path += ` L ${basePoints[i].x} ${basePoints[i].y}`;
  }
  path += ' Z';
  return path;
}

export interface ConditionAnchor {
  id: string;
  x: number;
  y: number;
  anchorType: 'in' | 'out';
}

/**
 * Get anchor positions for a condition element.
 * All positions are in absolute (canvas) coordinates.
 * `h` should be the **base** height (before convex bulge).
 * The function internally computes the effective height for positioning.
 */
export function getConditionAnchors(
  cx: number, cy: number, w: number, h: number,
  outCount: number, rotation: number = 0,
): ConditionAnchor[] {
  const effectiveH = getEffectiveConditionHeight(h, w, outCount);
  const ehh = effectiveH / 2;
  const hw = w / 2;
  const anchors: ConditionAnchor[] = [];

  // In-anchor: top vertex (before rotation)
  const inLocal = { x: cx, y: cy - ehh };
  const inRotated = rotatePoint(inLocal.x, inLocal.y, cx, cy, rotation);
  anchors.push({ id: "cond-in", x: inRotated.x, y: inRotated.y, anchorType: 'in' });

  // Out-anchors: distributed along the base with convex bulge
  const basePoints = getLocalBasePoints(w, h, outCount);
  const count = Math.max(2, outCount);
  for (let i = 0; i < count; i++) {
    // Convert from local SVG coords (0,0 to w,effectiveH) to canvas coords centered on (cx, cy)
    const localX = cx - hw + basePoints[i].x;
    const localY = cy - ehh + basePoints[i].y;
    const rotated = rotatePoint(localX, localY, cx, cy, rotation);
    anchors.push({ id: `cond-out-${i}`, x: rotated.x, y: rotated.y, anchorType: 'out' });
  }

  return anchors;
}

/** Get position of a single condition anchor. */
export function getConditionAnchorPosition(
  anchorId: string, cx: number, cy: number, w: number, h: number,
  outCount: number, rotation: number = 0,
): { x: number; y: number } {
  const all = getConditionAnchors(cx, cy, w, h, outCount, rotation);
  const found = all.find((a) => a.id === anchorId);
  return found ? { x: found.x, y: found.y } : { x: cx, y: cy };
}

/** Get the outward direction of a condition anchor. */
export function getConditionAnchorDirection(
  anchorId: string, cx: number, cy: number, w: number, h: number,
  outCount: number, rotation: number = 0,
): { dx: number; dy: number } {
  if (anchorId === "cond-in") {
    return rotateDir(0, -1, rotation);
  }
  // For out-anchors: direction from center toward anchor position
  const pos = getConditionAnchorPosition(anchorId, cx, cy, w, h, outCount, rotation);
  const dx = pos.x - cx;
  const dy = pos.y - cy;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.01) return rotateDir(0, 1, rotation);
  return { dx: dx / len, dy: dy / len };
}
