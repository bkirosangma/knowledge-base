"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import SplitPane from "../shared/components/SplitPane";
import { useToolbarContext } from "./ToolbarContext";
import type { PaneType, FocusedPane } from "./ToolbarContext";

export interface PaneEntry {
  filePath: string;
  fileType: PaneType;
}

interface PaneManagerProps {
  /** Pane state from usePaneManager() — the shell owns the single instance */
  leftPane: PaneEntry | null;
  rightPane: PaneEntry | null;
  isSplit: boolean;
  focusedSide: "left" | "right";
  setFocusedSide: (side: "left" | "right") => void;
  /** Render function for a pane — receives pane entry, focus state, and side */
  renderPane: (entry: PaneEntry, focused: boolean, side: "left" | "right") => React.ReactNode;
  /** Fallback when no file is open */
  emptyState: React.ReactNode;
}

export function usePaneManager() {
  const [leftPane, setLeftPane] = useState<PaneEntry | null>(null);
  const [rightPane, setRightPane] = useState<PaneEntry | null>(null);
  const [focusedSide, setFocusedSide] = useState<"left" | "right">("left");

  const [lastClosedPane, setLastClosedPane] = useState<PaneEntry | null>(null);
  const isSplit = rightPane !== null;

  const openFile = useCallback((filePath: string, fileType: PaneType) => {
    const entry: PaneEntry = { filePath, fileType };
    if (!isSplit) {
      setLeftPane(entry);
    } else if (focusedSide === "right") {
      setRightPane(entry);
    } else {
      setLeftPane(entry);
    }
  }, [isSplit, focusedSide]);

  const enterSplit = useCallback((filePath: string, fileType: PaneType) => {
    const entry: PaneEntry = { filePath, fileType };
    setRightPane(entry);
    setFocusedSide("right");
  }, []);

  const exitSplit = useCallback(() => {
    // Remember the unfocused pane so it can be restored on next split
    const closedEntry = focusedSide === "right" ? leftPane : rightPane;
    setLastClosedPane(closedEntry);
    // Keep the focused pane
    if (focusedSide === "right" && rightPane) {
      setLeftPane(rightPane);
    }
    setRightPane(null);
    setFocusedSide("left");
  }, [focusedSide, leftPane, rightPane]);

  const restoreLayout = useCallback((
    left: PaneEntry | null,
    right: PaneEntry | null,
    focused: "left" | "right",
  ) => {
    setLeftPane(left);
    setRightPane(right);
    setFocusedSide(right ? focused : "left");
  }, []);

  const closeFocusedPane = useCallback(() => {
    if (!isSplit) {
      setLeftPane(null);
    } else if (focusedSide === "right") {
      setRightPane(null);
      setFocusedSide("left");
    } else {
      setLeftPane(rightPane);
      setRightPane(null);
      setFocusedSide("left");
    }
  }, [isSplit, focusedSide, rightPane]);

  const focusedPane = useMemo<FocusedPane>(
    () => (isSplit ? focusedSide : "single"),
    [isSplit, focusedSide],
  );

  const activeEntry = useMemo(
    () => (focusedSide === "right" && rightPane ? rightPane : leftPane),
    [focusedSide, rightPane, leftPane],
  );

  return {
    leftPane,
    rightPane,
    isSplit,
    focusedSide,
    focusedPane,
    activeEntry,
    openFile,
    enterSplit,
    exitSplit,
    closeFocusedPane,
    restoreLayout,
    lastClosedPane,
    setLastClosedPane,
    setFocusedSide,
  };
}

export default function PaneManager({
  leftPane,
  rightPane,
  isSplit,
  focusedSide,
  setFocusedSide,
  renderPane,
  emptyState,
}: PaneManagerProps) {
  const { setLeftPaneType, setRightPaneType, setFocusedPane } = useToolbarContext();

  // Sync pane types into toolbar context
  useEffect(() => {
    setLeftPaneType(leftPane?.fileType ?? null);
  }, [leftPane?.fileType, setLeftPaneType]);

  useEffect(() => {
    setRightPaneType(rightPane?.fileType ?? null);
  }, [rightPane?.fileType, setRightPaneType]);

  useEffect(() => {
    setFocusedPane(isSplit ? focusedSide : "single");
  }, [isSplit, focusedSide, setFocusedPane]);

  if (!leftPane) return <>{emptyState}</>;

  if (!isSplit) {
    return <div className="flex-1 h-full min-w-0 overflow-hidden">{renderPane(leftPane, true, "left")}</div>;
  }

  return (
    <SplitPane
      storageKey="knowledge-base-split"
      left={
        <div
          className={`h-full ${focusedSide === "left" ? "ring-2 ring-blue-400 ring-inset" : ""}`}
          onMouseDown={() => setFocusedSide("left")}
        >
          {renderPane(leftPane, focusedSide === "left", "left")}
        </div>
      }
      right={
        <div
          className={`h-full ${focusedSide === "right" ? "ring-2 ring-blue-400 ring-inset" : ""}`}
          onMouseDown={() => setFocusedSide("right")}
        >
          {rightPane && renderPane(rightPane, focusedSide === "right", "right")}
        </div>
      }
    />
  );
}
