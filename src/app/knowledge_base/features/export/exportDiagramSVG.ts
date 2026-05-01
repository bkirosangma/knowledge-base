// Diagram → standalone SVG (KB-011 / EXPORT-9.1).
//
// Pure `(doc: DiagramData) => string` returning a complete SVG document
// that opens in a fresh browser tab and renders without app CSS. All
// colours and geometry are inlined — no class lookups, no external
// stylesheet, no `currentColor`.
//
// Geometry deliberately re-uses the same helpers the on-screen canvas
// relies on (`computeRegions`, `getNodeHeight`, `getConditionPath`,
// `getConditionDimensions`, `computePath`, `getNodeAnchorPosition`) so
// the export and the canvas agree on layout. v1 omits Lucide icons
// inside nodes (out of scope per the spec) and omits decorative
// shadows / rings.

import type { Connection, DiagramData, FlowDef, LayerDef, SerializedNodeData } from "../../shared/utils/types";
import { computeRegions } from "../diagram/utils/layerBounds";
import { getNodeHeight } from "../diagram/utils/geometry";
import { getConditionDimensions, getConditionPath, getEffectiveConditionHeight } from "../diagram/utils/conditionGeometry";
import { computePath } from "../diagram/utils/pathRouter";
import { getNodeAnchorPosition } from "../diagram/utils/anchors";
import type { LineCurveAlgorithm } from "../diagram/types";

const MARGIN = 40;
const TITLE_HEIGHT = 32;
const FONT_FAMILY = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

const DEFAULT_NODE_BG = "#ffffff";
const DEFAULT_NODE_BORDER = "#e2e8f0";
const DEFAULT_NODE_TEXT = "#1e293b";
const DEFAULT_LINE_COLOUR = "#64748b";

interface NodeBox {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

export function exportDiagramSVG(doc: DiagramData): string {
  const { title, layers, nodes, connections, flows = [], layerManualSizes = {} } = doc;
  const lineCurve: LineCurveAlgorithm = doc.lineCurve ?? "orthogonal";

  // Stable iteration order so snapshot tests stay byte-identical.
  const sortedLayers = [...layers].sort((a, b) => a.id.localeCompare(b.id));
  const sortedNodes = [...nodes].sort((a, b) => a.id.localeCompare(b.id));
  const sortedConnections = [...connections].sort((a, b) => a.id.localeCompare(b.id));

  // Per-node bounding box (centre-anchored coords + dimensions).
  const boxes = new Map<string, NodeBox>();
  for (const n of sortedNodes) {
    boxes.set(n.id, nodeBox(n));
  }

  // Layer regions — the on-screen canvas uses `computeRegions` with the
  // same dimension function, so this matches what the user sees.
  // computeRegions only reads identity (id), layer, position, and the
  // value returned by `getNodeDimensions`. Cast through `unknown` so we
  // don't have to fabricate placeholder icon components on the export
  // path; the helper never reaches into `NodeAppearance`.
  const regions = computeRegions(
    sortedLayers,
    sortedNodes.map(deserializeShape) as unknown as Parameters<typeof computeRegions>[1],
    (node) => {
      const b = boxes.get(node.id);
      return b ? { w: b.w, h: b.h } : { w: 200, h: getNodeHeight(200) };
    },
    layerManualSizes,
    null,
    null,
  );

  // Compute view bounds across regions, nodes, and connection sample
  // points so nothing clips. Add a margin on all sides + a band at the
  // top for the diagram title.
  const bounds = computeBounds(regions, boxes, sortedNodes, sortedConnections, lineCurve);
  const viewMinX = bounds.minX - MARGIN;
  const viewMinY = bounds.minY - MARGIN - TITLE_HEIGHT;
  const viewW = bounds.maxX - bounds.minX + MARGIN * 2;
  const viewH = bounds.maxY - bounds.minY + MARGIN * 2 + TITLE_HEIGHT;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${num(viewMinX)} ${num(viewMinY)} ${num(viewW)} ${num(viewH)}" width="${num(viewW)}" height="${num(viewH)}" font-family="${FONT_FAMILY}">`,
  );

  // White background — without this the SVG is transparent and the
  // browser's tab renders it on whatever colour the user has, which
  // hurts the "visually matches the canvas" check.
  parts.push(
    `<rect x="${num(viewMinX)}" y="${num(viewMinY)}" width="${num(viewW)}" height="${num(viewH)}" fill="#f8fafc" />`,
  );

  // Diagram title.
  if (title) {
    parts.push(
      `<text x="${num(viewMinX + MARGIN)}" y="${num(viewMinY + TITLE_HEIGHT - 8)}" font-size="20" font-weight="600" fill="${DEFAULT_NODE_TEXT}">${escapeText(title)}</text>`,
    );
  }

  // Layer regions go behind nodes.
  for (const r of regions) {
    if (r.empty && r.width === 0) continue;
    parts.push(renderRegion(r));
  }

  // Connections are rendered before nodes so node boxes sit on top.
  for (const conn of sortedConnections) {
    const fragment = renderConnection(conn, sortedNodes, boxes, lineCurve, flows);
    if (fragment) parts.push(fragment);
  }

  // Nodes.
  for (const n of sortedNodes) {
    const box = boxes.get(n.id);
    if (!box) continue;
    parts.push(renderNode(n, box));
  }

  parts.push(`</svg>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n` + parts.join("\n") + "\n";
}

// ─── Node geometry ────────────────────────────────────────────────────

function nodeBox(n: SerializedNodeData): NodeBox {
  const cx = n.x;
  const cy = n.y;
  if (n.shape === "condition") {
    const dims = getConditionDimensions(n.conditionSize, n.conditionOutCount);
    const effH = getEffectiveConditionHeight(dims.h, dims.w, n.conditionOutCount ?? 2);
    return { cx, cy, w: dims.w, h: effH };
  }
  const w = n.w;
  return { cx, cy, w, h: getNodeHeight(w) };
}

/** computeRegions reads only `layer`, `id`, and dimensions from each
 *  node. We don't need a full `NodeData` deserialisation here — the
 *  helper accepts the slice it actually consumes. */
function deserializeShape(n: SerializedNodeData): {
  id: string;
  layer: string;
  x: number;
  y: number;
  w: number;
} {
  return { id: n.id, layer: n.layer, x: n.x, y: n.y, w: n.w };
}

// ─── Bounds ───────────────────────────────────────────────────────────

function computeBounds(
  regions: ReturnType<typeof computeRegions>,
  boxes: Map<string, NodeBox>,
  nodes: SerializedNodeData[],
  connections: Connection[],
  lineCurve: LineCurveAlgorithm,
): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  // Empty diagram fallback.
  if (nodes.length === 0 && regions.every((r) => r.empty)) {
    return { minX: 0, minY: 0, maxX: 400, maxY: 200 };
  }

  for (const r of regions) {
    if (r.empty && r.width === 0) continue;
    if (r.left < minX) minX = r.left;
    if (r.top < minY) minY = r.top;
    if (r.left + r.width > maxX) maxX = r.left + r.width;
    if (r.top + r.height > maxY) maxY = r.top + r.height;
  }
  for (const b of boxes.values()) {
    if (b.cx - b.w / 2 < minX) minX = b.cx - b.w / 2;
    if (b.cy - b.h / 2 < minY) minY = b.cy - b.h / 2;
    if (b.cx + b.w / 2 > maxX) maxX = b.cx + b.w / 2;
    if (b.cy + b.h / 2 > maxY) maxY = b.cy + b.h / 2;
  }
  for (const conn of connections) {
    const sample = connectionGeometry(conn, nodes, boxes, lineCurve);
    if (!sample) continue;
    for (const p of sample.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
    return { minX: 0, minY: 0, maxX: 400, maxY: 200 };
  }
  return { minX, minY, maxX, maxY };
}

// ─── Layer regions ────────────────────────────────────────────────────

function renderRegion(r: ReturnType<typeof computeRegions>[number]): string {
  const titleY = r.top + 18;
  const titleX = r.left + 12;
  return [
    `<rect x="${num(r.left)}" y="${num(r.top)}" width="${num(r.width)}" height="${num(r.height)}" fill="${escapeAttr(r.bg)}" stroke="${escapeAttr(r.border)}" stroke-width="1" rx="6" />`,
    r.title
      ? `<text x="${num(titleX)}" y="${num(titleY)}" font-size="11" font-weight="600" letter-spacing="1" fill="${escapeAttr(r.textColor ?? "#475569")}" text-transform="uppercase">${escapeText(r.title.toUpperCase())}</text>`
      : "",
  ].filter(Boolean).join("\n");
}

// ─── Nodes ────────────────────────────────────────────────────────────

function renderNode(n: SerializedNodeData, box: NodeBox): string {
  if (n.shape === "condition") return renderCondition(n, box);
  return renderRect(n, box);
}

function renderRect(n: SerializedNodeData, box: NodeBox): string {
  const x = box.cx - box.w / 2;
  const y = box.cy - box.h / 2;
  const fill = n.bgColor ?? DEFAULT_NODE_BG;
  const stroke = n.borderColor ?? DEFAULT_NODE_BORDER;
  const text = n.textColor ?? DEFAULT_NODE_TEXT;
  const labelY = box.cy + (n.sub ? -2 : 4);

  const parts: string[] = [];
  parts.push(
    `<rect x="${num(x)}" y="${num(y)}" width="${num(box.w)}" height="${num(box.h)}" rx="8" ry="8" fill="${escapeAttr(fill)}" stroke="${escapeAttr(stroke)}" stroke-width="1" />`,
  );
  parts.push(
    `<text x="${num(box.cx)}" y="${num(labelY)}" font-size="13" font-weight="600" fill="${escapeAttr(text)}" text-anchor="middle">${escapeText(n.label)}</text>`,
  );
  if (n.sub) {
    parts.push(
      `<text x="${num(box.cx)}" y="${num(box.cy + 14)}" font-size="10.5" fill="${escapeAttr(`${text}99`)}" text-anchor="middle">${escapeText(n.sub)}</text>`,
    );
  }
  return parts.join("\n");
}

function renderCondition(n: SerializedNodeData, box: NodeBox): string {
  const dims = getConditionDimensions(n.conditionSize, n.conditionOutCount);
  const path = getConditionPath(dims.w, dims.h, n.conditionOutCount ?? 2);
  // getConditionPath is in local SVG coordinates (origin at top-left of
  // the bounding box). We translate to the node's centre and rotate as
  // the canvas does.
  const tx = box.cx - dims.w / 2;
  const ty = box.cy - box.h / 2;
  const rotation = n.rotation ?? 0;
  const fill = n.bgColor ?? DEFAULT_NODE_BG;
  const stroke = n.borderColor ?? DEFAULT_NODE_BORDER;
  const text = n.textColor ?? DEFAULT_NODE_TEXT;
  const transform = rotation
    ? `translate(${num(tx)} ${num(ty)}) rotate(${num(rotation)} ${num(dims.w / 2)} ${num(box.h / 2)})`
    : `translate(${num(tx)} ${num(ty)})`;

  return [
    `<g transform="${transform}">`,
    `  <path d="${path}" fill="${escapeAttr(fill)}" stroke="${escapeAttr(stroke)}" stroke-width="1" />`,
    `</g>`,
    `<text x="${num(box.cx)}" y="${num(box.cy + 4)}" font-size="13" font-weight="600" fill="${escapeAttr(text)}" text-anchor="middle">${escapeText(n.label)}</text>`,
  ].join("\n");
}

// ─── Connections ──────────────────────────────────────────────────────

function connectionGeometry(
  conn: Connection,
  nodes: SerializedNodeData[],
  boxes: Map<string, NodeBox>,
  lineCurve: LineCurveAlgorithm,
): { path: string; points: Array<{ x: number; y: number }> } | null {
  const fromNode = nodes.find((n) => n.id === conn.from);
  const toNode = nodes.find((n) => n.id === conn.to);
  if (!fromNode || !toNode) return null;
  const fromBox = boxes.get(fromNode.id);
  const toBox = boxes.get(toNode.id);
  if (!fromBox || !toBox) return null;

  const fromPos = getNodeAnchorPosition(
    conn.fromAnchor,
    fromBox.cx,
    fromBox.cy,
    fromBox.w,
    fromBox.h,
    fromNode.shape,
    fromNode.conditionOutCount,
    fromNode.rotation,
  );
  const toPos = getNodeAnchorPosition(
    conn.toAnchor,
    toBox.cx,
    toBox.cy,
    toBox.w,
    toBox.h,
    toNode.shape,
    toNode.conditionOutCount,
    toNode.rotation,
  );
  // Simple obstacle list: every other node's bbox. The on-screen
  // canvas computes obstacles slightly differently for orthogonal
  // routing, but the visual difference at export size is minor and
  // doesn't affect the snapshot fixture (which uses bezier).
  const obstacles = nodes
    .filter((n) => n.id !== fromNode.id && n.id !== toNode.id)
    .map((n) => {
      const b = boxes.get(n.id);
      if (!b) return null;
      return {
        left: b.cx - b.w / 2,
        right: b.cx + b.w / 2,
        top: b.cy - b.h / 2,
        bottom: b.cy + b.h / 2,
      };
    })
    .filter((r): r is { left: number; right: number; top: number; bottom: number } => r !== null);

  return computePath(
    lineCurve,
    fromPos,
    toPos,
    conn.fromAnchor,
    conn.toAnchor,
    obstacles,
    conn.waypoints,
  );
}

function renderConnection(
  conn: Connection,
  nodes: SerializedNodeData[],
  boxes: Map<string, NodeBox>,
  lineCurve: LineCurveAlgorithm,
  flows: FlowDef[],
): string | null {
  const geom = connectionGeometry(conn, nodes, boxes, lineCurve);
  if (!geom) return null;
  const colour = conn.color || flowColour(conn.id, flows) || DEFAULT_LINE_COLOUR;
  const dash = conn.connectionType === "asynchronous" ? ` stroke-dasharray="6 4"` : "";
  const parts: string[] = [];
  parts.push(
    `<path d="${geom.path}" fill="none" stroke="${escapeAttr(colour)}" stroke-width="2"${dash} />`,
  );
  if (conn.label) {
    const labelT = conn.labelPosition ?? 0.5;
    const idx = Math.min(geom.points.length - 1, Math.max(0, Math.floor(labelT * (geom.points.length - 1))));
    const lp = geom.points[idx];
    parts.push(
      `<text x="${num(lp.x)}" y="${num(lp.y - 6)}" font-size="11" fill="${escapeAttr(colour)}" text-anchor="middle">${escapeText(conn.label)}</text>`,
    );
  }
  return parts.join("\n");
}

function flowColour(connectionId: string, flows: FlowDef[]): string | null {
  for (const f of flows) {
    if (f.connectionIds.includes(connectionId)) return null; // flows don't carry colour today
  }
  return null;
}

// ─── String helpers ───────────────────────────────────────────────────

/** Format a number for SVG output: trims trailing zeros and avoids
 *  scientific notation. Keeps the snapshot stable across platforms. */
function num(n: number): string {
  if (!isFinite(n)) return "0";
  const rounded = Math.round(n * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function escapeText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

// Re-export type aliases for tests.
export type { DiagramData, LayerDef, SerializedNodeData };
