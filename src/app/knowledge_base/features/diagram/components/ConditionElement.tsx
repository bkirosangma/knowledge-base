import React, { useRef, useEffect, useState } from "react";
import type { ComponentType } from "react";
import { RotateCw, Plus } from "lucide-react";
import type { AnchorId } from "../utils/anchors";
import { getConditionPath, getConditionAnchors, getEffectiveConditionHeight } from "../utils/conditionGeometry";
import DocInfoBadge from "./DocInfoBadge";

interface ConditionElementProps {
  id: string;
  label: string;
  icon?: ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  x: number;
  y: number;
  w: number;
  h: number;
  outCount: number;
  rotation: number;
  showLabels: boolean;
  onDragStart?: (id: string, e: React.MouseEvent) => void;
  isDragging?: boolean;
  isSelected?: boolean;
  showAnchors?: boolean;
  highlightedAnchor?: AnchorId | null;
  onAnchorDragStart?: (nodeId: string, anchorId: AnchorId, e: React.MouseEvent) => void;
  onMouseEnter?: (id: string) => void;
  onMouseLeave?: (id: string) => void;
  onResize?: (id: string, width: number, height: number) => void;
  onDoubleClick?: (id: string) => void;
  onAddOutAnchor?: () => void;
  onRotationDragStart?: (id: string, e: React.MouseEvent) => void;
  dimmed?: boolean;
  borderColor?: string;
  bgColor?: string;
  textColor?: string;
  hasDocuments?: boolean;
  documentPaths?: string[];
  onDocNavigate?: (path: string) => void;
  flowRole?: 'start' | 'end' | 'middle';
}

function ConditionElement({
  id,
  label,
  icon: Icon,
  x,
  y,
  w,
  h,
  outCount,
  rotation,
  onDragStart,
  isDragging,
  isSelected,
  showAnchors,
  highlightedAnchor,
  onAnchorDragStart,
  onMouseEnter,
  onMouseLeave,
  onResize,
  onDoubleClick,
  onAddOutAnchor,
  onRotationDragStart,
  dimmed,
  borderColor,
  bgColor,
  textColor,
  hasDocuments,
  documentPaths,
  onDocNavigate,
  flowRole,
}: ConditionElementProps) {
  const ref = useRef<HTMLDivElement>(null);
  const effectiveH = getEffectiveConditionHeight(h, w, outCount);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (!onResize) return;
    onResize(id, w, effectiveH);
  }, [id, w, effectiveH, onResize]);

  const path = getConditionPath(w, h, outCount);
  const anchors = getConditionAnchors(x, y, w, h, outCount, rotation);

  const fill = bgColor ?? "#ffffff";
  const stroke = borderColor ?? "#e2e8f0";
  const text = textColor ?? "#1e293b";

  // Dynamic centroid positioning — triangle centroid is ~55% down from top in unrotated space
  // Rotate this offset around the center for arbitrary rotation
  const centroidRelY = effectiveH * 0.05; // offset from center (centroid is slightly below center)
  const centroidRad = (rotation * Math.PI) / 180;
  const centroidX = -centroidRelY * Math.sin(centroidRad);
  const centroidY = centroidRelY * Math.cos(centroidRad);
  const centroid = {
    left: `${50 + (centroidX / w) * 100}%`,
    top: `${50 + (centroidY / effectiveH) * 100}%`,
  };

  // Compute the "+" add button position: center of the base/arc (before rotation)
  const addBtnLocalX = w / 2;
  const addBtnLocalY = getEffectiveConditionHeight(h, w, outCount) + 28;
  // Convert to effective-height local space then rotate
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const relX = addBtnLocalX - w / 2;
  const relY = addBtnLocalY - effectiveH / 2;
  const addBtnX = (relX * cos - relY * sin) + w / 2;
  const addBtnY = (relX * sin + relY * cos) + effectiveH / 2;

  return (
    <div
      ref={ref}
      className={`absolute z-10 select-none ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
      style={{
        left: x,
        top: y,
        width: w,
        height: effectiveH,
        transform: "translate(-50%, -50%)",
        opacity: dimmed ? 0.55 : 1,
        transitionProperty: "opacity",
        transitionDuration: "150ms",
        transitionDelay: dimmed ? "0.15s" : "0s",
        filter: flowRole === 'start'
          ? 'drop-shadow(0 0 6px #22c55e)'
          : flowRole === 'end'
          ? 'drop-shadow(0 0 6px #ef4444)'
          : undefined,
      }}
      onMouseDown={(e) => { e.preventDefault(); onDragStart?.(id, e); }}
      onMouseEnter={() => { setHovered(true); onMouseEnter?.(id); }}
      onMouseLeave={() => { setHovered(false); onMouseLeave?.(id); }}
      onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick?.(id); }}
    >
      {(flowRole === 'start' || flowRole === 'end') && (
        <span
          data-testid={`flow-role-pill-${id}`}
          className={`absolute left-1/2 -translate-x-1/2 -top-2 -translate-y-full rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none pointer-events-none z-20 ${
            flowRole === 'start' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
          }`}
        >
          {flowRole === 'start' ? 'Start' : 'End'}
        </span>
      )}
      {/* SVG shape */}
      <svg
        width={w}
        height={effectiveH}
        className="absolute inset-0"
        style={{ transform: `rotate(${rotation}deg)`, transformOrigin: "center" }}
      >
        <path
          d={path}
          fill={fill}
          stroke={stroke}
          strokeWidth={isSelected || isDragging ? 2 : 1}
          filter="drop-shadow(0 4px 15px rgb(0,0,0,0.06))"
        />
        {isSelected && (
          <path
            d={path}
            fill="none"
            stroke="#60a5fa"
            strokeWidth={2}
          />
        )}
      </svg>

      {/* Icon + label (always upright, centroid-positioned) */}
      <div
        className="absolute flex flex-col items-center justify-center text-center pointer-events-none"
        style={{
          left: centroid.left,
          top: centroid.top,
          transform: "translate(-50%, -50%)",
          maxWidth: w * 0.7,
        }}
      >
        {Icon && (
          <span className="mb-1" style={{ color: textColor ?? "#475569" }}>
            <Icon size={16} strokeWidth={1.5} />
          </span>
        )}
        <div
          className="font-semibold text-[11px] leading-tight px-2"
          style={{ color: text }}
        >
          {label}
        </div>
      </div>

      {/* Anchor dots */}
      {anchors.map((anchor) => {
        const relAnchorX = anchor.x - x + w / 2;
        const relAnchorY = anchor.y - y + effectiveH / 2;
        const isIn = anchor.anchorType === 'in';
        const isHighlighted = showAnchors && highlightedAnchor === anchor.id;
        const anchorColor = isIn ? "#10b981" : "#f59e0b";
        const anchorHighlightColor = isIn ? "#6ee7b7" : "#fcd34d";
        return (
          <div
            key={anchor.id}
            className={`absolute rounded-full ${
              isHighlighted
                ? "w-4 h-4 ring-2"
                : "w-2.5 h-2.5 hover:w-4 hover:h-4 hover:opacity-100"
            }`}
            style={{
              left: `${(relAnchorX / w) * 100}%`,
              top: `${(relAnchorY / effectiveH) * 100}%`,
              transform: "translate(-50%, -50%)",
              backgroundColor: anchorColor,
              opacity: showAnchors ? (isHighlighted ? 1 : 0.6) : 0,
              transitionProperty: "all",
              transitionDuration: "150ms",
              transitionDelay: showAnchors ? "0s" : "0.15s",
              pointerEvents: showAnchors && onAnchorDragStart ? "auto" : "none",
              cursor: onAnchorDragStart ? "crosshair" : undefined,
              boxShadow: isHighlighted ? `0 0 0 2px ${anchorHighlightColor}` : undefined,
            }}
            onMouseDown={
              onAnchorDragStart
                ? (e) => { e.stopPropagation(); e.preventDefault(); onAnchorDragStart(id, anchor.id as AnchorId, e); }
                : undefined
            }
          />
        );
      })}

      {/* "+" button to add out anchor — shown only when selected */}
      {isSelected && onAddOutAnchor && (
        <div
          className="absolute flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 border border-amber-300 hover:bg-amber-200 cursor-pointer z-20 transition-opacity"
          style={{
            left: `${(addBtnX / w) * 100}%`,
            top: `${(addBtnY / effectiveH) * 100}%`,
            transform: "translate(-50%, -50%)",
          }}
          onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); onAddOutAnchor(); }}
        >
          <Plus size={10} className="text-amber-600" />
        </div>
      )}

      {hovered && hasDocuments && documentPaths && onDocNavigate && (
        <DocInfoBadge
          color={borderColor ?? "#a855f7"}
          position={{ x: w - 4, y: -8 }}
          documentPaths={documentPaths}
          onNavigate={onDocNavigate}
        />
      )}

      {/* Rotation handle — shown on hover or selected, positioned above cond-in anchor */}
      {(hovered || isSelected) && onRotationDragStart && (() => {
        const inAnchor = anchors.find((a) => a.id === "cond-in");
        if (!inAnchor) return null;
        const dirX = inAnchor.x - x;
        const dirY = inAnchor.y - y;
        const len = Math.sqrt(dirX * dirX + dirY * dirY);
        const offset = 20;
        const hx = (inAnchor.x - x) + (len > 0.01 ? (dirX / len) * offset : 0);
        const hy = (inAnchor.y - y) + (len > 0.01 ? (dirY / len) * offset : -offset);
        return (
          <div
            className="absolute flex items-center justify-center w-6 h-6 rounded-full bg-white border border-slate-300 shadow-sm hover:bg-blue-50 hover:border-blue-400 cursor-grab z-20 transition-colors"
            style={{
              left: `calc(50% + ${hx}px)`,
              top: `calc(50% + ${hy}px)`,
              transform: "translate(-50%, -50%)",
            }}
            onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); onRotationDragStart(id, e); }}
          >
            <RotateCw size={12} className="text-slate-500" />
          </div>
        );
      })()}
    </div>
  );
}

/**
 * KB-021: custom memo equality. Same approach as Element — compare
 * data / visual-state props, ignore handler identities and recomputed
 * arrays. Includes condition-specific fields (`outCount`, `rotation`).
 */
function shallowEqArr<T>(a: T[] | undefined, b: T[] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function arePropsEqual(p: ConditionElementProps, n: ConditionElementProps): boolean {
  return (
    // Data fields
    p.id === n.id &&
    p.label === n.label &&
    p.icon === n.icon &&
    p.x === n.x &&
    p.y === n.y &&
    p.w === n.w &&
    p.h === n.h &&
    p.outCount === n.outCount &&
    p.rotation === n.rotation &&
    p.bgColor === n.bgColor &&
    p.borderColor === n.borderColor &&
    p.textColor === n.textColor &&
    p.flowRole === n.flowRole &&
    // Visual-state booleans
    p.showLabels === n.showLabels &&
    p.isDragging === n.isDragging &&
    p.isSelected === n.isSelected &&
    p.showAnchors === n.showAnchors &&
    p.highlightedAnchor === n.highlightedAnchor &&
    p.dimmed === n.dimmed &&
    p.hasDocuments === n.hasDocuments &&
    // Handlers — see Element.tsx for the rationale. Included so that
    // read-only-toggling closures reach the component promptly.
    p.onDragStart === n.onDragStart &&
    p.onAnchorDragStart === n.onAnchorDragStart &&
    p.onMouseEnter === n.onMouseEnter &&
    p.onMouseLeave === n.onMouseLeave &&
    p.onResize === n.onResize &&
    p.onDoubleClick === n.onDoubleClick &&
    p.onAddOutAnchor === n.onAddOutAnchor &&
    p.onRotationDragStart === n.onRotationDragStart &&
    p.onDocNavigate === n.onDocNavigate &&
    shallowEqArr(p.documentPaths, n.documentPaths)
  );
}

export default React.memo(ConditionElement, arePropsEqual);
