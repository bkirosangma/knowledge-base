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
}

export interface LayerDef {
  id: string;
  title: string;
  bg: string;
  border: string;
}

export interface Connection {
  id: string;
  from: string;
  to: string;
  fromAnchor: AnchorId;
  toAnchor: AnchorId;
  color: string;
  label: string;
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
}

export interface DiagramData {
  title: string;
  layers: LayerDef[];
  nodes: SerializedNodeData[];
  connections: Connection[];
  layerManualSizes?: Record<string, { left?: number; width?: number; top?: number; height?: number }>;
}

export function getNodeHeight(w: number): number {
  return w === 110 || w === 130 ? 60 : 70;
}
