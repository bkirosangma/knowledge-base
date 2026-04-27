"use client";

import React, { useRef, useState, useEffect } from "react";
import {
  MousePointer2, Square, Circle, Minus, PenTool, Type,
  Undo2, Redo2, ZoomIn, ZoomOut, Maximize2, Link2, Link2Off, Crop,
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
  bgColor?: string;
  onBgColorChange?: (color: string) => void;
  canvasSize?: { w: number; h: number };
  onCanvasSizeChange?: (w: number, h: number) => void;
}

const TOOLS: { tool: SVGTool; Icon: React.ElementType; title: string }[] = [
  { tool: "select",  Icon: MousePointer2, title: "Select (S)"    },
  { tool: "rect",    Icon: Square,        title: "Rectangle (R)"  },
  { tool: "ellipse", Icon: Circle,        title: "Ellipse (E)"    },
  { tool: "line",    Icon: Minus,         title: "Line (L)"       },
  { tool: "path",    Icon: PenTool,       title: "Path (P)"       },
  { tool: "text",    Icon: Type,          title: "Text (T)"       },
];

const btnBase = "p-2 rounded transition-colors";
const btnActive = "bg-surface-2 text-ink";
const btnInactive = "text-mute hover:text-ink-2 hover:bg-surface-2";
const btnDisabled = "text-mute opacity-40 cursor-not-allowed";

const CHECKER = "repeating-conic-gradient(#bbb 0% 25%, #fff 0% 50%)";

function ColorSwatch({
  label, color, disabled, onChange, allowNone = false,
}: {
  label: string;
  color: string;
  disabled: boolean;
  onChange: (c: string) => void;
  allowNone?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isNone = color === "none";
  // Remember the last valid hex so the picker opens with it after toggling back from none.
  const lastHexRef = useRef(isNone ? "#000000" : color);
  if (!isNone) lastHexRef.current = color;

  return (
    <div className="flex items-center">
      <button
        title={isNone ? `${label}: none — click to pick color` : `${label}: ${color}`}
        disabled={disabled}
        className={`${btnBase} flex items-center gap-0.5 ${disabled ? btnDisabled : btnInactive}`}
        onClick={() => !disabled && inputRef.current?.click()}
      >
        <span className="text-[10px] text-mute">{label[0].toUpperCase()}</span>
        <span
          className="inline-block w-3.5 h-3.5 rounded-sm border border-line"
          style={isNone
            ? { backgroundImage: CHECKER, backgroundSize: "6px 6px" }
            : { background: color }}
        />
        <input
          ref={inputRef}
          type="color"
          value={lastHexRef.current}
          className="sr-only"
          onChange={e => onChange(e.target.value)}
        />
      </button>
      {allowNone && !disabled && (
        <button
          title={isNone ? `Restore ${label.toLowerCase()} color` : `Set ${label.toLowerCase()} to none`}
          className={`text-[10px] leading-none px-0.5 ${isNone ? "text-ink-2 font-bold" : "text-mute hover:text-ink"}`}
          onClick={() => onChange(isNone ? lastHexRef.current : "none")}
        >
          ∅
        </button>
      )}
    </div>
  );
}

export default function SVGToolbar({
  activeTool, onToolChange, onUndo, onRedo, onZoomIn, onZoomOut, onZoomFit,
  style, onFillChange, onStrokeChange, onStrokeWidthChange,
  linkedHandles, onLinkedHandlesChange, readOnly = false,
  bgColor = "none", onBgColorChange,
  canvasSize = { w: 800, h: 600 }, onCanvasSizeChange,
}: SVGToolbarProps) {
  const fill        = style?.fill        ?? "#000000";
  const stroke      = style?.stroke      ?? "#000000";
  const strokeWidth = style?.strokeWidth ?? 1;

  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsContainerRef = useRef<HTMLDivElement>(null);
  const [sizeW, setSizeW] = useState(String(canvasSize.w));
  const [sizeH, setSizeH] = useState(String(canvasSize.h));

  // Sync local size inputs when the prop changes (e.g. after file load).
  useEffect(() => { setSizeW(String(canvasSize.w)); }, [canvasSize.w]);
  useEffect(() => { setSizeH(String(canvasSize.h)); }, [canvasSize.h]);

  // Close settings panel when mousedown lands outside the container.
  // Using mousedown (not click) + contains() avoids the race where the
  // opener click's native event reaches the document listener before
  // stopPropagation can block it.
  useEffect(() => {
    if (!settingsOpen) return;
    const close = (e: MouseEvent) => {
      if (settingsContainerRef.current && !settingsContainerRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [settingsOpen]);

  const applySize = () => {
    const w = parseInt(sizeW, 10);
    const h = parseInt(sizeH, 10);
    if (w > 0 && h > 0) onCanvasSizeChange?.(w, h);
  };

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
          <Icon size={16} />
        </button>
      ))}

      <div className="w-px h-4 bg-line mx-1" />

      <button
        title={linkedHandles ? "Handles linked — click to break (allow sharp points)" : "Handles independent — click to link (smooth curves)"}
        disabled={readOnly}
        onClick={() => !readOnly && onLinkedHandlesChange(!linkedHandles)}
        className={`${btnBase} ${readOnly ? btnDisabled : linkedHandles ? btnActive : btnInactive}`}
      >
        {linkedHandles ? <Link2 size={16} /> : <Link2Off size={16} />}
      </button>

      <div className="w-px h-4 bg-line mx-1" />

      <button title="Undo" disabled={readOnly} className={`${btnBase} ${readOnly ? btnDisabled : btnInactive}`} onClick={onUndo}>
        <Undo2 size={16} />
      </button>
      <button title="Redo" disabled={readOnly} className={`${btnBase} ${readOnly ? btnDisabled : btnInactive}`} onClick={onRedo}>
        <Redo2 size={16} />
      </button>

      <div className="w-px h-4 bg-line mx-1" />

      <ColorSwatch label="Fill"   color={fill}   disabled={readOnly} onChange={onFillChange}   allowNone />
      <ColorSwatch label="Stroke" color={stroke} disabled={readOnly} onChange={onStrokeChange} allowNone />
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
        <ZoomIn size={16} />
      </button>
      <button title="Zoom out" className={`${btnBase} ${btnInactive}`} onClick={onZoomOut}>
        <ZoomOut size={16} />
      </button>
      <button title="Fit" className={`${btnBase} ${btnInactive}`} onClick={onZoomFit}>
        <Maximize2 size={16} />
      </button>

      <div className="w-px h-4 bg-line mx-1" />

      {/* Canvas settings — background colour + size */}
      <div className="relative" ref={settingsContainerRef}>
        <button
          title="Canvas settings"
          className={`${btnBase} ${settingsOpen ? btnActive : btnInactive}`}
          onClick={() => setSettingsOpen(v => !v)}
        >
          <Crop size={16} />
        </button>

        {settingsOpen && (
          <div
            className="absolute top-full right-0 mt-1 z-50 rounded-lg shadow-lg border border-line px-3 py-2 w-52"
            style={{ background: "var(--color-surface)" }}
          >
            <p className="text-[9px] font-semibold uppercase tracking-wider mb-2 text-mute">Canvas</p>

            <div className="mb-3">
              <p className="text-[10px] text-mute mb-1">Background</p>
              <ColorSwatch
                label="Background"
                color={bgColor}
                disabled={false}
                onChange={c => onBgColorChange?.(c)}
                allowNone
              />
            </div>

            <div>
              <p className="text-[10px] text-mute mb-1">Size (px)</p>
              <div className="flex items-center gap-1">
                <input
                  type="number" min={1} max={9999} step={1}
                  value={sizeW}
                  className="w-16 h-5 text-[10px] text-center rounded border border-line bg-transparent text-ink"
                  onChange={e => setSizeW(e.target.value)}
                  onBlur={applySize}
                  onKeyDown={e => e.key === "Enter" && applySize()}
                />
                <span className="text-[10px] text-mute">×</span>
                <input
                  type="number" min={1} max={9999} step={1}
                  value={sizeH}
                  className="w-16 h-5 text-[10px] text-center rounded border border-line bg-transparent text-ink"
                  onChange={e => setSizeH(e.target.value)}
                  onBlur={applySize}
                  onKeyDown={e => e.key === "Enter" && applySize()}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {!readOnly && activeTool === "path" && (
        <span className="ml-2 text-[10px] text-mute italic select-none">
          Enter = end path (open) · click start = close
        </span>
      )}
    </div>
  );
}
