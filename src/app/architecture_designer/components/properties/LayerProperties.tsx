import type { NodeData } from "../../utils/types";
import { Row, EditableRow, EditableIdRow, ExpandableListRow, type RegionBounds } from "./shared";

export function LayerProperties({
  id, regions, nodes, onSelectNode, onUpdate, allLayerIds,
}: {
  id: string; regions: RegionBounds[]; nodes: NodeData[];
  onSelectNode?: (nodeId: string) => void;
  onUpdate?: (id: string, updates: Partial<{ id: string; title: string }>) => void;
  allLayerIds: string[];
}) {
  const region = regions.find((r) => r.id === id);
  if (!region) return <p className="text-xs text-slate-400">Layer not found.</p>;

  const layerNodes = nodes.filter((n) => n.layer === id);
  const nodeItems = layerNodes.map((n) => ({ id: n.id, name: n.label }));

  return (
    <div className="space-y-3">
      <div className="space-y-0">
        <EditableIdRow
          label="ID" value={region.id} prefix="ly-"
          onCommit={(newId) => {
            if (newId === id) return true;
            if (allLayerIds.includes(newId)) return false;
            onUpdate?.(id, { id: newId });
            return true;
          }}
        />
        <EditableRow label="Title" value={region.title} onCommit={(v) => { onUpdate?.(id, { title: v }); return true; }} />
        <ExpandableListRow label="Elements" items={nodeItems} onSelect={onSelectNode} />
        <Row label="Position" value={`${Math.round(region.left)}, ${Math.round(region.top)}`} />
        <Row label="Size" value={`${Math.round(region.width)} × ${Math.round(region.height)}`} />
      </div>
    </div>
  );
}
