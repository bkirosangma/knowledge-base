"use client";

/**
 * useGraphData — derives `{ nodes, links }` for the vault graph from the
 * file tree (`useFileExplorer.tree`) plus the link index (`useLinkIndex`).
 *
 * Why both sources? `linkIndex.documents` only holds `.md` source docs as
 * keys; `.json` diagrams appear only as outbound *targets*, never as keys.
 * So orphaned diagrams (no incoming links) wouldn't show up if we only
 * walked the index. The tree gives us every node; the index gives us
 * every edge.
 *
 * Filters: folder set, file-type set, orphans-only. Cached layout
 * positions from `vaultConfig.graph.layout` are merged into nodes when
 * available so re-opening the pane doesn't re-simulate from scratch.
 *
 * Phase 3 PR 2 (2026-04-26).
 */

import { useMemo } from "react";
import type { TreeNode } from "../../../shared/hooks/useFileExplorer";
import type { LinkIndex } from "../../document/types";

export interface GraphNode {
  id: string;            // file path
  label: string;         // basename without extension
  fileType: "md" | "json";
  folder: string;        // top-level folder, '' for root
  orphan: boolean;       // 0 incoming + 0 outgoing edges
  /**
   * File mtime as carried on the source `TreeNode`. Missing for files
   * that came from the link index but not the disk scan.
   */
  lastModified?: number;
  x?: number;
  y?: number;
}

export interface GraphLink {
  source: string;
  target: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface GraphFilters {
  folders: Set<string> | null;       // null = all
  fileTypes: Set<"md" | "json">;
  orphansOnly: boolean;
  /**
   * KB-042 quick filter — when true, only the `RECENT_LIMIT` most-recently
   * modified files survive (ties break by id ascending). Drives the "Show
   * recent only" affordance in the node-count guard placeholder.
   */
  recentOnly: boolean;
}

/**
 * Top-N retained when `filters.recentOnly` is on. Sized to stay well below
 * `GRAPH_NODE_GUARD_THRESHOLD` so toggling the filter always lets the canvas
 * render without a follow-up "Render anyway".
 */
export const RECENT_LIMIT = 100;

/**
 * KB-042 — `GraphView` swaps the canvas for the placeholder once the
 * filtered node count exceeds this threshold. `react-force-graph-2d` is
 * uncapped; ~300 is the empirical comfort ceiling on a mid-tier laptop.
 */
export const GRAPH_NODE_GUARD_THRESHOLD = 300;

interface UseGraphDataArgs {
  tree: TreeNode[];
  linkIndex: LinkIndex;
  filters: GraphFilters;
  layout?: Record<string, { x: number; y: number }> | null;
}

export function topLevelFolder(path: string): string {
  const idx = path.indexOf("/");
  return idx === -1 ? "" : path.substring(0, idx);
}

function basenameNoExt(path: string): string {
  const base = path.split("/").pop() ?? path;
  const dot = base.lastIndexOf(".");
  return dot === -1 ? base : base.substring(0, dot);
}

function fileTypeOf(path: string): "md" | "json" | null {
  if (path.endsWith(".md")) return "md";
  if (path.endsWith(".json")) return "json";
  return null;
}

/** Walk the tree and collect every `.md` / `.json` path. */
export function collectAllPaths(tree: TreeNode[]): string[] {
  const out: string[] = [];
  const walk = (items: TreeNode[]) => {
    for (const it of items) {
      if (it.type === "file" && fileTypeOf(it.path) !== null) out.push(it.path);
      if (it.children) walk(it.children);
    }
  };
  walk(tree);
  return out;
}

/** Walk the tree and build a `path → lastModified` lookup. Files without
 *  an mtime are omitted (treated as 0 by the recent-slice ranking). */
function collectMtimes(tree: TreeNode[]): Map<string, number> {
  const out = new Map<string, number>();
  const walk = (items: TreeNode[]) => {
    for (const it of items) {
      if (it.type === "file" && fileTypeOf(it.path) !== null && it.lastModified !== undefined) {
        out.set(it.path, it.lastModified);
      }
      if (it.children) walk(it.children);
    }
  };
  walk(tree);
  return out;
}

/** Build the unfiltered node + edge sets. Exported for unit testing. */
export function buildGraphData(
  tree: TreeNode[],
  linkIndex: LinkIndex,
  layout?: Record<string, { x: number; y: number }> | null,
): { nodes: GraphNode[]; links: GraphLink[] } {
  const allPaths = new Set(collectAllPaths(tree));
  const mtimes = collectMtimes(tree);

  // Edges: from each document's outboundLinks + sectionLinks (deduped).
  const edgeKey = new Set<string>();
  const links: GraphLink[] = [];
  for (const [source, entry] of Object.entries(linkIndex.documents)) {
    for (const link of entry.outboundLinks) {
      const key = `${source}->${link.targetPath}`;
      if (edgeKey.has(key)) continue;
      edgeKey.add(key);
      links.push({ source, target: link.targetPath });
    }
    for (const sl of entry.sectionLinks) {
      const key = `${source}->${sl.targetPath}`;
      if (edgeKey.has(key)) continue;
      edgeKey.add(key);
      links.push({ source, target: sl.targetPath });
    }
  }

  // Connectivity counts for orphan detection.
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, number>();
  for (const e of links) {
    outgoing.set(e.source, (outgoing.get(e.source) ?? 0) + 1);
    incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1);
  }

  // Build nodes from tree (every file gets a node, even unlinked ones).
  // Also union edge endpoints — covers files referenced in the index that
  // may have been deleted from disk (rare but defensive).
  const nodeIds = new Set<string>(allPaths);
  for (const e of links) { nodeIds.add(e.source); nodeIds.add(e.target); }

  const nodes: GraphNode[] = [];
  for (const id of nodeIds) {
    const ft = fileTypeOf(id);
    if (ft === null) continue;
    const cached = layout?.[id];
    const mtime = mtimes.get(id);
    nodes.push({
      id,
      label: basenameNoExt(id),
      fileType: ft,
      folder: topLevelFolder(id),
      orphan: (incoming.get(id) ?? 0) === 0 && (outgoing.get(id) ?? 0) === 0,
      ...(mtime !== undefined ? { lastModified: mtime } : {}),
      ...(cached ? { x: cached.x, y: cached.y } : {}),
    });
  }

  return { nodes, links };
}

/** Apply filters to a built graph. Edges between filtered-out nodes drop. */
export function applyFilters(
  data: { nodes: GraphNode[]; links: GraphLink[] },
  filters: GraphFilters,
): GraphData {
  const visibleIds = new Set<string>();
  for (const n of data.nodes) {
    if (!filters.fileTypes.has(n.fileType)) continue;
    if (filters.folders && !filters.folders.has(n.folder)) continue;
    if (filters.orphansOnly && !n.orphan) continue;
    visibleIds.add(n.id);
  }
  if (filters.recentOnly && visibleIds.size > RECENT_LIMIT) {
    // Rank surviving nodes by mtime desc, ties broken by id ascending so the
    // top-N slice is stable across renders. Without a stable tie-break the
    // canvas would re-mount nodes whenever the surviving set toggled equal-
    // mtime files in and out, churning cached force-graph positions.
    const ranked = data.nodes
      .filter((n) => visibleIds.has(n.id))
      .sort((a, b) => {
        const am = a.lastModified ?? 0;
        const bm = b.lastModified ?? 0;
        if (am !== bm) return bm - am;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });
    visibleIds.clear();
    for (let i = 0; i < RECENT_LIMIT && i < ranked.length; i++) {
      visibleIds.add(ranked[i].id);
    }
  }
  const nodes = data.nodes.filter((n) => visibleIds.has(n.id));
  const links = data.links.filter(
    (e) => visibleIds.has(e.source) && visibleIds.has(e.target),
  );
  return { nodes, links };
}

/** All distinct top-level folders present in the tree (sorted, root first). */
export function listTopFolders(tree: TreeNode[]): string[] {
  const set = new Set<string>();
  for (const p of collectAllPaths(tree)) set.add(topLevelFolder(p));
  const arr = Array.from(set);
  arr.sort((a, b) => {
    if (a === "") return -1;
    if (b === "") return 1;
    return a.localeCompare(b);
  });
  return arr;
}

export function useGraphData({
  tree,
  linkIndex,
  filters,
  layout,
}: UseGraphDataArgs): GraphData {
  return useMemo(() => {
    const all = buildGraphData(tree, linkIndex, layout);
    return applyFilters(all, filters);
  }, [tree, linkIndex, filters, layout]);
}
