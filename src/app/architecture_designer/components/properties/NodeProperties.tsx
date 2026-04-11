import { useMemo, type ComponentType } from "react";
import type { NodeData, Connection, LayerDef, FlowDef } from "../../utils/types";
import type { LevelInfo } from "../../utils/levelModel";
import { getDistinctTypes } from "../../utils/typeUtils";
import { Section, Row, EditableRow, EditableIdRow, ExpandableListRow, IconPickerRow, ColorRow, ColorSchemeRow, KEY_COL, type RegionBounds } from "./shared";
import { AutocompleteInput } from "./AutocompleteInput";

export function NodeProperties({
  id, nodes, connections, regions, layerDefs, onSelectLayer, onSelectNode, onUpdate, allNodeIds, flows, onSelectFlow, onHoverFlow, onCreateLayer, onDeleteAnchor, levelInfo,
}: {
  id: string; nodes: NodeData[]; connections: Connection[]; regions: RegionBounds[];
  layerDefs: LayerDef[];
  levelInfo?: LevelInfo;
  onSelectLayer?: (layerId: string) => void;
  onSelectNode?: (nodeId: string) => void;
  onUpdate?: (id: string, updates: Partial<{ id: string; label: string; sub: string; type: string; icon: ComponentType<{ size?: number; className?: string; strokeWidth?: number }>; borderColor: string; bgColor: string; textColor: string; layer: string; conditionOutCount: number; conditionSize: 1 | 2 | 3 | 4 | 5; rotation: number }>) => void;
  allNodeIds: string[];
  flows?: FlowDef[];
  onSelectFlow?: (flowId: string) => void;
  onHoverFlow?: (flowId: string | null) => void;
  onCreateLayer?: (title: string) => string;
  onDeleteAnchor?: (nodeId: string, anchorIndex: number) => void;
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

  // Elements reachable through condition nodes
  const viaConditionItems = useMemo(() => {
    if (node.shape === "condition") return [];
    const items: { id: string; name: string; sub: string }[] = [];
    // Outbound: this → condition → targets
    for (const c of connections) {
      if (c.from !== id) continue;
      const condNode = nodes.find((n) => n.id === c.to && n.shape === "condition");
      if (!condNode) continue;
      for (const out of connections) {
        if (out.from !== condNode.id) continue;
        const target = nodes.find((n) => n.id === out.to);
        if (target) items.push({ id: target.id, name: target.label, sub: `via ${condNode.label}` });
      }
    }
    // Inbound: sources → condition → this
    for (const c of connections) {
      if (c.to !== id) continue;
      const condNode = nodes.find((n) => n.id === c.from && n.shape === "condition");
      if (!condNode) continue;
      for (const inc of connections) {
        if (inc.to !== condNode.id) continue;
        const source = nodes.find((n) => n.id === inc.from);
        if (source) items.push({ id: source.id, name: source.label, sub: `via ${condNode.label}` });
      }
    }
    return items;
  }, [id, node.shape, connections, nodes]);

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
          <AutocompleteInput
            label="Type"
            value={node.type ?? ""}
            suggestions={getDistinctTypes(nodes)}
            onCommit={(v) => { onUpdate?.(id, { type: v }); return true; }}
            onClear={() => onUpdate?.(id, { type: "" })}
          />
        )}
      </Section>

      <Section title="Connections">
        {node.shape !== "condition" && (
          <AutocompleteInput
            label="Layer"
            value={layerDefs.find((l) => l.id === node.layer)?.title ?? ""}
            suggestions={layerDefs.map((l) => l.title)}
            onCommit={(v) => {
              if (!v) { onUpdate?.(id, { layer: "" }); return true; }
              const existing = layerDefs.find((l) => l.title.toLowerCase() === v.toLowerCase());
              if (existing) { onUpdate?.(id, { layer: existing.id }); return true; }
              const newId = onCreateLayer?.(v);
              if (newId) { onUpdate?.(id, { layer: newId }); return true; }
              return false;
            }}
            onClear={() => onUpdate?.(id, { layer: "" })}
          />
        )}
        <ExpandableListRow label="In" items={incomingItems} onSelect={onSelectNode} />
        <ExpandableListRow label="Out" items={outgoingItems} onSelect={onSelectNode} />
        {viaConditionItems.length > 0 && (
          <ExpandableListRow label="Via Conditions" items={viaConditionItems} onSelect={onSelectNode} />
        )}
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

      {node.shape === "condition" && (() => {
        const outCount = node.conditionOutCount ?? 2;
        const inConn = connections.find((c) => c.to === id && c.toAnchor === "cond-in");
        const inSource = inConn ? nodes.find((n) => n.id === inConn.from) : null;
        return (
          <Section title="Condition">
            <div className="border-b border-slate-100 px-1.5 py-1">
              <div className="text-[11px] font-semibold text-green-600 mb-0.5">In</div>
              {inSource ? (
                <button className="text-[12px] text-slate-600 hover:text-blue-600 transition-colors cursor-pointer" onClick={() => onSelectNode?.(inSource.id)}>
                  {inSource.label}
                </button>
              ) : (
                <span className="text-[11px] text-slate-400 italic">No connection</span>
              )}
            </div>
            {Array.from({ length: outCount }, (_, i) => {
              const anchorId = `cond-out-${i}`;
              const outConns = connections.filter((c) => c.from === id && c.fromAnchor === anchorId);
              return (
                <div key={i} className="border-b border-slate-100 px-1.5 py-1 flex items-start gap-1">
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-semibold text-amber-600">Out {i}</div>
                    {outConns.length > 0 ? outConns.map((c) => {
                      const target = nodes.find((n) => n.id === c.to);
                      return (
                        <button key={c.id} className="block text-[12px] text-slate-600 hover:text-blue-600 truncate transition-colors cursor-pointer" onClick={() => onSelectNode?.(c.to)}>
                          {target?.label ?? c.to}
                        </button>
                      );
                    }) : (
                      <span className="text-[11px] text-slate-400 italic">No connection</span>
                    )}
                  </div>
                  {outCount > 2 && (
                    <button
                      className="text-slate-300 hover:text-red-500 transition-colors shrink-0 mt-0.5 cursor-pointer"
                      onClick={() => onDeleteAnchor?.(id, i)}
                      title="Delete anchor and its connections"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                    </button>
                  )}
                </div>
              );
            })}
            <div className="px-1 py-2">
              <button
                className="w-full px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-md transition-colors border border-amber-200"
                onClick={() => onUpdate?.(id, { conditionOutCount: outCount + 1 })}
              >
                Add Out Anchor
              </button>
            </div>
            <div className="flex items-center py-1.5 border-b border-slate-100">
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
            <div className="flex items-center py-1.5 border-b border-slate-100">
              <span className={`text-[11px] font-semibold text-slate-500 uppercase tracking-wider ${KEY_COL}`}>Rotation</span>
              <div className="flex items-center gap-1">
                <div className="flex gap-0.5">
                  {[0, 90, 180, 270].map((deg) => (
                    <button
                      key={deg}
                      className={`px-1.5 py-0.5 text-[10px] font-medium rounded transition-colors ${
                        Math.round(node.rotation ?? 0) === deg
                          ? "bg-blue-100 text-blue-700 border border-blue-300"
                          : "bg-slate-50 text-slate-500 border border-slate-200 hover:bg-slate-100"
                      }`}
                      onClick={() => onUpdate?.(id, { rotation: deg })}
                    >
                      {deg}°
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  min={0} max={359} step={1}
                  className="w-12 text-[11px] text-slate-700 bg-slate-50 border border-slate-200 rounded px-1 py-0.5 outline-none focus:border-blue-400 text-center"
                  value={Math.round(node.rotation ?? 0)}
                  onChange={(e) => {
                    const v = ((parseInt(e.target.value) || 0) % 360 + 360) % 360;
                    onUpdate?.(id, { rotation: v });
                  }}
                />
              </div>
            </div>
          </Section>
        );
      })()}

      <Section title="Layout">
        <Row label="Level" value={levelInfo?.level ?? "—"} />
        <Row label="Base" value={levelInfo ? (levelInfo.base === "canvas" ? "Canvas" : layerDefs.find(l => l.id === levelInfo.base)?.title ?? levelInfo.base) : "—"} />
        <Row label="Position" value={`${Math.round(node.x)}, ${Math.round(node.y)}`} />
        <Row label="Width" value={`${node.w}px`} />
      </Section>
    </>
  );
}
