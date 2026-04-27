// Re-export diagram types
export type {
  NodeData,
  SerializedNodeData,
  LayerDef,
  Connection,
  FlowDef,
  LineCurveAlgorithm,
  Selection,
  RegionBounds,
} from "../../features/diagram/types";

// Re-export document types for backward compatibility
export type {
  DocumentMeta,
  LinkIndex,
  LinkIndexEntry,
  BacklinkEntry,
} from "../../features/document/types";

// Re-export getNodeHeight for backward compatibility
export { getNodeHeight } from "../../features/diagram/utils/geometry";

// --- Shared types (owned by this file) ---

import type { LayerDef, SerializedNodeData, Connection, LineCurveAlgorithm, FlowDef } from "../../features/diagram/types";
import type { DocumentMeta } from "../../features/document/types";

export interface DiagramData {
  title: string;
  layers: LayerDef[];
  nodes: SerializedNodeData[];
  connections: Connection[];
  layerManualSizes?: Record<string, { left?: number; width?: number; top?: number; height?: number }>;
  lineCurve?: LineCurveAlgorithm;
  flows?: FlowDef[];
  documents?: DocumentMeta[];
}

export type ViewMode = 'diagram' | 'split' | 'document';

export interface VaultConfig {
  version: string;
  name: string;
  created: string;
  lastOpened: string;
  /**
   * Persisted theme preference. Optional — when missing, the app falls
   * back to the OS-level `prefers-color-scheme` query at startup. Set by
   * `useTheme.setTheme` when the user explicitly toggles. Phase 3 PR 1
   * (2026-04-26).
   */
  theme?: "light" | "dark";
  /**
   * Cached graph view state — persists node layout positions across
   * sessions so re-opening the graph view doesn't re-simulate the
   * force-directed layout from scratch. Written by `GraphCanvas` on
   * `onEngineStop` (debounced 500 ms). Phase 3 PR 2 (2026-04-26).
   */
  graph?: {
    layout?: Record<string, { x: number; y: number }>;
  };
  /** Graphify knowledge-graph physics tuning, persisted across sessions. */
  graphifyPhysics?: {
    linkDistance: number;
    linkStrength: number;
    repelForce: number;
    centerForce: number;
    hyperedgeForce: number;
  };
}

export type ExplorerFilter = 'all' | 'diagrams' | 'documents';
