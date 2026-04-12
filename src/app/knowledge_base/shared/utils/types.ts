// Re-export design types for backward compatibility
export type {
  NodeData,
  SerializedNodeData,
  LayerDef,
  Connection,
  FlowDef,
  LineCurveAlgorithm,
  Selection,
  RegionBounds,
} from "../../features/design/types";

// Re-export document types for backward compatibility
export type {
  DocumentMeta,
  LinkIndex,
  LinkIndexEntry,
  BacklinkEntry,
} from "../../features/document/types";

// Re-export getNodeHeight for backward compatibility
export { getNodeHeight } from "../../features/design/utils/geometry";

// --- Shared types (owned by this file) ---

import type { LayerDef, SerializedNodeData, Connection, LineCurveAlgorithm, FlowDef } from "../../features/design/types";
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
}

export type ExplorerFilter = 'all' | 'diagrams' | 'documents';
