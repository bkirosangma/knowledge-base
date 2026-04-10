import { useMemo, type ComponentType } from "react";
import type { NodeData, Connection, LayerDef, FlowDef } from "../../utils/types";
import { Section, Row, EditableRow, EditableIdRow, ExpandableListRow, IconPickerRow, ColorRow, ColorSchemeRow, KEY_COL, type RegionBounds } from "./shared";

export function NodeProperties({
  id, nodes, connections, regions, layerDefs, onSelectLayer, onSelectNode, onUpdate, allNodeIds, flows, onSelectFlow, onHoverFlow,
}: {
  id: string; nodes: NodeData[]; connections: Connection[]; regions: RegionBounds[];
  layerDefs: LayerDef[];
  onSelectLayer?: (layerId: string) => void;
  onSelectNode?: (nodeId: string) => void;
  onUpdate?: (id: string, updates: Partial<{ id: string; label: string; sub: string; type: string; icon: ComponentType<{ size?: number; className?: string; strokeWidth?: number }>; borderColor: string; bgColor: string; textColor: string; layer: string; conditionOutCount: number; conditionSize: 1 | 2 | 3 | 4 | 5; rotation: 0 | 90 | 180 | 270 }>) => void;
  allNodeIds: string[];
  flows?: FlowDef[];
  onSelectFlow?: (flowId: string) => void;
  onHoverFlow?: (flowId: string | null) => void;
}) {
  const node = nodes.find((n) => n.id === id);
  if (!node) return <p className="text-xs text-slate-400">Node not found.</p>;

  const Icon = node.icon;
  const iconName = (Icon as unknown as { displayName?: string }).displayName ?? Icon.name ?? "—";

  const memberFlows = useMemo(() =>
    (flows ?? []).filter((f) =>
      f.connectionIds.some((cid) => {
        const conn = connections.find((c) => c.id === cid);
        return conn && (conn.from === id || conn.to === id);
      })
    ).map((f) => ({ id: f.id, name: f.name })),
    [flows, connections, id],
  );

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
    <>
      <Section title="Identity">
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
        {node.shape !== "condition" && (
          <EditableRow label="Sub" value={node.sub ?? ""} onCommit={(v) => { onUpdate?.(id, { sub: v }); return true; }} onClear={() => onUpdate?.(id, { sub: "" })} />
        )}
        {node.shape !== "condition" && (
          <EditableRow label="Type" value={node.type ?? ""} onCommit={(v) => { onUpdate?.(id, { type: v }); return true; }} onClear={() => onUpdate?.(id, { type: "" })} />
        )}
      </Section>

      <Section title="Connections">
        {node.shape !== "condition" && (
          <div className="flex items-center py-1.5 border-b border-slate-100 last:border-b-0">
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
        )}
        <ExpandableListRow label="In" items={incomingItems} onSelect={onSelectNode} />
        <ExpandableListRow label="Out" items={outgoingItems} onSelect={onSelectNode} />
      </Section>

      <Section title="Appearance">
        <IconPickerRow
          currentIcon={Icon}
          currentName={iconName}
          onSelect={(icon) => onUpdate?.(id, { icon })}
        />
        <ColorSchemeRow
          type={node.shape === "condition" ? "condition" : "node"}
          currentColors={{ fill: node.bgColor ?? "#ffffff", border: node.borderColor ?? "#e2e8f0", text: node.textColor ?? "#1e293b" }}
          onSelect={(s) => {
            const colors = node.shape === "condition" ? s.condition : s.node;
            onUpdate?.(id, { bgColor: colors.fill, borderColor: colors.border, textColor: colors.text });
          }}
        />
        <ColorRow label="Fill" value={node.bgColor ?? "#ffffff"} onChange={(v) => onUpdate?.(id, { bgColor: v })} />
        <ColorRow label="Border" value={node.borderColor ?? "#e2e8f0"} onChange={(v) => onUpdate?.(id, { borderColor: v })} />
        <ColorRow label="Text" value={node.textColor ?? "#1e293b"} onChange={(v) => onUpdate?.(id, { textColor: v })} />
      </Section>

      {memberFlows.length > 0 && (
        <Section title="Flows">
          <ExpandableListRow label="Flows" items={memberFlows} onSelect={onSelectFlow} onHoverItem={onHoverFlow} />
        </Section>
      )}

      {node.shape === "condition" && (
        <Section title="Condition">
          <Row label="Out Anchors" value={node.conditionOutCount ?? 2} />
          <div className="px-4 py-2">
            <button
              className="w-full px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-md transition-colors border border-amber-200"
              onClick={() => onUpdate?.(id, { conditionOutCount: (node.conditionOutCount ?? 2) + 1 })}
            >
              Add Out Anchor
            </button>
          </div>
          <div className="flex items-center py-1.5 border-b border-slate-100 last:border-b-0">
            <span className={`text-[11px] font-semibold text-slate-500 uppercase tracking-wider ${KEY_COL}`}>Size</span>
            <div className="flex gap-0.5">
              {([1, 2, 3, 4, 5] as const).map((s) => (
                <button
                  key={s}
                  className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${
                    (node.conditionSize ?? 1) === s
                      ? "bg-blue-100 text-blue-700 border border-blue-300"
                      : "bg-slate-50 text-slate-500 border border-slate-200 hover:bg-slate-100"
                  }`}
                  onClick={() => onUpdate?.(id, { conditionSize: s })}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center py-1.5 border-b border-slate-100 last:border-b-0">
            <span className={`text-[11px] font-semibold text-slate-500 uppercase tracking-wider ${KEY_COL}`}>Rotation</span>
            <div className="flex gap-0.5">
              {([0, 90, 180, 270] as const).map((deg) => (
                <button
                  key={deg}
                  className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${
                    (node.rotation ?? 0) === deg
                      ? "bg-blue-100 text-blue-700 border border-blue-300"
                      : "bg-slate-50 text-slate-500 border border-slate-200 hover:bg-slate-100"
                  }`}
                  onClick={() => onUpdate?.(id, { rotation: deg })}
                >
                  {deg}°
                </button>
              ))}
            </div>
          </div>
        </Section>
      )}

      <Section title="Layout">
        <Row label="Position" value={`${Math.round(node.x)}, ${Math.round(node.y)}`} />
        <Row label="Width" value={`${node.w}px`} />
      </Section>
    </>
  );
}
