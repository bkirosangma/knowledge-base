import { useEffect, useRef } from "react";
import { VIEWPORT_PADDING } from "./useCanvasCoords";

const VIEWPORT_KEY = "architecture-designer-viewport";

/**
 * Persists viewport scroll position and zoom to localStorage,
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

  // Save viewport on scroll (debounced)
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout>;
    const save = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          localStorage.setItem(VIEWPORT_KEY, JSON.stringify({
            scrollLeft: el.scrollLeft,
            scrollTop: el.scrollTop,
            zoom: zoomRef.current,
          }));
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
        localStorage.setItem(VIEWPORT_KEY, JSON.stringify({
          scrollLeft: el.scrollLeft,
          scrollTop: el.scrollTop,
          zoom,
        }));
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
        if (vp.zoom != null) { zoomRef.current = vp.zoom; setZoom(vp.zoom); }
        requestAnimationFrame(() => {
          if (vp.scrollLeft != null) el.scrollLeft = vp.scrollLeft;
          if (vp.scrollTop != null) el.scrollTop = vp.scrollTop;
        });
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
