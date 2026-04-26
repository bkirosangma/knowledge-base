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
}

export interface RawGraphifyData {
  nodes: RawGraphifyNode[];
  links: RawGraphifyLink[];
}

/** Community entry with color assigned at load time. */
export interface CommunityInfo {
  id: number;
  color: string;
  count: number;
}

export interface GraphifyResult {
  data: RawGraphifyData;
  communities: CommunityInfo[];
  /** id → community color for fast node lookups */
  nodeColorMap: Map<string, string>;
  /** id → source_file for click navigation */
  nodeSourceMap: Map<string, string>;
  status: GraphifyStatus;
}

const EMPTY: RawGraphifyData = { nodes: [], links: [] };

// Golden-angle hue spacing gives visually distinct colors even for many communities.
function communityColor(index: number): string {
  const hue = (index * 137.508) % 360;
  return `hsl(${Math.round(hue)}, 62%, 52%)`;
}

export function useRawGraphify(
  dirHandleRef: React.MutableRefObject<FileSystemDirectoryHandle | null>,
): GraphifyResult {
  const [status, setStatus] = useState<GraphifyStatus>("idle");
  const [data, setData] = useState<RawGraphifyData>(EMPTY);
  const [communities, setCommunities] = useState<CommunityInfo[]>([]);
  const [nodeColorMap, setNodeColorMap] = useState<Map<string, string>>(new Map());
  const [nodeSourceMap, setNodeSourceMap] = useState<Map<string, string>>(new Map());
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
        const fileHandle = await graphifyDir.getFileHandle("graph.json");
        const text = await (await fileHandle.getFile()).text();
        const raw = JSON.parse(text) as RawGraphifyData;
        if (cancelled) return;

        // Build community palette
        const communityCountMap = new Map<number, number>();
        for (const n of raw.nodes) {
          const c = n.community ?? -1;
          communityCountMap.set(c, (communityCountMap.get(c) ?? 0) + 1);
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
        setCommunities(communityList);
        setNodeColorMap(colorMap);
        setNodeSourceMap(sourceMap);
        setStatus("loaded");
      } catch (e) {
        if (cancelled) return;
        if (e instanceof DOMException && e.name === "NotFoundError") {
          setStatus("missing");
        } else {
          setStatus("error");
        }
        setData(EMPTY);
        setCommunities([]);
        setNodeColorMap(new Map());
        setNodeSourceMap(new Map());
      }
    })();

    return () => { cancelled = true; };
  // dirHandleRef is a ref — its .current changes won't trigger re-runs,
  // but the dep on dirHandleRef itself means this fires once on mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirHandleRef]);

  return { data, communities, nodeColorMap, nodeSourceMap, status };
}
