"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { loadDefaults, type loadDiagramFromData } from "../../../shared/utils/persistence";
import type {
  Connection,
  FlowDef,
  LayerDef,
  LineCurveAlgorithm,
  NodeData,
} from "../types";

/**
 * The 6-field diagram document per the KB-020 spec:
 *   `doc = { title, layers, nodes, connections, lineCurve, flows }`
 *
 * `layerManualSizes` deliberately stays out of `doc` — it's owned by
 * `useLayerResize` (it pairs the resize handles with their persisted
 * dimensions). `measuredSizes` and `patches` are also outside `doc`
 * because they are layout/measurement concerns, not document content.
 */
export interface DiagramDoc {
  title: string;
  layers: LayerDef[];
  nodes: NodeData[];
  connections: Connection[];
  lineCurve: LineCurveAlgorithm;
  flows: FlowDef[];
}

type Updater<T> = T | ((prev: T) => T);

export interface DiagramDocDispatch {
  setTitle: (next: Updater<string>) => void;
  setLayers: (next: Updater<LayerDef[]>) => void;
  setNodes: (next: Updater<NodeData[]>) => void;
  setConnections: (next: Updater<Connection[]>) => void;
  setLineCurve: (next: Updater<LineCurveAlgorithm>) => void;
  setFlows: (next: Updater<FlowDef[]>) => void;
  /** Replace every doc field at once from a freshly loaded diagram. */
  loadDoc: (loaded: ReturnType<typeof loadDiagramFromData>) => void;
}

export type LayerManualSize = {
  left?: number;
  width?: number;
  top?: number;
  height?: number;
};

/**
 * The "tiny in-component store, not Redux" — bundles the canonical
 * document state into one hook with a slice-setter dispatch and a
 * single multi-slice `loadDoc` action used by load / undo-redo /
 * file-watcher reload.
 *
 * Behaviour-preserving extract: each underlying useState matches what
 * DiagramView held inline pre-KB-020, so order of state declarations
 * (and therefore React's render-time identity for setters) is identical.
 */
export function useDiagramDocument() {
  const defaults = useRef(loadDefaults());

  const [title, setTitle] = useState(defaults.current.title);
  const [layers, setLayers] = useState<LayerDef[]>(defaults.current.layers);
  const [nodes, setNodes] = useState<NodeData[]>(defaults.current.nodes);
  const [connections, setConnections] = useState<Connection[]>(defaults.current.connections);
  const [lineCurve, setLineCurve] = useState<LineCurveAlgorithm>(defaults.current.lineCurve);
  const [flows, setFlows] = useState<FlowDef[]>(defaults.current.flows);

  // Measured DOM sizes are document-adjacent (cleared on load) but not
  // part of the canonical doc.
  const [measuredSizes, setMeasuredSizes] = useState<Record<string, { w: number; h: number }>>({});

  const loadDoc = useCallback((loaded: ReturnType<typeof loadDiagramFromData>) => {
    setTitle(loaded.title);
    setLayers(loaded.layers);
    setNodes(loaded.nodes);
    setConnections(loaded.connections);
    setLineCurve(loaded.lineCurve);
    setFlows(loaded.flows);
  }, []);

  const dispatch = useMemo<DiagramDocDispatch>(
    () => ({ setTitle, setLayers, setNodes, setConnections, setLineCurve, setFlows, loadDoc }),
    [loadDoc],
  );

  const doc = useMemo<DiagramDoc>(
    () => ({ title, layers, nodes, connections, lineCurve, flows }),
    [title, layers, nodes, connections, lineCurve, flows],
  );

  return { doc, dispatch, defaults: defaults.current, measuredSizes, setMeasuredSizes };
}
