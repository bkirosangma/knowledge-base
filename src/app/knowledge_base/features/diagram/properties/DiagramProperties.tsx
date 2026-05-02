import { useState, useMemo, useEffect, useCallback } from "react";
import type { NodeData, Connection, LineCurveAlgorithm, FlowDef } from "../types";
import type { DocumentMeta } from "../../document/types";
import { getDistinctTypes, getNodesByType } from "../utils/typeUtils";
import { Section, Row, EditableRow, ExpandableListRow, DropdownRow, type RegionBounds } from "./shared";
import DocumentsSection from "./DocumentsSection";
import { FlowProperties } from "./FlowProperties";

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
        isExpanded ? "text-accent bg-blue-50 font-medium" : "text-ink-2 hover:text-accent hover:bg-surface-2"
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
    <div className="border-b border-line last:border-b-0">
      <button
        className="flex items-start py-1.5 w-full text-left hover:bg-surface-2 transition-colors cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-[11px] font-semibold text-mute uppercase tracking-wider w-[96px] shrink-0">{label}</span>
        <span className="flex items-center gap-1.5 text-[13px] text-ink min-w-0">
          {items.length}
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-mute transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}><path d="m9 18 6-6-6-6"/></svg>
        </span>
      </button>
      {expanded && (
        <div className="pl-[96px] pb-1.5 space-y-0.5">
          {items.map((f) => (
            <FlowListItem key={f.id} flow={f} isExpanded={expandedFlowId === f.id} onToggle={() => onToggleFlow(f.id)} onHover={onHoverFlow} />
          ))}
        </div>
      )}
    </div>
  );
}

export function DiagramProperties({
  title, regions, nodes, connections, onUpdateTitle, onSelectLayer, onSelectNode, lineCurve, onUpdateLineCurve,
  flows, onHoverFlow, onSelectFlow, onUpdateFlow, onDeleteFlow, onSelectLine, activeFlowId,
  onSelectType, onHoverType, expandedType, onExpandType,
  backlinks, onOpenDocument: _onOpenDocument, readOnly,
  documents, onPreviewDocument, onOpenDocPicker, onDetachDocument,
  getDocumentReferences, deleteDocumentWithCleanup, onCreateAndAttach,
}: {
  title: string; regions: RegionBounds[]; nodes: NodeData[]; connections: Connection[];
  onUpdateTitle?: (title: string) => void;
  onSelectLayer?: (layerId: string) => void;
  onSelectNode?: (nodeId: string) => void;
  lineCurve?: LineCurveAlgorithm;
  onUpdateLineCurve?: (algorithm: LineCurveAlgorithm) => void;
  flows?: FlowDef[];
  onHoverFlow?: (flowId: string | null) => void;
  onSelectFlow?: (flowId: string | null) => void;
  onUpdateFlow?: (id: string, updates: Partial<{ id: string; name: string; category: string }>) => void;
  onDeleteFlow?: (id: string) => void;
  onSelectLine?: (lineId: string) => void;
  activeFlowId?: string;
  onSelectType?: (type: string) => void;
  onHoverType?: (type: string | null) => void;
  expandedType?: string | null;
  onExpandType?: (type: string | null) => void;
  backlinks?: { sourcePath: string; section?: string }[];
  onOpenDocument?: (path: string) => void;
  readOnly?: boolean;
  documents?: DocumentMeta[];
  onPreviewDocument?: (path: string, entityName?: string) => void;
  onOpenDocPicker?: (entityType: string, entityId: string) => void;
  onDetachDocument?: (docPath: string, entityType: string, entityId: string) => void;
  getDocumentReferences?: (docPath: string, exclude?: { entityType: string; entityId: string }) => {
    attachments: Array<{ entityType: string; entityId: string }>;
    wikiBacklinks: string[];
  };
  deleteDocumentWithCleanup?: (path: string) => Promise<void>;
  onCreateAndAttach?: (flowId: string, filename: string, editNow: boolean) => Promise<void>;
}) {
  const layerItems = regions.map((r) => ({ id: r.id, name: r.title }));
  const nodeItems = nodes.map((n) => ({ id: n.id, name: n.label }));
  const allFlows = flows ?? [];
  const allFlowIds = allFlows.map((f) => f.id);

  const [expandedFlowId, setExpandedFlowId] = useState<string | null>(activeFlowId ?? null);

  useEffect(() => {
    setExpandedFlowId(activeFlowId ?? null);
  }, [activeFlowId]);

  const toggleFlow = useCallback((flowId: string) => {
    const next = expandedFlowId === flowId ? null : flowId;
    setExpandedFlowId(next);
    onSelectFlow?.(next);
  }, [expandedFlowId, onSelectFlow]);

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
        {readOnly ? (
          <Row label="Title" value={title} />
        ) : (
          <EditableRow label="Title" value={title} onCommit={(v) => { onUpdateTitle?.(v); return true; }} />
        )}
        <DropdownRow<LineCurveAlgorithm>
          label="Lines"
          value={lineCurve ?? "orthogonal"}
          options={[
            { value: "orthogonal", label: "Orthogonal" },
            { value: "bezier", label: "Bezier" },
            { value: "straight", label: "Straight" },
          ]}
          onChange={readOnly ? undefined : onUpdateLineCurve}
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
                    isExpanded ? "text-accent bg-blue-50 font-medium" : "text-ink-2 hover:text-accent hover:bg-surface-2"
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
                  <span className="text-[10px] text-mute ml-1">({getNodesByType(nodes, type).length})</span>
                </button>
              );
            })}
          </div>
          {expandedType && (
            <div className="border-t border-line mt-1 pt-1">
              <ExpandableListRow
                label="Elements"
                items={getNodesByType(nodes, expandedType).map((n) => ({ id: n.id, name: n.label }))}
                onSelect={(nodeId) => onSelectNode?.(nodeId)}
              />
              <div className="px-1 py-2">
                <button
                  className="w-full px-3 py-1.5 text-xs font-medium text-accent bg-blue-50 hover:bg-blue-100 rounded-md transition-colors cursor-pointer"
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
            <FlowProperties
              id={expandedFlow.id}
              flows={allFlows}
              connections={connections}
              nodes={nodes}
              allFlowIds={allFlowIds}
              onUpdate={onUpdateFlow}
              onDelete={(id) => { setExpandedFlowId(null); onDeleteFlow?.(id); }}
              onSelectLine={onSelectLine}
              onSelectNode={onSelectNode}
              attachedDocs={documents?.filter(d => d.attachedTo?.some(a => a.type === "flow" && a.id === expandedFlow.id)) ?? []}
              onAttach={() => onOpenDocPicker?.("flow", expandedFlow.id)}
              onDetach={(docPath) => onDetachDocument?.(docPath, "flow", expandedFlow.id)}
              onPreview={(docPath) => onPreviewDocument?.(docPath, expandedFlow.name)}
              getDocumentReferences={getDocumentReferences}
              deleteDocumentWithCleanup={deleteDocumentWithCleanup}
              onCreateAndAttach={(filename, editNow) => onCreateAndAttach?.(expandedFlow.id, filename, editNow) ?? Promise.resolve()}
              readOnly={readOnly}
            />
          )}
        </Section>
      )}

      {backlinks && (
        <DocumentsSection
          backlinks={backlinks}
          onPreviewDocument={onPreviewDocument}
        />
      )}
    </>
  );
}
