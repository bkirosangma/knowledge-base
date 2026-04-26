import { useCallback } from "react";
import type { AnchorId } from "../utils/anchors";

export type EdgeHandleDirection = "n" | "e" | "s" | "w";

/** Maps an edge-handle direction to the midpoint AnchorId on that side. */
export const DIRECTION_TO_ANCHOR: Record<EdgeHandleDirection, AnchorId> = {
  n: "top-1",
  e: "right-1",
  s: "bottom-1",
  w: "left-1",
};

interface UseDragToConnectOptions {
  readOnly: boolean;
  handleAnchorDragStart: (
    nodeId: string,
    anchorId: AnchorId,
    e: React.MouseEvent,
    opts?: { isDashed?: boolean; skipConnectedCheck?: boolean },
  ) => void;
}

/**
 * Thin hook that maps persistent edge-handle drag gestures to the existing
 * `useLineDrag` anchor-drag machinery.  The N/E/S/W directions map to the
 * midpoint anchors (top-1, right-1, bottom-1, left-1).
 *
 * `startEdgeHandleDrag` should be called from the `onMouseDown` of each
 * rendered edge handle.  It delegates to `handleAnchorDragStart` with:
 *   - `isDashed: true`  — so the preview line renders dashed
 *   - `skipConnectedCheck: true` — edge handles always create a new connection
 *     even if a connection already uses that anchor
 */
export function useDragToConnect({ readOnly, handleAnchorDragStart }: UseDragToConnectOptions) {
  const startEdgeHandleDrag = useCallback(
    (nodeId: string, direction: EdgeHandleDirection, e: React.MouseEvent) => {
      if (readOnly) return;
      e.stopPropagation();
      e.preventDefault();
      const anchorId = DIRECTION_TO_ANCHOR[direction];
      handleAnchorDragStart(nodeId, anchorId, e, { isDashed: true, skipConnectedCheck: true });
    },
    [readOnly, handleAnchorDragStart],
  );

  return { startEdgeHandleDrag };
}
