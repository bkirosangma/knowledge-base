import { useEffect, useRef } from "react";
import type { NodeData, LayerDef, Connection, LineCurveAlgorithm } from "../utils/types";
import { loadDiagram, saveDiagram } from "../utils/persistence";

/**
 * Hydrates diagram state from localStorage on mount, and auto-saves
 * changes with a debounce.
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
) {
  const hydratedRef = useRef(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem("architecture-designer-data")) {
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
    const timer = setTimeout(() => {
      saveDiagram(title, layerDefs, nodes, connections, layerManualSizes, lineCurve);
    }, 500);
    return () => clearTimeout(timer);
  }, [title, layerDefs, nodes, connections, layerManualSizes, lineCurve]);
}
