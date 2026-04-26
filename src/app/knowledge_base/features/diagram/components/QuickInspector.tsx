"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Palette, Pencil, Link2, Copy, Trash2 } from "lucide-react";
import type { EdgeHandleDirection } from "../hooks/useDragToConnect";

// The 6 preset colour schemes mirrored from properties/shared.tsx COLOR_SCHEMES.
// Each swatch shows the border colour; clicking applies the full scheme to
// bgColor / borderColor / textColor so the node stays visually consistent.
// TODO: tokenize — these hex values should live in a shared design-token file.
const COLOUR_SCHEMES = [
  { name: "Default", border: "#e2e8f0", fill: "#ffffff",  text: "#1e293b" },
  { name: "Ocean",   border: "#93c5fd", fill: "#eff6ff",  text: "#1e3a5f" },
  { name: "Emerald", border: "#6ee7b7", fill: "#ecfdf5",  text: "#064e3b" },
  { name: "Amber",   border: "#fcd34d", fill: "#fffbeb",  text: "#78350f" },
  { name: "Rose",    border: "#fda4af", fill: "#fff1f2",  text: "#881337" },
  { name: "Slate",   border: "#94a3b8", fill: "#f8fafc",  text: "#0f172a" },
] as const;

const TOOLBAR_HEIGHT = 40; // px — height of the pill bar

export interface QuickInspectorProps {
  nodeId: string;
  /** Canvas-space bounding box. x/y are the top-left corner (not centre). */
  nodeBounds: { x: number; y: number; w: number; h: number };
  /** Converts a canvas-space point to viewport (screen) coordinates. */
  canvasToViewport: (x: number, y: number) => { x: number; y: number };
  readOnly: boolean;
  onColorChange: (nodeId: string, fill: string, border: string, text: string) => void;
  onDelete: (nodeId: string) => void;
  onDuplicate: (nodeId: string) => void;
  onStartConnect: (nodeId: string, direction: EdgeHandleDirection, e: React.MouseEvent) => void;
  onLabelEdit: (nodeId: string) => void;
  /** Current fill colour of the node — used to highlight the active swatch. */
  currentColor: string;
}

export default function QuickInspector({
  nodeId,
  nodeBounds,
  canvasToViewport,
  readOnly,
  onColorChange,
  onDelete,
  onDuplicate,
  onStartConnect,
  onLabelEdit,
  currentColor,
}: QuickInspectorProps) {
  const [showColorPopover, setShowColorPopover] = useState(false);
  const colorButtonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const nativeColorRef = useRef<HTMLInputElement>(null);

  // Close popover when clicking outside it.
  useEffect(() => {
    if (!showColorPopover) return;
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        colorButtonRef.current &&
        !colorButtonRef.current.contains(e.target as Node)
      ) {
        setShowColorPopover(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showColorPopover]);

  const handleSchemeClick = useCallback(
    (scheme: typeof COLOUR_SCHEMES[number]) => {
      onColorChange(nodeId, scheme.fill, scheme.border, scheme.text);
      setShowColorPopover(false);
    },
    [nodeId, onColorChange],
  );

  const handleNativeColorChange = useCallback(
    (value: string) => {
      // When using "Other…" apply the custom colour as both fill and border;
      // text defaults to the darkest slate to stay readable on any hue.
      onColorChange(nodeId, value, value, "#1e293b");
    },
    [nodeId, onColorChange],
  );

  // Compute viewport position.
  // nodeBounds.x/y is top-left; centre-x = x + w/2, top-y = y.
  const vpCenter = canvasToViewport(nodeBounds.x + nodeBounds.w / 2, nodeBounds.y);
  const vpTop    = canvasToViewport(nodeBounds.x, nodeBounds.y);

  const left = vpCenter.x;           // horizontally centred on node
  const top  = vpTop.y - 16 - TOOLBAR_HEIGHT; // 16px gap above node top

  if (readOnly) return null;

  return (
    <>
      {/* Floating pill toolbar */}
      <div
        data-testid="quick-inspector"
        className="fixed z-[55] flex items-center gap-0.5 bg-white rounded-full shadow-lg border border-slate-200 px-1"
        style={{ left, top, transform: "translateX(-50%)", height: TOOLBAR_HEIGHT }}
      >
        {/* Color button */}
        <button
          ref={colorButtonRef}
          title="Change colour"
          aria-label="Change color"
          aria-haspopup="true"
          aria-expanded={showColorPopover}
          className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-slate-100 transition-colors relative"
          onClick={() => setShowColorPopover((v) => !v)}
        >
          {/* Small filled circle showing current colour */}
          <span
            className="absolute bottom-1.5 right-1.5 w-2.5 h-2.5 rounded-full border border-slate-300"
            style={{ backgroundColor: currentColor }} // dynamic — must be inline
          />
          <Palette size={15} className="text-slate-600" />
        </button>

        {/* Label edit button */}
        <button
          title="Edit label"
          aria-label="Edit label"
          className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-slate-100 transition-colors"
          onClick={() => onLabelEdit(nodeId)}
        >
          <Pencil size={15} className="text-slate-600" />
        </button>

        {/* Divider */}
        <div className="border-l border-slate-200 h-5 mx-0.5" />

        {/* Connect button — mousedown, not click, to start drag immediately */}
        <button
          title="Connect"
          aria-label="Connect to another node"
          className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-slate-100 transition-colors"
          onMouseDown={(e) => onStartConnect(nodeId, "e", e)}
        >
          <Link2 size={15} className="text-slate-600" />
        </button>

        {/* Divider */}
        <div className="border-l border-slate-200 h-5 mx-0.5" />

        {/* Duplicate button */}
        <button
          title="Duplicate"
          aria-label="Duplicate node"
          className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-slate-100 transition-colors"
          onClick={() => onDuplicate(nodeId)}
        >
          <Copy size={15} className="text-slate-600" />
        </button>

        {/* Delete button */}
        <button
          title="Delete"
          aria-label="Delete node"
          className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-red-50 transition-colors"
          onClick={() => onDelete(nodeId)}
        >
          <Trash2 size={15} className="text-red-400" />
        </button>
      </div>

      {/* Colour swatch popover */}
      {showColorPopover && (
        <div
          ref={popoverRef}
          data-testid="quick-inspector-color-popover"
          className="fixed z-[56] bg-white rounded-lg shadow-md border border-slate-200 p-2"
          style={{
            // Position below the colour button — dynamic, must be inline
            left,
            top: top + TOOLBAR_HEIGHT + 4,
            transform: "translateX(-50%)",
          }}
        >
          {/* 6 scheme swatches in a 3×2 grid */}
          <div className="grid grid-cols-3 gap-1.5 mb-1.5">
            {COLOUR_SCHEMES.map((scheme) => {
              const isActive = currentColor === scheme.fill;
              return (
                <button
                  key={scheme.name}
                  title={scheme.name}
                  aria-label={scheme.name}
                  className={`w-8 h-8 rounded-md border-2 cursor-pointer transition-all ${
                    isActive
                      ? "ring-2 ring-blue-400 ring-offset-1 border-white"
                      : "border-slate-200 hover:border-slate-400"
                  }`}
                  style={{ backgroundColor: scheme.fill }} // dynamic — must be inline
                  onClick={() => handleSchemeClick(scheme)}
                />
              );
            })}
          </div>

          {/* "Other…" — triggers native color picker */}
          <button
            aria-label="Pick custom color"
            className="w-full text-[11px] text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded px-1.5 py-1 transition-colors border border-dashed border-slate-300 cursor-pointer flex items-center justify-center gap-1"
            onClick={() => nativeColorRef.current?.click()}
          >
            Other…
            <input
              ref={nativeColorRef}
              type="color"
              value={currentColor}
              className="sr-only"
              onChange={() => {}} // suppress React warning for controlled input
              onBlur={(e) => handleNativeColorChange(e.target.value)}
            />
          </button>
        </div>
      )}
    </>
  );
}
