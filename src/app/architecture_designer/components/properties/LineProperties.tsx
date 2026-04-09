import type { NodeData, Connection } from "../../utils/types";
import { Row, EditableRow, EditableIdRow, ColorRow, ColorSchemeRow } from "./shared";

export function LineProperties({
  id, connections, nodes, onUpdate, allConnectionIds,
}: {
  id: string; connections: Connection[]; nodes: NodeData[];
  onUpdate?: (id: string, updates: Partial<{ id: string; label: string; color: string }>) => void;
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
