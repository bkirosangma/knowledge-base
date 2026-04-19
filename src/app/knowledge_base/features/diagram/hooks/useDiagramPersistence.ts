import { useEffect, useRef, useState, useCallback } from "react";
import type { NodeData, LayerDef, Connection, LineCurveAlgorithm, FlowDef } from "../types";
import { saveDraft } from "../../../shared/utils/persistence";
import { useShellErrors } from "../../../shell/ShellErrorContext";

/**
 * Hydrates diagram state from localStorage on mount, and auto-saves
 * changes with a debounce. When activeFile is set, saves to a per-file
 * draft key instead of the global key.
 */
export function useDiagramPersistence(
  setTitle: (t: string) => void,
  setLayerDefs: React.Dispatch<React.SetStateAction<LayerDef[]>>,
  setNodes: React.Dispatch<React.SetStateAction<NodeData[]>>,
  setConnections: React.Dispatch<React.SetStateAction<Connection[]>>,
  setLayerManualSizes: React.Dispatch<React.SetStateAction<Record<string, { left?: number; width?: number; top?: number; height?: number }>>>,
  setLineCurve: (alg: LineCurveAlgorithm) => void,
  setFlows: React.Dispatch<React.SetStateAction<FlowDef[]>>,
  title: string,
  layerDefs: LayerDef[],
  nodes: NodeData[],
  connections: Connection[],
  layerManualSizes: Record<string, { left?: number; width?: number; top?: number; height?: number }>,
  lineCurve: LineCurveAlgorithm,
  flows: FlowDef[],
  activeFile: string | null,
  onDirtyChange?: (fileName: string, dirty: boolean) => void,
) {
  const { reportError } = useShellErrors();
  const hydratedRef = useRef(false);
  const snapshotRef = useRef<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const takeSnapshot = useCallback((
    t: string, l: LayerDef[], n: NodeData[], c: Connection[],
    lms: Record<string, { left?: number; width?: number; top?: number; height?: number }>,
    lc: LineCurveAlgorithm,
    fl: FlowDef[],
  ) => {
    // Lightweight fingerprint: JSON of the serializable parts
    return JSON.stringify({ title: t, layers: l.length, nodes: n.map(nd => ({ id: nd.id, x: nd.x, y: nd.y, label: nd.label, sub: nd.sub, w: nd.w, layer: nd.layer })), connections: c, layerManualSizes: lms, lineCurve: lc, layerDefs: l, flows: fl });
  }, []);

  // Set snapshot when a file is loaded
  const setLoadSnapshot = useCallback((
    t: string, l: LayerDef[], n: NodeData[], c: Connection[],
    lms: Record<string, { left?: number; width?: number; top?: number; height?: number }>,
    lc: LineCurveAlgorithm,
    fl: FlowDef[],
  ) => {
    snapshotRef.current = takeSnapshot(t, l, n, c, lms, lc, fl);
    setIsDirty(false);
  }, [takeSnapshot]);

  // Mark as hydrated on mount (diagram state comes from file open, not global localStorage)
  useEffect(() => {
    hydratedRef.current = true;
  }, []);

  // Persist to localStorage (debounced, skip until hydrated)
  useEffect(() => {
    if (!hydratedRef.current) return;

    const currentSnap = takeSnapshot(title, layerDefs, nodes, connections, layerManualSizes, lineCurve, flows);
    const dirty = snapshotRef.current !== null && currentSnap !== snapshotRef.current;
    setIsDirty(dirty);

    const timer = setTimeout(() => {
      if (activeFile) {
        // Only write draft if actually changed from disk version
        if (dirty) {
          try {
            saveDraft(activeFile, title, layerDefs, nodes, connections, layerManualSizes, lineCurve, flows);
            onDirtyChange?.(activeFile, true);
          } catch (e) {
            // Phase 5c (2026-04-19): quota-exceeded during autosave is a
            // real data-loss vector. Surface to the shell banner so the
            // user knows their pending edits are not being persisted.
            reportError(e, `Auto-saving draft of ${activeFile}`);
          }
        }
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [title, layerDefs, nodes, connections, layerManualSizes, lineCurve, flows, activeFile, takeSnapshot, onDirtyChange, reportError]);

  return { isDirty, setLoadSnapshot };
}
