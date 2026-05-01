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

// ─── Shell bridge types ──────────────────────────────────────────────
//
// DiagramView publishes a bridge object back to the shell so the
// header / explorer tree / confirm popovers can hook into the same
// behaviour the diagram uses internally. Pre-KB-020 these were declared
// inline at the top of DiagramView.tsx; they live here now so the
// bridge hook (`useDiagramBridge`) and DiagramView don't need to
// duplicate the definitions.

import type React from "react";

export interface ConfirmAction {
  type: "delete-file" | "delete-folder" | "discard";
  path?: string;
  x: number;
  y: number;
}

/** Title + save/discard surface consumed by the Header. */
export interface HeaderBridge {
  isDirty: boolean;
  title: string;
  titleInputValue: string;
  setTitleInputValue: (v: string) => void;
  titleWidth: number | string;
  setTitleWidth: (w: number | string) => void;
  onTitleCommit: (value: string) => void;
  onSave: () => void;
  onDiscard: (e: React.MouseEvent) => void;
}

/** File-ops + confirm-popover surface consumed by the explorer tree and rename/delete wrappers. */
export interface ExplorerBridge {
  handleLoadFile: (fileName: string) => Promise<void>;
  handleCreateFile: (parentPath?: string) => Promise<string | null>;
  handleCreateFolder: (parentPath?: string) => Promise<string | null>;
  handleDeleteFile: (path: string, event: React.MouseEvent) => void;
  handleDeleteFolder: (path: string, event: React.MouseEvent) => void;
  handleRenameFile: (oldPath: string, newName: string) => Promise<void>;
  handleRenameFolder: (oldPath: string, newName: string) => Promise<void>;
  handleDuplicateFile: (path: string) => Promise<void>;
  handleMoveItem: (sourcePath: string, targetFolderPath: string) => Promise<void>;
  handleConfirmAction: () => Promise<void>;
  confirmAction: ConfirmAction | null;
  setConfirmAction: React.Dispatch<React.SetStateAction<ConfirmAction | null>>;
}

/**
 * Bridge object that DiagramView exposes to the shell.
 * Consumers that only need one slice should prefer `HeaderBridge` or
 * `ExplorerBridge` in their own parameter types.
 */
export type DiagramBridge = HeaderBridge & ExplorerBridge;
