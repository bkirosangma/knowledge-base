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
  readOnly,
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
