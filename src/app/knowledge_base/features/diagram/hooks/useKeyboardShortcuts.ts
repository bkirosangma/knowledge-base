import { useEffect, useMemo } from "react";
import type { Selection, NodeData } from "../types";
import { toggleItemInSelection } from "../utils/selectionUtils";
import type { PendingDeletion } from "./useDeletion";
import { useRegisterCommands } from "../../../shared/context/CommandRegistry";

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
  /** Called at most once per session when the user presses a key in read mode. */
  onFirstKeystrokeInReadMode?: () => void;
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
  onFirstKeystrokeInReadMode,
}: KeyboardShortcutsConfig) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        cancelSelectionRect();
        setSelection(null);
        setContextMenu(null);
      }

      // E key: toggle read/edit mode (works both in and out of read mode).
      if ((e.key === "e" || e.key === "E") && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (isEditingInput()) return;
        e.preventDefault();
        onToggleReadOnly();
        return;
      }

      // Toggle Read Mode — works both on and off (Cmd/Ctrl+Shift+R).
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "r" || e.key === "R")) {
        if (isEditingInput()) return;
        e.preventDefault();
        onToggleReadOnly();
        return;
      }

      // First-keystroke toast: fire once per session when user presses any
      // printable key while in read mode (excluding modifiers and E/⌘⇧R itself).
      if (readOnly && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const isModifierOnly = ["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(e.key);
        const isToggleKey = e.key === "e" || e.key === "E";
        if (!isModifierOnly && !isToggleKey && !isEditingInput()) {
          onFirstKeystrokeInReadMode?.();
        }
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
    // Listen on `document` rather than `window` so the click → selection
    // commit fires reliably even when bubble propagation stops at the
    // document level. KB-020 split DiagramView's interaction state into
    // a nested context-provider tree; in that arrangement (with React 19)
    // mouseup events targeting a node element bubble up to `document`
    // but do not always continue to `window`. Document-level catches the
    // same events and is strictly more robust.
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [cancelSelectionRect, handleUndo, handleRedo, deleteSelection, handleCreateFlow, setSelection, setContextMenu, setPendingDeletion, selectionRef, pendingSelectionRef, nodesRef, readOnly, onToggleReadOnly, onFirstKeystrokeInReadMode]);

  // ─── Register commands into the global palette ───
  // Use refs so the memoized command array stays stable across selection changes.
  const diagramCmds = useMemo(() => [
    {
      id: "diagram.toggle-read-only",
      title: "Toggle Read / Edit Mode",
      group: "Diagram",
      shortcut: "E / ⌘⇧R",
      run: () => onToggleReadOnly(),
    },
    {
      id: "diagram.delete-selected",
      title: "Delete Selected",
      group: "Diagram",
      shortcut: "⌫",
      when: () => selectionRef.current != null,
      run: () => {
        if (readOnly) return;
        const sel = selectionRef.current;
        if (!sel) return;
        const pending = deleteSelection(sel);
        if (pending) setPendingDeletion(pending);
      },
    },
  // Commands reference stable refs and callbacks — re-memoize when
  // onToggleReadOnly, the deletion callbacks, or readOnly changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [onToggleReadOnly, deleteSelection, setPendingDeletion, readOnly]);

  useRegisterCommands(diagramCmds);
}
