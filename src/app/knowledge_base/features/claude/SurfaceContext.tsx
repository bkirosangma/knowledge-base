"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  getClaudeSurface,
  setClaudeSurface as persistSurface,
  type ClaudeSurface,
} from "../../infrastructure/settingsStore";

interface Value {
  surface: ClaudeSurface;
  /** Optimistic update + persists. */
  setSurface: (next: ClaudeSurface) => Promise<void>;
}

const SurfaceContext = createContext<Value | null>(null);

export function SurfaceProvider({ children }: { children: ReactNode }) {
  const [surface, setLocalSurface] = useState<ClaudeSurface>("terminal");

  useEffect(() => {
    void getClaudeSurface().then(setLocalSurface);
  }, []);

  const setSurface = useCallback(async (next: ClaudeSurface) => {
    setLocalSurface(next);
    await persistSurface(next);
  }, []);

  return (
    <SurfaceContext.Provider value={{ surface, setSurface }}>
      {children}
    </SurfaceContext.Provider>
  );
}

export function useSurface(): Value {
  const ctx = useContext(SurfaceContext);
  if (!ctx) throw new Error("useSurface must be used inside <SurfaceProvider>");
  return ctx;
}
