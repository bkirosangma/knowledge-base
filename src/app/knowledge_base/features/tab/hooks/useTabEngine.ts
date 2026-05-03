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

export type TabPlayerStatus = "playing" | "paused";

export interface UseTabEngine {
  status: TabEngineStatus;
  metadata: TabMetadata | null;
  error: Error | null;
  /** Cumulative midi-tick position from the latest "tick" event (0 until first tick). */
  currentTick: number;
  /** Reflects the engine's playback state — flips on "played" / "paused" events. */
  playerStatus: TabPlayerStatus;
  /** True after the engine emits "ready" (SoundFont loaded). Toolbar play stays disabled until then. */
  isAudioReady: boolean;
  /** Active session — null before mount, null after engine-load-error. Used by `useTabPlayback`. */
  session: TabSession | null;
  /** The latest score object from the session; null before the first "loaded" event. */
  score: unknown | null;
  mountInto: (container: HTMLElement, alphatex: string) => Promise<void>;
}

/**
 * Owns the `AlphaTabEngine` instance + active `TabSession` for one
 * `TabView`. Surfaces engine + player status as React state so the
 * view + toolbar can render correctly without subscribing to engine
 * events themselves.
 */
export function useTabEngine(): UseTabEngine {
  const [status, setStatus] = useState<TabEngineStatus>("idle");
  const [metadata, setMetadata] = useState<TabMetadata | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [currentTick, setCurrentTick] = useState(0);
  const [playerStatus, setPlayerStatus] = useState<TabPlayerStatus>("paused");
  const [isAudioReady, setIsAudioReady] = useState(false);
  const [session, setSession] = useState<TabSession | null>(null);
  const [score, setScore] = useState<unknown | null>(null);
  const sessionRef = useRef<TabSession | null>(null);
  const unsubsRef = useRef<(() => void)[]>([]);

  const cleanup = useCallback(() => {
    unsubsRef.current.forEach((u) => u());
    unsubsRef.current = [];
    sessionRef.current?.dispose();
    sessionRef.current = null;
    setSession(null);
    setScore(null);
    setIsAudioReady(false);
    setPlayerStatus("paused");
    setCurrentTick(0);
  }, []);

  const mountInto = useCallback(
    async (container: HTMLElement, alphatex: string) => {
      cleanup();
      setStatus("mounting");
      setError(null);
      let nextSession: TabSession;
      try {
        nextSession = await new AlphaTabEngine().mount(container, {
          initialSource: { kind: "alphatex", text: alphatex },
          readOnly: true,
        });
      } catch (e) {
        setError(e instanceof Error ? e : new Error(String(e)));
        setStatus("engine-load-error");
        return;
      }
      sessionRef.current = nextSession;
      setSession(nextSession);

      const offLoaded = nextSession.on("loaded", (payload) => {
        if (payload.event !== "loaded") return;
        setMetadata(payload.metadata);
        setScore(nextSession.score ?? null);
        setStatus("ready");
      });
      const offError = nextSession.on("error", (payload) => {
        if (payload.event !== "error") return;
        setError(payload.error);
        setStatus("error");
      });
      const offReady = nextSession.on("ready", (payload) => {
        if (payload.event !== "ready") return;
        setIsAudioReady(true);
      });
      const offPlayed = nextSession.on("played", (payload) => {
        if (payload.event !== "played") return;
        setPlayerStatus("playing");
      });
      const offPaused = nextSession.on("paused", (payload) => {
        if (payload.event !== "paused") return;
        setPlayerStatus("paused");
      });
      const offTick = nextSession.on("tick", (payload) => {
        if (payload.event !== "tick") return;
        setCurrentTick(payload.beat);
      });

      unsubsRef.current = [offLoaded, offError, offReady, offPlayed, offPaused, offTick];
    },
    [cleanup],
  );

  useEffect(() => () => cleanup(), [cleanup]);

  return { status, metadata, error, currentTick, playerStatus, isAudioReady, session, score, mountInto };
}
