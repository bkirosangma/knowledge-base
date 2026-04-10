import { useEffect, useRef } from "react";
import { VIEWPORT_PADDING } from "./useCanvasCoords";
import { scopedKey } from "../utils/directoryScope";

const VIEWPORT_KEY = "architecture-designer-viewport";

/**
 * Persists viewport center (in canvas coordinates) and zoom to localStorage,
 * scoped per directory and per file, and restores it on mount or file switch.
 */
export function useViewportPersistence(
  canvasRef: React.RefObject<HTMLDivElement | null>,
  worldRef: React.RefObject<{ x: number; y: number; w: number; h: number }>,
  zoomRef: React.RefObject<number>,
  zoom: number,
  setZoom: (z: number) => void,
  activeFile: string | null,
) {
  const hasScrolledToCenter = useRef(false);
  const activeFileRef = useRef(activeFile);

  /** Build the full scoped key including file path */
  const getKey = () => {
    const base = scopedKey(VIEWPORT_KEY);
    return activeFileRef.current ? `${base}:${activeFileRef.current}` : base;
  };

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

  // Reset scroll-to-center flag when file changes so viewport restores per-file
  useEffect(() => {
    if (activeFileRef.current !== activeFile) {
      // Save current viewport for old file before switching
      try {
        const center = getViewportCenter();
        if (center) {
          localStorage.setItem(getKey(), JSON.stringify({
            cx: center.cx,
            cy: center.cy,
            zoom: zoomRef.current,
          }));
        }
      } catch { /* ignore */ }

      activeFileRef.current = activeFile;
      hasScrolledToCenter.current = false;
    }
  }, [activeFile]);

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
            localStorage.setItem(getKey(), JSON.stringify({
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
          localStorage.setItem(getKey(), JSON.stringify({
            cx: center.cx,
            cy: center.cy,
            zoom,
          }));
        }
      } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(timer);
  }, [zoom]);

  // Restore scroll position from localStorage, or center on first render / file switch
  useEffect(() => {
    if (hasScrolledToCenter.current) return;
    const el = canvasRef.current;
    const world = worldRef.current;
    if (!el || world.w === 0) return;
    try {
      const raw = localStorage.getItem(getKey());
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
  }, [worldRef.current.w, worldRef.current.h, activeFile]);

  return { VIEWPORT_KEY };
}
