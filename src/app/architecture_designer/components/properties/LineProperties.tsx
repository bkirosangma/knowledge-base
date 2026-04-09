import { useState, useEffect, useRef, useCallback } from "react";
import type { NodeData, Connection } from "../../utils/types";
import type { AnchorId } from "../../utils/anchors";
import { Row, EditableRow, EditableIdRow, ColorRow, ColorSchemeRow } from "./shared";

function DurationRow({ value, defaultValue, onChange }: { value: number; defaultValue: number; onChange: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(String(value)); setEditing(false); }, [value]);
  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  const commit = useCallback(() => {
    const num = parseFloat(draft);
    if (isNaN(num) || num <= 0) {
      onChange(defaultValue);
    } else {
      onChange(num);
    }
    setEditing(false);
  }, [draft, defaultValue, onChange]);

  if (!editing) {
    return (
      <div className="flex items-center py-1.5 border-b border-slate-100 last:border-b-0 cursor-text" onDoubleClick={() => setEditing(true)}>
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider w-[110px] shrink-0 px-4">Flow Duration</span>
        <span className="text-[13px] text-slate-800 truncate pr-4">{value}s</span>
      </div>
    );
  }

  return (
    <div className="flex items-center py-1.5 border-b border-slate-100 last:border-b-0">
      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider w-[110px] shrink-0 px-4">Flow Duration</span>
      <div className="flex items-center pr-4 gap-1">
        <input
          ref={inputRef}
          type="number"
          step="0.1"
          min="0.1"
          className="text-[13px] text-slate-800 bg-white border border-slate-300 rounded px-1.5 py-0.5 w-16 outline-none focus:border-blue-400"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(String(value)); setEditing(false); } }}
        />
        <span className="text-[13px] text-slate-500">s</span>
      </div>
    </div>
  );
}

export function LineProperties({
  id, connections, nodes, onUpdate, allConnectionIds,
}: {
  id: string; connections: Connection[]; nodes: NodeData[];
  onUpdate?: (id: string, updates: Partial<{ id: string; label: string; color: string; from: string; to: string; fromAnchor: AnchorId; toAnchor: AnchorId; biDirectional: boolean; flowDuration: number }>) => void;
  allConnectionIds: string[];
}) {
  const conn = connections.find((c) => c.id === id);
  if (!conn) return <p className="text-xs text-slate-400">Connection not found.</p>;

  const fromNode = nodes.find((n) => n.id === conn.from);
  const toNode = nodes.find((n) => n.id === conn.to);

  return (
    <div className="space-y-3">
      <div className="space-y-0">
        <EditableIdRow
          label="ID" value={conn.id} prefix="dl-"
          onCommit={(newId) => {
            if (newId === id) return true;
            if (allConnectionIds.includes(newId)) return false;
            onUpdate?.(id, { id: newId });
            return true;
          }}
        />
        <EditableRow label="Label" value={conn.label} onCommit={(v) => { onUpdate?.(id, { label: v }); return true; }} />
        <Row label="From" value={fromNode?.label ?? conn.from} />
        <Row label="To" value={toNode?.label ?? conn.to} />
        <Row label="From Anchor" value={conn.fromAnchor} />
        <Row label="To Anchor" value={conn.toAnchor} />
        <div className="px-4 py-2">
          <button
            className="w-full px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
            onClick={() => onUpdate?.(id, { from: conn.to, to: conn.from, fromAnchor: conn.toAnchor, toAnchor: conn.fromAnchor })}
          >
            Reverse Direction
          </button>
        </div>
        <div className="flex items-center justify-between px-4 py-2">
          <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Bi-directional</span>
          <button
            className={`w-8 h-[18px] rounded-full relative transition-colors ${conn.biDirectional ? "bg-blue-500" : "bg-slate-300"}`}
            onClick={() => onUpdate?.(id, { biDirectional: !conn.biDirectional })}
          >
            <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-transform ${conn.biDirectional ? "left-[16px]" : "left-[2px]"}`} />
          </button>
        </div>
        <DurationRow
          value={conn.flowDuration ?? 2.5}
          defaultValue={2.5}
          onChange={(v) => onUpdate?.(id, { flowDuration: v })}
        />
        <ColorSchemeRow
          type="line"
          currentColors={{ color: conn.color }}
          onSelect={(s) => onUpdate?.(id, { color: s.line })}
        />
        <ColorRow label="Color" value={conn.color} onChange={(v) => onUpdate?.(id, { color: v })} />
      </div>
    </div>
  );
}
