import type { NodeData, LayerDef, Connection, DiagramData, SerializedNodeData, LineCurveAlgorithm } from "./types";
import { getIcon, getIconName } from "./iconRegistry";
import defaultData from "../data/thanos.json";

const STORAGE_KEY = "architecture-designer-data";

function deserializeNodes(serialized: SerializedNodeData[]): NodeData[] {
  return serialized.map((n) => ({
    ...n,
    icon: getIcon(n.icon) ?? getIcon("Database")!,
  }));
}

function serializeNodes(nodes: NodeData[]): SerializedNodeData[] {
  return nodes.map((n) => ({
    id: n.id,
    label: n.label,
    sub: n.sub,
    icon: getIconName(n.icon),
    x: n.x,
    y: n.y,
    w: n.w,
    layer: n.layer,
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
} {
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data: DiagramData = JSON.parse(raw);
        return {
          title: data.title ?? (defaultData as DiagramData).title,
          layers: migrateLayerColors(data.layers),
          nodes: deserializeNodes(data.nodes),
          connections: data.connections,
          layerManualSizes: data.layerManualSizes ?? {},
          lineCurve: data.lineCurve ?? "orthogonal",
        };
      }
    } catch {
      // Corrupted data — fall through to defaults
    }
  }
  return loadDefaults();
}

export function loadDefaults(): {
  title: string;
  layers: LayerDef[];
  nodes: NodeData[];
  connections: Connection[];
  layerManualSizes: Record<string, { left?: number; width?: number; top?: number; height?: number }>;
  lineCurve: LineCurveAlgorithm;
} {
  const data = defaultData as DiagramData;
  return {
    title: data.title,
    layers: migrateLayerColors(data.layers),
    nodes: deserializeNodes(data.nodes),
    connections: data.connections,
    layerManualSizes: {},
    lineCurve: "orthogonal",
  };
}

export function saveDiagram(
  title: string,
  layers: LayerDef[],
  nodes: NodeData[],
  connections: Connection[],
  layerManualSizes: Record<string, { left?: number; width?: number; top?: number; height?: number }>,
  lineCurve: LineCurveAlgorithm,
): void {
  if (typeof window === "undefined") return;
  const data: DiagramData = {
    title,
    layers,
    nodes: serializeNodes(nodes),
    connections,
    layerManualSizes,
    lineCurve,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

export function clearDiagram(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Silently ignore
  }
}
