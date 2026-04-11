/** Geometry calculations for condition elements (triangle with circular arc base). */

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

export interface ConditionAnchor {
  id: string;
  x: number;
  y: number;
  anchorType: 'in' | 'out';
}

/** Fixed isosceles side length (vertex to base corner), equal to the side at 7+ anchors (120°) with w=140. */
const SIDE_LENGTH = 70 / Math.sin(60 * Math.PI / 180); // ≈ 80.83

/** Compute vertex angle (degrees) based on out-anchor count. Starts at 45°, increases per anchor, caps at 120°. */
function getVertexAngle(outCount: number): number {
  const base = 60;
  const perAnchor = 12;
  return Math.min(120, base + Math.max(0, outCount - 2) * perAnchor);
}

/** Compute width and height from fixed side length and vertex angle. */
function computeDimensions(outCount: number): { w: number; h: number } {
  const angle = getVertexAngle(outCount);
  const halfRad = (angle / 2) * Math.PI / 180;
  const w = Math.round(2 * SIDE_LENGTH * Math.sin(halfRad));
  const h = Math.round(SIDE_LENGTH * Math.cos(halfRad));
  return { w, h };
}

/** Default width at max vertex angle (used for scale reference). */
export const CONDITION_WIDTH = Math.round(2 * SIDE_LENGTH * Math.sin(60 * Math.PI / 180)); // 140
/** Default height at 2 anchors (60°). */
export const CONDITION_HEIGHT = Math.round(SIDE_LENGTH * Math.cos(30 * Math.PI / 180)); // ~70

/** Get the scale factor for a condition size level (1-5). */
export function getConditionScale(size?: number): number {
  const s = size ?? 1;
  return 1 + (s - 1) * 0.25; // 1.0, 1.25, 1.50, 1.75, 2.0
}

/** Get the dimensions for a condition at a given size level and out-anchor count. */
export function getConditionDimensions(size?: number, outCount?: number): { w: number; h: number } {
  const scale = getConditionScale(size);
  const dims = computeDimensions(outCount ?? 2);
  return { w: Math.round(dims.w * scale), h: Math.round(dims.h * scale) };
}

/** Compute circular arc parameters for the base. Returns null for outCount <= 2. */
function getArcParams(w: number, outCount: number): { R: number; sagitta: number; arcCenterY: number; halfAngle: number } | null {
  if (outCount <= 2) return null;
  const sagitta = w * 0.10 * Math.min(outCount - 2, 5);
  const R = (w * w) / (8 * sagitta) + sagitta / 2;
  const halfAngle = Math.asin(Math.min(1, w / (2 * R)));
  const arcCenterY = -R + sagitta; // relative to base line (y=h)
  return { R, sagitta, arcCenterY, halfAngle };
}

/** Get the effective bounding height including arc sagitta. */
export function getEffectiveConditionHeight(h: number, w: number, outCount: number): number {
  const arc = getArcParams(w, outCount);
  return h + (arc ? arc.sagitta : 0);
}

/**
 * Compute local-space anchor positions along the base (unrotated).
 * Returns points from left to right in local SVG coordinates (0,0 to w,effectiveH).
 */
function getLocalBasePoints(w: number, h: number, outCount: number): { x: number; y: number }[] {
  const count = Math.max(2, outCount);
  const arc = getArcParams(w, outCount);

  if (!arc) {
    // No arc for outCount <= 2: just the two base corners
    return [{ x: 0, y: h }, { x: w, y: h }];
  }

  // Distribute points along the circular arc
  const { R, arcCenterY, halfAngle } = arc;
  const cxLocal = w / 2;
  const cyLocal = h + arcCenterY; // arc circle center in local coords
  const points: { x: number; y: number }[] = [];

  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1); // 0=left, 1=right
    // Angle goes from (PI/2 + halfAngle) at left to (PI/2 - halfAngle) at right
    const angle = (Math.PI / 2 + halfAngle) - t * (2 * halfAngle);
    const x = cxLocal + R * Math.cos(angle);
    const y = cyLocal + R * Math.sin(angle);
    points.push({ x, y });
  }
  return points;
}

/**
 * Get the SVG path for a condition shape in local coordinates.
 * The in-anchor vertex is at the top center. The base uses a circular arc for 3+ anchors.
 */
export function getConditionPath(w: number, h: number, outCount: number): string {
  const topX = w / 2;
  const topY = 0;

  if (outCount <= 2) {
    // Plain isosceles triangle
    return `M ${topX} ${topY} L ${w} ${h} L 0 ${h} Z`;
  }

  // Triangle with circular arc base
  const arc = getArcParams(w, outCount);
  if (!arc) return `M ${topX} ${topY} L ${w} ${h} L 0 ${h} Z`;

  const basePoints = getLocalBasePoints(w, h, outCount);
  const rightCorner = basePoints[basePoints.length - 1];
  const leftCorner = basePoints[0];

  // Path: top vertex → right corner → circular arc to left corner → close
  // SVG arc: A rx ry x-rotation large-arc-flag sweep-flag x y
  // sweep-flag=1 for clockwise (bulging downward from right to left)
  return `M ${topX} ${topY} L ${rightCorner.x} ${rightCorner.y} A ${arc.R} ${arc.R} 0 0 1 ${leftCorner.x} ${leftCorner.y} Z`;
}

/**
 * Get anchor positions for a condition element.
 * All positions are in absolute (canvas) coordinates.
 * `h` should be the **base** height (before arc sagitta).
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

  // Out-anchors: distributed along the base (or arc)
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
