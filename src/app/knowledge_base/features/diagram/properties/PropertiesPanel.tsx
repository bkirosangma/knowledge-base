import type { ComponentType } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { NodeData, Connection, LayerDef, LineCurveAlgorithm, Selection, FlowDef } from "../types";
import type { AnchorId } from "../utils/anchors";
import type { LevelMap } from "../utils/levelModel";
import type { HistoryEntry, DiagramSnapshot } from "../../../shared/hooks/useDiagramHistory";
import type { RegionBounds } from "./shared";
import type { DocumentMeta, AttachmentBuckets, EntityAttachmentTarget } from "../../document/types";
import type { PreviewItemType } from "../components/AttachmentPreviewModal";
import { NodeProperties } from "./NodeProperties";
import { LayerProperties } from "./LayerProperties";
import { LineProperties } from "./LineProperties";
import { DiagramProperties } from "./DiagramProperties";
import { FlowProperties } from "./FlowProperties";
import HistoryPanel from "../../../shared/components/HistoryPanel";
import { Tooltip } from "../../../shared/components/Tooltip";
import { useLockedFlow } from "../state/DiagramInteractionContext";

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
  documents?: DocumentMeta[];
  onPreviewDocument?: (path: string, entityName?: string) => void;
  onOpenDocPicker?: (entityType: string, entityId: string) => void;
  onDetachDocument?: (docPath: string, entityType: string, entityId: string) => void;
  getDocumentReferences?: (docPath: string, exclude?: { entityType: string; entityId: string }) => {
    attachments: Array<{ entityType: string; entityId: string }>;
    wikiBacklinks: string[];
  };
  deleteDocumentWithCleanup?: (path: string) => Promise<void>;
  onCreateAndAttach?: (flowId: string, filename: string, editNow: boolean, type: PreviewItemType) => Promise<void>;
  activeFile?: string | null;
  attachmentsByType?: (target: { type: EntityAttachmentTarget; id: string; diagramPath?: string }) => AttachmentBuckets;
  openAttachmentPreviewFor?: (target: { type: EntityAttachmentTarget; id: string; diagramPath?: string }) => void;
  hidden?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  readOnly?: boolean;
  history?: {
    entries: HistoryEntry<DiagramSnapshot>[];
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

export default function PropertiesPanel({ selection, title, nodes, connections, regions, levelMap, layerDefs, onSelectLayer, onSelectNode, onUpdateTitle, onUpdateNode, onUpdateLayer, onUpdateConnection, lineCurve, onUpdateLineCurve, flows, onSelectFlow, onHoverFlow, onUpdateFlow, onDeleteFlow, onCreateFlow, onSelectLine, onCreateLayer, onDeleteAnchor, onSelectType, onHoverType, expandedType, onExpandType, backlinks, onOpenDocument, documents, onPreviewDocument, onOpenDocPicker, onDetachDocument, getDocumentReferences, deleteDocumentWithCleanup, onCreateAndAttach, activeFile, attachmentsByType, openAttachmentPreviewFor, hidden, collapsed, onToggleCollapse, readOnly, history }: PropertiesPanelProps) {
  const allNodeIds = nodes.map((n) => n.id);
  const allLayerIds = regions.map((r) => r.id);
  const allConnectionIds = connections.map((c) => c.id);

  const { lockedFlowId, setLockedFlowId } = useLockedFlow();
  const lockedFlow = lockedFlowId ? flows.find((f) => f.id === lockedFlowId) ?? null : null;

  /**
   * Returns the selection-driven JSX for whatever is currently selected
   * (node, layer, line, multi-*, flow, or null → diagram-level).
   * Shared by both the unlocked path and the element section of the locked stack.
   */
  function renderForSelection() {
    return (
      <>
        {(!selection || selection.type === "flow") && (
          <DiagramProperties
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
            documents={documents}
            onPreviewDocument={onPreviewDocument}
            onOpenDocPicker={onOpenDocPicker}
            onDetachDocument={onDetachDocument}
            getDocumentReferences={getDocumentReferences}
            deleteDocumentWithCleanup={deleteDocumentWithCleanup}
            onCreateAndAttach={onCreateAndAttach}
            onLockFlow={(flowId) => setLockedFlowId(flowId)}
            diagramFilename={activeFile}
            attachmentsByType={attachmentsByType}
            openAttachmentPreviewFor={openAttachmentPreviewFor}
          />
        )}
        {selection?.type === "node" && (
          <NodeProperties id={selection.id} nodes={nodes} connections={connections} regions={regions} layerDefs={layerDefs} onSelectLayer={onSelectLayer} onSelectNode={onSelectNode} onUpdate={onUpdateNode} allNodeIds={allNodeIds} flows={flows} onSelectFlow={onSelectFlow} onHoverFlow={onHoverFlow} onCreateLayer={onCreateLayer} onDeleteAnchor={onDeleteAnchor} levelInfo={levelMap?.get(selection.id)} backlinks={backlinks} onPreviewDocument={onPreviewDocument} readOnly={readOnly} attachmentsByType={attachmentsByType} openAttachmentPreviewFor={openAttachmentPreviewFor} onOpenDocPicker={onOpenDocPicker} onDetachDocument={onDetachDocument} />
        )}
        {selection?.type === "layer" && (
          <LayerProperties id={selection.id} regions={regions} nodes={nodes} layerDefs={layerDefs} onSelectNode={onSelectNode} onUpdate={onUpdateLayer} allLayerIds={allLayerIds} backlinks={backlinks} onPreviewDocument={onPreviewDocument} readOnly={readOnly} />
        )}
        {selection?.type === "line" && (
          <LineProperties id={selection.id} connections={connections} nodes={nodes} onUpdate={onUpdateConnection} allConnectionIds={allConnectionIds} flows={flows} onSelectFlow={onSelectFlow} onHoverFlow={onHoverFlow} backlinks={backlinks} onPreviewDocument={onPreviewDocument} readOnly={readOnly} attachmentsByType={attachmentsByType} openAttachmentPreviewFor={openAttachmentPreviewFor} onOpenDocPicker={onOpenDocPicker} onDetachDocument={onDetachDocument} />
        )}
        {selection?.type === "multi-node" && (
          <div className="text-sm text-mute italic py-4">{selection.ids.length} elements selected</div>
        )}
        {selection?.type === "multi-layer" && (
          <div className="text-sm text-mute italic py-4">{selection.ids.length} layers selected</div>
        )}
        {selection?.type === "multi-line" && (
          <div>
            <div className="text-sm text-mute italic py-4">{selection.ids.length} lines selected</div>
            {!readOnly && (
              <div className="px-1">
                <button
                  className="w-full px-3 py-1.5 text-xs font-medium text-accent bg-blue-50 hover:bg-blue-100 rounded-md transition-colors cursor-pointer"
                  onClick={() => onCreateFlow?.(selection.ids)}
                >
                  Create Flow
                </button>
              </div>
            )}
          </div>
        )}
      </>
    );
  }

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
        className={`flex-shrink-0 bg-surface border-l border-line flex flex-col overflow-hidden${hidden ? " hidden" : ""}`}
        style={{ width: hidden ? 0 : 36 }}
      >
        <Tooltip label="Expand properties">
          <button
            onClick={onToggleCollapse}
            className="flex items-center justify-center px-2 py-3 border-b border-line hover:bg-surface-2 transition-colors"
            aria-label="Expand properties"
          >
            <ChevronLeft size={16} className="text-mute" />
          </button>
        </Tooltip>
      </div>
    );
  }

  return (
    <div
      className={`flex-shrink-0 bg-surface border-l border-line flex flex-col overflow-hidden${hidden ? " hidden" : ""}`}
      data-testid="properties-panel"
      style={{ width: hidden ? 0 : 280 }}
    >
      {onToggleCollapse ? (
        <Tooltip label="Collapse properties">
          <button
            onClick={onToggleCollapse}
            className="flex items-center gap-2 px-4 py-2.5 border-b border-line hover:bg-surface-2 transition-colors w-full"
            aria-label="Collapse properties"
          >
            <span className="text-xs font-bold text-ink-2 uppercase tracking-wider">Properties</span>
            <span className="text-[10px] text-mute font-medium">{sectionLabel}</span>
            <ChevronRight size={14} className="ml-auto text-mute" />
          </button>
        </Tooltip>
      ) : (
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-line">
          <span className="text-xs font-bold text-ink-2 uppercase tracking-wider">Properties</span>
          <span className="text-[10px] text-mute font-medium">{sectionLabel}</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {lockedFlow ? (
          <>
            <div data-testid="flow-properties-panel">
              <FlowProperties
                id={lockedFlow.id}
                flows={flows}
                connections={connections}
                nodes={nodes}
                allFlowIds={flows.map((f) => f.id)}
                onUpdate={onUpdateFlow}
                onDelete={onDeleteFlow}
                onSelectLine={onSelectLine}
                onSelectNode={onSelectNode}
                attachedDocs={documents?.filter(d => d.attachedTo?.some(a => a.type === "flow" && a.id === lockedFlow.id)) ?? []}
                onAttach={() => onOpenDocPicker?.("flow", lockedFlow.id)}
                onDetach={(docPath) => onDetachDocument?.(docPath, "flow", lockedFlow.id)}
                onPreview={(docPath) => onPreviewDocument?.(docPath, lockedFlow.name)}
                getDocumentReferences={getDocumentReferences}
                deleteDocumentWithCleanup={deleteDocumentWithCleanup}
                onCreateAndAttach={(filename, editNow, type) => onCreateAndAttach?.(lockedFlow.id, filename, editNow, type) ?? Promise.resolve()}
                readOnly={readOnly}
                attachmentsByType={attachmentsByType}
                openAttachmentPreviewFor={openAttachmentPreviewFor}
                onOpenDocPicker={onOpenDocPicker}
                onDetachDocument={onDetachDocument}
              />
            </div>
            {selection && selection.type !== "flow" && (
              <div data-testid="element-properties-panel" className="mt-4 border-t pt-4">
                {renderForSelection()}
              </div>
            )}
          </>
        ) : (
          renderForSelection()
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
