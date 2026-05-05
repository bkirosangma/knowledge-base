import { useEffect, useRef, useCallback } from "react";
import { VIEWPORT_PADDING } from "./useCanvasCoords";

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3;
const BASE_SENSITIVITY = 0.008;
const MAX_SENSITIVITY = 0.04;

export function useZoom(
  canvasRef: React.RefObject<HTMLDivElement | null>,
  worldRef: React.RefObject<{ x: number; y: number; w: number; h: number }>,
) {
  const zoomRef = useRef(1);
  const isZoomingRef = useRef(false);
  const setZoomState = useRef<(z: number) => void>(() => {});
  const setIsZoomingState = useRef<(z: boolean) => void>(() => {});

  const getZoom = useCallback(() => zoomRef.current, []);

  const registerSetZoom = useCallback((fn: (z: number) => void) => {
    setZoomState.current = fn;
  }, []);

  const registerSetIsZooming = useCallback((fn: (z: boolean) => void) => {
    setIsZoomingState.current = fn;
  }, []);

  /** Programmatically set zoom to a specific level, keeping the viewport center stable */
  const setZoomTo = useCallback((targetZoom: number) => {
    const el = canvasRef.current;
    if (!el) return;
    const w = worldRef.current;
    const oldZoom = zoomRef.current;
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, targetZoom));
    if (newZoom === oldZoom) return;

    // Anchor on viewport center
    const centerX = el.scrollLeft + el.clientWidth / 2;
    const centerY = el.scrollTop + el.clientHeight / 2;
    const worldX = (centerX - VIEWPORT_PADDING) / oldZoom;
    const worldY = (centerY - VIEWPORT_PADDING) / oldZoom;

    zoomRef.current = newZoom;

    // Update DOM synchronously. The canvas root's first child is the
    // sr-only `CanvasLiveRegion` — we need the actual sizer / wrapper,
    // tagged with data-attributes for direct lookup.
    const sizer = el.querySelector("[data-diagram-sizer]") as HTMLElement | null;
    const canvasWrapper = el.querySelector("[data-diagram-canvas-wrapper]") as HTMLElement | null;
    if (sizer) {
      sizer.style.width = `${VIEWPORT_PADDING * 2 + w.w * newZoom}px`;
      sizer.style.height = `${VIEWPORT_PADDING * 2 + w.h * newZoom}px`;
    }
    if (canvasWrapper) {
      canvasWrapper.style.transform = `scale(${newZoom})`;
    }

    // Keep the same world point at center
    el.scrollLeft = VIEWPORT_PADDING + worldX * newZoom - el.clientWidth / 2;
    el.scrollTop = VIEWPORT_PADDING + worldY * newZoom - el.clientHeight / 2;

    setZoomState.current(newZoom);
  }, [canvasRef, worldRef]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let renderTimer: ReturnType<typeof setTimeout> | null = null;
    // Trackpad pinch on macOS occasionally fires 1–2 non-ctrlKey wheel
    // events at the very start (and end) of a gesture before the OS
    // classifies it as a pinch. Track the most recent ctrl-wheel
    // timestamp so we can swallow those bracketing scroll events instead
    // of letting the canvas pan immediately before/after the zoom.
    let lastPinchAt = 0;
    const PINCH_WINDOW_MS = 200;
    // Pan-batching state: trackpads send 60–120 wheel events/sec; applying
    // each one synchronously fans out to every scroll listener (Minimap,
    // viewport sync, bounds clamp) and forces layout each pass. Coalesce
    // pending deltas into a single scroll write per animation frame.
    let pendingPanDx = 0;
    let pendingPanDy = 0;
    let panRaf: number | null = null;
    const flushPan = () => {
      panRaf = null;
      if (pendingPanDx !== 0) { el.scrollLeft += pendingPanDx; pendingPanDx = 0; }
      if (pendingPanDy !== 0) { el.scrollTop += pendingPanDy; pendingPanDy = 0; }
    };

    const onWheel = (e: WheelEvent) => {
      // Pan: non-ctrl/meta wheel events. Chromium's native scroll on
      // `overflow: auto` axis-locks trackpad pan to the dominant axis
      // even though the device sends both deltaX and deltaY for a
      // diagonal swipe (verified by probe). JS-apply the scroll so
      // diagonal motion moves both axes. preventDefault also stops
      // browser back/forward gestures and pull-to-refresh.
      if (!e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        // Inside the pinch window, swallow stray non-ctrl wheel events
        // dispatched at the start/end of a trackpad pinch so the canvas
        // doesn't pan immediately before/after the zoom.
        if (Date.now() - lastPinchAt < PINCH_WINDOW_MS) return;
        // deltaMode: 0 = pixel (trackpads, modern mice), 1 = line, 2 = page.
        const factor = e.deltaMode === 1 ? 16 : (e.deltaMode === 2 ? el.clientHeight : 1);
        pendingPanDx += e.deltaX * factor;
        pendingPanDy += e.deltaY * factor;
        if (panRaf === null) panRaf = requestAnimationFrame(flushPan);
        return;
      }
      e.preventDefault();
      lastPinchAt = Date.now();

      const oldZoom = zoomRef.current;
      // Adaptive sensitivity: faster pinch (larger deltaY) = higher sensitivity
      const absDelta = Math.abs(e.deltaY);
      const sensitivity = Math.min(MAX_SENSITIVITY, BASE_SENSITIVITY + absDelta * 0.0003);
      const delta = -e.deltaY * sensitivity;
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, oldZoom * (1 + delta)));
      if (newZoom === oldZoom) return;

      const rect = el.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;

      // Anchor on the cursor for THIS event. The previous "lock anchor on
      // first event" pattern caused the world to drift away from the
      // cursor over a multi-event gesture (the locked anchor stayed put
      // while the actual cursor / fingers moved), which read as the
      // diagram panning during zoom.
      const worldPtX = (el.scrollLeft + cursorX - VIEWPORT_PADDING) / oldZoom;
      const worldPtY = (el.scrollTop + cursorY - VIEWPORT_PADDING) / oldZoom;

      // Signal zooming start — pause animations
      if (!isZoomingRef.current) {
        isZoomingRef.current = true;
        setIsZoomingState.current(true);
      }

      // Reset idle timer — end zooming after 200ms idle
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        isZoomingRef.current = false;
        setIsZoomingState.current(false);
      }, 200);

      zoomRef.current = newZoom;

      // Synchronously update DOM — no React re-render needed for visual zoom.
      // Look up the sizer + wrapper by data attribute: the canvas root's
      // first child is the sr-only `CanvasLiveRegion`, not the sizer.
      const w = worldRef.current;
      const sizer = el.querySelector("[data-diagram-sizer]") as HTMLElement | null;
      const canvasWrapper = el.querySelector("[data-diagram-canvas-wrapper]") as HTMLElement | null;
      if (sizer) {
        sizer.style.width = `${VIEWPORT_PADDING * 2 + w.w * newZoom}px`;
        sizer.style.height = `${VIEWPORT_PADDING * 2 + w.h * newZoom}px`;
      }
      if (canvasWrapper) {
        canvasWrapper.style.transform = `scale(${newZoom})`;
      }

      // Keep the world point under the current cursor.
      el.scrollLeft = VIEWPORT_PADDING + worldPtX * newZoom - cursorX;
      el.scrollTop = VIEWPORT_PADDING + worldPtY * newZoom - cursorY;

      // Debounce React state sync — only update after 50ms of no zoom events
      // This prevents expensive re-renders during active pinching
      if (renderTimer) clearTimeout(renderTimer);
      renderTimer = setTimeout(() => {
        setZoomState.current(zoomRef.current);
      }, 50);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      if (idleTimer) clearTimeout(idleTimer);
      if (renderTimer) clearTimeout(renderTimer);
      if (panRaf !== null) cancelAnimationFrame(panRaf);
    };
  }, [canvasRef, worldRef]);

  return { getZoom, zoomRef, isZoomingRef, registerSetZoom, registerSetIsZooming, setZoomTo };
}
