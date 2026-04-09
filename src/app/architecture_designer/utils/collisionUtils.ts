export const LAYER_GAP = 10;
export const NODE_GAP = 8;

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface LayerBounds extends Rect {
  id: string;
  empty: boolean;
}

/** Check if two rects overlap (with gap) */
export function rectsOverlap(a: Rect, b: Rect, gap: number): boolean {
  return (
    a.left < b.left + b.width + gap &&
    a.left + a.width + gap > b.left &&
    a.top < b.top + b.height + gap &&
    a.top + a.height + gap > b.top
  );
}

/** Is `val` between `a` and `b` (inclusive, order-independent)? */
export function between(val: number, a: number, b: number): boolean {
  return a <= b ? a <= val && val <= b : b <= val && val <= a;
}

/**
 * Clamp a drag delta so the dragged layer can't overlap any other layer.
 *
 * For each obstacle, computes the 4 exclusion-zone edges in delta-space.
 * Generates candidate positions by snapping to each edge, then picks
 * the candidate closest to the raw delta that doesn't overlap any obstacle.
 */
export function clampLayerDelta(
  draggedBounds: LayerBounds,
  others: LayerBounds[],
  rawDx: number,
  rawDy: number,
  prevDx: number,
  prevDy: number,
): { dx: number; dy: number } {
  const obstacles = others.filter((l) => !l.empty && l.id !== draggedBounds.id);
  if (obstacles.length === 0) return { dx: rawDx, dy: rawDy };

  const anyOverlap = (tdx: number, tdy: number) => {
    const b: Rect = { left: draggedBounds.left + tdx, top: draggedBounds.top + tdy, width: draggedBounds.width, height: draggedBounds.height };
    return obstacles.some((o) => rectsOverlap(b, o, LAYER_GAP));
  };

  // Fast path — no collision
  if (!anyOverlap(rawDx, rawDy)) return { dx: rawDx, dy: rawDy };

  const xEdges: number[] = [rawDx, prevDx];
  const yEdges: number[] = [rawDy, prevDy];

  for (const obs of obstacles) {
    const exL = obs.left - LAYER_GAP - draggedBounds.width - draggedBounds.left;
    const exR = obs.left + obs.width + LAYER_GAP - draggedBounds.left;
    const exT = obs.top - LAYER_GAP - draggedBounds.height - draggedBounds.top;
    const exB = obs.top + obs.height + LAYER_GAP - draggedBounds.top;

    if (between(exL, prevDx, rawDx)) xEdges.push(exL);
    if (between(exR, prevDx, rawDx)) xEdges.push(exR);
    if (between(exT, prevDy, rawDy)) yEdges.push(exT);
    if (between(exB, prevDy, rawDy)) yEdges.push(exB);
  }

  // Try every combination of X edge × Y edge, pick the closest valid one
  let bestDx = prevDx, bestDy = prevDy, bestDist = Infinity;
  let found = false;

  for (const dx of xEdges) {
    for (const dy of yEdges) {
      if (anyOverlap(dx, dy)) continue;
      const dist = (dx - rawDx) ** 2 + (dy - rawDy) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        bestDx = dx;
        bestDy = dy;
        found = true;
      }
    }
  }

  if (found) return { dx: bestDx, dy: bestDy };

  // Binary search along the vector from previous position to raw target
  let lo = 0;
  let hi = 1;
  const vecDx = rawDx - prevDx;
  const vecDy = rawDy - prevDy;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (anyOverlap(prevDx + vecDx * mid, prevDy + vecDy * mid)) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return { dx: prevDx + vecDx * lo, dy: prevDy + vecDy * lo };
}

/**
 * Clamp a node position so it can't overlap any sibling node.
 * Mirrors the layer clamp algorithm but operates on center-based
 * coordinates (x, y) converted to rects.
 */
export function clampNodePosition(
  x: number,
  y: number,
  halfW: number,
  halfH: number,
  prevX: number,
  prevY: number,
  siblings: Rect[],
): { x: number; y: number } {
  if (siblings.length === 0) return { x, y };

  const toRect = (cx: number, cy: number): Rect => ({
    left: cx - halfW,
    top: cy - halfH,
    width: halfW * 2,
    height: halfH * 2,
  });

  const anyOverlap = (cx: number, cy: number) => {
    const r = toRect(cx, cy);
    return siblings.some((s) => rectsOverlap(r, s, NODE_GAP));
  };

  // Fast path — no collision
  if (!anyOverlap(x, y)) return { x, y };

  // Collect exclusion-zone edges in position-space
  const draggedRect = toRect(prevX, prevY);
  const xEdges: number[] = [x, prevX];
  const yEdges: number[] = [y, prevY];

  for (const obs of siblings) {
    const exL = obs.left - NODE_GAP - draggedRect.width + halfW;
    const exR = obs.left + obs.width + NODE_GAP + halfW;
    const exT = obs.top - NODE_GAP - draggedRect.height + halfH;
    const exB = obs.top + obs.height + NODE_GAP + halfH;

    if (between(exL, prevX, x)) xEdges.push(exL);
    if (between(exR, prevX, x)) xEdges.push(exR);
    if (between(exT, prevY, y)) yEdges.push(exT);
    if (between(exB, prevY, y)) yEdges.push(exB);
  }

  let bestX = prevX, bestY = prevY, bestDist = Infinity;
  let found = false;

  for (const ex of xEdges) {
    for (const ey of yEdges) {
      if (anyOverlap(ex, ey)) continue;
      const dist = (ex - x) ** 2 + (ey - y) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        bestX = ex;
        bestY = ey;
        found = true;
      }
    }
  }

  if (found) return { x: bestX, y: bestY };

  // Binary search fallback
  let lo = 0;
  let hi = 1;
  const vecX = x - prevX;
  const vecY = y - prevY;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (anyOverlap(prevX + vecX * mid, prevY + vecY * mid)) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return { x: prevX + vecX * lo, y: prevY + vecY * lo };
}

interface NodeRect {
  x: number; y: number; halfW: number; halfH: number;
}

/**
 * Clamp a group drag delta so no dragged node overlaps any non-dragged sibling.
 * Uses the same edge-snapping + binary-search approach as clampNodePosition,
 * but operates in delta-space and checks all dragged nodes against all siblings.
 */
export function clampMultiNodeDelta(
  dx: number,
  dy: number,
  prevDx: number,
  prevDy: number,
  draggedNodes: NodeRect[],
  siblings: Rect[],
): { dx: number; dy: number } {
  if (siblings.length === 0 || draggedNodes.length === 0) return { dx, dy };

  const anyOverlap = (ddx: number, ddy: number) => {
    for (const dn of draggedNodes) {
      const r: Rect = {
        left: dn.x + ddx - dn.halfW,
        top: dn.y + ddy - dn.halfH,
        width: dn.halfW * 2,
        height: dn.halfH * 2,
      };
      for (const s of siblings) {
        if (rectsOverlap(r, s, NODE_GAP)) return true;
      }
    }
    return false;
  };

  // Fast path — no collision
  if (!anyOverlap(dx, dy)) return { dx, dy };

  // Collect exclusion-zone edges in delta-space
  const dxEdges: number[] = [dx, prevDx];
  const dyEdges: number[] = [dy, prevDy];

  for (const dn of draggedNodes) {
    const dw = dn.halfW * 2;
    const dh = dn.halfH * 2;
    for (const obs of siblings) {
      // Left/right edges: where dragged node just clears the obstacle
      const exL = obs.left - NODE_GAP - dw + dn.halfW - dn.x;
      const exR = obs.left + obs.width + NODE_GAP + dn.halfW - dn.x;
      const exT = obs.top - NODE_GAP - dh + dn.halfH - dn.y;
      const exB = obs.top + obs.height + NODE_GAP + dn.halfH - dn.y;

      if (between(exL, prevDx, dx)) dxEdges.push(exL);
      if (between(exR, prevDx, dx)) dxEdges.push(exR);
      if (between(exT, prevDy, dy)) dyEdges.push(exT);
      if (between(exB, prevDy, dy)) dyEdges.push(exB);
    }
  }

  let bestDx = prevDx, bestDy = prevDy, bestDist = Infinity;
  let found = false;

  for (const ex of dxEdges) {
    for (const ey of dyEdges) {
      if (anyOverlap(ex, ey)) continue;
      const dist = (ex - dx) ** 2 + (ey - dy) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        bestDx = ex;
        bestDy = ey;
        found = true;
      }
    }
  }

  if (found) return { dx: bestDx, dy: bestDy };

  // Binary search fallback along the delta vector
  let lo = 0;
  let hi = 1;
  const vecX = dx - prevDx;
  const vecY = dy - prevDy;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (anyOverlap(prevDx + vecX * mid, prevDy + vecY * mid)) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return { dx: prevDx + vecX * lo, dy: prevDy + vecY * lo };
}

/**
 * Find the closest non-overlapping position for a new layer.
 * Uses the same edge-snapping approach as clampLayerDelta but without
 * the between() constraint — considers all 4 edges of every obstacle.
 */
export function findNonOverlappingLayerPosition(
  newRect: Rect,
  obstacles: LayerBounds[],
): { left: number; top: number } {
  const solid = obstacles.filter((o) => !(o.empty && o.width === 0));
  if (solid.length === 0) return { left: newRect.left, top: newRect.top };

  const anyOverlap = (left: number, top: number) => {
    const r: Rect = { left, top, width: newRect.width, height: newRect.height };
    return solid.some((o) => rectsOverlap(r, o, LAYER_GAP));
  };

  if (!anyOverlap(newRect.left, newRect.top)) {
    return { left: newRect.left, top: newRect.top };
  }

  // Generate candidate positions from all obstacle edges
  const xCandidates: number[] = [newRect.left];
  const yCandidates: number[] = [newRect.top];

  for (const obs of solid) {
    // Place to the left of obstacle
    xCandidates.push(obs.left - LAYER_GAP - newRect.width);
    // Place to the right of obstacle
    xCandidates.push(obs.left + obs.width + LAYER_GAP);
    // Place above obstacle
    yCandidates.push(obs.top - LAYER_GAP - newRect.height);
    // Place below obstacle
    yCandidates.push(obs.top + obs.height + LAYER_GAP);
  }

  let bestLeft = newRect.left;
  let bestTop = newRect.top;
  let bestDist = Infinity;

  for (const x of xCandidates) {
    for (const y of yCandidates) {
      if (anyOverlap(x, y)) continue;
      const dist = (x - newRect.left) ** 2 + (y - newRect.top) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        bestLeft = x;
        bestTop = y;
      }
    }
  }

  return { left: bestLeft, top: bestTop };
}
