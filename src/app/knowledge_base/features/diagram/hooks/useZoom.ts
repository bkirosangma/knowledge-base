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

    // Lock zoom anchor to the initial cursor position during a pinch gesture
    let anchorWorldPt: { x: number; y: number } | null = null;
    let anchorCursor: { x: number; y: number } | null = null;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let renderTimer: ReturnType<typeof setTimeout> | null = null;

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
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();

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

      // Lock anchor on first zoom event of the gesture
      if (!anchorWorldPt) {
        const contentX = el.scrollLeft + cursorX;
        const contentY = el.scrollTop + cursorY;
        anchorWorldPt = {
          x: (contentX - VIEWPORT_PADDING) / oldZoom,
          y: (contentY - VIEWPORT_PADDING) / oldZoom,
        };
        anchorCursor = { x: cursorX, y: cursorY };
      }

      // Signal zooming start — pause animations
      if (!isZoomingRef.current) {
        isZoomingRef.current = true;
        setIsZoomingState.current(true);
      }

      // Reset idle timer — release anchor and end zooming after 200ms idle
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        anchorWorldPt = null;
        anchorCursor = null;
        isZoomingRef.current = false;
        setIsZoomingState.current(false);
      }, 200);

      const worldPtX = anchorWorldPt.x;
      const worldPtY = anchorWorldPt.y;
      const lockCursorX = anchorCursor!.x;
      const lockCursorY = anchorCursor!.y;

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

      // Adjust scroll synchronously
      const newContentX = VIEWPORT_PADDING + worldPtX * newZoom;
      const newContentY = VIEWPORT_PADDING + worldPtY * newZoom;
      el.scrollLeft = newContentX - lockCursorX;
      el.scrollTop = newContentY - lockCursorY;

      // Debounce React state sync — only update after 100ms of no zoom events
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
