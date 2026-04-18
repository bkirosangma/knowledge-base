import React, { useRef, useEffect, useCallback, useState } from "react";
import type { ComponentType } from "react";
import { type AnchorId, type AnchorPoint } from "../utils/anchors";
import DocInfoBadge from "./DocInfoBadge";

interface ElementProps {
  id: string;
  label: string;
  sub?: string;
  icon?: ComponentType<{
    size?: number;
    className?: string;
    strokeWidth?: number;
  }>;
  x: number;
  y: number;
  w?: number;
  showLabels: boolean;
  onDragStart?: (id: string, e: React.MouseEvent) => void;
  isDragging?: boolean;
  isSelected?: boolean;
  showAnchors?: boolean;
  highlightedAnchor?: AnchorId | null;
  anchors?: AnchorPoint[];
  onAnchorDragStart?: (
    nodeId: string,
    anchorId: AnchorId,
    e: React.MouseEvent,
  ) => void;
  onMouseEnter?: (id: string) => void;
  onMouseLeave?: (id: string) => void;
  onAnchorHover?: (nodeId: string, anchorId: AnchorId, clientX: number, clientY: number) => void;
  onAnchorHoverEnd?: () => void;
  onResize?: (id: string, width: number, height: number) => void;
  onDoubleClick?: (id: string) => void;
  measuredHeight?: number;
  dimmed?: boolean;
  borderColor?: string;
  bgColor?: string;
  textColor?: string;
  hasDocuments?: boolean;
  documentPaths?: string[];
  onDocNavigate?: (path: string) => void;
}

function Element({
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
  isSelected,
  showAnchors,
  highlightedAnchor,
  anchors,
  onAnchorDragStart,
  onMouseEnter,
  onMouseLeave,
  onAnchorHover,
  onAnchorHoverEnd,
  onResize,
  onDoubleClick,
  measuredHeight,
  dimmed,
  borderColor,
  bgColor,
  textColor,
  hasDocuments,
  documentPaths,
  onDocNavigate,
}: ElementProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
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
      data-testid={`node-${id}`}
      data-node-label={label}
      className={`absolute rounded-lg shadow-[0_4px_15px_rgb(0,0,0,0.06)] border flex flex-col items-center justify-center text-center p-3 z-10 select-none ${isDragging ? "cursor-grabbing shadow-lg ring-2 ring-blue-400" : isSelected ? "ring-2 ring-blue-400 cursor-grab" : "cursor-grab"}`}
      style={{
        left: x,
        top: y,
        transform: "translate(-50%, -50%)",
        width: `${w}px`,
        minHeight: `${minH}px`,
        opacity: dimmed ? 0.55 : 1,
        transitionProperty: "opacity",
        transitionDuration: "150ms",
        transitionDelay: dimmed ? "0.15s" : "0s",
        backgroundColor: bgColor ?? "#ffffff",
        borderColor: borderColor ?? "#e2e8f0",
      }}
      onMouseDown={(e) => {
        e.preventDefault();
        onDragStart?.(id, e);
      }}
      onMouseEnter={() => { setIsHovered(true); onMouseEnter?.(id); }}
      onMouseLeave={() => { setIsHovered(false); onMouseLeave?.(id); }}
      onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick?.(id); }}
    >
      {Icon && (
        <span className="mb-2" style={{ color: textColor ?? "#475569" }}>
          <Icon size={18} strokeWidth={1.5} />
        </span>
      )}
      <div
        className="font-semibold text-[13px] leading-tight"
        style={{ color: textColor ?? "#1e293b" }}
      >
        {label}
      </div>
      {showLabels && sub && (
        <div
          className="text-[10.5px] mt-1 font-medium tracking-tight"
          style={{ color: textColor ? `${textColor}99` : "#64748b" }}
        >
          {sub}
        </div>
      )}

      {isHovered && hasDocuments && documentPaths && onDocNavigate && (
        <DocInfoBadge
          color={borderColor ?? "#3b82f6"}
          position={{ x: w - 4, y: -8 }}
          documentPaths={documentPaths}
          onNavigate={onDocNavigate}
        />
      )}

      {/* Anchor points */}
      {anchors?.map((anchor) => {
        const relX = anchor.x - x + w / 2;
        const relY = anchor.y - y + displayH / 2;
        const isHighlighted = showAnchors && highlightedAnchor === anchor.id;
        return (
          <div
            key={anchor.id}
            className={`absolute rounded-full ${
              isHighlighted
                ? "w-4 h-4 bg-blue-500 ring-2 ring-blue-300"
                : "w-2.5 h-2.5 bg-slate-400 hover:w-4 hover:h-4 hover:bg-blue-400 hover:opacity-100"
            }`}
            style={{
              left: `${(relX / w) * 100}%`,
              top: `${(relY / displayH) * 100}%`,
              transform: "translate(-50%, -50%)",
              opacity: showAnchors ? (isHighlighted ? 1 : 0.5) : 0,
              transitionProperty: "all",
              transitionDuration: "150ms",
              transitionDelay: showAnchors ? "0s" : "0.15s",
              pointerEvents: showAnchors && onAnchorDragStart ? "auto" : "none",
              cursor: onAnchorDragStart ? "crosshair" : undefined,
            }}
            onMouseEnter={
              onAnchorHover
                ? (e) => onAnchorHover(id, anchor.id, e.clientX, e.clientY)
                : undefined
            }
            onMouseLeave={onAnchorHoverEnd}
            onMouseDown={
              onAnchorDragStart
                ? (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onAnchorDragStart(id, anchor.id, e);
                  }
                : undefined
            }
          />
        );
      })}
    </div>
  );
}

export default React.memo(Element);
