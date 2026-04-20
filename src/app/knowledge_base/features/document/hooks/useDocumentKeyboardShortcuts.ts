import { useEffect, useRef } from "react";

interface Options {
  onUndo: () => void;
  onRedo: () => void;
  readOnly: boolean;
}

export function useDocumentKeyboardShortcuts({ onUndo, onRedo, readOnly }: Options): void {
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
}
