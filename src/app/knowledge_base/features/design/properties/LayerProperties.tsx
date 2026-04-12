import type { NodeData, DocumentMeta } from "../../../shared/utils/types";
import type { LayerDef } from "../../../shared/utils/types";
import { Section, Row, EditableRow, EditableIdRow, ExpandableListRow, ColorRow, ColorSchemeRow, type RegionBounds } from "./shared";
import DocumentsSection from "./DocumentsSection";

export function LayerProperties({
  id, regions, nodes, layerDefs, onSelectNode, onUpdate, allLayerIds, documents, onOpenDocument, onAttachDocument, onDetachDocument,
}: {
  id: string; regions: RegionBounds[]; nodes: NodeData[]; layerDefs: LayerDef[];
  onSelectNode?: (nodeId: string) => void;
  onUpdate?: (id: string, updates: Partial<{ id: string; title: string; bg: string; border: string; textColor: string }>) => void;
  allLayerIds: string[];
  documents?: DocumentMeta[];
  onOpenDocument?: (path: string) => void;
  onAttachDocument?: (entityType: string, entityId: string) => void;
  onDetachDocument?: (docPath: string, entityType: string, entityId: string) => void;
}) {
  const region = regions.find((r) => r.id === id);
  if (!region) return <p className="text-xs text-slate-400">Layer not found.</p>;

  const layerNodes = nodes.filter((n) => n.layer === id);
  const nodeItems = layerNodes.map((n) => ({ id: n.id, name: n.label }));

  const layerDef = layerDefs.find((l) => l.id === id);
  const fill = layerDef?.bg ?? "#eff3f9";
  const border = layerDef?.border ?? "#cdd6e4";
  const text = layerDef?.textColor ?? "#334155";

  return (
    <>
      <Section title="Identity">
        <EditableIdRow
          label="ID" value={region.id} prefix="ly-"
          onCommit={(newId) => {
            if (newId === id) return true;
            if (allLayerIds.includes(newId)) return false;
            onUpdate?.(id, { id: newId });
            return true;
          }}
        />
        <EditableRow label="Label" value={region.title} onCommit={(v) => { onUpdate?.(id, { title: v }); return true; }} />
      </Section>

      <Section title="Appearance">
        <ColorSchemeRow
          type="layer"
          currentColors={{ fill, border, text }}
          onSelect={(s) => onUpdate?.(id, { bg: s.layer.fill, border: s.layer.border, textColor: s.layer.text })}
        />
        <ColorRow label="Fill" value={fill} onChange={(v) => onUpdate?.(id, { bg: v })} />
        <ColorRow label="Border" value={border} onChange={(v) => onUpdate?.(id, { border: v })} />
        <ColorRow label="Text" value={text} onChange={(v) => onUpdate?.(id, { textColor: v })} />
      </Section>

      <Section title="Content">
        <ExpandableListRow label="Elements" items={nodeItems} onSelect={onSelectNode} />
      </Section>

      <Section title="Layout">
        <Row label="Level" value={1} />
        <Row label="Base" value="Canvas" />
        <Row label="Position" value={`${Math.round(region.left)}, ${Math.round(region.top)}`} />
        <Row label="Size" value={`${Math.round(region.width)} × ${Math.round(region.height)}`} />
      </Section>

      {documents && (
        <DocumentsSection
          entityType="type"
          entityId={id}
          documents={documents}
          onOpenDocument={onOpenDocument}
          onAttachDocument={() => onAttachDocument?.("type", id)}
          onDetachDocument={onDetachDocument}
        />
      )}
    </>
  );
}
