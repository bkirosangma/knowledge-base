import type { ComponentType } from "react";
import type { AnchorId } from "./anchors";

export interface NodeData {
  id: string;
  label: string;
  sub?: string;
  icon: ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  x: number;
  y: number;
  w: number;
  layer: string;
  type?: string;
  shape?: 'rect' | 'condition';
  conditionOutCount?: number;
  conditionSize?: 1 | 2 | 3 | 4 | 5;
  rotation?: 0 | 90 | 180 | 270;
  borderColor?: string;
  bgColor?: string;
  textColor?: string;
}

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
  rotation?: 0 | 90 | 180 | 270;
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

export interface DiagramData {
  title: string;
  layers: LayerDef[];
  nodes: SerializedNodeData[];
  connections: Connection[];
  layerManualSizes?: Record<string, { left?: number; width?: number; top?: number; height?: number }>;
  lineCurve?: LineCurveAlgorithm;
  flows?: FlowDef[];
}

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

export { getNodeHeight } from "./geometry";
