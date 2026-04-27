"use client";

import React, { useRef } from "react";
import {
  MousePointer2, Square, Circle, Minus, PenTool, Type,
  Undo2, Redo2, ZoomIn, ZoomOut, Maximize2, Link2, Link2Off,
} from "lucide-react";
import type { SVGStyle, SVGTool } from "./SVGCanvas";

interface SVGToolbarProps {
  activeTool: SVGTool;
  onToolChange: (tool: SVGTool) => void;
  onUndo: () => void;
  onRedo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomFit: () => void;
  style?: SVGStyle;
  onFillChange: (color: string) => void;
  onStrokeChange: (color: string) => void;
  onStrokeWidthChange: (width: number) => void;
  linkedHandles: boolean;
  onLinkedHandlesChange: (linked: boolean) => void;
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

function ColorSwatch({
  label, color, disabled, onChange,
}: { label: string; color: string; disabled: boolean; onChange: (c: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <button
      title={label}
      disabled={disabled}
      className={`${btnBase} flex items-center gap-0.5 ${disabled ? btnDisabled : btnInactive}`}
      onClick={() => !disabled && inputRef.current?.click()}
    >
      <span className="text-[10px] text-mute">{label[0].toUpperCase()}</span>
      <span
        className="inline-block w-3.5 h-3.5 rounded-sm border border-line"
        style={{ background: color }}
      />
      <input
        ref={inputRef}
        type="color"
        value={color}
        className="sr-only"
        onChange={e => onChange(e.target.value)}
      />
    </button>
  );
}

export default function SVGToolbar({
  activeTool, onToolChange, onUndo, onRedo, onZoomIn, onZoomOut, onZoomFit,
  style, onFillChange, onStrokeChange, onStrokeWidthChange,
  linkedHandles, onLinkedHandlesChange, readOnly = false,
}: SVGToolbarProps) {
  const fill        = style?.fill        ?? "#000000";
  const stroke      = style?.stroke      ?? "#000000";
  const strokeWidth = style?.strokeWidth ?? 1;

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

      <button
        title={linkedHandles ? "Handles linked — click to break (allow sharp points)" : "Handles independent — click to link (smooth curves)"}
        disabled={readOnly}
        onClick={() => !readOnly && onLinkedHandlesChange(!linkedHandles)}
        className={`${btnBase} ${readOnly ? btnDisabled : linkedHandles ? btnActive : btnInactive}`}
      >
        {linkedHandles ? <Link2 size={14} /> : <Link2Off size={14} />}
      </button>

      <div className="w-px h-4 bg-line mx-1" />

      <button title="Undo" disabled={readOnly} className={`${btnBase} ${readOnly ? btnDisabled : btnInactive}`} onClick={onUndo}>
        <Undo2 size={14} />
      </button>
      <button title="Redo" disabled={readOnly} className={`${btnBase} ${readOnly ? btnDisabled : btnInactive}`} onClick={onRedo}>
        <Redo2 size={14} />
      </button>

      <div className="w-px h-4 bg-line mx-1" />

      <ColorSwatch label="Fill"   color={fill}   disabled={readOnly} onChange={onFillChange}   />
      <ColorSwatch label="Stroke" color={stroke} disabled={readOnly} onChange={onStrokeChange} />
      <div className="flex items-center gap-1 px-1">
        <span className="text-[10px] text-mute">W</span>
        <input
          type="number"
          min={0.5} max={50} step={0.5}
          value={strokeWidth}
          disabled={readOnly}
          title="Stroke width"
          className="w-10 h-5 text-[10px] text-center rounded border border-line bg-transparent text-ink disabled:opacity-40 disabled:cursor-not-allowed"
          onChange={e => onStrokeWidthChange(Number(e.target.value))}
        />
      </div>

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
