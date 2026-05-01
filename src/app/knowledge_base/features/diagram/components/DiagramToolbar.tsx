"use client";

import React from "react";
import { Activity, Tag, Map as MapIcon } from "lucide-react";
import PaneHeader from "../../../shared/components/PaneHeader";
import ExportMenu from "../../export/ExportMenu";
import { exportDiagramSVG } from "../../export/exportDiagramSVG";
import { exportDiagramPNG } from "../../export/exportDiagramPNG";
import { exportFilename } from "../../export/exportFilename";
import { downloadBlob } from "../../export/downloadBlob";
import { serializeNodes } from "../../../shared/utils/persistence";
import AutoArrangeDropdown from "./AutoArrangeDropdown";
import DiagramToolbarOverflow from "./DiagramToolbarOverflow";
import { toggleClass } from "../utils/toolbarClass";
import type { Connection, FlowDef, LayerDef, LineCurveAlgorithm, NodeData } from "../types";
import type { ArrangeAlgorithm } from "../utils/autoArrange";

interface DiagramToolbarProps {
  activeFile: string | null;
  // PaneHeader inputs
  readOnly: boolean;
  onToggleReadOnly: () => void;
  title: string;
  onTitleChange: (v: string) => void;
  isDirty: boolean;
  onSave: () => void;
  onDiscard: (e: React.MouseEvent) => void;
  // Export-menu inputs (full diagram doc + sizes)
  layers: LayerDef[];
  nodes: NodeData[];
  connections: Connection[];
  flows: FlowDef[];
  layerManualSizes: Record<string, { left?: number; width?: number; top?: number; height?: number }>;
  lineCurve: LineCurveAlgorithm;
  // Toolbar toggles
  isCompact: boolean;
  isLive: boolean;
  setIsLive: (next: boolean | ((prev: boolean) => boolean)) => void;
  showLabels: boolean;
  setShowLabels: (next: boolean | ((prev: boolean) => boolean)) => void;
  showMinimap: boolean;
  setShowMinimap: (next: boolean | ((prev: boolean) => boolean)) => void;
  // Zoom
  zoom: number;
  setZoomTo: (z: number) => void;
  // Auto-arrange
  onAutoArrange: (algorithm: ArrangeAlgorithm) => void;
}

export default function DiagramToolbar({
  activeFile,
  readOnly,
  onToggleReadOnly,
  title,
  onTitleChange,
  isDirty,
  onSave,
  onDiscard,
  layers,
  nodes,
  connections,
  flows,
  layerManualSizes,
  lineCurve,
  isCompact,
  isLive,
  setIsLive,
  showLabels,
  setShowLabels,
  showMinimap,
  setShowMinimap,
  zoom,
  setZoomTo,
  onAutoArrange,
}: DiagramToolbarProps) {
  if (!activeFile) return null;
  return (
    <>
      <PaneHeader
        filePath={activeFile}
        readOnly={readOnly}
        onToggleReadOnly={onToggleReadOnly}
        title={title}
        onTitleChange={onTitleChange}
        isDirty={isDirty}
        hasActiveFile={!!activeFile}
        onSave={onSave}
        onDiscard={onDiscard}
      >
        <ExportMenu
          paneType="diagram"
          handlers={{
            svg: () => {
              const data = {
                title,
                layers,
                nodes: serializeNodes(nodes),
                connections,
                flows,
                layerManualSizes,
                lineCurve,
              };
              const svg = exportDiagramSVG(data);
              const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
              downloadBlob(blob, exportFilename(activeFile, "svg", "diagram"));
            },
            png: async () => {
              const data = {
                title,
                layers,
                nodes: serializeNodes(nodes),
                connections,
                flows,
                layerManualSizes,
                lineCurve,
              };
              const { blob } = await exportDiagramPNG(data);
              downloadBlob(blob, exportFilename(activeFile, "png", "diagram"));
            },
          }}
        />
      </PaneHeader>

      <div className="flex-shrink-0 flex items-center gap-3 px-3 py-1 bg-surface-2 border-b border-line z-10">
        {/* KB-013: at compact viewports, secondary toggles
         *  collapse into the overflow menu so the primary
         *  controls (zoom + auto-arrange) stay visible without
         *  wrapping. Zoom always remains inline. */}
        {isCompact ? (
          <DiagramToolbarOverflow
            isLive={isLive}
            onToggleLive={() => setIsLive((l) => !l)}
            showLabels={showLabels}
            onToggleLabels={() => setShowLabels((l) => !l)}
            showMinimap={showMinimap}
            onToggleMinimap={() => setShowMinimap((m) => !m)}
          />
        ) : (
          <>
            <div className="flex items-center gap-0.5 bg-surface rounded-lg p-0.5 border border-line">
              <button
                onClick={() => setIsLive((l) => !l)}
                className={toggleClass(isLive)}
                title="Toggle live data flow animation"
                aria-label="Toggle live data flow animation"
                aria-pressed={isLive}
              >
                <Activity size={13} />
                <span className="hidden xl:inline">Live</span>
              </button>
              <button
                onClick={() => setShowLabels((l) => !l)}
                className={toggleClass(showLabels)}
                title="Toggle data line labels"
                aria-label="Toggle data line labels"
                aria-pressed={showLabels}
              >
                <Tag size={13} />
                <span className="hidden xl:inline">Labels</span>
              </button>
            </div>
            <button
              onClick={() => setShowMinimap((m) => !m)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all border ${
                showMinimap
                  ? "bg-surface shadow-sm text-accent border-line"
                  : "bg-surface text-mute hover:text-ink-2 border-line"
              }`}
              title="Toggle minimap"
              aria-label="Toggle minimap"
              aria-pressed={showMinimap}
            >
              <MapIcon size={13} />
              <span className="hidden xl:inline">Minimap</span>
            </button>
          </>
        )}

        <div className="flex items-center gap-1 bg-surface rounded-lg p-0.5 border border-line" role="group" aria-label="Zoom controls">
          <button
            onClick={() => setZoomTo(Math.max(0.1, zoom - 0.25))}
            className="px-1.5 py-1 rounded-md text-xs font-bold text-mute hover:text-ink-2 hover:bg-surface-2 transition-all"
            title="Zoom out"
            aria-label="Zoom out"
          >&minus;</button>
          <button
            onClick={() => setZoomTo(1)}
            className={`px-2 py-1 rounded-md text-xs font-semibold transition-all ${
              Math.abs(zoom - 1) < 0.01 ? "text-accent bg-surface shadow-sm border border-line" : "text-ink-2 hover:text-accent hover:bg-surface border border-transparent"
            }`}
            title="Reset zoom to 100%"
            aria-label="Reset zoom to 100%"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={() => setZoomTo(Math.min(3, zoom + 0.25))}
            className="px-1.5 py-1 rounded-md text-xs font-bold text-mute hover:text-ink-2 hover:bg-surface-2 transition-all"
            title="Zoom in"
            aria-label="Zoom in"
          >+</button>
        </div>

        {!readOnly && (
          <>
            <div className="h-5 w-px bg-line" />
            <AutoArrangeDropdown onSelect={onAutoArrange} />
          </>
        )}
      </div>
    </>
  );
}
