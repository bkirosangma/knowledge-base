import type { ComponentType } from "react";
import type { AnchorId } from "./utils/anchors";

/** Stable identity + logical placement within a diagram. */
export interface NodeIdentity {
  id: string;
  label: string;
  sub?: string;
  type?: string;
  layer: string;
}

/** Spatial placement. `w` is width; height is derived from shape. */
export interface NodeGeometry {
  x: number;
  y: number;
  w: number;
  rotation?: number;
}

/** Visual attributes. */
export interface NodeAppearance {
  icon: ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  borderColor?: string;
  bgColor?: string;
  textColor?: string;
}

/**
 * Shape-specific fields. Condition nodes require `conditionOutCount` and
 * `conditionSize` so downstream code can rely on their presence without a
 * default. `?: never` on the rect branch keeps unnarrowed reads
 * (`n.conditionOutCount ?? 2`) legal without forcing every consumer to
 * narrow via `n.shape === "condition"`.
 */
export type NodeShape =
  | { shape?: 'rect'; conditionOutCount?: never; conditionSize?: never }
  | {
      shape: 'condition';
      conditionOutCount: number;
      conditionSize: 1 | 2 | 3 | 4 | 5;
    };

/** Full runtime node. Composes via intersection; consumers should prefer the
 *  narrowest slice that satisfies their needs. */
export type NodeData = NodeIdentity & NodeGeometry & NodeAppearance & NodeShape;

export interface LayerDef {
  id: string;
  title: string;
  bg: string;
  border: string;
  textColor?: string;
}

export interface FlowDef {
  id: string;
  name: string;
  connectionIds: string[];
  category?: string;
}

export interface Connection {
  id: string;
  from: string;
  to: string;
  fromAnchor: AnchorId;
  toAnchor: AnchorId;
  color: string;
  label: string;
  biDirectional?: boolean;
  flowDuration?: number;
  /** Position of the label along the path (0 = start, 1 = end, default 0.5 = midpoint) */
  labelPosition?: number;
  connectionType?: 'synchronous' | 'asynchronous';
  waypoints?: { x: number; y: number }[];
}

export interface SerializedNodeData {
  id: string;
  label: string;
  sub?: string;
  icon: string;
  x: number;
  y: number;
  w: number;
  layer: string;
  type?: string;
  shape?: 'rect' | 'condition';
  conditionOutCount?: number;
  conditionSize?: 1 | 2 | 3 | 4 | 5;
  rotation?: number;
  borderColor?: string;
  bgColor?: string;
  textColor?: string;
}

export type Selection =
  | { type: 'node'; id: string }
  | { type: 'layer'; id: string }
  | { type: 'line'; id: string }
  | { type: 'multi-node'; ids: string[]; layer: string }
  | { type: 'multi-layer'; ids: string[] }
  | { type: 'multi-line'; ids: string[] }
  | { type: 'flow'; id: string }
  | null;

export type LineCurveAlgorithm = "orthogonal" | "bezier" | "straight";

export interface RegionBounds {
  id: string;
  title: string;
  bg: string;
  border: string;
  textColor?: string;
  left: number;
  width: number;
  top: number;
  height: number;
  empty: boolean;
}
