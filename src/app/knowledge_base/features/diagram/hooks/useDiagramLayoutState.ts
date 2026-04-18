"use client";

import { useCallback, useState } from "react";

/**
 * DiagramView's toolbar and panel visibility flags.
 *
 * - `isLive` / `showLabels` / `showMinimap`: ephemeral toolbar toggles.
 * - `historyCollapsed`: whether the left-side history panel is folded.
 * - `propertiesCollapsed`: whether the right-side properties panel is folded;
 *   persisted to localStorage under the key `"properties-collapsed"` so it
 *   survives refresh.
 */
export interface DiagramLayoutState {
  isLive: boolean;
  showLabels: boolean;
  showMinimap: boolean;
  historyCollapsed: boolean;
  propertiesCollapsed: boolean;
}

export interface DiagramLayoutActions {
  setIsLive: (v: boolean | ((prev: boolean) => boolean)) => void;
  setShowLabels: (v: boolean | ((prev: boolean) => boolean)) => void;
  setShowMinimap: (v: boolean | ((prev: boolean) => boolean)) => void;
  setHistoryCollapsed: (v: boolean | ((prev: boolean) => boolean)) => void;
  /** Toggle + persist to localStorage. */
  toggleProperties: () => void;
}

const PROPERTIES_COLLAPSED_KEY = "properties-collapsed";

export function useDiagramLayoutState(): {
  state: DiagramLayoutState;
  actions: DiagramLayoutActions;
} {
  const [isLive, setIsLive] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [showMinimap, setShowMinimap] = useState(true);
  const [historyCollapsed, setHistoryCollapsed] = useState(true);
  const [propertiesCollapsed, setPropertiesCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(PROPERTIES_COLLAPSED_KEY) === "true";
  });
  const toggleProperties = useCallback(() => {
    setPropertiesCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem(PROPERTIES_COLLAPSED_KEY, String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  return {
    state: { isLive, showLabels, showMinimap, historyCollapsed, propertiesCollapsed },
    actions: { setIsLive, setShowLabels, setShowMinimap, setHistoryCollapsed, toggleProperties },
  };
}
