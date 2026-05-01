"use client";

import { useEffect, useMemo } from "react";
import type { LayerDef, NodeData, Selection } from "../types";
import type { EditingLabelTarget } from "../state/DiagramInteractionContext";

const NUDGE_PX = 8;
const NUDGE_PX_FINE = 1;

interface UseCanvasKeyboardNavInput {
  canvasRef: React.RefObject<HTMLDivElement | null>;
  nodes: NodeData[];
  layers: LayerDef[];
  selection: Selection;
  setSelection: (s: Selection) => void;
  setNodes: (updater: (prev: NodeData[]) => NodeData[]) => void;
  scheduleRecord: (description: string) => void;
  setEditingLabel: (v: EditingLabelTarget | null) => void;
  setEditingLabelValue: (v: string) => void;
  editingLabelBeforeRef: React.MutableRefObject<string>;
  readOnly: boolean;
  editingLabel: EditingLabelTarget | null;
}

/**
 * KB-030 — keyboard navigation for the diagram canvas. Closes WCAG 2.1.1.
 *
 *   Tab / Shift+Tab  walk nodes in reading order (layer.zIndex → y → x), wrap
 *   ArrowUp/Down/Left/Right
 *                    nudge the selected node by 8 px (1 px with Shift)
 *   Enter            open inline label edit on the selected node
 *
 * The keydown listener binds to the canvas root, so keys only fire while
 * the canvas is focused — that's how we cohabit with `useKeyboardShortcuts`,
 * which lives at document level and owns Escape / Delete / Cmd-Z / E /
 * Cmd-Shift-R / Cmd-G regardless of focus.
 *
 * Click-to-select also works for arrow / Enter follow-up: a capture-phase
 * mousedown listener focuses the canvas root before React processes the
 * event, so Element's `e.preventDefault()` doesn't strip focus away.
 */
export function useCanvasKeyboardNav({
  canvasRef,
  nodes,
  layers,
  selection,
  setSelection,
  setNodes,
  scheduleRecord,
  setEditingLabel,
  setEditingLabelValue,
  editingLabelBeforeRef,
  readOnly,
  editingLabel,
}: UseCanvasKeyboardNavInput) {
  // Reading-order sort: layer.zIndex (= layer index in the array — earlier
  // means lower z) → y → x. Stable across renders unless any of the keys
  // changes, so the Tab walk doesn't jitter on unrelated re-renders.
  const orderedNodes = useMemo(() => {
    const layerZ = new Map(layers.map((l, i) => [l.id, i]));
    return [...nodes].sort((a, b) => {
      const za = layerZ.get(a.layer) ?? 0;
      const zb = layerZ.get(b.layer) ?? 0;
      if (za !== zb) return za - zb;
      if (a.y !== b.y) return a.y - b.y;
      return a.x - b.x;
    });
  }, [nodes, layers]);

  // Capture-phase mousedown → focus the canvas. Runs before React event
  // dispatch, so a child's `e.preventDefault()` (Element.tsx) doesn't
  // strip focus from the root.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const focusOnMouseDown = () => {
      if (document.activeElement !== el) el.focus({ preventScroll: true });
    };
    el.addEventListener("mousedown", focusOnMouseDown, true);
    return () => el.removeEventListener("mousedown", focusOnMouseDown, true);
  }, [canvasRef]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const onKeyDown = (e: KeyboardEvent) => {
      // Inline label edit owns the keys while open.
      if (editingLabel) return;

      if (e.key === "Tab") {
        if (orderedNodes.length === 0) return;
        e.preventDefault();
        const dir = e.shiftKey ? -1 : 1;
        const currentIdx =
          selection?.type === "node"
            ? orderedNodes.findIndex((n) => n.id === selection.id)
            : -1;
        const nextIdx =
          currentIdx === -1
            ? dir > 0
              ? 0
              : orderedNodes.length - 1
            : (currentIdx + dir + orderedNodes.length) % orderedNodes.length;
        setSelection({ type: "node", id: orderedNodes[nextIdx].id });
        return;
      }

      // Arrow / Enter only apply to a node selection.
      if (selection?.type !== "node") return;
      const node = orderedNodes.find((n) => n.id === selection.id);
      if (!node) return;

      if (
        e.key === "ArrowUp" ||
        e.key === "ArrowDown" ||
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight"
      ) {
        if (readOnly) return;
        e.preventDefault();
        const step = e.shiftKey ? NUDGE_PX_FINE : NUDGE_PX;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        setNodes((prev) =>
          prev.map((n) => (n.id === node.id ? { ...n, x: n.x + dx, y: n.y + dy } : n)),
        );
        scheduleRecord(node.shape === "condition" ? "Move conditional" : "Move element");
        return;
      }

      if (e.key === "Enter") {
        if (readOnly) return;
        e.preventDefault();
        setEditingLabel({ type: "node", id: node.id });
        setEditingLabelValue(node.label);
        editingLabelBeforeRef.current = node.label;
      }
    };

    el.addEventListener("keydown", onKeyDown);
    return () => el.removeEventListener("keydown", onKeyDown);
  }, [
    canvasRef,
    orderedNodes,
    selection,
    setSelection,
    setNodes,
    scheduleRecord,
    setEditingLabel,
    setEditingLabelValue,
    editingLabelBeforeRef,
    readOnly,
    editingLabel,
  ]);
}
