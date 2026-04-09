import React, { useRef, useCallback } from "react";
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
  /** Current zoom level */
  zoom?: number;
}

const MINIMAP_WIDTH = 200;
const MINIMAP_MAX_HEIGHT = 150;

export default function Minimap({ world, viewportRef, regions, nodes, zoom = 1 }: MinimapProps) {
  const minimapRef = useRef<HTMLDivElement>(null);

  if (world.w === 0 || world.h === 0) return null;

  // Uniform scale preserving aspect ratio — always computed at base size
  const scale = Math.min(MINIMAP_WIDTH / world.w, MINIMAP_MAX_HEIGHT / world.h);
  const miniW = world.w * scale;
  const miniH = world.h * scale;

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

  const handleMinimapClick = useCallback(
    (e: React.MouseEvent) => {
      const el = minimapRef.current;
      const viewport = viewportRef.current;
      if (!el || !viewport) return;

      const rect = el.getBoundingClientRect();
      // Account for CSS transform scale — getBoundingClientRect returns scaled size
      const cssScale = rect.width / miniW;
      const clickX = (e.clientX - rect.left) / cssScale;
      const clickY = (e.clientY - rect.top) / cssScale;

      // Convert minimap click to world coords, center viewport there
      const worldX = clickX / scale + world.x;
      const worldY = clickY / scale + world.y;

      viewport.scrollLeft = (worldX - world.x) * zoom - vpWidth / 2 + VIEWPORT_PADDING;
      viewport.scrollTop = (worldY - world.y) * zoom - vpHeight / 2 + VIEWPORT_PADDING;
    },
    [scale, miniW, world, vpWidth, vpHeight, zoom, viewportRef]
  );

  return (
    <div
      ref={minimapRef}
      className="bg-white border border-slate-300 rounded-lg shadow-lg cursor-pointer overflow-hidden transition-transform duration-200 ease-out origin-bottom-left hover:scale-[2]"
      style={{ width: miniW, height: miniH }}
      onClick={handleMinimapClick}
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
          }}
        />
      ))}

      {/* Viewport indicator — clamped to minimap bounds on all sides */}
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
            className="absolute border-2 border-blue-500 rounded-sm bg-blue-500/10"
            style={{ left: clampedLeft, top: clampedTop, width: clampedW, height: clampedH }}
          />
        );
      })()}
    </div>
  );
}
