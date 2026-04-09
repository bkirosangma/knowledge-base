import { useCallback, useEffect } from "react";
import { VIEWPORT_PADDING } from "./useCanvasCoords";
import { MINIMAP_WIDTH, MINIMAP_MAX_HEIGHT } from "../components/Minimap";

export function useCanvasEffects(
  canvasRef: React.RefObject<HTMLDivElement | null>,
  worldRef: React.RefObject<{ x: number; y: number; w: number; h: number }>,
  zoomRef: React.RefObject<number>,
): { scrollToRect: (rect: { x: number; y: number; w: number; h: number }) => void } {

  const scrollToRect = useCallback((rect: { x: number; y: number; w: number; h: number }) => {
    const el = canvasRef.current;
    if (!el) return;
    const w = worldRef.current;
    const z = zoomRef.current;
    const pad = 20 * z;

    const compLeft = (rect.x - w.x) * z + VIEWPORT_PADDING - pad;
    const compRight = (rect.x + rect.w - w.x) * z + VIEWPORT_PADDING + pad;
    const compTop = (rect.y - w.y) * z + VIEWPORT_PADDING - pad;
    const compBottom = (rect.y + rect.h - w.y) * z + VIEWPORT_PADDING + pad;

    const vpW = el.clientWidth;
    const vpH = el.clientHeight;

    let targetSL = el.scrollLeft;
    let targetST = el.scrollTop;

    if (compRight - compLeft > vpW) {
      targetSL = compLeft;
    } else if (compLeft < el.scrollLeft) {
      targetSL = compLeft;
    } else if (compRight > el.scrollLeft + vpW) {
      targetSL = compRight - vpW;
    }

    if (compBottom - compTop > vpH) {
      targetST = compTop;
    } else if (compTop < el.scrollTop) {
      targetST = compTop;
    } else if (compBottom > el.scrollTop + vpH) {
      targetST = compBottom - vpH;
    }

    if (targetSL === el.scrollLeft && targetST === el.scrollTop) return;

    const startSL = el.scrollLeft;
    const startST = el.scrollTop;
    const startTime = performance.now();
    const duration = 100;

    const animate = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      const ease = t * (2 - t);
      el.scrollLeft = startSL + (targetSL - startSL) * ease;
      el.scrollTop = startST + (targetST - startST) * ease;
      if (t < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, []);

  // Prevent browser zoom (Ctrl/Cmd + scroll, Ctrl/Cmd + +/-/0)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "+" || e.key === "-" || e.key === "=" || e.key === "0")) {
        e.preventDefault();
      }
    };
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("wheel", onWheel);
    };
  }, []);

  // Clamp scroll bounds
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onScroll = () => {
      const w = worldRef.current;
      const z = zoomRef.current;
      const vpWidth = el.clientWidth;
      const vpHeight = el.clientHeight;

      // Ensure the minimap viewport indicator stays at least 2px visible
      const minimapScale = (w.w > 0 && w.h > 0)
        ? Math.min(MINIMAP_WIDTH / w.w, MINIMAP_MAX_HEIGHT / w.h)
        : 1;
      const minOverlap = 2 * z / minimapScale;

      const minSL = VIEWPORT_PADDING - vpWidth + minOverlap;
      const maxSL = VIEWPORT_PADDING + w.w * z - minOverlap;
      const minST = VIEWPORT_PADDING - vpHeight + minOverlap;
      const maxST = VIEWPORT_PADDING + w.h * z - minOverlap;

      if (el.scrollLeft < minSL) { el.scrollLeft = minSL; }
      if (el.scrollLeft > maxSL) { el.scrollLeft = maxSL; }
      if (el.scrollTop < minST) { el.scrollTop = minST; }
      if (el.scrollTop > maxST) { el.scrollTop = maxST; }
    };
    el.addEventListener("scroll", onScroll, { passive: false });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  return { scrollToRect };
}
