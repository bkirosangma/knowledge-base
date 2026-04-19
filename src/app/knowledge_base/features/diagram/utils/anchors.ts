import { getConditionAnchors, getConditionAnchorPosition, getConditionAnchorDirection } from "./conditionGeometry";

export type StandardAnchorId =
  | "top-0" | "top-1" | "top-2"
  | "bottom-0" | "bottom-1" | "bottom-2"
  | "left-0" | "left-1" | "left-2"
  | "right-0" | "right-1" | "right-2";

export type ConditionAnchorId = "cond-in" | `cond-out-${number}`;

export type AnchorId = StandardAnchorId | ConditionAnchorId;

export interface AnchorPoint {
  id: AnchorId;
  x: number;
  y: number;
}

/** Map removed corner anchors to their nearest side anchor */
const CORNER_MIGRATION: Record<string, AnchorId> = {
  "top-left": "top-0",
  "top-right": "top-2",
  "bottom-left": "bottom-0",
  "bottom-right": "bottom-2",
};

export function migrateAnchorId(id: string): AnchorId {
  return (CORNER_MIGRATION[id] ?? id) as AnchorId;
}

export function getAnchorPosition(
  anchorId: AnchorId | string,
  cx: number,
  cy: number,
  w: number,
  h: number
): { x: number; y: number } {
  const hw = w / 2;
  const hh = h / 2;
  const id = migrateAnchorId(anchorId);

  switch (id) {
    // Top side (25%, 50%, 75%)
    case "top-0":    return { x: cx - hw / 2, y: cy - hh };
    case "top-1":    return { x: cx,          y: cy - hh };
    case "top-2":    return { x: cx + hw / 2, y: cy - hh };
    // Bottom side
    case "bottom-0": return { x: cx - hw / 2, y: cy + hh };
    case "bottom-1": return { x: cx,          y: cy + hh };
    case "bottom-2": return { x: cx + hw / 2, y: cy + hh };
    // Left side
    case "left-0":   return { x: cx - hw, y: cy - hh / 2 };
    case "left-1":   return { x: cx - hw, y: cy };
    case "left-2":   return { x: cx - hw, y: cy + hh / 2 };
    // Right side
    case "right-0":  return { x: cx + hw, y: cy - hh / 2 };
    case "right-1":  return { x: cx + hw, y: cy };
    case "right-2":  return { x: cx + hw, y: cy + hh / 2 };
    default:         return { x: cx, y: cy - hh }; // fallback to top-center
  }
}

const ALL_ANCHOR_IDS: AnchorId[] = [
  "top-0", "top-1", "top-2",
  "bottom-0", "bottom-1", "bottom-2",
  "left-0", "left-1", "left-2",
  "right-0", "right-1", "right-2",
];

export function getAnchors(cx: number, cy: number, w: number, h: number): AnchorPoint[] {
  return ALL_ANCHOR_IDS.map((id) => ({
    id,
    ...getAnchorPosition(id, cx, cy, w, h),
  }));
}

export function getAnchorEdge(anchorId: AnchorId | string): "top" | "right" | "bottom" | "left" {
  if (anchorId.startsWith("top")) return "top";
  if (anchorId.startsWith("bottom")) return "bottom";
  if (anchorId.startsWith("left")) return "left";
  if (anchorId.startsWith("right")) return "right";
  return "top";
}

export function getAnchorDirection(anchorId: AnchorId | string): { dx: number; dy: number } {
  if (anchorId.startsWith("top")) return { dx: 0, dy: -1 };
  if (anchorId.startsWith("bottom")) return { dx: 0, dy: 1 };
  if (anchorId.startsWith("left")) return { dx: -1, dy: 0 };
  if (anchorId.startsWith("right")) return { dx: 1, dy: 0 };
  // Condition anchors — delegate to conditionGeometry if available, otherwise fallback
  if (anchorId === "cond-in") return { dx: 0, dy: -1 };
  if (anchorId.startsWith("cond-out")) return { dx: 0, dy: 1 };
  return { dx: 0, dy: 0 };
}

/** Get anchor position with node-aware dispatch for conditions. */
export function getNodeAnchorPosition(
  anchorId: AnchorId | string,
  cx: number, cy: number, w: number, h: number,
  shape?: string, conditionOutCount?: number, rotation?: number,
): { x: number; y: number } {
  if (shape === "condition") {
    return getConditionAnchorPosition(anchorId, cx, cy, w, h, conditionOutCount ?? 2, rotation ?? 0);
  }
  return getAnchorPosition(anchorId as AnchorId, cx, cy, w, h);
}

/** Get anchor direction with node-aware dispatch for conditions. */
export function getNodeAnchorDirection(
  anchorId: AnchorId | string,
  cx: number, cy: number, w: number, h: number,
  shape?: string, conditionOutCount?: number, rotation?: number,
): { dx: number; dy: number } {
  if (shape === "condition") {
    return getConditionAnchorDirection(anchorId, cx, cy, w, h, conditionOutCount ?? 2, rotation ?? 0);
  }
  return getAnchorDirection(anchorId as AnchorId);
}

/** Pick the best anchor on a target node facing the source position */
export function pickBestTargetAnchor(
  sourcePos: { x: number; y: number },
  targetCx: number,
  targetCy: number,
  _targetW: number,
  _targetH: number,
): AnchorId {
  const dx = sourcePos.x - targetCx;
  const dy = sourcePos.y - targetCy;
  // Pick the side facing the source
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx < 0 ? "left-1" : "right-1";
  }
  return dy < 0 ? "top-1" : "bottom-1";
}

export function findNearestAnchor(
  px: number,
  py: number,
  nodes: { id: string; x: number; y: number; w: number; h: number; shape?: string; conditionOutCount?: number; rotation?: number }[],
  snapRadius = 25
): { nodeId: string; anchorId: AnchorId; x: number; y: number; distance: number } | null {
  let best: { nodeId: string; anchorId: AnchorId; x: number; y: number; distance: number } | null = null;

  for (const node of nodes) {
    let anchors: { id: string; x: number; y: number }[];
    if (node.shape === "condition") {
      anchors = getConditionAnchors(node.x, node.y, node.w, node.h, node.conditionOutCount ?? 2, node.rotation ?? 0);
    } else {
      anchors = getAnchors(node.x, node.y, node.w, node.h);
    }
    for (const anchor of anchors) {
      const dx = px - anchor.x;
      const dy = py - anchor.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= snapRadius && (!best || dist < best.distance)) {
        best = { nodeId: node.id, anchorId: anchor.id as AnchorId, x: anchor.x, y: anchor.y, distance: dist };
      }
    }
  }

  return best;
}
