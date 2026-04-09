import type { NodeData, LayerDef, Connection, DiagramData, SerializedNodeData } from "./types";
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
  }));
}

export function loadDiagram(): {
  title: string;
  layers: LayerDef[];
  nodes: NodeData[];
  connections: Connection[];
  layerManualSizes: Record<string, { left?: number; width?: number; top?: number; height?: number }>;
} {
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data: DiagramData = JSON.parse(raw);
        return {
          title: data.title ?? (defaultData as DiagramData).title,
          layers: data.layers,
          nodes: deserializeNodes(data.nodes),
          connections: data.connections,
          layerManualSizes: data.layerManualSizes ?? {},
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
} {
  const data = defaultData as DiagramData;
  return {
    title: data.title,
    layers: data.layers,
    nodes: deserializeNodes(data.nodes),
    connections: data.connections,
    layerManualSizes: {},
  };
}

export function saveDiagram(
  title: string,
  layers: LayerDef[],
  nodes: NodeData[],
  connections: Connection[],
  layerManualSizes: Record<string, { left?: number; width?: number; top?: number; height?: number }>,
): void {
  if (typeof window === "undefined") return;
  const data: DiagramData = {
    title,
    layers,
    nodes: serializeNodes(nodes),
    connections,
    layerManualSizes,
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
