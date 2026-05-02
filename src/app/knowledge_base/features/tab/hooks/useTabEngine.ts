"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TabMetadata, TabSession } from "../../../domain/tabEngine";
import { AlphaTabEngine } from "../../../infrastructure/alphaTabEngine";

export type TabEngineStatus =
  | "idle"
  | "mounting"
  | "ready"
  | "error"
  | "engine-load-error";

export interface UseTabEngine {
  status: TabEngineStatus;
  metadata: TabMetadata | null;
  error: Error | null;
  mountInto: (container: HTMLElement, alphatex: string) => Promise<void>;
  dispose: () => void;
}

/**
 * Owns the `AlphaTabEngine` instance + active `TabSession` for one
 * `TabView`. Surfaces engine status as React state so the view can swap
 * between loading / canvas / error chrome.
 */
export function useTabEngine(): UseTabEngine {
  const [status, setStatus] = useState<TabEngineStatus>("idle");
  const [metadata, setMetadata] = useState<TabMetadata | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const sessionRef = useRef<TabSession | null>(null);
  const unsubsRef = useRef<(() => void)[]>([]);

  const cleanup = useCallback(() => {
    unsubsRef.current.forEach((u) => u());
    unsubsRef.current = [];
    sessionRef.current?.dispose();
    sessionRef.current = null;
  }, []);

  const dispose = useCallback(() => {
    cleanup();
    setStatus("idle");
    setMetadata(null);
    setError(null);
  }, [cleanup]);

  const mountInto = useCallback(
    async (container: HTMLElement, alphatex: string) => {
      cleanup();
      setStatus("mounting");
      setError(null);
      let session: TabSession;
      try {
        session = await new AlphaTabEngine().mount(container, {
          initialSource: { kind: "alphatex", text: alphatex },
          readOnly: true,
        });
      } catch (e) {
        setError(e instanceof Error ? e : new Error(String(e)));
        setStatus("engine-load-error");
        return;
      }
      sessionRef.current = session;

      const offLoaded = session.on("loaded", (payload) => {
        if (payload.event !== "loaded") return;
        setMetadata(payload.metadata);
        setStatus("ready");
      });
      const offError = session.on("error", (payload) => {
        if (payload.event !== "error") return;
        setError(payload.error);
        setStatus("error");
      });
      unsubsRef.current = [offLoaded, offError];
    },
    [cleanup],
  );

  useEffect(() => () => cleanup(), [cleanup]);

  return { status, metadata, error, mountInto, dispose };
}
