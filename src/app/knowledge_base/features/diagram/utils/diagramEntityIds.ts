import type { DiagramData } from "../../../shared/utils/types";

/**
 * Collect every entity id whose lifecycle is bound to this diagram —
 * nodes, connections, flows. Used by file-tree delete cleanup and
 * diagram-undo subset snapshots.
 */
export function collectDiagramEntityIds(data: DiagramData): Set<string> {
  const ids = new Set<string>();
  for (const n of data.nodes) ids.add(n.id);
  for (const c of data.connections) ids.add(c.id);
  for (const f of data.flows ?? []) ids.add(f.id);
  return ids;
}
