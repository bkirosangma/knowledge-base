import type { ComponentType } from "react";
import type { NodeData, Connection, LayerDef, LineCurveAlgorithm, Selection, FlowDef, DocumentMeta } from "../../../shared/utils/types";
import type { AnchorId } from "../utils/anchors";
import type { LevelMap } from "../utils/levelModel";
import type { RegionBounds } from "./shared";
import { NodeProperties } from "./NodeProperties";
import { LayerProperties } from "./LayerProperties";
import { LineProperties } from "./LineProperties";
import { ArchitectureProperties } from "./ArchitectureProperties";

interface PropertiesPanelProps {
  selection: Selection;
  title: string;
  nodes: NodeData[];
  connections: Connection[];
  regions: RegionBounds[];
  levelMap?: LevelMap;
  onSelectLayer?: (layerId: string) => void;
  onSelectNode?: (nodeId: string) => void;
  onUpdateTitle?: (title: string) => void;
  layerDefs: LayerDef[];
  onUpdateNode?: (id: string, updates: Partial<{ id: string; label: string; sub: string; icon: ComponentType<{ size?: number; className?: string; strokeWidth?: number }>; borderColor: string; bgColor: string; textColor: string; layer: string }>) => void;
  onUpdateLayer?: (id: string, updates: Partial<{ id: string; title: string; bg: string; border: string; textColor: string }>) => void;
  onUpdateConnection?: (id: string, updates: Partial<{ id: string; label: string; color: string; from: string; to: string; fromAnchor: AnchorId; toAnchor: AnchorId; biDirectional: boolean; flowDuration: number; connectionType: 'synchronous' | 'asynchronous' }>) => void;
  lineCurve?: LineCurveAlgorithm;
  onUpdateLineCurve?: (algorithm: LineCurveAlgorithm) => void;
  flows: FlowDef[];
  onSelectFlow?: (flowId: string) => void;
  onHoverFlow?: (flowId: string | null) => void;
  onUpdateFlow?: (id: string, updates: Partial<{ id: string; name: string; category: string }>) => void;
  onDeleteFlow?: (id: string) => void;
  onCreateFlow?: (connectionIds: string[]) => void;
  onSelectLine?: (lineId: string) => void;
  onCreateLayer?: (title: string) => string;
  onDeleteAnchor?: (nodeId: string, anchorIndex: number) => void;
  onSelectType?: (type: string) => void;
  onHoverType?: (type: string | null) => void;
  expandedType?: string | null;
  onExpandType?: (type: string | null) => void;
  documents?: DocumentMeta[];
  onOpenDocument?: (path: string) => void;
  onAttachDocument?: (entityType: string, entityId: string) => void;
  onDetachDocument?: (docPath: string, entityType: string, entityId: string) => void;
  hidden?: boolean;
}

export default function PropertiesPanel({ selection, title, nodes, connections, regions, levelMap, layerDefs, onSelectLayer, onSelectNode, onUpdateTitle, onUpdateNode, onUpdateLayer, onUpdateConnection, lineCurve, onUpdateLineCurve, flows, onSelectFlow, onHoverFlow, onUpdateFlow, onDeleteFlow, onCreateFlow, onSelectLine, onCreateLayer, onDeleteAnchor, onSelectType, onHoverType, expandedType, onExpandType, documents, onOpenDocument, onAttachDocument, onDetachDocument, hidden }: PropertiesPanelProps) {
  const allNodeIds = nodes.map((n) => n.id);
  const allLayerIds = regions.map((r) => r.id);
  const allConnectionIds = connections.map((c) => c.id);


  const sectionLabel = !selection || selection.type === "flow"
    ? "Architecture"
    : selection.type === "node"
      ? "Element"
      : selection.type === "layer"
        ? "Layer"
        : selection.type === "line"
          ? "Connection"
          : selection.type === "multi-node"
            ? `${selection.ids.length} Elements`
            : selection.type === "multi-layer"
              ? `${selection.ids.length} Layers`
              : `${selection.ids.length} Lines`;

  return (
    <div
      className={`flex-shrink-0 bg-white border-l border-slate-200 flex flex-col overflow-hidden${hidden ? " hidden" : ""}`}
      style={{ width: hidden ? 0 : 280 }}
    >
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-200">
        <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Properties</span>
        <span className="text-[10px] text-slate-400 font-medium">{sectionLabel}</span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {(!selection || selection.type === "flow") && (
          <ArchitectureProperties
            title={title}
            regions={regions}
            nodes={nodes}
            connections={connections}
            onUpdateTitle={onUpdateTitle}
            onSelectLayer={onSelectLayer}
            onSelectNode={onSelectNode}
            lineCurve={lineCurve}
            onUpdateLineCurve={onUpdateLineCurve}
            flows={flows}
            onHoverFlow={onHoverFlow}
            onUpdateFlow={onUpdateFlow}
            onDeleteFlow={onDeleteFlow}
            onSelectLine={onSelectLine}
            activeFlowId={selection?.type === "flow" ? selection.id : undefined}
            onSelectType={onSelectType}
            onHoverType={onHoverType}
            expandedType={expandedType}
            onExpandType={onExpandType}
            documents={documents}
            onOpenDocument={onOpenDocument}
            onAttachDocument={onAttachDocument}
            onDetachDocument={onDetachDocument}
          />
        )}
        {selection?.type === "node" && (
          <NodeProperties id={selection.id} nodes={nodes} connections={connections} regions={regions} layerDefs={layerDefs} onSelectLayer={onSelectLayer} onSelectNode={onSelectNode} onUpdate={onUpdateNode} allNodeIds={allNodeIds} flows={flows} onSelectFlow={onSelectFlow} onHoverFlow={onHoverFlow} onCreateLayer={onCreateLayer} onDeleteAnchor={onDeleteAnchor} levelInfo={levelMap?.get(selection.id)} documents={documents} onOpenDocument={onOpenDocument} onAttachDocument={onAttachDocument} onDetachDocument={onDetachDocument} />
        )}
        {selection?.type === "layer" && (
          <LayerProperties id={selection.id} regions={regions} nodes={nodes} layerDefs={layerDefs} onSelectNode={onSelectNode} onUpdate={onUpdateLayer} allLayerIds={allLayerIds} documents={documents} onOpenDocument={onOpenDocument} onAttachDocument={onAttachDocument} onDetachDocument={onDetachDocument} />
        )}
        {selection?.type === "line" && (
          <LineProperties id={selection.id} connections={connections} nodes={nodes} onUpdate={onUpdateConnection} allConnectionIds={allConnectionIds} flows={flows} onSelectFlow={onSelectFlow} onHoverFlow={onHoverFlow} documents={documents} onOpenDocument={onOpenDocument} onAttachDocument={onAttachDocument} onDetachDocument={onDetachDocument} />
        )}
        {selection?.type === "multi-node" && (
          <div className="text-sm text-slate-500 italic py-4">{selection.ids.length} elements selected</div>
        )}
        {selection?.type === "multi-layer" && (
          <div className="text-sm text-slate-500 italic py-4">{selection.ids.length} layers selected</div>
        )}
        {selection?.type === "multi-line" && (
          <div>
            <div className="text-sm text-slate-500 italic py-4">{selection.ids.length} lines selected</div>
            <div className="px-1">
              <button
                className="w-full px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors cursor-pointer"
                onClick={() => onCreateFlow?.(selection.ids)}
              >
                Create Flow
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
