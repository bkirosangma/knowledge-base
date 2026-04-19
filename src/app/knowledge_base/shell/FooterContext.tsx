"use client";

import { createContext, useContext, useState, useCallback, useMemo } from "react";
import type { ReactNode } from "react";

/**
 * Diagram-produced footer bridge — the typed payload DiagramView pushes into
 * `FooterContext` so the Footer can render world size / patch count / zoom.
 * Peer of `HeaderBridge` + `ExplorerBridge` (DiagramView.tsx §72): the three
 * together are the ISP-sliced shell surface DiagramView exposes. Unlike the
 * header/explorer slices — which travel through the `onDiagramBridge`
 * callback — the footer slice is plumbed through React context because
 * `useFooterContext` is available from any diagram pane side without
 * threading a ref up to `knowledgeBase.tsx`.
 */
export interface DiagramFooterBridge {
  kind: "diagram";
  world: { w: number; h: number };
  patches: number;
  zoom: number;
}

/** Union of every footer-bridge variant. One shape today; broadens when a
 *  non-diagram pane starts pushing its own footer info. */
export type FooterBridge = DiagramFooterBridge;

interface FooterContextValue {
  leftInfo: FooterBridge | null;
  rightInfo: FooterBridge | null;
  setLeftInfo: (info: FooterBridge | null) => void;
  setRightInfo: (info: FooterBridge | null) => void;
}

const FooterContext = createContext<FooterContextValue | null>(null);

export function useFooterContext(): FooterContextValue {
  const ctx = useContext(FooterContext);
  if (!ctx) throw new Error("useFooterContext must be used within FooterProvider");
  return ctx;
}

export function FooterProvider({ children }: { children: ReactNode }) {
  const [leftInfo, setLeftInfoState] = useState<FooterBridge | null>(null);
  const [rightInfo, setRightInfoState] = useState<FooterBridge | null>(null);

  const setLeftInfo = useCallback((info: FooterBridge | null) => setLeftInfoState(info), []);
  const setRightInfo = useCallback((info: FooterBridge | null) => setRightInfoState(info), []);

  const value = useMemo<FooterContextValue>(
    () => ({ leftInfo, rightInfo, setLeftInfo, setRightInfo }),
    [leftInfo, rightInfo, setLeftInfo, setRightInfo],
  );

  return <FooterContext.Provider value={value}>{children}</FooterContext.Provider>;
}
