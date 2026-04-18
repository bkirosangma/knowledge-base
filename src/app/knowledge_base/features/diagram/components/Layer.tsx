import React from "react";

export type ResizeEdge = "left" | "right" | "top" | "bottom";

interface LayerProps {
  id: string;
  title: string;
  left: number;
  width: number;
  top: number;
  height: number;
  bg: string;
  border: string;
  textColor?: string;
  onDragStart?: (id: string, e: React.MouseEvent) => void;
  onResizeStart?: (id: string, edge: ResizeEdge, e: React.MouseEvent) => void;
  onDoubleClick?: (id: string) => void;
  isDragging?: boolean;
  isResizing?: boolean;
  isSelected?: boolean;
  dimmed?: boolean;
}

const HANDLE_SIZE = 8;

function Layer({
  id,
  title,
  left,
  width,
  top,
  height,
  bg,
  border,
  textColor,
  onDragStart,
  onResizeStart,
  onDoubleClick,
  isDragging,
  isResizing,
  isSelected,
  dimmed,
}: LayerProps) {
  const handleResize = (edge: ResizeEdge, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onResizeStart?.(id, edge, e);
  };

  return (
    <>
      <div
        data-testid={`layer-${id}`}
        className={`absolute rounded-xl border ${isSelected ? "border-blue-400 border-solid border-2" : "border-dashed"} ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
        style={{ left, width, top, height, opacity: dimmed ? 0.55 : 1, transitionProperty: "opacity", transitionDuration: "150ms", transitionDelay: dimmed ? "0.15s" : "0s", backgroundColor: bg, ...(!isSelected ? { borderColor: border } : {}) }}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) {
            e.preventDefault();
            onDragStart?.(id, e);
          }
        }}
      >
        {/* Resize handles — edges (hidden when dimmed or when no handler is provided) */}
        {!dimmed && onResizeStart && (<>
        {/* Left */}
        <div
          className="absolute top-0 -left-1 w-2 h-full cursor-ew-resize z-20 group"
          onMouseDown={(e) => handleResize("left", e)}
        >
          <div className="absolute left-0.5 top-1/2 -translate-y-1/2 w-1 h-8 rounded-full bg-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        {/* Right */}
        <div
          className="absolute top-0 -right-1 w-2 h-full cursor-ew-resize z-20 group"
          onMouseDown={(e) => handleResize("right", e)}
        >
          <div className="absolute right-0.5 top-1/2 -translate-y-1/2 w-1 h-8 rounded-full bg-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        {/* Top */}
        <div
          className="absolute -top-1 left-0 h-2 w-full cursor-ns-resize z-20 group"
          onMouseDown={(e) => handleResize("top", e)}
        >
          <div className="absolute top-0.5 left-1/2 -translate-x-1/2 h-1 w-8 rounded-full bg-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        {/* Bottom */}
        <div
          className="absolute -bottom-1 left-0 h-2 w-full cursor-ns-resize z-20 group"
          onMouseDown={(e) => handleResize("bottom", e)}
        >
          <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-8 rounded-full bg-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        </>)}
      </div>
      <span
        className="absolute font-bold tracking-wider text-[11px] select-none overflow-hidden text-ellipsis whitespace-nowrap"
        style={{ left: left + 12, top: top + 12, width: width - 24, opacity: dimmed ? 0.55 : 1, transitionProperty: "opacity", transitionDuration: "150ms", transitionDelay: dimmed ? "0.15s" : "0s", color: textColor ?? "#334155" }}
        title={title}
        onMouseDown={(e) => {
          e.preventDefault();
          onDragStart?.(id, e);
        }}
        onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick?.(id); }}
      >
        {title}
      </span>
    </>
  );
}

export default React.memo(Layer);
