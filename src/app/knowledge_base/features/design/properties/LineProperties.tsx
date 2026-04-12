import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { NodeData, Connection, FlowDef } from "../types";
import type { AnchorId } from "../utils/anchors";
import { Section, Row, EditableRow, EditableIdRow, ColorRow, ColorSchemeRow, ExpandableListRow } from "./shared";
import DocumentsSection from "./DocumentsSection";

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
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider w-[110px] shrink-0 px-4">Duration</span>
        <span className="text-[13px] text-slate-800 truncate pr-4">{value}s</span>
      </div>
    );
  }

  return (
    <div className="flex items-center py-1.5 border-b border-slate-100 last:border-b-0">
      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider w-[110px] shrink-0 px-4">Duration</span>
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
  id, connections, nodes, onUpdate, allConnectionIds, flows, onSelectFlow, onHoverFlow, backlinks, onOpenDocument,
}: {
  id: string; connections: Connection[]; nodes: NodeData[];
  onUpdate?: (id: string, updates: Partial<{ id: string; label: string; color: string; from: string; to: string; fromAnchor: AnchorId; toAnchor: AnchorId; biDirectional: boolean; flowDuration: number; connectionType: 'synchronous' | 'asynchronous' }>) => void;
  allConnectionIds: string[];
  flows?: FlowDef[];
  onSelectFlow?: (flowId: string) => void;
  onHoverFlow?: (flowId: string | null) => void;
  backlinks?: { sourcePath: string; section?: string }[];
  onOpenDocument?: (path: string) => void;
}) {
  const conn = connections.find((c) => c.id === id);
  if (!conn) return <p className="text-xs text-slate-400">Connection not found.</p>;

  const fromNode = nodes.find((n) => n.id === conn.from);
  const toNode = nodes.find((n) => n.id === conn.to);

  const memberFlows = useMemo(() =>
    (flows ?? []).filter((f) => f.connectionIds.includes(id)).map((f) => ({ id: f.id, name: f.name })),
    [flows, id],
  );

  return (
    <>
      <Section title="Identity">
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
      </Section>

      <Section title="Route">
        <Row label="From" value={fromNode?.label ?? conn.from} />
        <Row label="To" value={toNode?.label ?? conn.to} />
        <Row label="From Pt" value={conn.fromAnchor} />
        <Row label="To Pt" value={conn.toAnchor} />
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
        <div className="flex items-center py-1.5 border-b border-slate-100 last:border-b-0">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider w-[110px] shrink-0 px-4">Conn Type</span>
          <div className="flex gap-0.5">
            {([['synchronous', 'Sync'], ['asynchronous', 'Async']] as const).map(([type, label]) => (
              <button
                key={type}
                className={`px-2.5 py-0.5 text-[11px] font-medium rounded transition-colors ${
                  (conn.connectionType ?? 'synchronous') === type
                    ? "bg-blue-100 text-blue-700 border border-blue-300"
                    : "bg-slate-50 text-slate-500 border border-slate-200 hover:bg-slate-100"
                }`}
                onClick={() => onUpdate?.(id, { connectionType: type })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Appearance">
        <ColorSchemeRow
          type="line"
          currentColors={{ color: conn.color }}
          onSelect={(s) => onUpdate?.(id, { color: s.line })}
        />
        <ColorRow label="Color" value={conn.color} onChange={(v) => onUpdate?.(id, { color: v })} />
      </Section>

      {memberFlows.length > 0 && (
        <Section title="Flows">
          <ExpandableListRow label="Flows" items={memberFlows} onSelect={onSelectFlow} onHoverItem={onHoverFlow} />
        </Section>
      )}

      <Section title="Animation">
        <DurationRow
          value={conn.flowDuration ?? 2.5}
          defaultValue={2.5}
          onChange={(v) => onUpdate?.(id, { flowDuration: v })}
        />
      </Section>

      {backlinks && (
        <DocumentsSection
          backlinks={backlinks}
          onOpenDocument={onOpenDocument}
        />
      )}
    </>
  );
}
