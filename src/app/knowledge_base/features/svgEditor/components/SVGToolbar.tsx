"use client";

import React from "react";
import {
  MousePointer2, Square, Circle, Minus, PenTool, Type,
  Undo2, Redo2, ZoomIn, ZoomOut, Maximize2,
} from "lucide-react";
import type { SVGTool } from "./SVGCanvas";

interface SVGToolbarProps {
  activeTool: SVGTool;
  onToolChange: (tool: SVGTool) => void;
  onUndo: () => void;
  onRedo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomFit: () => void;
  readOnly?: boolean;
}

const TOOLS: { tool: SVGTool; Icon: React.ElementType; title: string }[] = [
  { tool: "select",  Icon: MousePointer2, title: "Select (S)"    },
  { tool: "rect",    Icon: Square,        title: "Rectangle (R)"  },
  { tool: "ellipse", Icon: Circle,        title: "Ellipse (E)"    },
  { tool: "line",    Icon: Minus,         title: "Line (L)"       },
  { tool: "path",    Icon: PenTool,       title: "Path (P)"       },
  { tool: "text",    Icon: Type,          title: "Text (T)"       },
];

const btnBase = "p-1.5 rounded transition-colors";
const btnActive = "bg-surface-2 text-ink";
const btnInactive = "text-mute hover:text-ink-2 hover:bg-surface-2";

const btnDisabled = "text-mute opacity-40 cursor-not-allowed";

export default function SVGToolbar({
  activeTool, onToolChange, onUndo, onRedo, onZoomIn, onZoomOut, onZoomFit, readOnly = false,
}: SVGToolbarProps) {
  return (
    <div className="flex items-center gap-0.5 px-2 py-1 border-b border-line bg-surface flex-shrink-0">
      {TOOLS.map(({ tool, Icon, title }) => (
        <button
          key={tool}
          title={title}
          disabled={readOnly}
          data-active={!readOnly && activeTool === tool}
          className={`${btnBase} ${readOnly ? btnDisabled : activeTool === tool ? btnActive : btnInactive}`}
          onClick={() => !readOnly && onToolChange(tool)}
        >
          <Icon size={14} />
        </button>
      ))}

      <div className="w-px h-4 bg-line mx-1" />

      <button title="Undo" disabled={readOnly} className={`${btnBase} ${readOnly ? btnDisabled : btnInactive}`} onClick={onUndo}>
        <Undo2 size={14} />
      </button>
      <button title="Redo" disabled={readOnly} className={`${btnBase} ${readOnly ? btnDisabled : btnInactive}`} onClick={onRedo}>
        <Redo2 size={14} />
      </button>

      <div className="w-px h-4 bg-line mx-1" />

      <button title="Zoom in" className={`${btnBase} ${btnInactive}`} onClick={onZoomIn}>
        <ZoomIn size={14} />
      </button>
      <button title="Zoom out" className={`${btnBase} ${btnInactive}`} onClick={onZoomOut}>
        <ZoomOut size={14} />
      </button>
      <button title="Fit" className={`${btnBase} ${btnInactive}`} onClick={onZoomFit}>
        <Maximize2 size={14} />
      </button>
    </div>
  );
}
