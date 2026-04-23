// src/app/knowledge_base/shared/hooks/useDiagramHistory.ts
import { useCallback } from "react";
import { useHistoryFileSync } from "./useHistoryFileSync";
import type { HistoryFileSync } from "./useHistoryFileSync";
import type { LayerDef, Connection, SerializedNodeData, LineCurveAlgorithm, FlowDef } from "../utils/types";
import type { DocumentMeta } from "../../features/document/types";

export type { HistoryEntry } from "../utils/historyPersistence";

export interface DiagramSnapshot {
  title: string;
  layerDefs: LayerDef[];
  nodes: SerializedNodeData[];
  connections: Connection[];
  layerManualSizes: Record<string, { left?: number; width?: number; top?: number; height?: number }>;
  lineCurve: LineCurveAlgorithm;
  flows: FlowDef[];
  documents?: DocumentMeta[];
}

export interface DiagramHistory extends HistoryFileSync<DiagramSnapshot> {
  onSave(diagramJson: string): void;
}

export function useDiagramHistory(): DiagramHistory {
  const sync = useHistoryFileSync<DiagramSnapshot>();

  const onSave = useCallback((diagramJson: string) => {
    sync.onFileSave(diagramJson);
  }, [sync.onFileSave]);

  return { ...sync, onSave };
}
