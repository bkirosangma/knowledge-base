import { useCallback, type MutableRefObject } from "react";
import type { NodeData } from "../utils/types";

export function useCanvasInteraction(
  nodesRef: MutableRefObject<NodeData[]>,
  editingLabelBeforeRef: MutableRefObject<string>,
  setNodes: React.Dispatch<React.SetStateAction<NodeData[]>>,
  setHoveredNodeId: React.Dispatch<React.SetStateAction<string | null>>,
  setEditingLabel: React.Dispatch<React.SetStateAction<{ type: "node" | "layer" | "line"; id: string } | null>>,
  setEditingLabelValue: React.Dispatch<React.SetStateAction<string>>,
  pendingSelection: MutableRefObject<{ type: 'node' | 'layer' | 'line'; id: string; x: number; y: number } | null>,
  handleSelectionRectStart: (e: React.MouseEvent) => void,
  handleDragStart: (id: string, e: React.MouseEvent) => void,
  scheduleRecord: (description: string) => void,
) {
  const handleRotationDragStart = useCallback((nodeId: string, e: React.MouseEvent) => {
    const node = nodesRef.current.find((n) => n.id === nodeId);
    if (!node) return;
    const initialRotation = node.rotation ?? 0;

    const parentEl = (e.currentTarget.parentElement) as HTMLElement;
    const rect = parentEl.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const baseAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * 180 / Math.PI;

    let lastSnapped = initialRotation;
    const onMove = (ev: MouseEvent) => {
      const currentAngle = Math.atan2(ev.clientY - centerY, ev.clientX - centerX) * 180 / Math.PI;
      const delta = currentAngle - baseAngle;
      const raw = initialRotation + delta;
      const normalized = ((raw % 360) + 360) % 360;
      const nearest90 = (Math.round(normalized / 90) * 90 % 360) as 0 | 90 | 180 | 270;
      const distTo90 = Math.abs(normalized - nearest90) <= 180 ? Math.abs(normalized - nearest90) : 360 - Math.abs(normalized - nearest90);
      if (distTo90 <= 15) {
        lastSnapped = nearest90;
      }
      setNodes((prev) => prev.map((n) => n.id === nodeId ? { ...n, rotation: lastSnapped as 0 | 90 | 180 | 270 } : n));
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      scheduleRecord("Rotate condition");
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [scheduleRecord]);

  const handleNodeDragStart = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (e.metaKey || e.ctrlKey) {
      pendingSelection.current = { type: 'node', id, x: e.clientX, y: e.clientY };
      handleSelectionRectStart(e);
      return;
    }
    pendingSelection.current = { type: 'node', id, x: e.clientX, y: e.clientY };
    handleDragStart(id, e);
  }, [handleSelectionRectStart, handleDragStart]);

  const handleNodeDoubleClick = useCallback((nodeId: string) => {
    const n = nodesRef.current.find((nd) => nd.id === nodeId);
    if (n) { setEditingLabel({ type: "node", id: nodeId }); setEditingLabelValue(n.label); editingLabelBeforeRef.current = n.label; }
  }, []);

  const handleNodeMouseEnter = useCallback((id: string) => setHoveredNodeId(id), []);
  const handleNodeMouseLeave = useCallback(() => setHoveredNodeId(null), []);

  return { handleRotationDragStart, handleNodeDragStart, handleNodeDoubleClick, handleNodeMouseEnter, handleNodeMouseLeave };
}
