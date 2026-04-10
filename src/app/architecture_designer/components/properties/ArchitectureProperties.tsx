import type { NodeData, LineCurveAlgorithm, FlowDef } from "../../utils/types";
import { Section, EditableRow, ExpandableListRow, DropdownRow, type RegionBounds } from "./shared";

export function ArchitectureProperties({
  title, regions, nodes, onUpdateTitle, onSelectLayer, onSelectNode, lineCurve, onUpdateLineCurve, flows, onSelectFlow,
}: {
  title: string; regions: RegionBounds[]; nodes: NodeData[];
  onUpdateTitle?: (title: string) => void;
  onSelectLayer?: (layerId: string) => void;
  onSelectNode?: (nodeId: string) => void;
  lineCurve?: LineCurveAlgorithm;
  onUpdateLineCurve?: (algorithm: LineCurveAlgorithm) => void;
  flows?: FlowDef[];
  onSelectFlow?: (flowId: string) => void;
}) {
  const layerItems = regions.map((r) => ({ id: r.id, name: r.title }));
  const nodeItems = nodes.map((n) => ({ id: n.id, name: n.label }));
  const flowItems = (flows ?? []).map((f) => ({ id: f.id, name: f.name }));

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
        {flowItems.length > 0 && (
          <ExpandableListRow label="Flows" items={flowItems} onSelect={onSelectFlow} />
        )}
      </Section>
    </>
  );
}
