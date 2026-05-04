"use client";
import type { ReactElement } from "react";
import type { TabMetadata } from "../../../domain/tabEngine";
import type { CursorLocation } from "./hooks/useTabCursor";

// NOTE: For long tabs (e.g. 200 beats × 6 strings = 1200 buttons) this renders
// one DOM node per cell. Acceptable for TAB-008 (single track, typical tabs <100
// beats). If profiling shows layout cost, virtualize with a windowed approach
// keyed on the visible beat range.

const DEFAULT_CELL_WIDTH = 32;
const DEFAULT_CELL_HEIGHT = 18;

export interface TabEditorCanvasOverlayProps {
  metadata: TabMetadata | null;
  cursor: CursorLocation | null;
  setCursor: (loc: CursorLocation) => void;
  cellWidth?: number;
  cellHeight?: number;
  trackIndex?: number;
}

export function TabEditorCanvasOverlay({
  metadata,
  cursor,
  setCursor,
  cellWidth = DEFAULT_CELL_WIDTH,
  cellHeight = DEFAULT_CELL_HEIGHT,
  trackIndex = 0,
}: TabEditorCanvasOverlayProps): ReactElement {
  if (!metadata) {
    return (
      <div
        data-testid="tab-editor-overlay"
        className="absolute inset-0"
        style={{ pointerEvents: "none" }}
      />
    );
  }

  const beats = metadata.totalBeats;
  const strings = metadata.tracks[trackIndex]?.tuning.length ?? 6;
  const showHighlight = cursor !== null && cursor.trackIndex === trackIndex;

  const cells: ReactElement[] = [];
  for (let beat = 0; beat < beats; beat++) {
    for (let string = 1; string <= strings; string++) {
      cells.push(
        <button
          key={`${beat}-${string}`}
          type="button"
          data-testid={`tab-editor-cursor-target-${beat}-${string}`}
          aria-label={`Edit beat ${beat}, string ${string}`}
          className="absolute opacity-0 cursor-pointer"
          style={{
            left: beat * cellWidth,
            top: (string - 1) * cellHeight,
            width: cellWidth,
            height: cellHeight,
            pointerEvents: "auto",
          }}
          onClick={() => setCursor({ trackIndex, voiceIndex: 0, beat, string })}
        />,
      );
    }
  }

  return (
    <div
      data-testid="tab-editor-overlay"
      className="absolute inset-0"
      style={{ pointerEvents: "none" }}
    >
      {showHighlight && (
        <div
          data-testid="tab-editor-cursor-highlight"
          className="absolute bg-cyan-200/30 ring-2 ring-cyan-500 pointer-events-none"
          style={{
            left: cursor.beat * cellWidth,
            top: (cursor.string - 1) * cellHeight,
            width: cellWidth,
            height: cellHeight,
          }}
        />
      )}
      {cells}
    </div>
  );
}
