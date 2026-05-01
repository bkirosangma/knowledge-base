"use client";

import { useEffect, useRef } from "react";
import type { NodeData, Selection } from "../types";

interface UseDiagramFileLoadingInput {
  activeFile: string | null;
  nodes: NodeData[];
  searchTarget?: { nodeId: string };
  handleLoadFile: (fileName: string) => Promise<void>;
  setSelection: (s: Selection) => void;
  scrollToRect: (rect: { x: number; y: number; w: number; h: number }) => void;
  getNodeDimensions: (n: NodeData) => { w: number; h: number };
}

/**
 * Two correlated lifecycle effects:
 *
 *  1. Auto-load the diagram whenever `activeFile` changes (mount,
 *     restore-on-refresh, pane switch). Uses a ref-trampoline so the
 *     effect doesn't re-fire when `handleLoadFile`'s identity changes.
 *
 *  2. Consume `searchTarget` (KB-010c). When the shell threads a
 *     search hit through `PaneEntry.searchTarget`, find the node, select
 *     it, and centre the viewport on it. Single-fire keyed by
 *     `<filePath>::<nodeId>` so re-renders with the same target don't
 *     re-trigger.
 */
export function useDiagramFileLoading({
  activeFile,
  nodes,
  searchTarget,
  handleLoadFile,
  setSelection,
  scrollToRect,
  getNodeDimensions,
}: UseDiagramFileLoadingInput) {
  const handleLoadFileRef = useRef(handleLoadFile);
  handleLoadFileRef.current = handleLoadFile;
  const prevActiveFileRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevActiveFileRef.current;
    prevActiveFileRef.current = activeFile;
    if (activeFile && activeFile !== prev) {
      handleLoadFileRef.current(activeFile);
    }
  }, [activeFile]);

  const consumedSearchTargetRef = useRef<string | null>(null);
  useEffect(() => {
    if (!searchTarget || !activeFile || nodes.length === 0) return;
    const key = `${activeFile}::${searchTarget.nodeId}`;
    if (consumedSearchTargetRef.current === key) return;
    consumedSearchTargetRef.current = key;
    const node = nodes.find((n) => n.id === searchTarget.nodeId);
    if (!node) return;
    setSelection({ type: "node", id: node.id });
    const dims = getNodeDimensions(node);
    scrollToRect({ x: node.x - dims.w / 2, y: node.y - dims.h / 2, w: dims.w, h: dims.h });
  }, [searchTarget, activeFile, nodes, scrollToRect, getNodeDimensions, setSelection]);
}
