import { useMemo, useState } from "react";
import { FileText, Paperclip, Plus, X } from "lucide-react";
import type { FlowDef, Connection, NodeData } from "../types";
import type { DocumentMeta } from "../../document/types";
import { Section, EditableRow, EditableIdRow, ExpandableListRow } from "./shared";
import CreateAttachDocModal from "../components/CreateAttachDocModal";
import DetachDocModal from "../components/DetachDocModal";

export function FlowProperties({
  id, flows, connections, nodes,
  onUpdate, onDelete, onSelectLine, onSelectNode,
  allFlowIds,
  attachedDocs,
  onAttach, onDetach, onPreview,
  getDocumentReferences, deleteDocumentWithCleanup, onCreateAndAttach,
  onLock,
  readOnly,
}: {
  id: string;
  flows: FlowDef[];
  connections: Connection[];
  nodes: NodeData[];
  onUpdate?: (id: string, updates: Partial<{
    id: string;
    name: string;
    category: string;
    nodeOrders: Record<string, number>;
    startNodeIds: string[];
    endNodeIds: string[];
  }>) => void;
  onDelete?: (id: string) => void;
  onSelectLine?: (lineId: string) => void;
  onSelectNode?: (nodeId: string) => void;
  allFlowIds: string[];
  attachedDocs?: DocumentMeta[];
  onAttach?: () => void;
  onDetach?: (docPath: string) => void;
  onPreview?: (docPath: string) => void;
  getDocumentReferences?: (
    docPath: string,
    exclude?: { entityType: string; entityId: string }
  ) => { attachments: Array<{ entityType: string; entityId: string }>; wikiBacklinks: string[] };
  deleteDocumentWithCleanup?: (path: string) => Promise<void>;
  onCreateAndAttach?: (filename: string, editNow: boolean) => Promise<void>;
  onLock?: (flowId: string) => void;
  readOnly?: boolean;
}) {
  const flow = flows.find((f) => f.id === id);

  const connectionItems = useMemo(() => {
    if (!flow) return [];
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
  }, [flow, connections, nodes]);

  const nodeItems = useMemo(() => {
    if (!flow) return [];
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
  }, [flow, connections, nodes]);

  const memberRows = useMemo(() => {
    if (!flow) return [];
    const orders = flow.nodeOrders ?? {};
    const startSet = new Set(flow.startNodeIds ?? []);
    const endSet = new Set(flow.endNodeIds ?? []);
    return nodeItems
      .map((n) => ({
        id: n.id,
        label: n.name,
        order: orders[n.id],
        isStart: startSet.has(n.id),
        isEnd: endSet.has(n.id),
      }))
      .sort((x, y) => {
        if (x.order !== undefined && y.order !== undefined) return x.order - y.order || x.label.localeCompare(y.label);
        if (x.order !== undefined) return -1;
        if (y.order !== undefined) return 1;
        return x.label.localeCompare(y.label);
      });
  }, [flow, nodeItems]);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [detachTarget, setDetachTarget] = useState<string | null>(null);

  const detachRefs = detachTarget
    ? (getDocumentReferences?.(detachTarget, { entityType: "flow", entityId: id }) ?? { attachments: [], wikiBacklinks: [] })
    : null;

  if (!flow) return <p className="text-xs text-mute">Flow not found.</p>;

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

      {onLock && (
        <button
          type="button"
          data-testid="flow-lock-button"
          className="text-xs text-amber-800 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded px-2 py-1 mt-2"
          onClick={() => onLock(flow.id)}
        >
          🔒 Lock into Flow (⌘L)
        </button>
      )}

      <Section title="Member nodes">
        <div className="flex justify-end mb-1">
          <button
            type="button"
            data-testid="flow-number-sequentially"
            className="text-xs text-blue-700 hover:underline disabled:opacity-50"
            disabled={readOnly || memberRows.length === 0}
            onClick={() => {
              const nodeOrders: Record<string, number> = {};
              memberRows.forEach((r, i) => { nodeOrders[r.id] = i + 1; });
              onUpdate?.(flow.id, { nodeOrders });
            }}
          >
            Number sequentially
          </button>
        </div>
        {memberRows.map((row) => (
          <div
            key={row.id}
            data-testid={`flow-member-row-${row.id}`}
            className="flex items-center gap-2 text-xs py-0.5"
          >
            <span className="flex-1 truncate">{row.label}</span>
            <input
              data-testid={`flow-member-order-input-${row.id}`}
              type="text"
              inputMode="numeric"
              className="w-12 px-1 py-0.5 border rounded text-center"
              defaultValue={row.order ?? ""}
              disabled={readOnly}
              onBlur={(e) => {
                const v = e.target.value.trim();
                const next = v === "" ? undefined : parseInt(v, 10);
                const orders = { ...(flow.nodeOrders ?? {}) };
                if (next === undefined || Number.isNaN(next)) delete orders[row.id];
                else orders[row.id] = next;
                onUpdate?.(flow.id, { nodeOrders: orders });
              }}
            />
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                data-testid={`flow-member-start-checkbox-${row.id}`}
                checked={row.isStart}
                disabled={readOnly}
                onChange={() => {
                  const set = new Set(flow.startNodeIds ?? []);
                  row.isStart ? set.delete(row.id) : set.add(row.id);
                  onUpdate?.(flow.id, { startNodeIds: [...set] });
                }}
              />
              <span>Start</span>
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                data-testid={`flow-member-end-checkbox-${row.id}`}
                checked={row.isEnd}
                disabled={readOnly}
                onChange={() => {
                  const set = new Set(flow.endNodeIds ?? []);
                  row.isEnd ? set.delete(row.id) : set.add(row.id);
                  onUpdate?.(flow.id, { endNodeIds: [...set] });
                }}
              />
              <span>End</span>
            </label>
          </div>
        ))}
        {memberRows.length === 0 && <p className="text-xs text-mute">No member nodes — flow has no connections.</p>}
      </Section>

      <Section title="Connections">
        <ExpandableListRow label="Connections" items={connectionItems} onSelect={onSelectLine} />
      </Section>

      <Section title="Elements">
        <ExpandableListRow label="Elements" items={nodeItems} onSelect={onSelectNode} />
      </Section>

      <Section title="Documents">
        {(attachedDocs?.length ?? 0) > 0 ? (
          <div className="flex flex-col gap-1">
            {attachedDocs!.map(doc => (
              <div key={doc.filename} className="flex items-center gap-1.5 px-2 py-1 rounded bg-surface-2 border border-line text-xs">
                <FileText size={12} className="text-indigo-400 flex-shrink-0" />
                <button
                  onClick={() => onPreview?.(doc.filename)}
                  className="text-accent hover:underline truncate flex-1 text-left"
                >
                  {doc.filename.split("/").pop()}
                </button>
                {!readOnly && (
                  <button
                    aria-label={`detach ${doc.filename}`}
                    onClick={() => setDetachTarget(doc.filename)}
                    className="ml-auto text-mute hover:text-red-500 transition-colors"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-mute">No documents linked to this flow.</p>
        )}

        {!readOnly && (
          <div className="flex gap-1.5 mt-2">
            <button
              onClick={() => onAttach?.()}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-ink-2 bg-surface border border-line hover:bg-surface-2 rounded-md transition-colors"
            >
              <Paperclip size={11} />
              Attach existing…
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-ink-2 bg-surface border border-line hover:bg-surface-2 rounded-md transition-colors"
            >
              <Plus size={11} />
              Create & attach new…
            </button>
          </div>
        )}
      </Section>

      {!readOnly && (
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
      )}

      {showCreateModal && (
        <CreateAttachDocModal
          defaultFilename={`${flow.name.toLowerCase().replace(/\s+/g, "-")}-notes.md`}
          onConfirm={async (filename, editNow) => {
            setShowCreateModal(false);
            await onCreateAndAttach?.(filename, editNow);
          }}
          onCancel={() => setShowCreateModal(false)}
        />
      )}

      {detachTarget && detachRefs && (
        <DetachDocModal
          docPath={detachTarget}
          attachments={detachRefs.attachments}
          wikiBacklinks={detachRefs.wikiBacklinks}
          onCancel={() => setDetachTarget(null)}
          onConfirm={async (alsoDelete) => {
            const target = detachTarget;
            setDetachTarget(null);
            onDetach?.(target);
            if (alsoDelete) await deleteDocumentWithCleanup?.(target);
          }}
        />
      )}
    </>
  );
}
