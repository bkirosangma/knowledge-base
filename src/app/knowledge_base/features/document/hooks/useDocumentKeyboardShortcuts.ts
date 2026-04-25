import { useEffect, useMemo, useRef } from "react";
import { useRegisterCommands } from "../../../shared/context/CommandRegistry";

interface Options {
  onUndo: () => void;
  onRedo: () => void;
  readOnly: boolean;
  onToggleReadOnly?: () => void;
}

export function useDocumentKeyboardShortcuts({ onUndo, onRedo, readOnly, onToggleReadOnly }: Options): void {
  const onUndoRef = useRef(onUndo);
  const onRedoRef = useRef(onRedo);
  const readOnlyRef = useRef(readOnly);
  onUndoRef.current = onUndo;
  onRedoRef.current = onRedo;
  readOnlyRef.current = readOnly;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
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
        shortcut: "⌘⇧R",
        run: () => onToggleReadOnly(),
      },
    ];
  // Re-memoize only when onToggleReadOnly identity changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onToggleReadOnly]);

  useRegisterCommands(documentCmds);
}
