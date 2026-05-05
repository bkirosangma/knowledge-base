import type { Connection, FlowDef } from "../types";

/**
 * Check if a set of connections forms a contiguous (connected) graph.
 * Two connections are connected if they share a node (from/to).
 */
export function isContiguous(connectionIds: string[], connections: Connection[]): boolean {
  if (connectionIds.length <= 1) return true;

  const conns = connectionIds
    .map((id) => connections.find((c) => c.id === id))
    .filter((c): c is Connection => c != null);
  if (conns.length !== connectionIds.length) return false;

  // Build adjacency: connection index → set of connected connection indices (sharing a node)
  const adj = new Map<number, Set<number>>();
  for (let i = 0; i < conns.length; i++) adj.set(i, new Set());

  // Node → list of connection indices that touch it
  const nodeToConns = new Map<string, number[]>();
  for (let i = 0; i < conns.length; i++) {
    for (const nid of [conns[i].from, conns[i].to]) {
      if (!nodeToConns.has(nid)) nodeToConns.set(nid, []);
      nodeToConns.get(nid)!.push(i);
    }
  }

  // Two connections sharing a node are adjacent
  for (const indices of nodeToConns.values()) {
    for (let i = 0; i < indices.length; i++) {
      for (let j = i + 1; j < indices.length; j++) {
        adj.get(indices[i])!.add(indices[j]);
        adj.get(indices[j])!.add(indices[i]);
      }
    }
  }

  // BFS from first connection
  const visited = new Set<number>();
  const queue = [0];
  visited.add(0);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const neighbor of adj.get(cur)!) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  return visited.size === conns.length;
}

/**
 * Order connections into a traversal path.
 * Uses a greedy walk: start from a "source" node (one that only appears as `from`
 * among the selected connections, or the first connection's `from` as fallback),
 * then follow connections in from→to order.
 */
export function orderConnections(connectionIds: string[], connections: Connection[]): string[] {
  if (connectionIds.length <= 1) return connectionIds;

  const idSet = new Set(connectionIds);
  const conns = connections.filter((c) => idSet.has(c.id));
  if (conns.length === 0) return connectionIds;

  // Build from-node → connections map
  const fromMap = new Map<string, Connection[]>();
  const toMap = new Map<string, Connection[]>();
  for (const c of conns) {
    if (!fromMap.has(c.from)) fromMap.set(c.from, []);
    fromMap.get(c.from)!.push(c);
    if (!toMap.has(c.to)) toMap.set(c.to, []);
    toMap.get(c.to)!.push(c);
  }

  // Find source nodes: nodes that appear as `from` but not as `to` in the selected set
  const allFroms = new Set(conns.map((c) => c.from));
  const allTos = new Set(conns.map((c) => c.to));
  const sources = [...allFroms].filter((n) => !allTos.has(n));
  const startNode = sources.length > 0 ? sources[0] : conns[0].from;

  // Greedy BFS walk through the connection graph
  const ordered: string[] = [];
  const used = new Set<string>();
  const nodeQueue = [startNode];
  const visitedNodes = new Set<string>();

  while (nodeQueue.length > 0 && ordered.length < conns.length) {
    const node = nodeQueue.shift()!;
    if (visitedNodes.has(node)) continue;
    visitedNodes.add(node);

    const outgoing = fromMap.get(node) ?? [];
    for (const c of outgoing) {
      if (!used.has(c.id)) {
        used.add(c.id);
        ordered.push(c.id);
        nodeQueue.push(c.to);
      }
    }

    // Also check incoming (for cases where graph isn't purely directional)
    const incoming = toMap.get(node) ?? [];
    for (const c of incoming) {
      if (!used.has(c.id)) {
        used.add(c.id);
        ordered.push(c.id);
        nodeQueue.push(c.from);
      }
    }
  }

  // Append any remaining (shouldn't happen if contiguous, but be safe)
  for (const id of connectionIds) {
    if (!used.has(id)) ordered.push(id);
  }

  return ordered;
}

/**
 * Find flows that would be broken by removing a set of connection IDs.
 * A flow is "broken" if removing the connections makes the remaining set
 * non-contiguous or empty.
 */
export function findBrokenFlows(
  flows: FlowDef[],
  removedConnectionIds: Set<string>,
  connections: Connection[],
): FlowDef[] {
  return flows.filter((flow) => {
    const remaining = flow.connectionIds.filter((id) => !removedConnectionIds.has(id));
    if (remaining.length === 0) return true; // completely removed
    if (remaining.length === flow.connectionIds.length) return false; // unaffected
    return !isContiguous(remaining, connections);
  });
}

/**
 * Find flows that would be broken by reconnecting a connection's endpoint.
 * Simulates the reconnection and checks contiguity of affected flows.
 */
export function findBrokenFlowsByReconnect(
  flows: FlowDef[],
  connectionId: string,
  newFrom: string | undefined,
  newTo: string | undefined,
  connections: Connection[],
): FlowDef[] {
  // Build a simulated connections list with the reconnected endpoint
  const simulated = connections.map((c) => {
    if (c.id !== connectionId) return c;
    return {
      ...c,
      from: newFrom ?? c.from,
      to: newTo ?? c.to,
    };
  });

  return flows.filter((flow) => {
    if (!flow.connectionIds.includes(connectionId)) return false;
    return !isContiguous(flow.connectionIds, simulated);
  });
}
