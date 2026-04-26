"use client";

import { createContext, useContext, useState, useCallback, useMemo } from "react";
import type { ReactNode } from "react";

export type PaneType = "diagram" | "document" | "graph" | "graphify";

/** Sentinel filePath used for the virtual graph pane (no on-disk file). */
export const GRAPH_SENTINEL = "__graph__";
export const GRAPHIFY_SENTINEL = "__graphify__";
export type FocusedPane = "left" | "right" | "single";

export interface ToolbarState {
  /** What type of content is in the active pane(s) */
  activePaneType: PaneType | "mixed";
  /** Which pane has focus */
  focusedPane: FocusedPane;
  /** Number of open panes */
  paneCount: 1 | 2;
}

interface ToolbarContextValue extends ToolbarState {
  setLeftPaneType: (type: PaneType | null) => void;
  setRightPaneType: (type: PaneType | null) => void;
  setFocusedPane: (pane: FocusedPane) => void;
}

const ToolbarContext = createContext<ToolbarContextValue | null>(null);

export function useToolbarContext(): ToolbarContextValue {
  const ctx = useContext(ToolbarContext);
  if (!ctx) throw new Error("useToolbarContext must be used within ToolbarProvider");
  return ctx;
}

export function ToolbarProvider({ children }: { children: ReactNode }) {
  const [leftType, setLeftType] = useState<PaneType | null>(null);
  const [rightType, setRightType] = useState<PaneType | null>(null);
  const [focused, setFocused] = useState<FocusedPane>("single");

  const setLeftPaneType = useCallback((type: PaneType | null) => setLeftType(type), []);
  const setRightPaneType = useCallback((type: PaneType | null) => setRightType(type), []);
  const setFocusedPane = useCallback((pane: FocusedPane) => setFocused(pane), []);

  const value = useMemo<ToolbarContextValue>(() => {
    const paneCount: 1 | 2 = rightType ? 2 : 1;
    let activePaneType: PaneType | "mixed";

    if (paneCount === 1) {
      activePaneType = leftType ?? "diagram";
    } else if (leftType === rightType) {
      activePaneType = leftType ?? "diagram";
    } else {
      // Mixed: use the focused pane's type
      activePaneType = focused === "right" ? (rightType ?? "diagram") : (leftType ?? "diagram");
    }

    return {
      activePaneType,
      focusedPane: paneCount === 1 ? "single" : focused,
      paneCount,
      setLeftPaneType,
      setRightPaneType,
      setFocusedPane,
    };
  }, [leftType, rightType, focused, setLeftPaneType, setRightPaneType, setFocusedPane]);

  return <ToolbarContext.Provider value={value}>{children}</ToolbarContext.Provider>;
}
