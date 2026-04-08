import { useRef, useEffect } from "react";
import type { ComponentType } from "react";
import { type AnchorId, type AnchorPoint } from "../utils/anchors";

interface ElementProps {
  id: string;
  label: string;
  sub?: string;
  icon?: ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  x: number;
  y: number;
  w?: number;
  showLabels: boolean;
  onDragStart?: (id: string, e: React.MouseEvent) => void;
  isDragging?: boolean;
  showAnchors?: boolean;
  highlightedAnchor?: AnchorId | null;
  anchors?: AnchorPoint[];
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onResize?: (id: string, width: number, height: number) => void;
  measuredHeight?: number;
  dimmed?: boolean;
}

export default function Element({
  id,
  label,
  sub,
  icon: Icon,
  x,
  y,
  w = 210,
  showLabels,
  onDragStart,
  isDragging,
  showAnchors,
  highlightedAnchor,
  anchors,
  onMouseEnter,
  onMouseLeave,
  onResize,
  measuredHeight,
  dimmed,
}: ElementProps) {
  const ref = useRef<HTMLDivElement>(null);
  const minH = w === 110 || w === 130 ? 60 : 70;

  useEffect(() => {
    const el = ref.current;
    if (!el || !onResize) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        // contentRect doesn't include padding/border, use offsetWidth/Height
        onResize(id, el.offsetWidth, el.offsetHeight);
      }
    });

    observer.observe(el);
    // Report initial size
    onResize(id, el.offsetWidth, el.offsetHeight);

    return () => observer.disconnect();
  }, [id, onResize]);

  // Use measured height for anchor positioning, fall back to minH
  const displayH = measuredHeight ?? minH;

  return (
    <div
      ref={ref}
      className={`absolute bg-white rounded-lg shadow-[0_4px_15px_rgb(0,0,0,0.06)] border border-slate-200 flex flex-col items-center justify-center text-center p-3 z-10 select-none transition-opacity ${isDragging ? "cursor-grabbing shadow-lg ring-2 ring-blue-400" : "cursor-grab"}`}
      style={{
        left: x,
        top: y,
        transform: "translate(-50%, -50%)",
        width: `${w}px`,
        minHeight: `${minH}px`,
        opacity: dimmed ? 0.2 : 1,
      }}
      onMouseDown={(e) => {
        e.preventDefault();
        onDragStart?.(id, e);
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {Icon && (
        <Icon size={18} className="text-slate-600 mb-2" strokeWidth={1.5} />
      )}
      <div className="font-semibold text-[13px] text-slate-800 leading-tight">
        {label}
      </div>
      {showLabels && sub && (
        <div className="text-[10.5px] text-slate-500 mt-1 font-medium tracking-tight">
          {sub}
        </div>
      )}

      {/* Anchor points */}
      {showAnchors && anchors?.map((anchor) => {
        const relX = anchor.x - x + w / 2;
        const relY = anchor.y - y + displayH / 2;
        const isHighlighted = highlightedAnchor === anchor.id;
        return (
          <div
            key={anchor.id}
            className={`absolute rounded-full transition-all ${
              isHighlighted
                ? "w-3.5 h-3.5 bg-blue-500 ring-2 ring-blue-300"
                : "w-2 h-2 bg-slate-400 opacity-50"
            }`}
            style={{
              left: relX,
              top: relY,
              transform: "translate(-50%, -50%)",
              pointerEvents: "none",
            }}
          />
        );
      })}
    </div>
  );
}
