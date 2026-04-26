import { useEffect, useMemo, useRef } from "react";
import { useRegisterCommands } from "../../../shared/context/CommandRegistry";

function isEditingInput(): boolean {
  const tag = (document.activeElement as HTMLElement)?.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || !!(document.activeElement as HTMLElement)?.isContentEditable;
}

interface Options {
  onUndo: () => void;
  onRedo: () => void;
  readOnly: boolean;
  onToggleReadOnly?: () => void;
  /** Called at most once per session when the user presses a key in read mode. */
  onFirstKeystrokeInReadMode?: () => void;
}

export function useDocumentKeyboardShortcuts({ onUndo, onRedo, readOnly, onToggleReadOnly, onFirstKeystrokeInReadMode }: Options): void {
  const onUndoRef = useRef(onUndo);
  const onRedoRef = useRef(onRedo);
  const readOnlyRef = useRef(readOnly);
  const onToggleReadOnlyRef = useRef(onToggleReadOnly);
  const onFirstKeystrokeRef = useRef(onFirstKeystrokeInReadMode);
  onUndoRef.current = onUndo;
  onRedoRef.current = onRedo;
  readOnlyRef.current = readOnly;
  onToggleReadOnlyRef.current = onToggleReadOnly;
  onFirstKeystrokeRef.current = onFirstKeystrokeInReadMode;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // E key: toggle read/edit mode (works both in and out of read mode,
      // but NOT when focus is in a contenteditable/input — which means it
      // correctly does nothing when the Tiptap editor is focused in edit mode).
      if ((e.key === "e" || e.key === "E") && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (isEditingInput()) return;
        e.preventDefault();
        onToggleReadOnlyRef.current?.();
        return;
      }

      // ⌘⇧R: toggle read/edit mode (works in both modes).
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "r" || e.key === "R")) {
        if (isEditingInput()) return;
        e.preventDefault();
        onToggleReadOnlyRef.current?.();
        return;
      }

      // First-keystroke toast: fire once per session when user presses any
      // printable key while in read mode (excluding modifiers and E itself).
      if (readOnlyRef.current && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const isModifierOnly = ["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(e.key);
        const isToggleKey = e.key === "e" || e.key === "E";
        if (!isModifierOnly && !isToggleKey && !isEditingInput()) {
          onFirstKeystrokeRef.current?.();
        }
      }

      // Undo/redo: only in edit mode.
      if (readOnlyRef.current) return;
      if (!(e.metaKey || e.ctrlKey) || e.key !== "z") return;
      e.preventDefault();
      if (e.shiftKey) {
        onRedoRef.current();
      } else {
        onUndoRef.current();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ─── Register commands into the global palette ───
  const documentCmds = useMemo(() => {
    if (!onToggleReadOnly) return [];
    return [
      {
        id: "document.toggle-read-only",
        title: "Toggle Read / Edit Mode",
        group: "Document",
        shortcut: "E / ⌘⇧R",
        run: () => onToggleReadOnly(),
      },
    ];
  // Re-memoize only when onToggleReadOnly identity changes.
  }, [onToggleReadOnly]);

  useRegisterCommands(documentCmds);
}
