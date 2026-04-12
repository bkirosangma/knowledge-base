import type { NodeData } from "../types";
import { getConditionDimensions } from "./conditionGeometry";

/** Compute standard node height from its width */
export function getNodeHeight(w: number): number {
  return w === 110 || w === 130 ? 60 : 70;
}

/** Resolve actual node dimensions using measured sizes with fallback to defaults */
export function getNodeDims(
  node: NodeData,
  measuredSizes: Record<string, { w: number; h: number }>,
): { w: number; h: number } {
  const measured = measuredSizes[node.id];
  if (node.shape === "condition") {
    // Always use computed dimensions — measured height includes arc sagitta
    // which getConditionAnchors adds internally
    return getConditionDimensions(node.conditionSize, node.conditionOutCount);
  }
  return {
    w: measured?.w ?? node.w,
    h: measured?.h ?? getNodeHeight(node.w),
  };
}

interface XYRect { x: number; y: number; w: number; h: number }

/** Check if two axis-aligned rectangles (x/y/w/h format) intersect */
export function rectsIntersect(a: XYRect, b: XYRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

interface LineBounds { id: string; points: { x: number; y: number }[] }

/** Check if a line segment (p1->p2) intersects an axis-aligned rectangle (Cohen-Sutherland). */
export function segmentIntersectsRect(
  x1: number, y1: number, x2: number, y2: number,
  rx: number, ry: number, rw: number, rh: number,
): boolean {
  const INSIDE = 0, LEFT = 1, RIGHT = 2, BOTTOM = 4, TOP = 8;
  const code = (x: number, y: number) => {
    let c = INSIDE;
    if (x < rx) c |= LEFT;
    else if (x > rx + rw) c |= RIGHT;
    if (y < ry) c |= BOTTOM;
    else if (y > ry + rh) c |= TOP;
    return c;
  };
  let c1 = code(x1, y1), c2 = code(x2, y2);
  let ax = x1, ay = y1, bx = x2, by = y2;
  while (true) {
    if (!(c1 | c2)) return true;
    if (c1 & c2) return false;
    const c = c1 || c2;
    let x = 0, y = 0;
    if (c & TOP) { x = ax + (bx - ax) * (ry + rh - ay) / (by - ay); y = ry + rh; }
    else if (c & BOTTOM) { x = ax + (bx - ax) * (ry - ay) / (by - ay); y = ry; }
    else if (c & RIGHT) { y = ay + (by - ay) * (rx + rw - ax) / (bx - ax); x = rx + rw; }
    else if (c & LEFT) { y = ay + (by - ay) * (rx - ax) / (bx - ax); x = rx; }
    if (c === c1) { ax = x; ay = y; c1 = code(ax, ay); }
    else { bx = x; by = y; c2 = code(bx, by); }
  }
}

const LINE_HIT_PADDING = 4;

/** Check if any segment of a multi-point polyline intersects the rectangle (with padding for stroke width). */
export function lineIntersectsRect(line: LineBounds, rect: XYRect): boolean {
  const padded: XYRect = {
    x: rect.x - LINE_HIT_PADDING,
    y: rect.y - LINE_HIT_PADDING,
    w: rect.w + LINE_HIT_PADDING * 2,
    h: rect.h + LINE_HIT_PADDING * 2,
  };
  const pts = line.points;
  for (let i = 0; i < pts.length - 1; i++) {
    if (segmentIntersectsRect(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, padded.x, padded.y, padded.w, padded.h)) {
      return true;
    }
  }
  return false;
}

export type ContextMenuTarget =
  | { type: "canvas" }
  | { type: "layer"; id: string }
  | { type: "element"; id: string };

/** Detect what's under a canvas point: element > layer > canvas */
export function detectContextMenuTarget(
  cx: number,
  cy: number,
  nodes: { id: string; x: number; y: number; w: number }[],
  getNodeDimensions: (node: { id: string; w: number }) => { w: number; h: number },
  regions: { id: string; left: number; width: number; top: number; height: number; empty: boolean }[],
): ContextMenuTarget {
  for (const n of nodes) {
    const dims = getNodeDimensions(n);
    const halfW = dims.w / 2;
    const halfH = dims.h / 2;
    if (cx >= n.x - halfW && cx <= n.x + halfW && cy >= n.y - halfH && cy <= n.y + halfH) {
      return { type: "element", id: n.id };
    }
  }
  for (const r of regions) {
    if (!r.empty && cx >= r.left && cx <= r.left + r.width && cy >= r.top && cy <= r.top + r.height) {
      return { type: "layer", id: r.id };
    }
  }
  return { type: "canvas" };
}

export type { XYRect, LineBounds };
