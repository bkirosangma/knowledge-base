import { useEffect, useRef, useState, useCallback } from "react";
import type { NodeData, LayerDef, Connection, LineCurveAlgorithm } from "../utils/types";
import { loadDiagram, saveDiagram, saveDraft } from "../utils/persistence";
import { scopedKey } from "../utils/directoryScope";

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
  title: string,
  layerDefs: LayerDef[],
  nodes: NodeData[],
  connections: Connection[],
  layerManualSizes: Record<string, { left?: number; width?: number; top?: number; height?: number }>,
  lineCurve: LineCurveAlgorithm,
  activeFile: string | null,
  onDirtyChange?: (fileName: string, dirty: boolean) => void,
) {
  const hydratedRef = useRef(false);
  const snapshotRef = useRef<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const takeSnapshot = useCallback((
    t: string, l: LayerDef[], n: NodeData[], c: Connection[],
    lms: Record<string, { left?: number; width?: number; top?: number; height?: number }>,
    lc: LineCurveAlgorithm,
  ) => {
    // Lightweight fingerprint: JSON of the serializable parts
    return JSON.stringify({ title: t, layers: l.length, nodes: n.map(nd => ({ id: nd.id, x: nd.x, y: nd.y, label: nd.label, sub: nd.sub, w: nd.w, layer: nd.layer })), connections: c, layerManualSizes: lms, lineCurve: lc, layerDefs: l });
  }, []);

  // Set snapshot when a file is loaded
  const setLoadSnapshot = useCallback((
    t: string, l: LayerDef[], n: NodeData[], c: Connection[],
    lms: Record<string, { left?: number; width?: number; top?: number; height?: number }>,
    lc: LineCurveAlgorithm,
  ) => {
    snapshotRef.current = takeSnapshot(t, l, n, c, lms, lc);
    setIsDirty(false);
  }, [takeSnapshot]);

  // Hydrate from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem(scopedKey("architecture-designer-data"))) {
      const saved = loadDiagram();
      setTitle(saved.title);
      setLayerDefs(saved.layers);
      setNodes(saved.nodes);
      setConnections(saved.connections);
      setLayerManualSizes(saved.layerManualSizes);
      setLineCurve(saved.lineCurve);
    }
    hydratedRef.current = true;
  }, []);

  // Persist to localStorage (debounced, skip until hydrated)
  useEffect(() => {
    if (!hydratedRef.current) return;

    const currentSnap = takeSnapshot(title, layerDefs, nodes, connections, layerManualSizes, lineCurve);
    const dirty = snapshotRef.current !== null && currentSnap !== snapshotRef.current;
    setIsDirty(dirty);

    const timer = setTimeout(() => {
      if (activeFile) {
        // Only write draft if actually changed from disk version
        if (dirty) {
          saveDraft(activeFile, title, layerDefs, nodes, connections, layerManualSizes, lineCurve);
          onDirtyChange?.(activeFile, true);
        }
      } else {
        saveDiagram(title, layerDefs, nodes, connections, layerManualSizes, lineCurve);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [title, layerDefs, nodes, connections, layerManualSizes, lineCurve, activeFile, takeSnapshot, onDirtyChange]);

  return { isDirty, setLoadSnapshot };
}
