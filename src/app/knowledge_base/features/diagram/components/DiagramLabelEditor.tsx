"use client";

import React from "react";
import type { NodeData, Connection, RegionBounds } from "../types";

export interface DiagramLabelEditorProps {
  readOnly: boolean;
  editingLabel: { type: "node" | "layer" | "line"; id: string } | null;
  editingLabelValue: string;
  setEditingLabelValue: React.Dispatch<React.SetStateAction<string>>;
  editingLabelBeforeRef: React.MutableRefObject<string>;
  commitLabel: (
    label: { type: "node" | "layer" | "line"; id: string },
    value: string,
  ) => void;
  nodes: NodeData[];
  regions: RegionBounds[];
  /** The rendered lines array — only `id` + `points` are consumed here. */
  lines: { id: string; points: { x: number; y: number }[] }[];
  connections: Connection[];
}

/**
 * The inline `<input>` that replaces a node/layer/line label when the user
 * starts editing it. Commits on Enter or blur; Escape restores the original
 * value before blurring.
 */
export default function DiagramLabelEditor({
  readOnly,
  editingLabel,
  editingLabelValue,
  setEditingLabelValue,
  editingLabelBeforeRef,
  commitLabel,
  nodes,
  regions,
  lines,
  connections,
}: DiagramLabelEditorProps) {
  if (readOnly || !editingLabel) return null;

  let editX = 0, editY = 0;
  if (editingLabel.type === "node") {
    const n = nodes.find((nd) => nd.id === editingLabel.id);
    if (n) { editX = n.x; editY = n.y; }
  } else if (editingLabel.type === "layer") {
    const r = regions.find((rg) => rg.id === editingLabel.id);
    if (r) { editX = r.left + 12; editY = r.top + 12; }
  } else if (editingLabel.type === "line") {
    const line = lines.find((l) => l.id === editingLabel.id);
    if (line) {
      const t = connections.find((c) => c.id === editingLabel.id)?.labelPosition ?? 0.5;
      const pts = line.points;
      if (pts.length >= 2) {
        let totalLen = 0;
        const segs: number[] = [];
        for (let i = 1; i < pts.length; i++) {
          const dx = pts[i].x - pts[i-1].x, dy = pts[i].y - pts[i-1].y;
          segs.push(Math.sqrt(dx*dx + dy*dy));
          totalLen += segs[i-1];
        }
        const target = t * totalLen;
        let acc = 0;
        for (let i = 0; i < segs.length; i++) {
          if (acc + segs[i] >= target) {
            const f = (target - acc) / segs[i];
            editX = pts[i].x + (pts[i+1].x - pts[i].x) * f;
            editY = pts[i].y + (pts[i+1].y - pts[i].y) * f;
            break;
          }
          acc += segs[i];
        }
      }
    }
  }

  const doCommit = () => commitLabel(editingLabel, editingLabelValue);
  return (
    <div
      className="absolute"
      style={{ left: editX, top: editY, transform: editingLabel.type === "node" ? "translate(-50%, -50%)" : undefined, zIndex: 60 }}
    >
      <input
        autoFocus
        value={editingLabelValue}
        onChange={(e) => setEditingLabelValue(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={doCommit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          else if (e.key === "Escape") { setEditingLabelValue(editingLabelBeforeRef.current); e.currentTarget.blur(); }
        }}
        maxLength={80}
        className="text-sm font-semibold bg-white/90 backdrop-blur-sm border-none outline-none px-1.5 py-0.5 rounded shadow-sm ring-1 ring-blue-300 focus:ring-2 focus:ring-blue-400 transition-shadow min-w-[60px]"
        style={{ width: Math.max(60, editingLabelValue.length * 8 + 16) }}
        onMouseDown={(e) => e.stopPropagation()}
      />
    </div>
  );
}
