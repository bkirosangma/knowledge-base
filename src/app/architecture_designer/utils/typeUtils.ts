import type { NodeData } from "./types";

/** Returns sorted unique non-empty type values from nodes */
export function getDistinctTypes(nodes: NodeData[]): string[] {
  const types = new Set<string>();
  for (const n of nodes) {
    if (n.type) types.add(n.type);
  }
  return [...types].sort((a, b) => a.localeCompare(b));
}

/** Returns nodes matching a given type */
export function getNodesByType(nodes: NodeData[], type: string): NodeData[] {
  return nodes.filter((n) => n.type === type);
}
