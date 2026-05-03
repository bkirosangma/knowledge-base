"use client";

import { useReadOnlyState } from "../../../shared/hooks/useReadOnlyState";

/**
 * Composes the per-file Read Mode state with the pane-level `readOnly` prop.
 *
 * `paneReadOnly` comes from `TabPaneContext` and is forced `true` on mobile
 * (per TAB-012). When the pane is forced read-only, the per-file toggle is
 * irrelevant — `effectiveReadOnly` is always `true`. On desktop, the pane
 * is editable and the per-file toggle decides.
 *
 * Returns the toggle so callers can wire it to a "Edit / Read" button.
 */
export function useTabEditMode(
  filePath: string | null,
  paneReadOnly: boolean,
): { effectiveReadOnly: boolean; perFileReadOnly: boolean; toggleReadOnly: () => void } {
  const { readOnly: perFileReadOnly, toggleReadOnly } = useReadOnlyState(
    filePath,
    "tab-read-only",
  );
  return {
    effectiveReadOnly: paneReadOnly || perFileReadOnly,
    perFileReadOnly,
    toggleReadOnly,
  };
}
