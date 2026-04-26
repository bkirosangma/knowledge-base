"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import type { RawGraphifyNode, RawGraphifyData } from "../hooks/useRawGraphify";

interface GraphifyCanvasProps {
  nodes: RawGraphifyNode[];
  links: RawGraphifyData["links"];
  nodeColorMap: Map<string, string>;
  /** Community ID to highlight; null = all visible at full opacity. */
  highlightedCommunity: number | null;
  /** Node ID to highlight; null = no selection. */
  highlightedNode: string | null;
  theme: "light" | "dark";
  onNodeClick: (node: RawGraphifyNode) => void;
}

interface CssTokens {
  surface: string;
  line: string;
}

function readTokens(): CssTokens {
  if (typeof window === "undefined") return { surface: "#ffffff", line: "#e2e8f0" };
  const cs = getComputedStyle(document.documentElement);
  const get = (name: string, fb: string) => cs.getPropertyValue(name).trim() || fb;
  return {
    surface: get("--surface", "#ffffff"),
    line: get("--line", "#e2e8f0"),
  };
}

export default function GraphifyCanvas({
  nodes,
  links,
  nodeColorMap,
  highlightedCommunity,
  highlightedNode,
  theme,
  onNodeClick,
}: GraphifyCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const tokens = useMemo<CssTokens>(() => readTokens(), [theme]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setSize({ w: Math.max(0, Math.floor(rect.width)), h: Math.max(0, Math.floor(rect.height)) });
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const graphData = useMemo(() => ({ nodes, links }), [nodes, links]);

  const nodeColor = useCallback(
    (node: RawGraphifyNode) => {
      const base = nodeColorMap.get(node.id) ?? "#888";
      if (highlightedCommunity !== null && node.community !== highlightedCommunity) {
        return base + "33"; // 20% opacity hex suffix
      }
      if (highlightedNode !== null && node.id === highlightedNode) {
        return "#ffffff";
      }
      return base;
    },
    [nodeColorMap, highlightedCommunity, highlightedNode],
  );

  const nodeRelSize = useCallback(
    (node: RawGraphifyNode) => (node.id === highlightedNode ? 6 : 4),
    [highlightedNode],
  );

  const nodeLabelAccessor = useCallback((node: RawGraphifyNode) => node.label, []);

  const handleNodeClick = useCallback(
    (node: RawGraphifyNode) => { onNodeClick(node); },
    [onNodeClick],
  );

  return (
    <div
      ref={containerRef}
      className="relative flex-1 min-w-0 min-h-0 bg-surface-2"
      data-testid="graphify-canvas-container"
    >
      {size.w > 0 && size.h > 0 && (
        <ForceGraph2D
          width={size.w}
          height={size.h}
          graphData={graphData}
          backgroundColor={tokens.surface}
          nodeId="id"
          nodeLabel={nodeLabelAccessor}
          nodeColor={nodeColor}
          nodeVal={nodeRelSize}
          nodeRelSize={4}
          linkColor={() => tokens.line}
          linkWidth={1}
          onNodeClick={handleNodeClick}
          enableNodeDrag
          cooldownTicks={120}
        />
      )}

      {/* Hidden DOM mirror for Playwright/accessibility */}
      <ul
        data-testid="graphify-debug-list"
        className="sr-only"
        aria-label="Knowledge graph nodes (accessible list)"
      >
        {nodes.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              tabIndex={-1}
              data-testid={`graphify-node-${n.id}`}
              data-community={n.community ?? "none"}
              onClick={() => onNodeClick(n)}
              aria-label={`Select ${n.label}`}
            >
              {n.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
