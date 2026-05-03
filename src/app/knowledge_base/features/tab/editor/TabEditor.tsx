"use client";
import type { ReactElement } from "react";

/**
 * Editor chunk entry. Loaded via `next/dynamic({ ssr: false })` from `TabView`
 * only when `effectiveReadOnly === false`. T13-T17 fill in cursor / overlay /
 * keyboard handling + the techniques toolbar; this commit ships the skeleton
 * so the chunk-loading wiring is locked in.
 */
export interface TabEditorProps {
  filePath: string;
  // Future props (added in T13-T17): session, score, dispatch, etc.
}

export default function TabEditor({ filePath: _filePath }: TabEditorProps): ReactElement {
  return (
    <div data-testid="tab-editor" className="absolute inset-0 pointer-events-none">
      {/* T13-T17 fill this in: TabEditorCanvasOverlay, TabEditorToolbar, etc. */}
    </div>
  );
}
