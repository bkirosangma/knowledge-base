"use client";

import { useState, useEffect, useRef } from "react";

export type GraphifyStatus = "idle" | "loading" | "loaded" | "missing" | "error";

export interface RawGraphifyNode {
  id: string;
  label: string;
  source_file?: string;
  file_type?: string;
  community?: number;
}

export interface RawGraphifyLink {
  source: string;
  target: string;
  _src?: string;
  _tgt?: string;
  relation?: string;
  confidence?: string;
  confidence_score?: number;
  source_file?: string;
  source_location?: string;
  weight?: number;
}

export interface RawHyperedge {
  id: string;
  label: string;
  nodes: string[];
  relation?: string;
  source_file?: string;
}

export interface RawGraphifyData {
  nodes: RawGraphifyNode[];
  links: RawGraphifyLink[];
  hyperedges?: RawHyperedge[];
}

/** Community entry with color assigned at load time. */
export interface CommunityInfo {
  id: number;
  /** Label of the most-connected node in this community. */
  name: string;
  color: string;
  count: number;
}

export interface GraphifyResult {
  data: RawGraphifyData;
  hyperedges: RawHyperedge[];
  communities: CommunityInfo[];
  /** id → community color for fast node lookups */
  nodeColorMap: Map<string, string>;
  /** id → source_file for click navigation */
  nodeSourceMap: Map<string, string>;
  /** id → total degree (in + out edges) for sizing */
  nodeDegreeMap: Map<string, number>;
  status: GraphifyStatus;
}

const EMPTY: RawGraphifyData = { nodes: [], links: [] };

// Golden-angle hue spacing gives visually distinct colors even for many communities.
// Higher lightness (68%) and moderate saturation (58%) look good on the dark canvas bg.
function communityColor(index: number): string {
  const hue = (index * 137.508) % 360;
  return `hsl(${Math.round(hue)}, 58%, 68%)`;
}

export function useRawGraphify(
  dirHandleRef: React.MutableRefObject<FileSystemDirectoryHandle | null>,
): GraphifyResult {
  const [status, setStatus] = useState<GraphifyStatus>("idle");
  const [data, setData] = useState<RawGraphifyData>(EMPTY);
  const [hyperedges, setHyperedges] = useState<RawHyperedge[]>([]);
  const [communities, setCommunities] = useState<CommunityInfo[]>([]);
  const [nodeColorMap, setNodeColorMap] = useState<Map<string, string>>(new Map());
  const [nodeSourceMap, setNodeSourceMap] = useState<Map<string, string>>(new Map());
  const [nodeDegreeMap, setNodeDegreeMap] = useState<Map<string, number>>(new Map());
  const lastHandleRef = useRef<FileSystemDirectoryHandle | null>(null);

  useEffect(() => {
    const rootHandle = dirHandleRef.current;
    if (!rootHandle) return;
    if (lastHandleRef.current === rootHandle) return;
    lastHandleRef.current = rootHandle;

    let cancelled = false;
    setStatus("loading");

    (async () => {
      try {
        const graphifyDir = await rootHandle.getDirectoryHandle("graphify-out");

        // Read community names from GRAPH_REPORT.md (LLM-generated per community)
        // Format: ### Community {id} - "{name}"
        const reportNameMap = new Map<number, string>();
        try {
          const reportHandle = await graphifyDir.getFileHandle("GRAPH_REPORT.md");
          const reportText = await (await reportHandle.getFile()).text();
          const re = /^###\s+Community\s+(\d+)\s+-\s+"([^"]+)"/gm;
          let m: RegExpExecArray | null;
          while ((m = re.exec(reportText)) !== null) {
            reportNameMap.set(parseInt(m[1], 10), m[2]);
          }
        } catch {
          // GRAPH_REPORT.md missing — fall back to deriving names from nodes
        }

        const fileHandle = await graphifyDir.getFileHandle("graph.json");
        const text = await (await fileHandle.getFile()).text();
        const raw = JSON.parse(text) as RawGraphifyData;
        if (cancelled) return;

        // Compute degree (in + out) for each node id
        const degreeMap = new Map<string, number>();
        for (const l of raw.links) {
          const src = typeof l.source === "object" ? (l.source as { id: string }).id : l.source;
          const tgt = typeof l.target === "object" ? (l.target as { id: string }).id : l.target;
          degreeMap.set(src, (degreeMap.get(src) ?? 0) + 1);
          degreeMap.set(tgt, (degreeMap.get(tgt) ?? 0) + 1);
        }

        // Build community palette + find the most-connected node per community
        const communityCountMap = new Map<number, number>();
        const communityTopNode = new Map<number, { label: string; degree: number }>();
        for (const n of raw.nodes) {
          const c = n.community ?? -1;
          communityCountMap.set(c, (communityCountMap.get(c) ?? 0) + 1);
          if (c >= 0) {
            const deg = degreeMap.get(n.id) ?? 0;
            const prev = communityTopNode.get(c);
            if (!prev || deg > prev.degree) {
              communityTopNode.set(c, { label: n.label, degree: deg });
            }
          }
        }
        const sortedCommunities = Array.from(communityCountMap.entries())
          .filter(([id]) => id >= 0)
          .sort(([a], [b]) => a - b);

        // Assign stable colors by community ID sort order
        const colorPalette = new Map<number, string>();
        sortedCommunities.forEach(([id], idx) => {
          colorPalette.set(id, communityColor(idx));
        });

        const communityList: CommunityInfo[] = sortedCommunities.map(([id, count]) => ({
          id,
          name: reportNameMap.get(id) ?? communityTopNode.get(id)?.label ?? `Community ${id}`,
          color: colorPalette.get(id)!,
          count,
        }));

        // Build fast lookup maps
        const colorMap = new Map<string, string>();
        const sourceMap = new Map<string, string>();
        for (const n of raw.nodes) {
          colorMap.set(n.id, colorPalette.get(n.community ?? -1) ?? "#888");
          if (n.source_file) sourceMap.set(n.id, n.source_file);
        }

        setData(raw);
        setHyperedges(raw.hyperedges ?? []);
        setCommunities(communityList);
        setNodeColorMap(colorMap);
        setNodeSourceMap(sourceMap);
        setNodeDegreeMap(degreeMap);
        setStatus("loaded");
      } catch (e) {
        if (cancelled) return;
        if (e instanceof DOMException && e.name === "NotFoundError") {
          setStatus("missing");
        } else {
          setStatus("error");
        }
        setData(EMPTY);
        setHyperedges([]);
        setCommunities([]);
        setNodeColorMap(new Map());
        setNodeSourceMap(new Map());
        setNodeDegreeMap(new Map());
      }
    })();

    return () => { cancelled = true; lastHandleRef.current = null; };
  // dirHandleRef is a ref — its .current changes won't trigger re-runs,
  // but the dep on dirHandleRef itself means this fires once on mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirHandleRef]);

  return { data, hyperedges, communities, nodeColorMap, nodeSourceMap, nodeDegreeMap, status };
}
