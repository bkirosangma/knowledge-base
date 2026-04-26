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
    opts?: { isDashed?: boolean; skipConnectedCheck?: boolean; immediateStart?: boolean },
  ) => void;
}

/**
 * Thin hook that maps persistent edge-handle drag gestures to the existing
 * `useLineDrag` anchor-drag machinery.  The N/E/S/W directions map to the
 * midpoint anchors (top-1, right-1, bottom-1, left-1).
 *
 * `startEdgeHandleDrag` should be called from the `onMouseDown` of each
 * rendered edge handle.  It delegates to `handleAnchorDragStart` with:
 *   - `isDashed: true`  — signals that an empty-canvas drop should open the
 *     AnchorPopupMenu (regular anchor drags cancel on empty drop; edge-handle
 *     drags open the radial menu)
 *   - `skipConnectedCheck: true` — edge handles always create a new connection
 *     even if a connection already uses that anchor
 *   - `immediateStart: true` — edge handles are persistent grab targets so the
 *     drag starts without the 150ms hold delay used for anchor dots
 */
export function useDragToConnect({ readOnly, handleAnchorDragStart }: UseDragToConnectOptions) {
  const startEdgeHandleDrag = useCallback(
    (nodeId: string, direction: EdgeHandleDirection, e: React.MouseEvent) => {
      if (readOnly) return;
      e.stopPropagation();
      e.preventDefault();
      const anchorId = DIRECTION_TO_ANCHOR[direction];
      handleAnchorDragStart(nodeId, anchorId, e, { isDashed: true, skipConnectedCheck: true, immediateStart: true });
    },
    [readOnly, handleAnchorDragStart],
  );

  return { startEdgeHandleDrag };
}
