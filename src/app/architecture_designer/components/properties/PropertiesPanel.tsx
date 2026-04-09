import { useState, type ComponentType } from "react";
import { ChevronRight } from "lucide-react";
import type { NodeData, Connection, LineCurveAlgorithm, Selection } from "../../utils/types";
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
  onUpdateNode?: (id: string, updates: Partial<{ id: string; label: string; sub: string; icon: ComponentType<{ size?: number; className?: string; strokeWidth?: number }> }>) => void;
  onUpdateLayer?: (id: string, updates: Partial<{ id: string; title: string }>) => void;
  onUpdateConnection?: (id: string, updates: Partial<{ id: string; label: string }>) => void;
  lineCurve?: LineCurveAlgorithm;
  onUpdateLineCurve?: (algorithm: LineCurveAlgorithm) => void;
}

export default function PropertiesPanel({ selection, title, nodes, connections, regions, onSelectLayer, onSelectNode, onUpdateTitle, onUpdateNode, onUpdateLayer, onUpdateConnection, lineCurve, onUpdateLineCurve }: PropertiesPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  const allNodeIds = nodes.map((n) => n.id);
  const allLayerIds = regions.map((r) => r.id);
  const allConnectionIds = connections.map((c) => c.id);

  return (
    <div
      className="flex-shrink-0 bg-white border-l border-slate-200 flex flex-col transition-[width] duration-200 overflow-hidden"
      style={{ width: collapsed ? 36 : 280 }}
    >
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 px-2.5 py-3 border-b border-slate-200 hover:bg-slate-50 transition-colors"
      >
        <ChevronRight
          size={16}
          className={`text-slate-500 transition-transform duration-200 ${collapsed ? "" : "rotate-180"}`}
        />
        {!collapsed && <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Properties</span>}
      </button>

      {!collapsed && (
        <div className="flex-1 overflow-y-auto px-4 py-3">
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
            <NodeProperties id={selection.id} nodes={nodes} connections={connections} regions={regions} onSelectLayer={onSelectLayer} onSelectNode={onSelectNode} onUpdate={onUpdateNode} allNodeIds={allNodeIds} />
          )}
          {selection?.type === "layer" && (
            <LayerProperties id={selection.id} regions={regions} nodes={nodes} onSelectNode={onSelectNode} onUpdate={onUpdateLayer} allLayerIds={allLayerIds} />
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
      )}
    </div>
  );
}
