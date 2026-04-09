import { useEffect, useRef } from "react";
import { VIEWPORT_PADDING } from "./useCanvasCoords";

const VIEWPORT_KEY = "architecture-designer-viewport";

/**
 * Persists viewport center (in canvas coordinates) and zoom to localStorage,
 * and restores it on mount.
 */
export function useViewportPersistence(
  canvasRef: React.RefObject<HTMLDivElement | null>,
  worldRef: React.RefObject<{ x: number; y: number; w: number; h: number }>,
  zoomRef: React.RefObject<number>,
  zoom: number,
  setZoom: (z: number) => void,
) {
  const hasScrolledToCenter = useRef(false);

  /** Compute the canvas-space coordinate at the viewport center */
  const getViewportCenter = () => {
    const el = canvasRef.current;
    const world = worldRef.current;
    const z = zoomRef.current;
    if (!el) return null;
    const cx = (el.scrollLeft - VIEWPORT_PADDING + el.clientWidth / 2) / z + world.x;
    const cy = (el.scrollTop - VIEWPORT_PADDING + el.clientHeight / 2) / z + world.y;
    return { cx, cy };
  };

  /** Set scroll so that the given canvas-space point is at viewport center */
  const scrollToCenter = (cx: number, cy: number, z: number) => {
    const el = canvasRef.current;
    const world = worldRef.current;
    if (!el) return;
    el.scrollLeft = VIEWPORT_PADDING + (cx - world.x) * z - el.clientWidth / 2;
    el.scrollTop = VIEWPORT_PADDING + (cy - world.y) * z - el.clientHeight / 2;
  };

  // Save viewport on scroll (debounced)
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout>;
    const save = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          const center = getViewportCenter();
          if (center) {
            localStorage.setItem(VIEWPORT_KEY, JSON.stringify({
              cx: center.cx,
              cy: center.cy,
              zoom: zoomRef.current,
            }));
          }
        } catch { /* ignore */ }
      }, 300);
    };
    el.addEventListener("scroll", save, { passive: true });
    return () => { clearTimeout(timer); el.removeEventListener("scroll", save); };
  }, []);

  // Save viewport when zoom changes
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const timer = setTimeout(() => {
      try {
        const center = getViewportCenter();
        if (center) {
          localStorage.setItem(VIEWPORT_KEY, JSON.stringify({
            cx: center.cx,
            cy: center.cy,
            zoom,
          }));
        }
      } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(timer);
  }, [zoom]);

  // Restore scroll position from localStorage, or center on first render
  useEffect(() => {
    if (hasScrolledToCenter.current) return;
    const el = canvasRef.current;
    const world = worldRef.current;
    if (!el || world.w === 0) return;
    try {
      const raw = localStorage.getItem(VIEWPORT_KEY);
      if (raw) {
        const vp = JSON.parse(raw);
        const z = vp.zoom ?? zoom;
        if (vp.zoom != null) { zoomRef.current = z; setZoom(z); }
        if (vp.cx != null && vp.cy != null) {
          requestAnimationFrame(() => scrollToCenter(vp.cx, vp.cy, z));
        } else if (vp.scrollLeft != null && vp.scrollTop != null) {
          // Legacy: raw scroll values (migrate gracefully)
          requestAnimationFrame(() => {
            el.scrollLeft = vp.scrollLeft;
            el.scrollTop = vp.scrollTop;
          });
        }
        hasScrolledToCenter.current = true;
        return;
      }
    } catch { /* ignore */ }
    el.scrollLeft = VIEWPORT_PADDING + (world.w * zoom - el.clientWidth) / 2;
    el.scrollTop = VIEWPORT_PADDING + (world.h * zoom - el.clientHeight) / 2;
    hasScrolledToCenter.current = true;
  }, [worldRef.current.w, worldRef.current.h]);

  return { VIEWPORT_KEY };
}
