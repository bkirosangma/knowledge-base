"use client";

import React from "react";
import PropertiesPanel from "../properties/PropertiesPanel";
import Minimap from "./Minimap";
import ContextMenu, { type ContextMenuTarget } from "./ContextMenu";
import AnchorPopupMenu from "./AnchorPopupMenu";
import FlowBreakWarningModal from "./FlowBreakWarningModal";
import DocumentPicker from "../../../shared/components/DocumentPicker";
import type { AnchorId } from "../utils/anchors";
import type { NodeData, LayerDef, Connection, FlowDef, LineCurveAlgorithm, Selection, RegionBounds } from "../types";
import type { DocumentMeta } from "../../document/types";
import type { PendingDeletion } from "../hooks/useDeletion";
import type { useFileExplorer } from "../../../shared/hooks/useFileExplorer";
import type { useActionHistory } from "../../../shared/hooks/useActionHistory";
import { findBrokenFlowsByReconnect } from "../utils/flowUtils";

export interface DiagramOverlaysProps {
  // Core state
  activeFile: string | null;
  readOnly: boolean;
  selection: Selection;
  title: string;
  nodes: NodeData[];
  connections: Connection[];
  flows: FlowDef[];
  layerDefs: LayerDef[];
  displayNodes: NodeData[];
  regions: RegionBounds[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  levelMap: any;
  lineCurve: LineCurveAlgorithm;
  measuredSizes: Record<string, { w: number; h: number }>;

  // Layout UI state
  propertiesCollapsed: boolean;
  historyCollapsed: boolean;
  showMinimap: boolean;
  showLabels: boolean;
  expandedTypeInPanel: string | null;

  // Overlay entity state
  contextMenu: {
    clientX: number;
    clientY: number;
    canvasX: number;
    canvasY: number;
    target: ContextMenuTarget;
  } | null;
  anchorPopup: {
    clientX: number;
    clientY: number;
    nodeId: string;
    anchorId: AnchorId;
    edge: "top" | "right" | "bottom" | "left";
  } | null;
  hoveredLine: { id: string; label: string; x: number; y: number } | null;
  pendingDeletion: PendingDeletion | null;
  pendingReconnect: {
    oldId: string;
    updates: Partial<Connection>;
    brokenFlows: FlowDef[];
  } | null;
  pickerTarget: { type: string; id: string } | null;

  // Refs + world
  canvasRef: React.RefObject<HTMLDivElement | null>;
  zoomRef: React.MutableRefObject<number>;
  world: { x: number; y: number; w: number; h: number };

  // External props passed through from DiagramView
  backlinks: { sourcePath: string; section?: string }[] | undefined;
  documents: DocumentMeta[];
  fileExplorer: ReturnType<typeof useFileExplorer>;
  onOpenDocument: (path: string) => void;
  onAttachDocument: (docPath: string, entityType: string, entityId: string) => void;
  onCreateDocument: (rootHandle: FileSystemDirectoryHandle, path: string) => Promise<void>;

  // useActionHistory result
  history: ReturnType<typeof useActionHistory>;

  // State setters needed by inline callbacks
  setSelection: React.Dispatch<React.SetStateAction<Selection>>;
  setNodes: React.Dispatch<React.SetStateAction<NodeData[]>>;
  setLayerDefs: React.Dispatch<React.SetStateAction<LayerDef[]>>;
  setLayerManualSizes: React.Dispatch<React.SetStateAction<Record<string, { left?: number; width?: number; top?: number; height?: number }>>>;
  setConnections: React.Dispatch<React.SetStateAction<Connection[]>>;
  setFlows: React.Dispatch<React.SetStateAction<FlowDef[]>>;
  setMeasuredSizes: React.Dispatch<React.SetStateAction<Record<string, { w: number; h: number }>>>;
  setTitle: React.Dispatch<React.SetStateAction<string>>;
  setLineCurve: React.Dispatch<React.SetStateAction<LineCurveAlgorithm>>;
  setPendingDeletion: React.Dispatch<React.SetStateAction<PendingDeletion | null>>;
  setPendingReconnect: React.Dispatch<React.SetStateAction<{
    oldId: string;
    updates: Partial<Connection>;
    brokenFlows: FlowDef[];
  } | null>>;
  setPickerTarget: React.Dispatch<React.SetStateAction<{ type: string; id: string } | null>>;
  setContextMenu: React.Dispatch<React.SetStateAction<DiagramOverlaysProps["contextMenu"]>>;
  setAnchorPopup: React.Dispatch<React.SetStateAction<DiagramOverlaysProps["anchorPopup"]>>;
  setHoveredFlowId: React.Dispatch<React.SetStateAction<string | null>>;
  setHoveredType: React.Dispatch<React.SetStateAction<string | null>>;
  setExpandedTypeInPanel: React.Dispatch<React.SetStateAction<string | null>>;
  setHistoryCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  toggleProperties: () => void;

  // Handlers from feature hooks
  handleAddElement: () => void;
  handleAddLayer: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deleteSelection: (sel: Selection) => any;
  confirmDeletion: (pd: PendingDeletion) => void;
  handleAnchorConnectToElement: (targetNodeId: string) => void;
  handleAnchorCreateCondition: () => void;
  handleAnchorConnectToType: (type: string) => void;
  handleAnchorMenuEnter: () => void;
  handleAnchorMenuLeave: () => void;
  handleCreateLayer: (title: string) => string;
  handleDeleteAnchor: (nodeId: string, anchorIndex: number) => void;
  handleSelectType: (type: string) => void;
  handleUndo: () => void;
  handleRedo: () => void;
  handleGoToEntry: (index: number) => void;
  handleSelectFlow: (flowId: string | null) => void;
  handleUpdateFlow: (oldId: string, updates: Partial<{ id: string; name: string; category: string }>) => void;
  handleDeleteFlow: (flowId: string) => void;
  handleCreateFlow: (connectionIds: string[]) => void;
  handleSelectLine: (lineId: string) => void;

  // Utilities
  scheduleRecord: (description: string) => void;
  scrollToRect: (r: { x: number; y: number; w: number; h: number }) => void;
  getNodeDimensions: (n: {
    id: string;
    w: number;
    shape?: string;
    conditionSize?: number;
    conditionOutCount?: number;
  }) => { w: number; h: number };
  getDocumentsForEntity: (type: string, id: string) => DocumentMeta[];
}

export default function DiagramOverlays(props: DiagramOverlaysProps) {
  const {
    activeFile,
    readOnly,
    selection,
    title,
    nodes,
    connections,
    flows,
    layerDefs,
    displayNodes,
    regions,
    levelMap,
    lineCurve,
    measuredSizes: _measuredSizes,
    propertiesCollapsed,
    historyCollapsed,
    showMinimap,
    showLabels,
    expandedTypeInPanel,
    contextMenu,
    anchorPopup,
    hoveredLine,
    pendingDeletion,
    pendingReconnect,
    pickerTarget,
    canvasRef,
    zoomRef,
    world,
    backlinks,
    fileExplorer,
    onOpenDocument,
    onAttachDocument,
    onCreateDocument,
    history,
    setSelection,
    setNodes,
    setLayerDefs,
    setLayerManualSizes,
    setConnections,
    setFlows,
    setMeasuredSizes,
    setTitle,
    setLineCurve,
    setPendingDeletion,
    setPendingReconnect,
    setPickerTarget,
    setContextMenu,
    setAnchorPopup,
    setHoveredFlowId,
    setHoveredType,
    setExpandedTypeInPanel,
    setHistoryCollapsed,
    toggleProperties,
    handleAddElement,
    handleAddLayer,
    deleteSelection,
    confirmDeletion,
    handleAnchorConnectToElement,
    handleAnchorCreateCondition,
    handleAnchorConnectToType,
    handleAnchorMenuEnter,
    handleAnchorMenuLeave,
    handleCreateLayer,
    handleDeleteAnchor,
    handleSelectType,
    handleUndo,
    handleRedo,
    handleGoToEntry,
    handleSelectFlow,
    handleUpdateFlow,
    handleDeleteFlow,
    handleCreateFlow,
    handleSelectLine,
    scheduleRecord,
    scrollToRect,
    getNodeDimensions,
    getDocumentsForEntity,
  } = props;
  // Unused in the JSX but needed for future-proofing against Phase 1.2; silence.
  void _measuredSizes;

  return (
    <>
      {/* Context Menu */}
      {!readOnly && contextMenu && (
        <ContextMenu
          x={contextMenu.clientX}
          y={contextMenu.clientY}
          target={contextMenu.target}
          onAddElement={handleAddElement}
          onAddLayer={handleAddLayer}
          onDeleteElement={(nodeId) => { const p = deleteSelection({ type: 'node', id: nodeId }); if (p) setPendingDeletion(p); }}
          onDeleteLayer={(layerId) => { const p = deleteSelection({ type: 'layer', id: layerId }); if (p) setPendingDeletion(p); }}
          onClose={() => setContextMenu(null)}
        />
      )}

      {!readOnly && anchorPopup && (
        <AnchorPopupMenu
          x={anchorPopup.clientX}
          y={anchorPopup.clientY}
          sourceNodeId={anchorPopup.nodeId}
          nodes={nodes}
          onClose={() => setAnchorPopup(null)}
          onConnectToElement={handleAnchorConnectToElement}
          onCreateCondition={handleAnchorCreateCondition}
          onConnectToType={handleAnchorConnectToType}
          anchorEdge={anchorPopup.edge}
          onMenuEnter={handleAnchorMenuEnter}
          onMenuLeave={handleAnchorMenuLeave}
        />
      )}

      {/* Properties Panel */}
      <PropertiesPanel
        collapsed={propertiesCollapsed}
        onToggleCollapse={toggleProperties}
        readOnly={readOnly}
        selection={selection}
        title={title}
        nodes={nodes}
        connections={connections}
        regions={regions}
        layerDefs={layerDefs}
        levelMap={levelMap}
        onSelectLayer={(layerId) => {
          setSelection({ type: 'layer', id: layerId });
          const region = regions.find((r) => r.id === layerId);
          if (region) scrollToRect({ x: region.left, y: region.top, w: region.width, h: region.height });
        }}
        onSelectNode={(nodeId) => {
          setSelection({ type: 'node', id: nodeId });
          const node = nodes.find((n) => n.id === nodeId);
          if (node) {
            const dims = getNodeDimensions(node);
            scrollToRect({ x: node.x - dims.w / 2, y: node.y - dims.h / 2, w: dims.w, h: dims.h });
          }
        }}
        onUpdateTitle={(t) => { setTitle(t); scheduleRecord("Edit title"); }}
        onUpdateNode={(oldId, updates) => {
          const newId = updates.id;
          setNodes((prev) => prev.map((n) => n.id === oldId ? { ...n, ...updates } : n));
          if (newId && newId !== oldId) {
            setConnections((prev) => prev.map((c) => ({
              ...c,
              from: c.from === oldId ? newId : c.from,
              to: c.to === oldId ? newId : c.to,
            })));
            setMeasuredSizes((prev) => {
              if (!(oldId in prev)) return prev;
              const { [oldId]: val, ...rest } = prev;
              void val;
              return rest;
            });
            setSelection({ type: 'node', id: newId });
          }
          const editLabel = nodes.find(n => n.id === oldId)?.shape === "condition" ? "Edit conditional" : "Edit element";
          scheduleRecord(editLabel);
        }}
        onUpdateLayer={(oldId, updates) => {
          const newId = updates.id;
          setLayerDefs((prev) => prev.map((l) => l.id === oldId ? { ...l, ...updates } : l));
          if (newId && newId !== oldId) {
            setNodes((prev) => prev.map((n) => n.layer === oldId ? { ...n, layer: newId } : n));
            setLayerManualSizes((prev) => {
              if (!(oldId in prev)) return prev;
              const { [oldId]: val, ...rest } = prev;
              void val;
              return rest;
            });
            setSelection({ type: 'layer', id: newId });
          }
          scheduleRecord("Edit layer");
        }}
        onUpdateConnection={(oldId, updates) => {
          const newId = updates.id;
          if (updates.from !== undefined || updates.to !== undefined) {
            const broken = findBrokenFlowsByReconnect(flows, oldId, updates.from as string | undefined, updates.to as string | undefined, connections);
            if (broken.length > 0) {
              setPendingReconnect({ oldId, updates, brokenFlows: broken });
              return;
            }
          }
          setConnections((prev) => prev.map((c) => c.id === oldId ? { ...c, ...updates } : c));
          if (newId && newId !== oldId) {
            setFlows((prev) => prev.map((f) => ({
              ...f,
              connectionIds: f.connectionIds.map((cid) => cid === oldId ? newId : cid),
            })));
            setSelection({ type: 'line', id: newId });
          }
          scheduleRecord("Edit connection");
        }}
        lineCurve={lineCurve}
        onUpdateLineCurve={(alg) => { setLineCurve(alg); scheduleRecord("Change line curve"); }}
        flows={flows}
        onSelectFlow={handleSelectFlow}
        onHoverFlow={setHoveredFlowId}
        onUpdateFlow={handleUpdateFlow}
        onDeleteFlow={handleDeleteFlow}
        onCreateFlow={handleCreateFlow}
        onSelectLine={handleSelectLine}
        onCreateLayer={handleCreateLayer}
        onDeleteAnchor={handleDeleteAnchor}
        onSelectType={handleSelectType}
        onHoverType={setHoveredType}
        expandedType={expandedTypeInPanel}
        onExpandType={(type) => { setExpandedTypeInPanel(type); setHoveredType(type); }}
        backlinks={backlinks}
        onOpenDocument={onOpenDocument}
        history={activeFile ? {
          entries: history.entries,
          currentIndex: history.currentIndex,
          savedIndex: history.savedIndex,
          canUndo: history.canUndo,
          canRedo: history.canRedo,
          onUndo: handleUndo,
          onRedo: handleRedo,
          onGoToEntry: handleGoToEntry,
          collapsed: historyCollapsed,
          onToggleCollapse: () => setHistoryCollapsed((c) => !c),
        } : undefined}
      />

      {/* Minimap */}
      {showMinimap && activeFile && (
        <div className="absolute bottom-4 left-4 z-30">
          <Minimap
            world={world}
            viewportRef={canvasRef}
            regions={regions}
            nodes={displayNodes}
            zoomRef={zoomRef}
          />
        </div>
      )}

      {/* Tooltip */}
      {hoveredLine && !showLabels && (
        <div
          className="fixed z-50 bg-slate-800 text-white text-xs font-semibold px-3 py-1.5 rounded shadow-lg pointer-events-none transform -translate-x-1/2 -translate-y-full"
          style={{ left: hoveredLine.x, top: hoveredLine.y - 15 }}
        >
          {hoveredLine.label}
        </div>
      )}

      {pendingDeletion && (
        <FlowBreakWarningModal
          description="The following flows will be deleted because their connections would no longer be contiguous:"
          brokenFlows={pendingDeletion.brokenFlows}
          onCancel={() => setPendingDeletion(null)}
          onConfirm={() => { confirmDeletion(pendingDeletion); setPendingDeletion(null); }}
        />
      )}

      {pendingReconnect && (
        <FlowBreakWarningModal
          description="Reconnecting this endpoint will break the contiguity of these flows, which will be deleted:"
          brokenFlows={pendingReconnect.brokenFlows}
          onCancel={() => setPendingReconnect(null)}
          onConfirm={() => {
            const { oldId, updates, brokenFlows } = pendingReconnect;
            const brokenIds = new Set(brokenFlows.map((f) => f.id));
            setConnections((prev) => prev.map((c) => c.id === oldId ? { ...c, ...updates } : c));
            setFlows((prev) => prev.filter((f) => !brokenIds.has(f.id)));
            scheduleRecord("Edit connection");
            setPendingReconnect(null);
          }}
        />
      )}

      {/* Document Picker */}
      {pickerTarget && (
        <DocumentPicker
          allDocPaths={
            (() => {
              const paths: string[] = [];
              type TreeNodeLike = { type: string; name: string; path: string; children?: TreeNodeLike[] };
              const walk = (items: TreeNodeLike[]) => {
                for (const item of items) {
                  if (item.type === "file" && item.name.endsWith(".md")) paths.push(item.path);
                  if (item.children) walk(item.children);
                }
              };
              walk(fileExplorer.tree as unknown as TreeNodeLike[]);
              return paths;
            })()
          }
          attachedPaths={getDocumentsForEntity(pickerTarget.type, pickerTarget.id).map(d => d.filename)}
          onAttach={(path) => {
            onAttachDocument(path, pickerTarget.type, pickerTarget.id);
          }}
          onCreate={async (path) => {
            const rootHandle = fileExplorer.dirHandleRef.current;
            if (rootHandle) {
              await onCreateDocument(rootHandle, path);
              onAttachDocument(path, pickerTarget.type, pickerTarget.id);
            }
          }}
          onClose={() => setPickerTarget(null)}
        />
      )}
    </>
  );
}
