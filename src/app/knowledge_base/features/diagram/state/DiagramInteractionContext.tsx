"use client";

import React, { createContext, useContext, useMemo, useRef, useState } from "react";
import type { Selection } from "../types";
import type { ContextMenuTarget } from "../components/ContextMenu";
import type { AnchorId } from "../utils/anchors";

/**
 * KB-020: split interaction state behind multiple contexts so consumers
 * can subscribe to ONE slice (selection, hover, context-menu, anchor
 * popup, label editing) without re-rendering on changes to the others.
 *
 * Selector hooks: `useSelection`, `useHovered`, `useContextMenu`,
 * `useAnchorPopup`, `useEditingLabel`. Each yields { value, setter }
 * for that slice. The master provider `<DiagramInteractionProvider>`
 * nests them in a stable order so React's tree shape is identical
 * across renders.
 */

// ─── Selection ───────────────────────────────────────────────────────

export interface SelectionContextValue {
  selection: Selection;
  setSelection: React.Dispatch<React.SetStateAction<Selection>>;
}
const SelectionContext = createContext<SelectionContextValue | null>(null);

function SelectionProvider({ children }: { children: React.ReactNode }) {
  const [selection, setSelection] = useState<Selection>(null);
  const value = useMemo(() => ({ selection, setSelection }), [selection]);
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export function useSelection(): SelectionContextValue {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error("useSelection must be used within DiagramInteractionProvider");
  return ctx;
}

// ─── Hovered node ────────────────────────────────────────────────────

export interface HoveredNodeContextValue {
  hoveredNodeId: string | null;
  setHoveredNodeId: React.Dispatch<React.SetStateAction<string | null>>;
}
const HoveredNodeContext = createContext<HoveredNodeContextValue | null>(null);

function HoveredNodeProvider({ children }: { children: React.ReactNode }) {
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const value = useMemo(() => ({ hoveredNodeId, setHoveredNodeId }), [hoveredNodeId]);
  return <HoveredNodeContext.Provider value={value}>{children}</HoveredNodeContext.Provider>;
}

export function useHovered(): HoveredNodeContextValue {
  const ctx = useContext(HoveredNodeContext);
  if (!ctx) throw new Error("useHovered must be used within DiagramInteractionProvider");
  return ctx;
}

// ─── Context menu ────────────────────────────────────────────────────

export interface ContextMenuValue {
  clientX: number;
  clientY: number;
  canvasX: number;
  canvasY: number;
  target: ContextMenuTarget;
}
export interface ContextMenuContextValue {
  contextMenu: ContextMenuValue | null;
  setContextMenu: React.Dispatch<React.SetStateAction<ContextMenuValue | null>>;
}
const ContextMenuContext = createContext<ContextMenuContextValue | null>(null);

function ContextMenuProvider({ children }: { children: React.ReactNode }) {
  const [contextMenu, setContextMenu] = useState<ContextMenuValue | null>(null);
  const value = useMemo(() => ({ contextMenu, setContextMenu }), [contextMenu]);
  return <ContextMenuContext.Provider value={value}>{children}</ContextMenuContext.Provider>;
}

export function useContextMenu(): ContextMenuContextValue {
  const ctx = useContext(ContextMenuContext);
  if (!ctx) throw new Error("useContextMenu must be used within DiagramInteractionProvider");
  return ctx;
}

// ─── Anchor popup ────────────────────────────────────────────────────

export interface AnchorPopupValue {
  clientX: number;
  clientY: number;
  nodeId: string;
  anchorId: AnchorId;
  edge: "top" | "right" | "bottom" | "left";
}
export interface AnchorPopupContextValue {
  anchorPopup: AnchorPopupValue | null;
  setAnchorPopup: React.Dispatch<React.SetStateAction<AnchorPopupValue | null>>;
}
const AnchorPopupContext = createContext<AnchorPopupContextValue | null>(null);

function AnchorPopupProvider({ children }: { children: React.ReactNode }) {
  const [anchorPopup, setAnchorPopup] = useState<AnchorPopupValue | null>(null);
  const value = useMemo(() => ({ anchorPopup, setAnchorPopup }), [anchorPopup]);
  return <AnchorPopupContext.Provider value={value}>{children}</AnchorPopupContext.Provider>;
}

export function useAnchorPopup(): AnchorPopupContextValue {
  const ctx = useContext(AnchorPopupContext);
  if (!ctx) throw new Error("useAnchorPopup must be used within DiagramInteractionProvider");
  return ctx;
}

// ─── Inline label editing ────────────────────────────────────────────

export interface EditingLabelTarget {
  type: "node" | "layer" | "line";
  id: string;
}
export interface EditingLabelContextValue {
  editingLabel: EditingLabelTarget | null;
  setEditingLabel: React.Dispatch<React.SetStateAction<EditingLabelTarget | null>>;
  editingLabelValue: string;
  setEditingLabelValue: React.Dispatch<React.SetStateAction<string>>;
  /** Mutable ref capturing the pre-edit value so commit can compare. */
  editingLabelBeforeRef: React.MutableRefObject<string>;
}
const EditingLabelContext = createContext<EditingLabelContextValue | null>(null);

function EditingLabelProvider({ children }: { children: React.ReactNode }) {
  const [editingLabel, setEditingLabel] = useState<EditingLabelTarget | null>(null);
  const [editingLabelValue, setEditingLabelValue] = useState("");
  const editingLabelBeforeRef = useRef("");
  const value = useMemo(
    () => ({ editingLabel, setEditingLabel, editingLabelValue, setEditingLabelValue, editingLabelBeforeRef }),
    [editingLabel, editingLabelValue],
  );
  return <EditingLabelContext.Provider value={value}>{children}</EditingLabelContext.Provider>;
}

export function useEditingLabel(): EditingLabelContextValue {
  const ctx = useContext(EditingLabelContext);
  if (!ctx) throw new Error("useEditingLabel must be used within DiagramInteractionProvider");
  return ctx;
}

// ─── Master provider ─────────────────────────────────────────────────

export function DiagramInteractionProvider({ children }: { children: React.ReactNode }) {
  return (
    <SelectionProvider>
      <HoveredNodeProvider>
        <ContextMenuProvider>
          <AnchorPopupProvider>
            <EditingLabelProvider>{children}</EditingLabelProvider>
          </AnchorPopupProvider>
        </ContextMenuProvider>
      </HoveredNodeProvider>
    </SelectionProvider>
  );
}
