import type { ComponentType } from "react";
import type { NodeData, Connection, LayerDef } from "../../utils/types";
import { Row, EditableRow, EditableIdRow, ExpandableListRow, IconPickerRow, ColorRow, ColorSchemeRow, KEY_COL, type RegionBounds } from "./shared";

export function NodeProperties({
  id, nodes, connections, regions, layerDefs, onSelectLayer, onSelectNode, onUpdate, allNodeIds,
}: {
  id: string; nodes: NodeData[]; connections: Connection[]; regions: RegionBounds[];
  layerDefs: LayerDef[];
  onSelectLayer?: (layerId: string) => void;
  onSelectNode?: (nodeId: string) => void;
  onUpdate?: (id: string, updates: Partial<{ id: string; label: string; sub: string; icon: ComponentType<{ size?: number; className?: string; strokeWidth?: number }>; borderColor: string; bgColor: string; textColor: string; layer: string }>) => void;
  allNodeIds: string[];
}) {
  const node = nodes.find((n) => n.id === id);
  if (!node) return <p className="text-xs text-slate-400">Node not found.</p>;

  const layer = regions.find((r) => r.id === node.layer);
  const Icon = node.icon;
  const iconName = (Icon as unknown as { displayName?: string }).displayName ?? Icon.name ?? "—";

  const incomingItems = connections
    .filter((c) => c.to === id)
    .map((c) => {
      const other = nodes.find((n) => n.id === c.from);
      return { id: c.from, name: other?.label ?? c.from, sub: c.label };
    });

  const outgoingItems = connections
    .filter((c) => c.from === id)
    .map((c) => {
      const other = nodes.find((n) => n.id === c.to);
      return { id: c.to, name: other?.label ?? c.to, sub: c.label };
    });

  return (
    <div className="space-y-3">
      <div className="space-y-0">
        <EditableIdRow
          label="ID" value={node.id} prefix="el-"
          onCommit={(newId) => {
            if (newId === id) return true;
            if (allNodeIds.includes(newId)) return false;
            onUpdate?.(id, { id: newId });
            return true;
          }}
        />
        <EditableRow label="Label" value={node.label} onCommit={(v) => { onUpdate?.(id, { label: v }); return true; }} />
        <EditableRow label="Sub" value={node.sub ?? ""} onCommit={(v) => { onUpdate?.(id, { sub: v }); return true; }} onClear={() => onUpdate?.(id, { sub: "" })} />
        <IconPickerRow
          currentIcon={Icon}
          currentName={iconName}
          onSelect={(icon) => onUpdate?.(id, { icon })}
        />
        <div className="flex items-center py-1.5 border-b border-slate-100">
          <span className={`text-[11px] font-semibold text-slate-500 uppercase tracking-wider ${KEY_COL}`}>Layer</span>
          <select
            className="text-[13px] text-slate-800 bg-white border border-slate-200 rounded px-1.5 py-0.5 outline-none focus:border-blue-400 cursor-pointer min-w-0 truncate"
            value={node.layer}
            onChange={(e) => onUpdate?.(id, { layer: e.target.value })}
          >
            <option value="">None</option>
            {layerDefs.map((l) => (
              <option key={l.id} value={l.id}>{l.title}</option>
            ))}
          </select>
        </div>
        <ColorSchemeRow
          type="node"
          currentColors={{ fill: node.bgColor ?? "#ffffff", border: node.borderColor ?? "#e2e8f0", text: node.textColor ?? "#1e293b" }}
          onSelect={(s) => onUpdate?.(id, { bgColor: s.node.fill, borderColor: s.node.border, textColor: s.node.text })}
        />
        <ColorRow label="Fill" value={node.bgColor ?? "#ffffff"} onChange={(v) => onUpdate?.(id, { bgColor: v })} />
        <ColorRow label="Border" value={node.borderColor ?? "#e2e8f0"} onChange={(v) => onUpdate?.(id, { borderColor: v })} />
        <ColorRow label="Text" value={node.textColor ?? "#1e293b"} onChange={(v) => onUpdate?.(id, { textColor: v })} />
        <ExpandableListRow label="In" items={incomingItems} onSelect={onSelectNode} />
        <ExpandableListRow label="Out" items={outgoingItems} onSelect={onSelectNode} />
        <Row label="Position" value={`${Math.round(node.x)}, ${Math.round(node.y)}`} />
        <Row label="Width" value={`${node.w}px`} />
      </div>
    </div>
  );
}
