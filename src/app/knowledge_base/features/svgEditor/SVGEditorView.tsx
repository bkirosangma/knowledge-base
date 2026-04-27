"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import type { useFileExplorer } from "../../shared/hooks/useFileExplorer";
import PaneHeader from "../../shared/components/PaneHeader";
import SVGCanvas, { type SVGCanvasHandle, type SVGTool } from "./components/SVGCanvas";
import SVGToolbar from "./components/SVGToolbar";
import { useSVGPersistence } from "./hooks/useSVGPersistence";

export interface SVGEditorBridge {
  isDirty: boolean;
  title: string;
  onSave: () => void;
  onDiscard: () => void;
}

export interface SVGEditorViewProps {
  focused: boolean;
  side: "left" | "right";
  activeFile: string | null;
  fileExplorer: ReturnType<typeof useFileExplorer>;
  onSVGEditorBridge: (bridge: SVGEditorBridge) => void;
}

function fileNameWithoutExtension(path: string): string {
  const name = path.split("/").pop() ?? path;
  return name.replace(/\.svg$/i, "");
}

export default function SVGEditorView({
  focused: _focused,
  side: _side,
  activeFile,
  fileExplorer,
  onSVGEditorBridge,
}: SVGEditorViewProps) {
  const canvasRef = useRef<SVGCanvasHandle | null>(null);
  const [activeTool, setActiveTool] = useState<SVGTool>("select");
  const [isReadOnly, setIsReadOnly] = useState(true);

  const { isDirty, onChanged, handleSave, handleDiscard } = useSVGPersistence(
    activeFile,
    fileExplorer.dirHandleRef,
    canvasRef,
  );

  const title = activeFile ? fileNameWithoutExtension(activeFile) : "Untitled";

  useEffect(() => {
    onSVGEditorBridge({ isDirty, title, onSave: handleSave, onDiscard: handleDiscard });
  }, [isDirty, title, handleSave, handleDiscard, onSVGEditorBridge]);

  const handleToolChange = useCallback((tool: SVGTool) => {
    setActiveTool(tool);
    canvasRef.current?.setMode(tool);
  }, []);

  const handleToggleReadOnly = useCallback(() => {
    setIsReadOnly(prev => {
      const next = !prev;
      if (next) {
        // Exit path-node editing and clear selection when entering read mode
        canvasRef.current?.setMode("select");
        setActiveTool("select");
        canvasRef.current?.clearSelection();
      }
      return next;
    });
  }, []);

  // E / ⌘⇧R: toggle read mode — same shortcuts as document and diagram panes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === "e" || e.key === "E") && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const tag = (document.activeElement as HTMLElement)?.tagName;
        const isEditing = tag === "INPUT" || tag === "TEXTAREA"
          || !!(document.activeElement as HTMLElement)?.isContentEditable;
        if (isEditing) return;
        e.preventDefault();
        handleToggleReadOnly();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "r" || e.key === "R")) {
        e.preventDefault();
        handleToggleReadOnly();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleToggleReadOnly]);

  return (
    <div className="flex flex-col h-full min-h-0 flex-1">
      <PaneHeader
        filePath={activeFile ?? ""}
        readOnly={isReadOnly}
        onToggleReadOnly={handleToggleReadOnly}
        title={title}
        isDirty={isDirty}
        hasActiveFile={activeFile !== null}
        onSave={handleSave}
        onDiscard={() => handleDiscard()}
      />
      <SVGToolbar
        activeTool={activeTool}
        onToolChange={handleToolChange}
        onUndo={() => canvasRef.current?.undo()}
        onRedo={() => canvasRef.current?.redo()}
        onZoomIn={() => canvasRef.current?.zoomIn()}
        onZoomOut={() => canvasRef.current?.zoomOut()}
        onZoomFit={() => canvasRef.current?.zoomFit()}
        readOnly={isReadOnly}
      />
      <SVGCanvas
        ref={canvasRef}
        onChanged={onChanged}
        readOnly={isReadOnly}
      />
    </div>
  );
}
