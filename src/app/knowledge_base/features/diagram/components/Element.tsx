import React, { useRef, useEffect, useState } from "react";
import type { ComponentType } from "react";
import { type AnchorId, type AnchorPoint } from "../utils/anchors";
import DocInfoBadge from "./DocInfoBadge";
import { useObservedTheme } from "../../../shared/hooks/useObservedTheme";
import { adaptUserColor } from "../utils/themeAdapter";

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
  flowRole?: 'start' | 'end' | 'middle';
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
  flowRole,
}: ElementProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const minH = w === 110 || w === 130 ? 60 : 70;

  const theme = useObservedTheme();
  const adaptedBg = adaptUserColor(bgColor ?? "#ffffff", theme);
  const adaptedBorder = adaptUserColor(borderColor ?? "#e2e8f0", theme);
  const adaptedSubText = adaptUserColor(textColor ?? "#475569", theme);
  const adaptedTitleText = adaptUserColor(textColor ?? "#1e293b", theme);
  // Light-mode preserves the hex+alpha shorthand the title text uses for
  // its muted line; dark-mode runs the adapter (HSL output) so we drop
  // the alpha and let the inverted lightness do the work.
  const adaptedMuted =
    theme === "dark"
      ? adaptUserColor(textColor ?? "#64748b", theme)
      : textColor
        ? `${textColor}99`
        : "#64748b";

  useEffect(() => {
    const el = ref.current;
    if (!el || !onResize) return;

    const observer = new ResizeObserver((entries) => {
      for (const _ of entries) {
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
        backgroundColor: adaptedBg,
        borderColor: adaptedBorder,
        boxShadow: flowRole === 'start'
          ? '0 0 0 2px #22c55e, 0 0 12px #22c55e80, 0 4px 15px rgb(0,0,0,0.06)'
          : flowRole === 'end'
          ? '0 0 0 2px #ef4444, 0 0 12px #ef444480, 0 4px 15px rgb(0,0,0,0.06)'
          : undefined,
      }}
      onMouseDown={(e) => {
        e.preventDefault();
        onDragStart?.(id, e);
      }}
      onMouseEnter={() => { setIsHovered(true); onMouseEnter?.(id); }}
      onMouseLeave={() => { setIsHovered(false); onMouseLeave?.(id); }}
      onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick?.(id); }}
    >
      {(flowRole === 'start' || flowRole === 'end') && (
        <span
          data-testid={`flow-role-pill-${id}`}
          className={`absolute left-1/2 -translate-x-1/2 -top-2 -translate-y-full rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none pointer-events-none ${
            flowRole === 'start' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
          }`}
        >
          {flowRole === 'start' ? 'Start' : 'End'}
        </span>
      )}
      {Icon && (
        <span className="mb-2" style={{ color: adaptedSubText }}>
          <Icon size={18} strokeWidth={1.5} />
        </span>
      )}
      <div
        className="font-semibold text-[13px] leading-tight"
        style={{ color: adaptedTitleText }}
      >
        {label}
      </div>
      {showLabels && sub && (
        <div
          className="text-[10.5px] mt-1 font-medium tracking-tight"
          style={{ color: adaptedMuted }}
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

/**
 * KB-021: custom memo equality.
 *
 * Comparing only the props that actually drive Element's render output
 * (data, colors, flow role, and the visual-state booleans) lets the
 * memo survive parent renders that recreate handler identities or the
 * `documentPaths` array each time. The handler list is intentionally
 * skipped — `useDiagramController` produces them via `useCallback`, so
 * the OLD render's handler is functionally identical. `anchors` is
 * also skipped: it's derived from x / y / w / measuredHeight, all of
 * which are compared above; any anchor-relevant change implies a data
 * change that re-renders Element anyway.
 *
 * Acceptance criterion: dragging one node on a 50-node diagram should
 * re-render only the dragged node (its x / y / dimmed change) plus a
 * couple of overlay components — never the other 49 Elements.
 */
function shallowEqArr<T>(a: T[] | undefined, b: T[] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function arePropsEqual(p: ElementProps, n: ElementProps): boolean {
  return (
    // Data fields (KB-021 spec: id, x, y, w, h, label, colors, flowRole)
    p.id === n.id &&
    p.label === n.label &&
    p.sub === n.sub &&
    p.icon === n.icon &&
    p.x === n.x &&
    p.y === n.y &&
    p.w === n.w &&
    p.measuredHeight === n.measuredHeight &&
    p.bgColor === n.bgColor &&
    p.borderColor === n.borderColor &&
    p.textColor === n.textColor &&
    p.flowRole === n.flowRole &&
    // Visual-state booleans — without these, selection/drag/dim feedback
    // would lag a render
    p.showLabels === n.showLabels &&
    p.isDragging === n.isDragging &&
    p.isSelected === n.isSelected &&
    p.showAnchors === n.showAnchors &&
    p.highlightedAnchor === n.highlightedAnchor &&
    p.dimmed === n.dimmed &&
    p.hasDocuments === n.hasDocuments &&
    // Handlers — included so that closures depending on changing state
    // (e.g. `useNodeDrag`'s `handleDragStart` closes over `isBlocked`,
    // which flips with read-only mode) reach Element promptly. They're
    // useCallback-stable mid-drag, so this does not bust the memo per
    // frame.
    p.onDragStart === n.onDragStart &&
    p.onAnchorDragStart === n.onAnchorDragStart &&
    p.onAnchorHover === n.onAnchorHover &&
    p.onAnchorHoverEnd === n.onAnchorHoverEnd &&
    p.onMouseEnter === n.onMouseEnter &&
    p.onMouseLeave === n.onMouseLeave &&
    p.onResize === n.onResize &&
    p.onDoubleClick === n.onDoubleClick &&
    p.onDocNavigate === n.onDocNavigate &&
    shallowEqArr(p.documentPaths, n.documentPaths)
  );
}

export default React.memo(Element, arePropsEqual);
