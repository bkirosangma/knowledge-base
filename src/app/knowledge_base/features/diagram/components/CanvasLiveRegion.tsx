"use client";

import React from "react";
import type { LayerDef, NodeData, Selection } from "../types";

interface CanvasLiveRegionProps {
  selection: Selection;
  nodes: NodeData[];
  layers: LayerDef[];
}

/**
 * KB-030 — `aria-live="polite"` region that announces selection changes
 * to screen readers. The text is the only thing that matters; the div
 * is visually hidden via the `sr-only` Tailwind utility (or the inline
 * sr-only-equivalent style for environments without it).
 *
 * Format: `Selected: <label or "unnamed">, layer <name>`. Layers without
 * a node selection (or no selection at all) emit empty content, which
 * suppresses an announcement — screen readers only read non-empty
 * polite-region updates.
 */
export default function CanvasLiveRegion({ selection, nodes, layers }: CanvasLiveRegionProps) {
  const message = React.useMemo(() => {
    if (selection?.type !== "node") return "";
    const node = nodes.find((n) => n.id === selection.id);
    if (!node) return "";
    const label = node.label?.trim() || "unnamed";
    const layer = layers.find((l) => l.id === node.layer);
    const layerName = layer?.title?.trim() || "no layer";
    return `Selected: ${label}, layer ${layerName}`;
  }, [selection, nodes, layers]);

  return (
    <div
      // `aria-live="polite"` alone is enough for screen-reader
      // announcements. `role="status"` would have the same effect but
      // collides with the toast container's `role="status"` and breaks
      // tests that select by role — DIAG-3.17-12 in particular.
      aria-live="polite"
      aria-atomic="true"
      data-testid="canvas-live-region"
      // Visually hidden, screen-reader accessible. Inlined to avoid a
      // CSS dependency surface for an a11y feature.
      style={{
        position: "absolute",
        width: 1,
        height: 1,
        padding: 0,
        margin: -1,
        overflow: "hidden",
        clip: "rect(0, 0, 0, 0)",
        whiteSpace: "nowrap",
        border: 0,
      }}
    >
      {message}
    </div>
  );
}
