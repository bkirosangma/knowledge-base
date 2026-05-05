"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { getWorldSize, type CanvasPatch } from "../components/Canvas";
import { useCanvasCoords, VIEWPORT_PADDING } from "./useCanvasCoords";
import { useFooterContext } from "../../../shell/FooterContext";
import { useViewportPersistence } from "./useViewportPersistence";

const DEFAULT_PATCHES: CanvasPatch[] = [{ id: "main", col: 0, row: 0, widthUnits: 1, heightUnits: 1 }];

type WorldBox = { x: number; y: number; w: number; h: number };

interface UseDiagramViewportSyncInput {
  canvasRef: React.RefObject<HTMLDivElement | null>;
  /** Shared with `useZoom` so its setZoomTo handler reads up-to-date world bounds. */
  worldRef: React.MutableRefObject<WorldBox>;
  zoomRef: React.MutableRefObject<number>;
  zoom: number;
  setZoom: (z: number) => void;
  side: "left" | "right";
  activeFile: string | null;
}

/**
 * One hook that owns:
 *  - patches state
 *  - world (derived from patches) + worldRef
 *  - canvas→viewport coordinate transform (with scroll-tick reactivity)
 *  - footer info push for the active pane side
 *  - per-file viewport persistence
 *  - world-origin shift compensation (scrollLeft/Top adjustment when
 *    the auto-fit content bounds shifts the world's origin so the
 *    viewport doesn't visibly jump)
 *
 * Pre-KB-020 these were ~80 lines of inline orchestration in DiagramView.
 */
export function useDiagramViewportSync(input: UseDiagramViewportSyncInput) {
  const { canvasRef, worldRef, zoomRef, zoom, setZoom, side, activeFile } = input;

  // ─── Patches + world ─────────────────────────────────────────────
  const [patches, setPatches] = useState<CanvasPatch[]>(DEFAULT_PATCHES);
  const world = getWorldSize(patches);
  worldRef.current = world;

  const { toCanvasCoords, setWorldOffset } = useCanvasCoords(canvasRef, zoomRef);
  setWorldOffset(world.x, world.y);

  // ─── Scroll tick for canvasToViewport reactivity ─────────────────
  const [, setCanvasScrollTick] = useState(0);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onScroll = () => setCanvasScrollTick((t) => t + 1);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [canvasRef]);

  /**
   * Inverse of toCanvasCoords — maps canvas-space → viewport-space so
   * floating UI like QuickInspector can position itself at a node.
   * Recomputed when scroll changes (we read scrollLeft/Top inside the
   * callback and depend on the scroll tick to bust the memo).
   */
  const canvasToViewport = useCallback(
    (canvasX: number, canvasY: number) => {
      const el = canvasRef.current;
      if (!el) return { x: 0, y: 0 };
      const rect = el.getBoundingClientRect();
      const z = zoomRef.current;
      const wo = worldRef.current;
      return {
        x: (canvasX - wo.x) * z + rect.left - el.scrollLeft + VIEWPORT_PADDING,
        y: (canvasY - wo.y) * z + rect.top - el.scrollTop + VIEWPORT_PADDING,
      };
    },
    // canvasRef / zoomRef / worldRef are stable refs; the callback's
    // identity intentionally depends only on those — scroll-tick
    // re-renders will pick up new scroll values via the ref read.
    [canvasRef, zoomRef],
  );

  // ─── Footer info push ────────────────────────────────────────────
  const { setLeftInfo, setRightInfo } = useFooterContext();
  const pushFooterInfo = side === "right" ? setRightInfo : setLeftInfo;
  useEffect(() => {
    pushFooterInfo({ kind: "diagram", world: { w: world.w, h: world.h }, patches: patches.length, zoom });
  }, [pushFooterInfo, world.w, world.h, patches.length, zoom]);
  useEffect(() => () => pushFooterInfo(null), [pushFooterInfo]);

  // ─── Per-file viewport persistence ───────────────────────────────
  useViewportPersistence(canvasRef, worldRef, zoomRef, zoom, setZoom, activeFile);

  // ─── World-origin shift compensation ─────────────────────────────
  const prevWorldOriginRef = useRef<{ x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    const prev = prevWorldOriginRef.current;
    if (prev !== null) {
      const dx = prev.x - world.x;
      const dy = prev.y - world.y;
      if ((dx !== 0 || dy !== 0) && canvasRef.current) {
        // TEMP probe — flag any world-origin shift that scrolls the canvas
        // outside of a wheel event. If this fires during a pinch, the
        // jitter is from React-driven layout effects fighting the wheel
        // handler's imperative scroll write.
        // eslint-disable-next-line no-console
        console.log(`[origin-shift] dx=${dx.toFixed(2)} dy=${dy.toFixed(2)} z=${zoomRef.current.toFixed(3)} → scroll +${(dx * zoomRef.current).toFixed(2)},${(dy * zoomRef.current).toFixed(2)}`);
        canvasRef.current.scrollLeft += dx * zoomRef.current;
        canvasRef.current.scrollTop += dy * zoomRef.current;
      }
    }
    prevWorldOriginRef.current = { x: world.x, y: world.y };
  }, [world.x, world.y, canvasRef, zoomRef]);

  return {
    patches,
    setPatches,
    world,
    worldRef,
    canvasToViewport,
    toCanvasCoords,
  };
}
