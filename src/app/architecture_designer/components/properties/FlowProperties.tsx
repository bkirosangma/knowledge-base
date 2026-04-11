import { useMemo } from "react";
import type { FlowDef, Connection, NodeData } from "../../utils/types";
import { Section, EditableRow, EditableIdRow, ExpandableListRow } from "./shared";

export function FlowProperties({
  id, flows, connections, nodes,
  onUpdate, onDelete, onSelectLine, onSelectNode,
  allFlowIds,
}: {
  id: string;
  flows: FlowDef[];
  connections: Connection[];
  nodes: NodeData[];
  onUpdate?: (id: string, updates: Partial<{ id: string; name: string; category: string }>) => void;
  onDelete?: (id: string) => void;
  onSelectLine?: (lineId: string) => void;
  onSelectNode?: (nodeId: string) => void;
  allFlowIds: string[];
}) {
  const flow = flows.find((f) => f.id === id);
  if (!flow) return <p className="text-xs text-slate-400">Flow not found.</p>;

  const connectionItems = useMemo(() => {
    return flow.connectionIds
      .map((cid) => {
        const conn = connections.find((c) => c.id === cid);
        if (!conn) return null;
        const fromNode = nodes.find((n) => n.id === conn.from);
        const toNode = nodes.find((n) => n.id === conn.to);
        return {
          id: conn.id,
          name: conn.label || conn.id,
          sub: `${fromNode?.label ?? conn.from} → ${toNode?.label ?? conn.to}`,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item != null);
  }, [flow.connectionIds, connections, nodes]);

  const nodeItems = useMemo(() => {
    const nodeIds = new Set<string>();
    for (const cid of flow.connectionIds) {
      const conn = connections.find((c) => c.id === cid);
      if (conn) {
        nodeIds.add(conn.from);
        nodeIds.add(conn.to);
      }
    }
    return [...nodeIds]
      .map((nid) => {
        const node = nodes.find((n) => n.id === nid);
        return node ? { id: node.id, name: node.label } : null;
      })
      .filter((item): item is NonNullable<typeof item> => item != null);
  }, [flow.connectionIds, connections, nodes]);

  return (
    <>
      <Section title="Identity">
        <EditableIdRow
          label="ID"
          value={flow.id}
          prefix="flow-"
          onCommit={(newId) => {
            if (newId === id) return true;
            if (allFlowIds.includes(newId)) return false;
            onUpdate?.(id, { id: newId });
            return true;
          }}
        />
        <EditableRow
          label="Name"
          value={flow.name}
          onCommit={(v) => { onUpdate?.(id, { name: v }); return true; }}
        />
        <EditableRow
          label="Category"
          value={flow.category ?? ""}
          onCommit={(v) => { onUpdate?.(id, { category: v }); return true; }}
          onClear={() => onUpdate?.(id, { category: "" })}
        />
      </Section>

      <Section title="Connections">
        <ExpandableListRow label="Connections" items={connectionItems} onSelect={onSelectLine} />
      </Section>

      <Section title="Elements">
        <ExpandableListRow label="Elements" items={nodeItems} onSelect={onSelectNode} />
      </Section>

      <Section title="Danger">
        <div className="px-1 py-2">
          <button
            className="w-full px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-md transition-colors cursor-pointer"
            onClick={() => onDelete?.(id)}
          >
            Delete Flow
          </button>
        </div>
      </Section>
    </>
  );
}
