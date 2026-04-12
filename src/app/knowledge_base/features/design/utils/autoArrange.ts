import type { NodeData, Connection } from "../../../shared/utils/types";
import { snapToGrid } from "./gridSnap";

const RANK_SPACING = 180;
const NODE_SPACING = 40;

interface LayoutOptions {
  direction?: "TB" | "LR";
}

/**
 * Hierarchical (Sugiyama-style) layout.
 * Assigns ranks via topological sort, orders nodes to minimize crossings,
 * then assigns grid-snapped coordinates.
 */
export function hierarchicalLayout(
  nodes: NodeData[],
  connections: Connection[],
  options: LayoutOptions = {},
): Map<string, { x: number; y: number }> {
  const dir = options.direction ?? "TB";
  const result = new Map<string, { x: number; y: number }>();
  if (nodes.length === 0) return result;

  // Build adjacency
  const adj = new Map<string, string[]>();
  const inDeg = new Map<string, number>();
  for (const n of nodes) {
    adj.set(n.id, []);
    inDeg.set(n.id, 0);
  }
  for (const c of connections) {
    if (adj.has(c.from) && inDeg.has(c.to)) {
      adj.get(c.from)!.push(c.to);
      inDeg.set(c.to, (inDeg.get(c.to) ?? 0) + 1);
    }
  }

  // Topological sort (Kahn's algorithm) → assign ranks
  const queue: string[] = [];
  for (const [id, deg] of inDeg) {
    if (deg === 0) queue.push(id);
  }
  const rank = new Map<string, number>();
  let idx = 0;
  while (idx < queue.length) {
    const id = queue[idx++];
    if (!rank.has(id)) rank.set(id, 0);
    for (const next of adj.get(id) ?? []) {
      rank.set(next, Math.max(rank.get(next) ?? 0, rank.get(id)! + 1));
      inDeg.set(next, (inDeg.get(next) ?? 0) - 1);
      if (inDeg.get(next) === 0) queue.push(next);
    }
  }
  // Assign rank 0 to any unvisited nodes (cycles)
  for (const n of nodes) {
    if (!rank.has(n.id)) rank.set(n.id, 0);
  }

  // Group by rank
  const ranks = new Map<number, NodeData[]>();
  for (const n of nodes) {
    const r = rank.get(n.id) ?? 0;
    if (!ranks.has(r)) ranks.set(r, []);
    ranks.get(r)!.push(n);
  }

  // Barycenter ordering within each rank (2 passes)
  const order = new Map<string, number>();
  const sortedRanks = [...ranks.keys()].sort((a, b) => a - b);
  // Initial order: index within rank
  for (const r of sortedRanks) {
    ranks.get(r)!.forEach((n, i) => order.set(n.id, i));
  }
  // Forward pass: sort by average position of predecessors
  for (let pass = 0; pass < 2; pass++) {
    for (const r of sortedRanks) {
      const nodesInRank = ranks.get(r)!;
      nodesInRank.sort((a, b) => {
        const aPreds = connections.filter((c) => c.to === a.id).map((c) => order.get(c.from) ?? 0);
        const bPreds = connections.filter((c) => c.to === b.id).map((c) => order.get(c.from) ?? 0);
        const aAvg = aPreds.length > 0 ? aPreds.reduce((s, v) => s + v, 0) / aPreds.length : order.get(a.id) ?? 0;
        const bAvg = bPreds.length > 0 ? bPreds.reduce((s, v) => s + v, 0) / bPreds.length : order.get(b.id) ?? 0;
        return aAvg - bAvg;
      });
      nodesInRank.forEach((n, i) => order.set(n.id, i));
    }
  }

  // Assign coordinates
  for (const r of sortedRanks) {
    const nodesInRank = ranks.get(r)!;
    const totalWidth = nodesInRank.length * NODE_SPACING + nodesInRank.reduce((s, n) => s + n.w, 0);
    let cursor = -totalWidth / 2;
    for (const n of nodesInRank) {
      const halfW = n.w / 2;
      cursor += halfW;
      const pos = dir === "TB"
        ? { x: snapToGrid(cursor), y: snapToGrid(r * RANK_SPACING) }
        : { x: snapToGrid(r * RANK_SPACING), y: snapToGrid(cursor) };
      result.set(n.id, pos);
      cursor += halfW + NODE_SPACING;
    }
  }

  return result;
}

/**
 * Force-directed layout (Fruchterman-Reingold).
 * Starts from current positions, runs iterations to spread nodes.
 */
export function forceDirectedLayout(
  nodes: NodeData[],
  connections: Connection[],
): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>();
  if (nodes.length === 0) return result;

  const k = 150; // ideal distance
  const iterations = 60;
  let temperature = 200;

  // Initialize positions
  const pos = new Map<string, { x: number; y: number }>();
  for (const n of nodes) {
    pos.set(n.id, { x: n.x, y: n.y });
  }

  const nodeIds = nodes.map((n) => n.id);
  const connSet = connections.map((c) => ({ from: c.from, to: c.to }));

  for (let iter = 0; iter < iterations; iter++) {
    const disp = new Map<string, { dx: number; dy: number }>();
    for (const id of nodeIds) disp.set(id, { dx: 0, dy: 0 });

    // Repulsion (all pairs)
    for (let i = 0; i < nodeIds.length; i++) {
      for (let j = i + 1; j < nodeIds.length; j++) {
        const u = pos.get(nodeIds[i])!;
        const v = pos.get(nodeIds[j])!;
        let dx = u.x - v.x;
        let dy = u.y - v.y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const force = (k * k) / dist;
        dx = (dx / dist) * force;
        dy = (dy / dist) * force;
        const du = disp.get(nodeIds[i])!;
        const dv = disp.get(nodeIds[j])!;
        du.dx += dx; du.dy += dy;
        dv.dx -= dx; dv.dy -= dy;
      }
    }

    // Attraction (connected pairs)
    for (const { from, to } of connSet) {
      const u = pos.get(from);
      const v = pos.get(to);
      if (!u || !v) continue;
      let dx = u.x - v.x;
      let dy = u.y - v.y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const force = (dist * dist) / k;
      dx = (dx / dist) * force;
      dy = (dy / dist) * force;
      const du = disp.get(from);
      const dv = disp.get(to);
      if (du) { du.dx -= dx; du.dy -= dy; }
      if (dv) { dv.dx += dx; dv.dy += dy; }
    }

    // Apply displacements clamped by temperature
    for (const id of nodeIds) {
      const d = disp.get(id)!;
      const dist = Math.max(Math.sqrt(d.dx * d.dx + d.dy * d.dy), 1);
      const clamped = Math.min(dist, temperature);
      const p = pos.get(id)!;
      p.x += (d.dx / dist) * clamped;
      p.y += (d.dy / dist) * clamped;
    }

    temperature *= 0.95;
  }

  // Snap to grid
  for (const id of nodeIds) {
    const p = pos.get(id)!;
    result.set(id, { x: snapToGrid(p.x), y: snapToGrid(p.y) });
  }

  return result;
}
