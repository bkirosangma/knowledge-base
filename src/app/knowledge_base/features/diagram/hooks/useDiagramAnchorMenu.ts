"use client";

import { useCallback, useRef } from "react";
import { getAnchorEdge, type AnchorId } from "../utils/anchors";
import type { NodeData } from "../types";
import type { AnchorPopupValue } from "../state/DiagramInteractionContext";

interface UseDiagramAnchorMenuInput {
  nodes: NodeData[];
  readOnly: boolean;
  setAnchorPopup: (v: AnchorPopupValue | null) => void;
}

/**
 * Anchor popup hover/click choreography. Pre-KB-020 these were five
 * separate useCallbacks plus two refs inline in DiagramView. Each
 * handler keeps the same timer constants (100ms hover-open,
 * 200ms dismiss) so the UX is unchanged.
 */
export function useDiagramAnchorMenu({ nodes, readOnly, setAnchorPopup }: UseDiagramAnchorMenuInput) {
  const anchorHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anchorDismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onAnchorClick = useCallback(
    (nodeId: string, anchorId: AnchorId, clientX: number, clientY: number) => {
      if (readOnly) return;
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;
      if (node.shape === "condition" && anchorId === "cond-in") return;
      setAnchorPopup({ clientX, clientY, nodeId, anchorId, edge: getAnchorEdge(anchorId) });
    },
    [nodes, readOnly, setAnchorPopup],
  );

  const handleAnchorHover = useCallback(
    (nodeId: string, anchorId: AnchorId, clientX: number, clientY: number) => {
      if (readOnly) return;
      if (anchorDismissTimer.current) {
        clearTimeout(anchorDismissTimer.current);
        anchorDismissTimer.current = null;
      }
      if (anchorHoverTimer.current) clearTimeout(anchorHoverTimer.current);
      anchorHoverTimer.current = setTimeout(() => {
        const node = nodes.find((n) => n.id === nodeId);
        if (!node) return;
        if (node.shape === "condition" && anchorId === "cond-in") return;
        setAnchorPopup({ clientX, clientY, nodeId, anchorId, edge: getAnchorEdge(anchorId) });
      }, 100);
    },
    [nodes, readOnly, setAnchorPopup],
  );

  const handleAnchorHoverEnd = useCallback(() => {
    if (anchorHoverTimer.current) {
      clearTimeout(anchorHoverTimer.current);
      anchorHoverTimer.current = null;
    }
    anchorDismissTimer.current = setTimeout(() => setAnchorPopup(null), 200);
  }, [setAnchorPopup]);

  const handleAnchorMenuEnter = useCallback(() => {
    if (anchorDismissTimer.current) {
      clearTimeout(anchorDismissTimer.current);
      anchorDismissTimer.current = null;
    }
  }, []);

  const handleAnchorMenuLeave = useCallback(() => {
    anchorDismissTimer.current = setTimeout(() => setAnchorPopup(null), 200);
  }, [setAnchorPopup]);

  return {
    onAnchorClick,
    handleAnchorHover,
    handleAnchorHoverEnd,
    handleAnchorMenuEnter,
    handleAnchorMenuLeave,
  };
}
