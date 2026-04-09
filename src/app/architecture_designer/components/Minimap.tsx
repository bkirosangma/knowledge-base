import React, { useRef, useState, useEffect, useCallback } from "react";
import { VIEWPORT_PADDING } from "../hooks/useCanvasCoords";

interface MinimapProps {
  /** Total canvas world bounds */
  world: { x: number; y: number; w: number; h: number };
  /** Ref to the scrollable viewport element */
  viewportRef: React.RefObject<HTMLDivElement | null>;
  /** Layer regions to draw on the minimap */
  regions: { id: string; left: number; width: number; top: number; height: number; bg: string; empty: boolean }[];
  /** Node positions to draw as dots */
  nodes: { id: string; x: number; y: number; w: number }[];
  /** Live zoom ref for real-time updates during pinch */
  zoomRef: React.RefObject<number>;
}

export const MINIMAP_WIDTH = 200;
export const MINIMAP_MAX_HEIGHT = 150;

export default function Minimap({ world, viewportRef, regions, nodes, zoomRef }: MinimapProps) {
  const minimapRef = useRef<HTMLDivElement>(null);
  const prevScaleRef = useRef<number | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isDraggingIndicator, setIsDraggingIndicator] = useState(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const didDragRef = useRef(false);
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, setScrollTick] = useState(0);
  const zoom = zoomRef.current;

  // Re-render minimap on viewport scroll (self-contained, avoids parent re-render)
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onScroll = () => setScrollTick((t) => t + 1);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [viewportRef]);

  if (world.w === 0 || world.h === 0) return null;

  // Uniform scale preserving aspect ratio — always computed at base size
  const scale = Math.min(MINIMAP_WIDTH / world.w, MINIMAP_MAX_HEIGHT / world.h);
  const miniW = world.w * scale;
  const miniH = world.h * scale;

  // Detect when minimap scale changes (aspect ratio change) — enable transitions briefly
  if (prevScaleRef.current !== null && prevScaleRef.current !== scale) {
    if (!isResizing) setIsResizing(true);
    if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
    resizeTimerRef.current = setTimeout(() => setIsResizing(false), 350);
  }
  prevScaleRef.current = scale;

  const resizeTransition = isResizing
    ? 'left 300ms ease-out, top 300ms ease-out, width 300ms ease-out, height 300ms ease-out'
    : 'none';

  // Get viewport rect in world coords
  const vp = viewportRef.current;
  const vpScrollLeft = vp ? vp.scrollLeft - VIEWPORT_PADDING : 0;
  const vpScrollTop = vp ? vp.scrollTop - VIEWPORT_PADDING : 0;
  const vpWidth = vp ? vp.clientWidth : 0;
  const vpHeight = vp ? vp.clientHeight : 0;

  // Viewport indicator in minimap coords
  // vpScrollLeft/Top is in zoomed space — divide by zoom to get world offset
  const indicatorLeft = (vpScrollLeft / zoom) * scale;
  const indicatorTop = (vpScrollTop / zoom) * scale;
  // Viewport covers less world space when zoomed in
  const indicatorW = (vpWidth / zoom) * scale;
  const indicatorH = (vpHeight / zoom) * scale;

  /** Convert a client (screen) position to minimap-local coords, accounting for CSS scale */
  const toMinimapCoords = useCallback((clientX: number, clientY: number) => {
    const el = minimapRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const cssScale = rect.width / miniW;
    return {
      x: (clientX - rect.left) / cssScale,
      y: (clientY - rect.top) / cssScale,
    };
  }, [miniW]);

  /** Set viewport scroll from a minimap-local position (top-left of indicator) */
  const scrollToMinimapPos = useCallback((mx: number, my: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const z = zoomRef.current;
    // mx/my is the desired indicator top-left in minimap coords
    // Convert to world coords then to scroll position
    viewport.scrollLeft = (mx / scale) * z + VIEWPORT_PADDING;
    viewport.scrollTop = (my / scale) * z + VIEWPORT_PADDING;
  }, [scale, zoomRef, viewportRef]);

  const handleMinimapMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const { x: mx, y: my } = toMinimapCoords(e.clientX, e.clientY);

      // Check if click is inside the indicator
      const insideIndicator =
        mx >= indicatorLeft && mx <= indicatorLeft + indicatorW &&
        my >= indicatorTop && my <= indicatorTop + indicatorH;

      if (insideIndicator) {
        // Drag from current position, preserving click offset within indicator
        dragOffsetRef.current = { x: mx - indicatorLeft, y: my - indicatorTop };
        setIsDraggingIndicator(true);
        didDragRef.current = false;
      } else {
        // Animate scroll to click point over 100ms, then start drag
        const viewport = viewportRef.current;
        if (!viewport) return;
        const z = zoomRef.current;
        const worldX = mx / scale + world.x;
        const worldY = my / scale + world.y;
        const targetSL = (worldX - world.x) * z - vpWidth / 2 + VIEWPORT_PADDING;
        const targetST = (worldY - world.y) * z - vpHeight / 2 + VIEWPORT_PADDING;
        const startSL = viewport.scrollLeft;
        const startST = viewport.scrollTop;
        const duration = 100;
        const startTime = performance.now();

        const animate = (now: number) => {
          const t = Math.min((now - startTime) / duration, 1);
          const ease = t * (2 - t); // ease-out quad
          viewport.scrollLeft = startSL + (targetSL - startSL) * ease;
          viewport.scrollTop = startST + (targetST - startST) * ease;
          if (t < 1) {
            requestAnimationFrame(animate);
          } else {
            // Animation done — start drag with center offset
            dragOffsetRef.current = { x: indicatorW / 2, y: indicatorH / 2 };
            setIsDraggingIndicator(true);
            didDragRef.current = false;
          }
        };
        requestAnimationFrame(animate);
      }
    },
    [toMinimapCoords, indicatorLeft, indicatorTop, indicatorW, indicatorH, scale, world, vpWidth, vpHeight, zoomRef, viewportRef]
  );

  useEffect(() => {
    if (!isDraggingIndicator) return;

    const handleMouseMove = (e: MouseEvent) => {
      didDragRef.current = true;
      const { x: mx, y: my } = toMinimapCoords(e.clientX, e.clientY);
      const newLeft = mx - dragOffsetRef.current.x;
      const newTop = my - dragOffsetRef.current.y;
      scrollToMinimapPos(newLeft, newTop);
    };

    const handleMouseUp = (e: MouseEvent) => {
      setIsDraggingIndicator(false);
      // If cursor is outside minimap when drag ends, collapse it
      const el = minimapRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
        if (!inside) setIsHovered(false);
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingIndicator, toMinimapCoords, scrollToMinimapPos]);

  return (
    <div
      ref={minimapRef}
      className={`relative bg-white border border-slate-300 rounded-lg shadow-lg overflow-hidden origin-bottom-left ${isDraggingIndicator ? "cursor-grabbing" : "cursor-grab"}`}
      style={{ width: miniW, height: miniH, boxSizing: 'content-box', transition: 'transform 200ms ease-out, width 300ms ease-out, height 300ms ease-out', transform: isHovered ? 'scale(2)' : 'scale(1)' }}
      onMouseDown={handleMinimapMouseDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => { if (!isDraggingIndicator) setIsHovered(false); }}
    >
      {/* Regions */}
      {regions.map((r) =>
        r.empty ? null : (
          <div
            key={r.id}
            className="absolute rounded-sm bg-slate-100 border border-slate-200"
            style={{
              left: (r.left - world.x) * scale,
              top: (r.top - world.y) * scale,
              width: r.width * scale,
              height: r.height * scale,
              transition: resizeTransition,
            }}
          />
        )
      )}

      {/* Nodes as dots */}
      {nodes.map((n) => (
        <div
          key={n.id}
          className="absolute bg-slate-500 rounded-sm"
          style={{
            left: (n.x - n.w / 2 - world.x) * scale,
            top: (n.y - 35 - world.y) * scale,
            width: Math.max(3, n.w * scale),
            height: Math.max(2, 70 * scale),
            transition: resizeTransition,
          }}
        />
      ))}

      {/* Viewport indicator — clamped to minimap bounds, draggable */}
      {(() => {
        const clampedLeft = Math.max(0, indicatorLeft);
        const clampedTop = Math.max(0, indicatorTop);
        const trimLeft = clampedLeft - indicatorLeft;
        const trimTop = clampedTop - indicatorTop;
        const clampedW = Math.max(0, Math.min(indicatorW - trimLeft, miniW - clampedLeft));
        const clampedH = Math.max(0, Math.min(indicatorH - trimTop, miniH - clampedTop));
        if (clampedW <= 0 || clampedH <= 0) return null;
        return (
          <div
            className={`absolute border-2 border-blue-500 rounded-sm bg-blue-500/10 ${isDraggingIndicator ? "cursor-grabbing" : "cursor-grab"}`}
            style={{ left: clampedLeft, top: clampedTop, width: clampedW, height: clampedH, transition: resizeTransition, pointerEvents: 'none' }}
          />
        );
      })()}
    </div>
  );
}
