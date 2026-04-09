import { useState, useRef, useEffect, useCallback } from "react";

/**
 * Shared edit-state logic for inline-editable fields.
 * Manages editing/draft/error state, auto-focus, and commit/cancel.
 */
export function useEditableState(value: string) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(value); setEditing(false); setError(false); }, [value]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const cancel = useCallback(() => {
    setDraft(value);
    setEditing(false);
    setError(false);
  }, [value]);

  const showError = useCallback(() => {
    setError(true);
    inputRef.current?.focus();
  }, []);

  const clearError = useCallback(() => setError(false), []);

  const finishEditing = useCallback(() => {
    setError(false);
    setEditing(false);
  }, []);

  return {
    editing, setEditing,
    draft, setDraft,
    error, showError, clearError,
    inputRef,
    cancel, finishEditing,
  };
}
