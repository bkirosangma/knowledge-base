import { useCallback, type MutableRefObject } from "react";
import type { NodeData, LayerDef, Connection } from "../types";

export function useLabelEditing(
  editingLabelBeforeRef: MutableRefObject<string>,
  setNodes: React.Dispatch<React.SetStateAction<NodeData[]>>,
  setLayerDefs: React.Dispatch<React.SetStateAction<LayerDef[]>>,
  setConnections: React.Dispatch<React.SetStateAction<Connection[]>>,
  setEditingLabel: React.Dispatch<React.SetStateAction<{ type: "node" | "layer" | "line"; id: string } | null>>,
  scheduleRecord: (description: string) => void,
) {
  const commitLabel = useCallback((editingLabel: { type: "node" | "layer" | "line"; id: string }, editingLabelValue: string) => {
    const v = editingLabelValue.trim();
    if (v && v !== editingLabelBeforeRef.current) {
      if (editingLabel.type === "node") {
        setNodes((prev) => prev.map((n) => n.id === editingLabel.id ? { ...n, label: v } : n));
      } else if (editingLabel.type === "layer") {
        setLayerDefs((prev) => prev.map((l) => l.id === editingLabel.id ? { ...l, title: v } : l));
      } else if (editingLabel.type === "line") {
        setConnections((prev) => prev.map((c) => c.id === editingLabel.id ? { ...c, label: v } : c));
      }
      scheduleRecord(`Edit ${editingLabel.type} label`);
    }
    setEditingLabel(null);
  }, [scheduleRecord]);

  return { commitLabel };
}
