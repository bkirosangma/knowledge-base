import type { ComponentType } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { NodeData, Connection, LayerDef, LineCurveAlgorithm, Selection, FlowDef } from "../types";
import type { AnchorId } from "../utils/anchors";
import type { LevelMap } from "../utils/levelModel";
import type { HistoryEntry } from "../../../shared/hooks/useActionHistory";
import type { RegionBounds } from "./shared";
import { NodeProperties } from "./NodeProperties";
import { LayerProperties } from "./LayerProperties";
import { LineProperties } from "./LineProperties";
import { ArchitectureProperties } from "./ArchitectureProperties";
import HistoryPanel from "../components/HistoryPanel";

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
  onSelectFlow?: (flowId: string | null) => void;
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
  backlinks?: { sourcePath: string; section?: string }[];
  onOpenDocument?: (path: string) => void;
  hidden?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  readOnly?: boolean;
  history?: {
    entries: HistoryEntry[];
    currentIndex: number;
    savedIndex: number;
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
    onGoToEntry: (index: number) => void;
    collapsed: boolean;
    onToggleCollapse: () => void;
  };
}

export default function PropertiesPanel({ selection, title, nodes, connections, regions, levelMap, layerDefs, onSelectLayer, onSelectNode, onUpdateTitle, onUpdateNode, onUpdateLayer, onUpdateConnection, lineCurve, onUpdateLineCurve, flows, onSelectFlow, onHoverFlow, onUpdateFlow, onDeleteFlow, onCreateFlow, onSelectLine, onCreateLayer, onDeleteAnchor, onSelectType, onHoverType, expandedType, onExpandType, backlinks, onOpenDocument, hidden, collapsed, onToggleCollapse, readOnly, history }: PropertiesPanelProps) {
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

  if (collapsed) {
    return (
      <div
        className={`flex-shrink-0 bg-white border-l border-slate-200 flex flex-col overflow-hidden${hidden ? " hidden" : ""}`}
        style={{ width: hidden ? 0 : 36 }}
      >
        <button
          onClick={onToggleCollapse}
          className="flex items-center justify-center px-2 py-3 border-b border-slate-200 hover:bg-slate-50 transition-colors"
          title="Expand properties"
        >
          <ChevronLeft size={16} className="text-slate-500" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={`flex-shrink-0 bg-white border-l border-slate-200 flex flex-col overflow-hidden${hidden ? " hidden" : ""}`}
      style={{ width: hidden ? 0 : 280 }}
    >
      {onToggleCollapse ? (
        <button
          onClick={onToggleCollapse}
          className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-200 hover:bg-slate-50 transition-colors w-full"
          title="Collapse properties"
        >
          <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Properties</span>
          <span className="text-[10px] text-slate-400 font-medium">{sectionLabel}</span>
          <ChevronRight size={14} className="ml-auto text-slate-400" />
        </button>
      ) : (
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-200">
          <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Properties</span>
          <span className="text-[10px] text-slate-400 font-medium">{sectionLabel}</span>
        </div>
      )}

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
            onSelectFlow={onSelectFlow}
            onUpdateFlow={onUpdateFlow}
            onDeleteFlow={onDeleteFlow}
            onSelectLine={onSelectLine}
            activeFlowId={selection?.type === "flow" ? selection.id : undefined}
            onSelectType={onSelectType}
            onHoverType={onHoverType}
            expandedType={expandedType}
            onExpandType={onExpandType}
            backlinks={backlinks}
            onOpenDocument={onOpenDocument}
            readOnly={readOnly}
          />
        )}
        {selection?.type === "node" && (
          <NodeProperties id={selection.id} nodes={nodes} connections={connections} regions={regions} layerDefs={layerDefs} onSelectLayer={onSelectLayer} onSelectNode={onSelectNode} onUpdate={onUpdateNode} allNodeIds={allNodeIds} flows={flows} onSelectFlow={onSelectFlow} onHoverFlow={onHoverFlow} onCreateLayer={onCreateLayer} onDeleteAnchor={onDeleteAnchor} levelInfo={levelMap?.get(selection.id)} backlinks={backlinks} onOpenDocument={onOpenDocument} readOnly={readOnly} />
        )}
        {selection?.type === "layer" && (
          <LayerProperties id={selection.id} regions={regions} nodes={nodes} layerDefs={layerDefs} onSelectNode={onSelectNode} onUpdate={onUpdateLayer} allLayerIds={allLayerIds} backlinks={backlinks} onOpenDocument={onOpenDocument} readOnly={readOnly} />
        )}
        {selection?.type === "line" && (
          <LineProperties id={selection.id} connections={connections} nodes={nodes} onUpdate={onUpdateConnection} allConnectionIds={allConnectionIds} flows={flows} onSelectFlow={onSelectFlow} onHoverFlow={onHoverFlow} backlinks={backlinks} onOpenDocument={onOpenDocument} readOnly={readOnly} />
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
            {!readOnly && (
              <div className="px-1">
                <button
                  className="w-full px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors cursor-pointer"
                  onClick={() => onCreateFlow?.(selection.ids)}
                >
                  Create Flow
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {history && (
        <HistoryPanel
          entries={history.entries}
          currentIndex={history.currentIndex}
          savedIndex={history.savedIndex}
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          onUndo={history.onUndo}
          onRedo={history.onRedo}
          onGoToEntry={history.onGoToEntry}
          collapsed={history.collapsed}
          onToggleCollapse={history.onToggleCollapse}
          readOnly={readOnly}
        />
      )}
    </div>
  );
}
