"use client";

import { createContext, useContext, useState, useCallback, useMemo } from "react";
import type { ReactNode } from "react";

export interface DiagramFooterInfo {
  kind: "diagram";
  world: { w: number; h: number };
  patches: number;
  zoom: number;
}

export type FooterInfo = DiagramFooterInfo;

interface FooterContextValue {
  leftInfo: FooterInfo | null;
  rightInfo: FooterInfo | null;
  setLeftInfo: (info: FooterInfo | null) => void;
  setRightInfo: (info: FooterInfo | null) => void;
}

const FooterContext = createContext<FooterContextValue | null>(null);

export function useFooterContext(): FooterContextValue {
  const ctx = useContext(FooterContext);
  if (!ctx) throw new Error("useFooterContext must be used within FooterProvider");
  return ctx;
}

export function FooterProvider({ children }: { children: ReactNode }) {
  const [leftInfo, setLeftInfoState] = useState<FooterInfo | null>(null);
  const [rightInfo, setRightInfoState] = useState<FooterInfo | null>(null);

  const setLeftInfo = useCallback((info: FooterInfo | null) => setLeftInfoState(info), []);
  const setRightInfo = useCallback((info: FooterInfo | null) => setRightInfoState(info), []);

  const value = useMemo<FooterContextValue>(
    () => ({ leftInfo, rightInfo, setLeftInfo, setRightInfo }),
    [leftInfo, rightInfo, setLeftInfo, setRightInfo],
  );

  return <FooterContext.Provider value={value}>{children}</FooterContext.Provider>;
}
