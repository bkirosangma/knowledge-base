import type { NodeData, Connection } from "../../../shared/utils/types";

export interface LevelInfo {
  level: number;
  base: string;
}

export type LevelMap = Map<string, LevelInfo>;

/**
 * Compute level + base for every node. Two-pass O(N+C):
 *  Pass 1: elements & layers (non-condition)
 *  Pass 2: conditions (inherit from inbound source, demote on cross-base)
 */
export function computeLevelMap(
  nodes: NodeData[],
  connections: Connection[],
): LevelMap {
  const map: LevelMap = new Map();

  // Pass 1 — non-condition nodes
  for (const n of nodes) {
    if (n.shape === "condition") continue;
    map.set(n.id, n.layer ? { level: 2, base: n.layer } : { level: 1, base: "canvas" });
  }

  // Pass 2 — condition nodes
  for (const n of nodes) {
    if (n.shape !== "condition") continue;

    const inConn = connections.find(
      (c) => c.to === n.id && c.toAnchor === "cond-in",
    );
    if (!inConn) {
      map.set(n.id, { level: 1, base: "canvas" });
      continue;
    }

    const sourceInfo = map.get(inConn.from);
    if (!sourceInfo) {
      map.set(n.id, { level: 1, base: "canvas" });
      continue;
    }

    // Check if any outbound target lives on a different base
    const crossBase = connections.some((c) => {
      if (c.from !== n.id) return false;
      const targetInfo = map.get(c.to);
      return targetInfo && targetInfo.base !== sourceInfo.base;
    });

    map.set(
      n.id,
      crossBase ? { level: 1, base: "canvas" } : { ...sourceInfo },
    );
  }

  return map;
}

/** Return nodes sharing the same level+base as the given node, excluding it. */
export function getCollisionPeers(
  nodeId: string,
  allNodes: NodeData[],
  levelMap: LevelMap,
): NodeData[] {
  const info = levelMap.get(nodeId);
  if (!info) return [];
  return allNodes.filter((n) => {
    if (n.id === nodeId) return false;
    const other = levelMap.get(n.id);
    return other && other.level === info.level && other.base === info.base;
  });
}
