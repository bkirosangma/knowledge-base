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

    // Update DOM synchronously
    const sizer = el.firstElementChild as HTMLElement;
    if (sizer) {
      sizer.style.width = `${VIEWPORT_PADDING * 2 + w.w * newZoom}px`;
      sizer.style.height = `${VIEWPORT_PADDING * 2 + w.h * newZoom}px`;
      const canvasWrapper = sizer.firstElementChild as HTMLElement;
      if (canvasWrapper) {
        canvasWrapper.style.transform = `scale(${newZoom})`;
      }
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
    // TEMP probe counter (remove with the log below).
    let panProbeN = 0;

    const onWheel = (e: WheelEvent) => {
      // Prevent browser gestures (back/forward navigation, pull-to-refresh)
      // when scrolling would overscroll at boundaries
      const atLeft = el.scrollLeft <= 0;
      const atRight = el.scrollLeft >= el.scrollWidth - el.clientWidth;
      const atTop = el.scrollTop <= 0;
      const atBottom = el.scrollTop >= el.scrollHeight - el.clientHeight;
      if ((e.deltaX < 0 && atLeft) || (e.deltaX > 0 && atRight) ||
          (e.deltaY < 0 && atTop) || (e.deltaY > 0 && atBottom)) {
        e.preventDefault();
      }

      // Only zoom on pinch (ctrlKey) or meta+wheel
      if (!e.ctrlKey && !e.metaKey) {
        // TEMP: diagnose "diagonal trackpad pan only scrolls one axis".
        // Logs every non-ctrl wheel event so we can tell whether both
        // deltaX and deltaY arrive from the device for a diagonal swipe.
        // Remove once the diagonal-pan question is settled.
        panProbeN++;
        // eslint-disable-next-line no-console
        console.log(`[zoom-probe #${panProbeN}] pan dx=${e.deltaX.toFixed(2)} dy=${e.deltaY.toFixed(2)} mode=${e.deltaMode}`);
        // Inside the pinch window, treat stray non-ctrl wheel events as
        // part of the gesture and swallow them so the canvas doesn't pan.
        if (Date.now() - lastPinchAt < PINCH_WINDOW_MS) {
          e.preventDefault();
        }
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

      // Synchronously update DOM — no React re-render needed for visual zoom
      const w = worldRef.current;
      const sizer = el.firstElementChild as HTMLElement;
      if (sizer) {
        sizer.style.width = `${VIEWPORT_PADDING * 2 + w.w * newZoom}px`;
        sizer.style.height = `${VIEWPORT_PADDING * 2 + w.h * newZoom}px`;
        const canvasWrapper = sizer.firstElementChild as HTMLElement;
        if (canvasWrapper) {
          canvasWrapper.style.transform = `scale(${newZoom})`;
        }
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
    };
  }, [canvasRef, worldRef]);

  return { getZoom, zoomRef, isZoomingRef, registerSetZoom, registerSetIsZooming, setZoomTo };
}
