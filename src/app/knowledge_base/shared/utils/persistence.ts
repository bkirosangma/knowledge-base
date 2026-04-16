import type { NodeData, LayerDef, Connection, DiagramData, SerializedNodeData, LineCurveAlgorithm, FlowDef } from "./types";
import { getIcon, getIconName } from "../../features/diagram/utils/iconRegistry";
import { scopedKey } from "./directoryScope";
const STORAGE_KEY = "knowledge-base-data";

function deserializeNodes(serialized: SerializedNodeData[]): NodeData[] {
  return serialized.map((n) => ({
    ...n,
    icon: getIcon(n.icon) ?? getIcon("Database")!,
  }));
}

export function serializeNodes(nodes: NodeData[]): SerializedNodeData[] {
  return nodes.map((n) => ({
    id: n.id,
    label: n.label,
    sub: n.sub,
    icon: getIconName(n.icon),
    x: n.x,
    y: n.y,
    w: n.w,
    layer: n.layer,
    ...(n.type ? { type: n.type } : {}),
    ...(n.shape && n.shape !== 'rect' ? { shape: n.shape } : {}),
    ...(n.conditionOutCount != null ? { conditionOutCount: n.conditionOutCount } : {}),
    ...(n.conditionSize && n.conditionSize !== 1 ? { conditionSize: n.conditionSize } : {}),
    ...(n.rotation ? { rotation: n.rotation } : {}),
    ...(n.borderColor ? { borderColor: n.borderColor } : {}),
    ...(n.bgColor ? { bgColor: n.bgColor } : {}),
    ...(n.textColor ? { textColor: n.textColor } : {}),
  }));
}

/** Migrate old Tailwind class colors (e.g. "bg-[#eff3f9]") to plain hex. */
function migrateLayerColors(layers: LayerDef[]): LayerDef[] {
  return layers.map((l) => ({
    ...l,
    bg: extractHex(l.bg),
    border: extractHex(l.border),
  }));
}

function extractHex(value: string): string {
  const match = value.match(/#[0-9a-fA-F]{3,8}/);
  return match ? match[0] : value;
}

export function loadDiagram(): {
  title: string;
  layers: LayerDef[];
  nodes: NodeData[];
  connections: Connection[];
  layerManualSizes: Record<string, { left?: number; width?: number; top?: number; height?: number }>;
  lineCurve: LineCurveAlgorithm;
  flows: FlowDef[];
} {
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(scopedKey(STORAGE_KEY));
      if (raw) {
        const data: DiagramData = JSON.parse(raw);
        return {
          title: data.title ?? "Untitled",
          layers: migrateLayerColors(data.layers),
          nodes: deserializeNodes(data.nodes),
          connections: data.connections,
          layerManualSizes: data.layerManualSizes ?? {},
          lineCurve: data.lineCurve ?? "orthogonal",
          flows: data.flows ?? [],
        };
      }
    } catch {
      // Corrupted data — fall through to defaults
    }
  }
  return loadDefaults();
}

export function loadDiagramFromData(data: DiagramData): {
  title: string;
  layers: LayerDef[];
  nodes: NodeData[];
  connections: Connection[];
  layerManualSizes: Record<string, { left?: number; width?: number; top?: number; height?: number }>;
  lineCurve: LineCurveAlgorithm;
  flows: FlowDef[];
} {
  return {
    title: data.title ?? "Untitled",
    layers: migrateLayerColors(data.layers),
    nodes: deserializeNodes(data.nodes),
    connections: data.connections,
    layerManualSizes: data.layerManualSizes ?? {},
    lineCurve: data.lineCurve ?? "orthogonal",
    flows: data.flows ?? [],
  };
}

export function createEmptyDiagram(title: string): DiagramData {
  return {
    title,
    layers: [],
    nodes: [],
    connections: [],
    layerManualSizes: {},
    lineCurve: "orthogonal",
    flows: [],
  };
}

export function loadDefaults(): {
  title: string;
  layers: LayerDef[];
  nodes: NodeData[];
  connections: Connection[];
  layerManualSizes: Record<string, { left?: number; width?: number; top?: number; height?: number }>;
  lineCurve: LineCurveAlgorithm;
  flows: FlowDef[];
} {
  return {
    title: "Untitled",
    layers: [],
    nodes: [],
    connections: [],
    layerManualSizes: {},
    lineCurve: "orthogonal",
    flows: [],
  };
}

export function saveDiagram(
  title: string,
  layers: LayerDef[],
  nodes: NodeData[],
  connections: Connection[],
  layerManualSizes: Record<string, { left?: number; width?: number; top?: number; height?: number }>,
  lineCurve: LineCurveAlgorithm,
  flows: FlowDef[] = [],
): void {
  if (typeof window === "undefined") return;
  const data: DiagramData = {
    title,
    layers,
    nodes: serializeNodes(nodes),
    connections,
    layerManualSizes,
    lineCurve,
    flows,
  };
  try {
    localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(data));
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

export function clearDiagram(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(scopedKey(STORAGE_KEY));
  } catch {
    // Silently ignore
  }
}

/* ── Per-file draft helpers ── */

const DRAFT_PREFIX = "knowledge-base-draft:";

export function saveDraft(
  fileName: string,
  title: string,
  layers: LayerDef[],
  nodes: NodeData[],
  connections: Connection[],
  layerManualSizes: Record<string, { left?: number; width?: number; top?: number; height?: number }>,
  lineCurve: LineCurveAlgorithm,
  flows: FlowDef[] = [],
): void {
  if (typeof window === "undefined") return;
  const data: DiagramData = {
    title,
    layers,
    nodes: serializeNodes(nodes),
    connections,
    layerManualSizes,
    lineCurve,
    flows,
  };
  try {
    localStorage.setItem(scopedKey(DRAFT_PREFIX) + fileName, JSON.stringify(data));
  } catch {
    // Storage full or unavailable
  }
}

export function loadDraft(fileName: string): DiagramData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(scopedKey(DRAFT_PREFIX) + fileName);
    if (raw) return JSON.parse(raw) as DiagramData;
  } catch {
    // Corrupted
  }
  return null;
}

export function clearDraft(fileName: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(scopedKey(DRAFT_PREFIX) + fileName);
  } catch {
    // Silently ignore
  }
}

export function hasDraft(fileName: string): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(scopedKey(DRAFT_PREFIX) + fileName) !== null;
}

export function listDrafts(): Set<string> {
  const result = new Set<string>();
  if (typeof window === "undefined") return result;
  const prefix = scopedKey(DRAFT_PREFIX);
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(prefix)) {
      result.add(key.slice(prefix.length));
    }
  }
  return result;
}

/* ── Per-file viewport helpers ── */

const VIEWPORT_PREFIX = "knowledge-base-viewport";

export function clearViewport(fileName: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(scopedKey(VIEWPORT_PREFIX) + ":" + fileName);
  } catch { /* ignore */ }
}

export function migrateViewport(oldFileName: string, newFileName: string): void {
  if (typeof window === "undefined") return;
  try {
    const oldKey = scopedKey(VIEWPORT_PREFIX) + ":" + oldFileName;
    const newKey = scopedKey(VIEWPORT_PREFIX) + ":" + newFileName;
    const raw = localStorage.getItem(oldKey);
    if (raw) {
      localStorage.setItem(newKey, raw);
      localStorage.removeItem(oldKey);
    }
  } catch { /* ignore */ }
}

/* ── Pane layout helpers ── */

const PANE_LAYOUT_KEY = "knowledge-base-pane-layout";

interface SavedPaneEntry {
  filePath: string;
  fileType: "diagram" | "document";
}

interface SavedPaneLayout {
  leftPane: SavedPaneEntry | null;
  rightPane: SavedPaneEntry | null;
  focusedSide: "left" | "right";
  lastClosedPane?: SavedPaneEntry | null;
}

export function savePaneLayout(
  leftPane: SavedPaneEntry | null,
  rightPane: SavedPaneEntry | null,
  focusedSide: "left" | "right",
  lastClosedPane?: SavedPaneEntry | null,
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      scopedKey(PANE_LAYOUT_KEY),
      JSON.stringify({ leftPane, rightPane, focusedSide, lastClosedPane: lastClosedPane ?? null }),
    );
  } catch { /* ignore */ }
}

export function loadPaneLayout(): SavedPaneLayout | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(scopedKey(PANE_LAYOUT_KEY));
    if (raw) return JSON.parse(raw) as SavedPaneLayout;
  } catch { /* ignore */ }
  return null;
}

/** Remove all per-file data (drafts + viewport) for files not in the given set. */
export function cleanupOrphanedData(existingFiles: Set<string>): void {
  if (typeof window === "undefined") return;
  const draftPrefix = scopedKey(DRAFT_PREFIX);
  const viewportPrefix = scopedKey(VIEWPORT_PREFIX) + ":";
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (key.startsWith(draftPrefix)) {
      const fileName = key.slice(draftPrefix.length);
      if (!existingFiles.has(fileName)) keysToRemove.push(key);
    } else if (key.startsWith(viewportPrefix)) {
      const fileName = key.slice(viewportPrefix.length);
      if (!existingFiles.has(fileName)) keysToRemove.push(key);
    }
  }
  for (const key of keysToRemove) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  }
}
