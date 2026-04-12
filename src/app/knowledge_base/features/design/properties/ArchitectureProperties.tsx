import { useState, useMemo, useEffect, useCallback } from "react";
import type { NodeData, Connection, LineCurveAlgorithm, FlowDef } from "../types";
import type { DocumentMeta } from "../../document/types";
import { getDistinctTypes, getNodesByType } from "../utils/typeUtils";
import { Section, EditableRow, EditableIdRow, ExpandableListRow, DropdownRow, type RegionBounds } from "./shared";
import DocumentsSection from "./DocumentsSection";

function FlowDetail({
  flow, connections, nodes, allFlowIds,
  onUpdate, onDelete, onSelectLine, onSelectNode,
}: {
  flow: FlowDef;
  connections: Connection[];
  nodes: NodeData[];
  allFlowIds: string[];
  onUpdate?: (id: string, updates: Partial<{ id: string; name: string; category: string }>) => void;
  onDelete?: (id: string) => void;
  onSelectLine?: (lineId: string) => void;
  onSelectNode?: (nodeId: string) => void;
}) {
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
    <div className="border-t border-slate-200 mt-1 pt-1">
      <EditableIdRow
        label="ID"
        value={flow.id}
        prefix="flow-"
        onCommit={(newId) => {
          if (newId === flow.id) return true;
          if (allFlowIds.includes(newId)) return false;
          onUpdate?.(flow.id, { id: newId });
          return true;
        }}
      />
      <EditableRow
        label="Name"
        value={flow.name}
        onCommit={(v) => { onUpdate?.(flow.id, { name: v }); return true; }}
      />
      <EditableRow
        label="Category"
        value={flow.category ?? ""}
        onCommit={(v) => { onUpdate?.(flow.id, { category: v }); return true; }}
        onClear={() => onUpdate?.(flow.id, { category: "" })}
      />
      <ExpandableListRow label="Connections" items={connectionItems} onSelect={onSelectLine} />
      <ExpandableListRow label="Elements" items={nodeItems} onSelect={onSelectNode} />
      <div className="px-1 py-2">
        <button
          className="w-full px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-md transition-colors cursor-pointer"
          onClick={() => onDelete?.(flow.id)}
        >
          Delete Flow
        </button>
      </div>
    </div>
  );
}

function FlowListItem({
  flow, isExpanded, onToggle, onHover,
}: {
  flow: FlowDef;
  isExpanded: boolean;
  onToggle: () => void;
  onHover: (flowId: string | null) => void;
}) {
  return (
    <button
      className={`block w-full text-left text-[12px] rounded px-1.5 py-0.5 transition-colors cursor-pointer ${
        isExpanded ? "text-blue-700 bg-blue-50 font-medium" : "text-slate-600 hover:text-blue-600 hover:bg-slate-50"
      }`}
      onClick={onToggle}
      onMouseEnter={() => onHover(flow.id)}
      onMouseLeave={() => onHover(null)}
    >
      <span className="block truncate">{flow.name}</span>
    </button>
  );
}

function FlowGroup({
  label, items, expandedFlowId, onToggleFlow, onHoverFlow,
}: {
  label: string;
  items: FlowDef[];
  expandedFlowId: string | null;
  onToggleFlow: (flowId: string) => void;
  onHoverFlow: (flowId: string | null) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div className="border-b border-slate-100 last:border-b-0">
      <button
        className="flex items-start py-1.5 w-full text-left hover:bg-slate-50 transition-colors cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider w-[72px] shrink-0">{label}</span>
        <span className="flex items-center gap-1.5 text-[13px] text-slate-800 min-w-0">
          {items.length}
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-slate-400 transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}><path d="m9 18 6-6-6-6"/></svg>
        </span>
      </button>
      {expanded && (
        <div className="pl-[72px] pb-1.5 space-y-0.5">
          {items.map((f) => (
            <FlowListItem key={f.id} flow={f} isExpanded={expandedFlowId === f.id} onToggle={() => onToggleFlow(f.id)} onHover={onHoverFlow} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ArchitectureProperties({
  title, regions, nodes, connections, onUpdateTitle, onSelectLayer, onSelectNode, lineCurve, onUpdateLineCurve,
  flows, onHoverFlow, onUpdateFlow, onDeleteFlow, onSelectLine, activeFlowId,
  onSelectType, onHoverType, expandedType, onExpandType,
  documents, onOpenDocument, onAttachDocument, onDetachDocument,
}: {
  title: string; regions: RegionBounds[]; nodes: NodeData[]; connections: Connection[];
  onUpdateTitle?: (title: string) => void;
  onSelectLayer?: (layerId: string) => void;
  onSelectNode?: (nodeId: string) => void;
  lineCurve?: LineCurveAlgorithm;
  onUpdateLineCurve?: (algorithm: LineCurveAlgorithm) => void;
  flows?: FlowDef[];
  onHoverFlow?: (flowId: string | null) => void;
  onUpdateFlow?: (id: string, updates: Partial<{ id: string; name: string; category: string }>) => void;
  onDeleteFlow?: (id: string) => void;
  onSelectLine?: (lineId: string) => void;
  activeFlowId?: string;
  onSelectType?: (type: string) => void;
  onHoverType?: (type: string | null) => void;
  expandedType?: string | null;
  onExpandType?: (type: string | null) => void;
  documents?: DocumentMeta[];
  onOpenDocument?: (path: string) => void;
  onAttachDocument?: (entityType: string, entityId: string) => void;
  onDetachDocument?: (docPath: string, entityType: string, entityId: string) => void;
}) {
  const layerItems = regions.map((r) => ({ id: r.id, name: r.title }));
  const nodeItems = nodes.map((n) => ({ id: n.id, name: n.label }));
  const allFlows = flows ?? [];
  const allFlowIds = allFlows.map((f) => f.id);

  const [expandedFlowId, setExpandedFlowId] = useState<string | null>(activeFlowId ?? null);

  useEffect(() => {
    if (activeFlowId) setExpandedFlowId(activeFlowId);
  }, [activeFlowId]);

  const toggleFlow = useCallback((flowId: string) => {
    setExpandedFlowId((prev) => prev === flowId ? null : flowId);
  }, []);

  const handleHover = useCallback((flowId: string | null) => {
    onHoverFlow?.(flowId ?? expandedFlowId ?? null);
  }, [onHoverFlow, expandedFlowId]);

  // Keep dim active while a flow is expanded
  useEffect(() => {
    if (expandedFlowId) onHoverFlow?.(expandedFlowId);
    return () => { onHoverFlow?.(null); };
  }, [expandedFlowId, onHoverFlow]);

  const expandedFlow = expandedFlowId ? allFlows.find((f) => f.id === expandedFlowId) : null;

  const flowGroups = useMemo(() => {
    if (allFlows.length === 0) return null;
    const hasCategories = allFlows.some((f) => f.category);
    if (!hasCategories) return { type: "flat" as const, items: allFlows };
    const groups = new Map<string, FlowDef[]>();
    const uncategorized: FlowDef[] = [];
    for (const f of allFlows) {
      if (f.category) {
        const list = groups.get(f.category);
        if (list) list.push(f);
        else groups.set(f.category, [f]);
      } else {
        uncategorized.push(f);
      }
    }
    return { type: "grouped" as const, groups, uncategorized };
  }, [allFlows]);

  return (
    <>
      <Section title="General">
        <EditableRow label="Title" value={title} onCommit={(v) => { onUpdateTitle?.(v); return true; }} />
        <DropdownRow<LineCurveAlgorithm>
          label="Lines"
          value={lineCurve ?? "orthogonal"}
          options={[
            { value: "orthogonal", label: "Orthogonal" },
            { value: "bezier", label: "Bezier" },
            { value: "straight", label: "Straight" },
          ]}
          onChange={onUpdateLineCurve}
        />
      </Section>
      <Section title="Content">
        <ExpandableListRow label="Layers" items={layerItems} onSelect={onSelectLayer} />
        <ExpandableListRow label="Elements" items={nodeItems} onSelect={onSelectNode} />
      </Section>
      {getDistinctTypes(nodes).length > 0 && (
        <Section title="Types">
          <div className="space-y-0.5">
            {getDistinctTypes(nodes).map((type) => {
              const isExpanded = expandedType === type;
              return (
                <button
                  key={type}
                  className={`block w-full text-left text-[12px] rounded px-1.5 py-0.5 transition-colors cursor-pointer ${
                    isExpanded ? "text-blue-700 bg-blue-50 font-medium" : "text-slate-600 hover:text-blue-600 hover:bg-slate-50"
                  }`}
                  onClick={() => {
                    const next = isExpanded ? null : type;
                    onExpandType?.(next);
                    if (next) onHoverType?.(next);
                    else onHoverType?.(null);
                  }}
                  onMouseEnter={() => { if (!expandedType) onHoverType?.(type); }}
                  onMouseLeave={() => { if (!expandedType) onHoverType?.(null); }}
                >
                  <span className="truncate">{type}</span>
                  <span className="text-[10px] text-slate-400 ml-1">({getNodesByType(nodes, type).length})</span>
                </button>
              );
            })}
          </div>
          {expandedType && (
            <div className="border-t border-slate-200 mt-1 pt-1">
              <ExpandableListRow
                label="Elements"
                items={getNodesByType(nodes, expandedType).map((n) => ({ id: n.id, name: n.label }))}
                onSelect={(nodeId) => onSelectNode?.(nodeId)}
              />
              <div className="px-1 py-2">
                <button
                  className="w-full px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors cursor-pointer"
                  onClick={() => onSelectType?.(expandedType)}
                >
                  Select All
                </button>
              </div>
            </div>
          )}
        </Section>
      )}
      {allFlows.length > 0 && (
        <Section title="Flows">
          {flowGroups?.type === "flat" && (
            <div className="pb-1.5 space-y-0.5">
              {flowGroups.items.map((f) => (
                <FlowListItem key={f.id} flow={f} isExpanded={expandedFlowId === f.id} onToggle={() => toggleFlow(f.id)} onHover={handleHover} />
              ))}
            </div>
          )}
          {flowGroups?.type === "grouped" && (
            <>
              {[...flowGroups.groups.entries()].map(([category, items]) => (
                <FlowGroup key={category} label={category} items={items} expandedFlowId={expandedFlowId} onToggleFlow={toggleFlow} onHoverFlow={handleHover} />
              ))}
              {flowGroups.uncategorized.length > 0 && (
                <FlowGroup label="Uncategorized" items={flowGroups.uncategorized} expandedFlowId={expandedFlowId} onToggleFlow={toggleFlow} onHoverFlow={handleHover} />
              )}
            </>
          )}
          {expandedFlow && (
            <FlowDetail
              flow={expandedFlow}
              connections={connections}
              nodes={nodes}
              allFlowIds={allFlowIds}
              onUpdate={onUpdateFlow}
              onDelete={(id) => { setExpandedFlowId(null); onDeleteFlow?.(id); }}
              onSelectLine={onSelectLine}
              onSelectNode={onSelectNode}
            />
          )}
        </Section>
      )}

      {documents && (
        <DocumentsSection
          entityType="root"
          entityId="root"
          documents={documents}
          onOpenDocument={onOpenDocument}
          onAttachDocument={() => onAttachDocument?.("root", "root")}
          onDetachDocument={onDetachDocument}
        />
      )}
    </>
  );
}
