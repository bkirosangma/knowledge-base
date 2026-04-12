import { useState, useCallback, useRef, useEffect } from "react";
import type { NodeData, Selection } from "../utils/types";
import { resolveRectangleSelection, toggleRectangleSelection } from "../utils/selectionUtils";

interface RegionBounds { id: string; left: number; top: number; width: number; height: number }

interface LineBounds { id: string; points: { x: number; y: number }[] }

interface UseSelectionRectOptions {
  toCanvasCoords: (clientX: number, clientY: number) => { x: number; y: number };
  isBlocked: boolean;
  nodes: NodeData[];
  regions: RegionBounds[];
  lines: LineBounds[];
  getNodeDimensions: (node: { id: string; w: number }) => { w: number; h: number };
  setSelection: React.Dispatch<React.SetStateAction<Selection>>;
  pendingSelectionRef: React.RefObject<{ type: 'node' | 'layer' | 'line'; id: string; x: number; y: number } | null>;
}

export interface SelectionRectState {
  x: number; y: number; w: number; h: number;
}

const DRAG_THRESHOLD = 25; // squared px

export function useSelectionRect({
  toCanvasCoords, isBlocked, nodes, regions, lines, getNodeDimensions, setSelection, pendingSelectionRef,
}: UseSelectionRectOptions) {
  const [selectionRect, setSelectionRect] = useState<SelectionRectState | null>(null);
  const startCanvas = useRef({ x: 0, y: 0 });
  const startClient = useRef({ x: 0, y: 0 });
  const active = useRef(false);
  const thresholdMet = useRef(false);
  // Keep latest values in refs so synchronous listeners always see fresh data
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const regionsRef = useRef(regions);
  regionsRef.current = regions;
  const linesRef = useRef(lines);
  linesRef.current = lines;

  const cleanup = useRef<(() => void) | null>(null);

  const teardown = useCallback(() => {
    cleanup.current?.();
    cleanup.current = null;
  }, []);

  const begin = useCallback((e: React.MouseEvent) => {
    if (isBlocked) return;
    teardown(); // clean up any prior listeners
    const canvas = toCanvasCoords(e.clientX, e.clientY);
    startCanvas.current = canvas;
    startClient.current = { x: e.clientX, y: e.clientY };
    active.current = true;
    thresholdMet.current = false;
    // Snapshot: was there a pending element/layer selection when we started?
    // If so, the global mouseup handler owns the click logic (toggle/select).
    const hadPendingSelection = !!pendingSelectionRef.current;
    // Clear selection immediately on mousedown when clicking empty canvas
    if (!hadPendingSelection) {
      setSelection(null);
    }
    const isToggle = e.metaKey || e.ctrlKey;
    // Snapshot selection at drag start so toggle computes against the original
    let selectionSnapshot: Selection = null;
    if (isToggle) {
      // Read current selection synchronously via a dummy updater
      setSelection((prev) => { selectionSnapshot = prev; return prev; });
    }

    const resolveRect = (ev: MouseEvent) => {
      const current = toCanvasCoords(ev.clientX, ev.clientY);
      const sx = startCanvas.current.x;
      const sy = startCanvas.current.y;
      const rect = {
        x: Math.min(sx, current.x),
        y: Math.min(sy, current.y),
        w: Math.abs(current.x - sx),
        h: Math.abs(current.y - sy),
      };
      setSelectionRect(rect);

      const rectResult = resolveRectangleSelection(rect, nodesRef.current, regionsRef.current, getNodeDimensions, linesRef.current);
      if (isToggle) {
        setSelection(toggleRectangleSelection(selectionSnapshot, rectResult, nodesRef.current));
      } else {
        setSelection(rectResult);
      }
    };

    const handleMouseMove = (ev: MouseEvent) => {
      if (!active.current) return;
      const dx = ev.clientX - startClient.current.x;
      const dy = ev.clientY - startClient.current.y;
      if (!thresholdMet.current) {
        if (dx * dx + dy * dy < DRAG_THRESHOLD) return;
        thresholdMet.current = true;
      }
      resolveRect(ev);
    };

    const handleMouseUp = (ev: MouseEvent) => {
      if (!active.current) return;
      active.current = false;
      teardown();

      if (!thresholdMet.current) {
        // Click (not drag). Selection was already cleared on mousedown.
        setSelectionRect(null);
        return;
      }

      // Final resolve + clean up rect visual
      resolveRect(ev);
      setSelectionRect(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    cleanup.current = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isBlocked, toCanvasCoords, getNodeDimensions, setSelection, pendingSelectionRef, teardown]);

  // Clean up listeners on unmount
  useEffect(() => teardown, [teardown]);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    begin(e);
  }, [begin]);

  const handleSelectionRectStart = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    begin(e);
  }, [begin]);

  const cancel = useCallback(() => {
    active.current = false;
    thresholdMet.current = false;
    teardown();
    setSelectionRect(null);
  }, [teardown]);

  return { selectionRect, handleCanvasMouseDown, handleSelectionRectStart, cancelSelectionRect: cancel };
}
