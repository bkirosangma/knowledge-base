import { useCallback, useRef } from "react";

export const VIEWPORT_PADDING = 2000;

export function useCanvasCoords(
  canvasRef: React.RefObject<HTMLDivElement | null>,
  zoomRef?: React.RefObject<number>,
) {
  const worldOffsetRef = useRef({ x: 0, y: 0 });

  const toCanvasCoords = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const wo = worldOffsetRef.current;
    const zoom = zoomRef?.current ?? 1;
    return {
      x: (clientX - rect.left + canvas.scrollLeft - VIEWPORT_PADDING) / zoom + wo.x,
      y: (clientY - rect.top + canvas.scrollTop - VIEWPORT_PADDING) / zoom + wo.y,
    };
  }, [canvasRef, zoomRef]);

  const setWorldOffset = useCallback((x: number, y: number) => {
    worldOffsetRef.current = { x, y };
  }, []);

  return { toCanvasCoords, setWorldOffset };
}
