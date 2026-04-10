import type { ComponentType } from "react";
import type { NodeData, Connection, LayerDef, LineCurveAlgorithm, Selection } from "../../utils/types";
import type { AnchorId } from "../../utils/anchors";
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
  onSelectLayer?: (layerId: string) => void;
  onSelectNode?: (nodeId: string) => void;
  onUpdateTitle?: (title: string) => void;
  layerDefs: LayerDef[];
  onUpdateNode?: (id: string, updates: Partial<{ id: string; label: string; sub: string; icon: ComponentType<{ size?: number; className?: string; strokeWidth?: number }>; borderColor: string; bgColor: string; textColor: string; layer: string }>) => void;
  onUpdateLayer?: (id: string, updates: Partial<{ id: string; title: string; bg: string; border: string; textColor: string }>) => void;
  onUpdateConnection?: (id: string, updates: Partial<{ id: string; label: string; color: string; from: string; to: string; fromAnchor: AnchorId; toAnchor: AnchorId; biDirectional: boolean; flowDuration: number }>) => void;
  lineCurve?: LineCurveAlgorithm;
  onUpdateLineCurve?: (algorithm: LineCurveAlgorithm) => void;
}

export default function PropertiesPanel({ selection, title, nodes, connections, regions, layerDefs, onSelectLayer, onSelectNode, onUpdateTitle, onUpdateNode, onUpdateLayer, onUpdateConnection, lineCurve, onUpdateLineCurve }: PropertiesPanelProps) {
  const allNodeIds = nodes.map((n) => n.id);
  const allLayerIds = regions.map((r) => r.id);
  const allConnectionIds = connections.map((c) => c.id);

  const sectionLabel = !selection
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
      className="flex-shrink-0 bg-white border-l border-slate-200 flex flex-col overflow-hidden"
      style={{ width: 280 }}
    >
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-200">
        <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Properties</span>
        <span className="text-[10px] text-slate-400 font-medium">{sectionLabel}</span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {!selection && (
          <ArchitectureProperties
            title={title}
            regions={regions}
            nodes={nodes}
            onUpdateTitle={onUpdateTitle}
            onSelectLayer={onSelectLayer}
            onSelectNode={onSelectNode}
            lineCurve={lineCurve}
            onUpdateLineCurve={onUpdateLineCurve}
          />
        )}
        {selection?.type === "node" && (
          <NodeProperties id={selection.id} nodes={nodes} connections={connections} regions={regions} layerDefs={layerDefs} onSelectLayer={onSelectLayer} onSelectNode={onSelectNode} onUpdate={onUpdateNode} allNodeIds={allNodeIds} />
        )}
        {selection?.type === "layer" && (
          <LayerProperties id={selection.id} regions={regions} nodes={nodes} layerDefs={layerDefs} onSelectNode={onSelectNode} onUpdate={onUpdateLayer} allLayerIds={allLayerIds} />
        )}
        {selection?.type === "line" && (
          <LineProperties id={selection.id} connections={connections} nodes={nodes} onUpdate={onUpdateConnection} allConnectionIds={allConnectionIds} />
        )}
        {selection?.type === "multi-node" && (
          <div className="text-sm text-slate-500 italic py-4">{selection.ids.length} elements selected</div>
        )}
        {selection?.type === "multi-layer" && (
          <div className="text-sm text-slate-500 italic py-4">{selection.ids.length} layers selected</div>
        )}
        {selection?.type === "multi-line" && (
          <div className="text-sm text-slate-500 italic py-4">{selection.ids.length} lines selected</div>
        )}
      </div>
    </div>
  );
}
