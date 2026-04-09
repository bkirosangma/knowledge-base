import type { Selection, NodeData } from "./types";

interface Rect { x: number; y: number; w: number; h: number }
interface RegionBounds { id: string; left: number; top: number; width: number; height: number }

export function isItemSelected(selection: Selection, type: string, id: string): boolean {
  if (!selection) return false;
  if (selection.type === type && 'id' in selection && selection.id === id) return true;
  if (selection.type === 'multi-node' && type === 'node' && selection.ids.includes(id)) return true;
  if (selection.type === 'multi-layer' && type === 'layer' && selection.ids.includes(id)) return true;
  if (selection.type === 'multi-line' && type === 'line' && selection.ids.includes(id)) return true;
  return false;
}

export function toggleItemInSelection(
  current: Selection,
  item: { type: 'node' | 'layer' | 'line'; id: string },
  nodes: NodeData[],
): Selection {
  // Nothing selected → single select
  if (!current) {
    return { type: item.type, id: item.id };
  }

  // Toggle off: clicking the same item that's already selected
  if ('id' in current && current.type === item.type && current.id === item.id) {
    return null;
  }

  // Handle node toggling
  if (item.type === 'node') {
    const clickedNode = nodes.find(n => n.id === item.id);
    if (!clickedNode) return current;

    if (current.type === 'node') {
      const existingNode = nodes.find(n => n.id === current.id);
      if (!existingNode) return { type: 'node', id: item.id };

      if (existingNode.layer === clickedNode.layer) {
        return { type: 'multi-node', ids: [current.id, item.id], layer: existingNode.layer };
      }
      // Different layers → promote to multi-layer
      const layers = new Set([existingNode.layer, clickedNode.layer]);
      return { type: 'multi-layer', ids: [...layers] };
    }

    if (current.type === 'multi-node') {
      // Toggle off if already in selection
      if (current.ids.includes(item.id)) {
        const remaining = current.ids.filter(id => id !== item.id);
        if (remaining.length === 1) return { type: 'node', id: remaining[0] };
        return { type: 'multi-node', ids: remaining, layer: current.layer };
      }
      // Add: check same layer
      if (clickedNode.layer === current.layer) {
        return { type: 'multi-node', ids: [...current.ids, item.id], layer: current.layer };
      }
      // Different layer → promote to multi-layer
      const layers = new Set([current.layer, clickedNode.layer]);
      return { type: 'multi-layer', ids: [...layers] };
    }

    // Current is layer/multi-layer/line → start fresh node selection
    return { type: 'node', id: item.id };
  }

  // Handle layer toggling
  if (item.type === 'layer') {
    if (current.type === 'layer') {
      return { type: 'multi-layer', ids: [current.id, item.id] };
    }
    if (current.type === 'multi-layer') {
      if (current.ids.includes(item.id)) {
        const remaining = current.ids.filter(id => id !== item.id);
        if (remaining.length === 1) return { type: 'layer', id: remaining[0] };
        return { type: 'multi-layer', ids: remaining };
      }
      return { type: 'multi-layer', ids: [...current.ids, item.id] };
    }
    // Current is node/multi-node/line → start fresh layer selection
    return { type: 'layer', id: item.id };
  }

  // Handle line toggling
  if (item.type === 'line') {
    if (current.type === 'line') {
      return { type: 'multi-line', ids: [current.id, item.id] };
    }
    if (current.type === 'multi-line') {
      if (current.ids.includes(item.id)) {
        const remaining = current.ids.filter(id => id !== item.id);
        if (remaining.length === 1) return { type: 'line', id: remaining[0] };
        return { type: 'multi-line', ids: remaining };
      }
      return { type: 'multi-line', ids: [...current.ids, item.id] };
    }
    // Current is node/multi-node/layer/multi-layer → start fresh line selection
    return { type: 'line', id: item.id };
  }

  return current;
}

function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

interface LineBounds { id: string; points: { x: number; y: number }[] }

/** Check if a line segment (p1→p2) intersects an axis-aligned rectangle (Cohen–Sutherland). */
function segmentIntersectsRect(
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
function lineIntersectsRect(line: LineBounds, rect: Rect): boolean {
  const padded: Rect = {
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

export function resolveRectangleSelection(
  rect: Rect,
  nodes: NodeData[],
  regions: RegionBounds[],
  getNodeDimensions: (node: { id: string; w: number }) => { w: number; h: number },
  lines: LineBounds[] = [],
): Selection {
  // Find intersected layers
  const hitLayers = regions.filter(r =>
    rectsIntersect(rect, { x: r.left, y: r.top, w: r.width, h: r.height })
  );

  // If rectangle covers >1 layer, select those layers
  if (hitLayers.length > 1) {
    return { type: 'multi-layer', ids: hitLayers.map(l => l.id) };
  }

  // Find intersected nodes
  const hitNodes = nodes.filter(node => {
    const dims = getNodeDimensions(node);
    const nodeRect: Rect = {
      x: node.x - dims.w / 2,
      y: node.y - dims.h / 2,
      w: dims.w,
      h: dims.h,
    };
    return rectsIntersect(rect, nodeRect);
  });

  if (hitNodes.length === 0) {
    if (hitLayers.length === 1) return { type: 'layer', id: hitLayers[0].id };
    // No nodes or layers hit — check lines
    const hitLines = lines.filter(l => lineIntersectsRect(l, rect));
    if (hitLines.length === 1) return { type: 'line', id: hitLines[0].id };
    if (hitLines.length > 1) return { type: 'multi-line', ids: hitLines.map(l => l.id) };
    return null;
  }

  if (hitNodes.length === 1) {
    return { type: 'node', id: hitNodes[0].id };
  }

  // Multiple nodes: check layer constraint
  const layers = new Set(hitNodes.map(n => n.layer));
  if (layers.size === 1) {
    const layer = hitNodes[0].layer;
    return { type: 'multi-node', ids: hitNodes.map(n => n.id), layer };
  }

  // Nodes from multiple layers → promote to multi-layer
  return { type: 'multi-layer', ids: [...layers] };
}

/** Toggle items from a rectangle selection against existing selection. */
export function toggleRectangleSelection(
  current: Selection,
  rectResult: Selection,
  nodes: NodeData[],
): Selection {
  if (!rectResult) return current;
  if (!current) return rectResult;

  // If types are incompatible, the rect result replaces
  const currentIsNode = current.type === 'node' || current.type === 'multi-node';
  const rectIsNode = rectResult.type === 'node' || rectResult.type === 'multi-node';
  const currentIsLayer = current.type === 'layer' || current.type === 'multi-layer';
  const rectIsLayer = rectResult.type === 'layer' || rectResult.type === 'multi-layer';
  const currentIsLine = current.type === 'line' || current.type === 'multi-line';
  const rectIsLine = rectResult.type === 'line' || rectResult.type === 'multi-line';

  // Incompatible types → rect result replaces
  if (!(currentIsNode && rectIsNode) && !(currentIsLayer && rectIsLayer) && !(currentIsLine && rectIsLine)) {
    return rectResult;
  }

  // Collect IDs from rect result
  const rectIds = 'ids' in rectResult ? rectResult.ids : [rectResult.id];

  // Toggle nodes
  if (currentIsNode && rectIsNode) {
    const currentIds = current.type === 'node' ? [current.id] : current.ids;
    const currentLayer = current.type === 'node'
      ? nodes.find(n => n.id === current.id)?.layer
      : current.layer;

    // Symmetric difference: items in one set but not both
    const toggled = new Set(currentIds);
    for (const id of rectIds) {
      if (toggled.has(id)) toggled.delete(id);
      else toggled.add(id);
    }

    if (toggled.size === 0) return null;

    const resultIds = [...toggled];
    // Determine layer(s)
    const layers = new Set(resultIds.map(id => nodes.find(n => n.id === id)?.layer).filter(Boolean) as string[]);
    if (layers.size > 1) {
      return { type: 'multi-layer', ids: [...layers] };
    }
    const layer = layers.values().next().value ?? currentLayer ?? '';
    if (resultIds.length === 1) return { type: 'node', id: resultIds[0] };
    return { type: 'multi-node', ids: resultIds, layer };
  }

  // Toggle layers
  if (currentIsLayer && rectIsLayer) {
    const currentIds = current.type === 'layer' ? [current.id] : current.ids;
    const toggled = new Set(currentIds);
    for (const id of rectIds) {
      if (toggled.has(id)) toggled.delete(id);
      else toggled.add(id);
    }

    if (toggled.size === 0) return null;
    const resultIds = [...toggled];
    if (resultIds.length === 1) return { type: 'layer', id: resultIds[0] };
    return { type: 'multi-layer', ids: resultIds };
  }

  // Toggle lines
  if (currentIsLine && rectIsLine) {
    const currentIds = current.type === 'line' ? [current.id] : current.ids;
    const toggled = new Set(currentIds);
    for (const id of rectIds) {
      if (toggled.has(id)) toggled.delete(id);
      else toggled.add(id);
    }

    if (toggled.size === 0) return null;
    const resultIds = [...toggled];
    if (resultIds.length === 1) return { type: 'line', id: resultIds[0] };
    return { type: 'multi-line', ids: resultIds };
  }

  return rectResult;
}
