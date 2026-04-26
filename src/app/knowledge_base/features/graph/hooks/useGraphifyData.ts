"use client";

import { useState, useEffect, useRef } from "react";
import { topLevelFolder } from "./useGraphData";
import type { GraphData, GraphNode, GraphLink } from "./useGraphData";

export type GraphifyStatus = "idle" | "loading" | "loaded" | "missing" | "error";

interface RawGraphifyNode {
  id: string;
  label: string;
  source_file?: string;
  file_type?: string;
  community?: number;
}

interface RawGraphifyLink {
  source: string;
  target: string;
  relation?: string;
}

interface RawGraphifyData {
  nodes: RawGraphifyNode[];
  links: RawGraphifyLink[];
}

const EMPTY_DATA: GraphData = { nodes: [], links: [] };

function transformGraphifyData(raw: RawGraphifyData): GraphData {
  // Build id → source_file map
  const idToSourceFile = new Map<string, string>();
  for (const n of raw.nodes) {
    if (n.source_file) idToSourceFile.set(n.id, n.source_file);
  }

  // Deduplicate nodes by source_file (one graph node per file)
  const seenFiles = new Map<string, GraphNode>();
  for (const n of raw.nodes) {
    const filePath = n.source_file ?? n.id;
    if (seenFiles.has(filePath)) continue;
    seenFiles.set(filePath, {
      id: filePath,
      label: n.label,
      fileType: filePath.endsWith(".json") ? "json" : "md",
      folder: topLevelFolder(filePath),
      orphan: false, // computed below
    });
  }

  // Build edges — map raw node ids to source_files
  const seenLinks = new Set<string>();
  const links: GraphLink[] = [];
  for (const l of raw.links) {
    const src = idToSourceFile.get(l.source) ?? l.source;
    const tgt = idToSourceFile.get(l.target) ?? l.target;
    if (!seenFiles.has(src) || !seenFiles.has(tgt) || src === tgt) continue;
    const key = `${src}\0${tgt}`;
    if (seenLinks.has(key)) continue;
    seenLinks.add(key);
    links.push({ source: src, target: tgt });
  }

  // Compute orphan status
  const connected = new Set<string>();
  for (const l of links) {
    connected.add(l.source as string);
    connected.add(l.target as string);
  }
  const nodes = Array.from(seenFiles.values()).map((n) => ({
    ...n,
    orphan: !connected.has(n.id),
  }));

  return { nodes, links };
}

export function useGraphifyData(
  dirHandleRef: React.MutableRefObject<FileSystemDirectoryHandle | null>,
  enabled: boolean,
): { data: GraphData; status: GraphifyStatus } {
  const [status, setStatus] = useState<GraphifyStatus>("idle");
  const [data, setData] = useState<GraphData>(EMPTY_DATA);
  // Track which handle we last loaded for, so switching vaults re-fetches.
  const lastHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const lastEnabledRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setStatus("idle");
      setData(EMPTY_DATA);
      lastEnabledRef.current = false;
      return;
    }

    const rootHandle = dirHandleRef.current;
    if (!rootHandle) return;

    // Skip if nothing changed
    if (lastEnabledRef.current && lastHandleRef.current === rootHandle) return;
    lastEnabledRef.current = true;
    lastHandleRef.current = rootHandle;

    let cancelled = false;
    setStatus("loading");

    (async () => {
      try {
        const graphifyDir = await rootHandle.getDirectoryHandle("graphify-out");
        const fileHandle = await graphifyDir.getFileHandle("graph.json");
        const text = await (await fileHandle.getFile()).text();
        const raw = JSON.parse(text) as RawGraphifyData;
        if (!cancelled) {
          setData(transformGraphifyData(raw));
          setStatus("loaded");
        }
      } catch (e) {
        if (cancelled) return;
        if (e instanceof DOMException && e.name === "NotFoundError") {
          setStatus("missing");
        } else {
          setStatus("error");
        }
        setData(EMPTY_DATA);
      }
    })();

    return () => { cancelled = true; };
  }, [enabled, dirHandleRef]);

  return { data, status };
}
