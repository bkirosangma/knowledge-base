import { useEffect } from "react";
import type { Selection, NodeData } from "../types";
import { toggleItemInSelection } from "../utils/selectionUtils";
import type { PendingDeletion } from "./useDeletion";

interface KeyboardShortcutsConfig {
  cancelSelectionRect: () => void;
  setSelection: React.Dispatch<React.SetStateAction<Selection>>;
  setContextMenu: (v: null) => void;
  deleteSelection: (sel: NonNullable<Selection>) => PendingDeletion | null;
  setPendingDeletion: React.Dispatch<React.SetStateAction<PendingDeletion | null>>;
  handleCreateFlow: (ids: string[]) => void;
  handleUndo: () => void;
  handleRedo: () => void;
  selectionRef: React.RefObject<Selection>;
  pendingSelectionRef: React.RefObject<{ type: 'node' | 'layer' | 'line'; id: string; x: number; y: number } | null>;
  nodesRef: React.RefObject<NodeData[]>;
  readOnly: boolean;
  onToggleReadOnly: () => void;
}

function isEditingInput(): boolean {
  const tag = (document.activeElement as HTMLElement)?.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || !!(document.activeElement as HTMLElement)?.isContentEditable;
}

export function useKeyboardShortcuts({
  cancelSelectionRect,
  setSelection,
  setContextMenu,
  deleteSelection,
  setPendingDeletion,
  handleCreateFlow,
  handleUndo,
  handleRedo,
  selectionRef,
  pendingSelectionRef,
  nodesRef,
  readOnly,
  onToggleReadOnly,
}: KeyboardShortcutsConfig) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        cancelSelectionRect();
        setSelection(null);
        setContextMenu(null);
      }

      // Toggle Read Mode — works both on and off (Cmd/Ctrl+Shift+R).
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "r" || e.key === "R")) {
        if (isEditingInput()) return;
        e.preventDefault();
        onToggleReadOnly();
        return;
      }

      if ((e.key === "Delete" || e.key === "Backspace") && selectionRef.current) {
        if (isEditingInput()) return;
        if (readOnly) return;
        e.preventDefault();
        const pending = deleteSelection(selectionRef.current);
        if (pending) setPendingDeletion(pending);
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "g") {
        if (isEditingInput()) return;
        if (readOnly) return;
        e.preventDefault();
        const sel = selectionRef.current;
        if (sel?.type === "multi-line") handleCreateFlow(sel.ids);
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        if (isEditingInput()) return;
        if (readOnly) return;
        e.preventDefault();
        handleUndo();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && e.shiftKey) {
        if (isEditingInput()) return;
        if (readOnly) return;
        e.preventDefault();
        handleRedo();
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      const p = pendingSelectionRef.current;
      if (p) {
        const dx = e.clientX - p.x;
        const dy = e.clientY - p.y;
        if (dx * dx + dy * dy < 25) {
          if (e.metaKey || e.ctrlKey) {
            setSelection((prev) => toggleItemInSelection(prev, { type: p.type, id: p.id }, nodesRef.current));
          } else {
            setSelection({ type: p.type, id: p.id });
          }
        }
        pendingSelectionRef.current = null;
      }
    };

    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [cancelSelectionRect, handleUndo, handleRedo, deleteSelection, handleCreateFlow, setSelection, setContextMenu, setPendingDeletion, selectionRef, pendingSelectionRef, nodesRef, readOnly, onToggleReadOnly]);
}
