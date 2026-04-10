import type { NodeData, LineCurveAlgorithm } from "../../utils/types";
import { Section, EditableRow, ExpandableListRow, DropdownRow, type RegionBounds } from "./shared";

export function ArchitectureProperties({
  title, regions, nodes, onUpdateTitle, onSelectLayer, onSelectNode, lineCurve, onUpdateLineCurve,
}: {
  title: string; regions: RegionBounds[]; nodes: NodeData[];
  onUpdateTitle?: (title: string) => void;
  onSelectLayer?: (layerId: string) => void;
  onSelectNode?: (nodeId: string) => void;
  lineCurve?: LineCurveAlgorithm;
  onUpdateLineCurve?: (algorithm: LineCurveAlgorithm) => void;
}) {
  const layerItems = regions.map((r) => ({ id: r.id, name: r.title }));
  const nodeItems = nodes.map((n) => ({ id: n.id, name: n.label }));

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
    </>
  );
}
