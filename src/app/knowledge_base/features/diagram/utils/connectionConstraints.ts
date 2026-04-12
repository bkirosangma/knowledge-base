import type { NodeData, Connection } from "../types";

/**
 * Validate whether a connection is allowed given condition element constraints.
 * Returns { valid: true } or { valid: false, reason: string }.
 */
export function validateConnection(
  fromNode: NodeData | undefined,
  fromAnchor: string,
  toNode: NodeData | undefined,
  toAnchor: string,
  connections: Connection[],
): { valid: boolean; reason?: string } {
  // cond-in anchor can only be a "to" (destination), never a "from" (source)
  if (fromAnchor === "cond-in") {
    return { valid: false, reason: "In-anchor can only receive connections" };
  }

  // cond-out anchors can only be a "from" (source), never a "to" (destination)
  if (toAnchor.startsWith("cond-out")) {
    return { valid: false, reason: "Out-anchor can only send connections" };
  }

  // cond-in can only have one incoming connection
  if (toAnchor === "cond-in" && toNode) {
    const existingIncoming = connections.filter((c) => c.to === toNode.id && c.toAnchor === "cond-in");
    if (existingIncoming.length > 0) {
      return { valid: false, reason: "Condition already has an incoming connection" };
    }
  }

  return { valid: true };
}
