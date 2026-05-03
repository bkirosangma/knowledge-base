"use client";

import { useCallback, useState } from "react";
import type { BeatRange, TabSession } from "../../../domain/tabEngine";
import type { TabPlayerStatus } from "./useTabEngine";

export interface UseTabPlaybackInput {
  session: TabSession | null;
  isAudioReady: boolean;
  playerStatus: TabPlayerStatus;
  currentTick: number;
}

export interface UseTabPlayback {
  play: () => void;
  pause: () => void;
  stop: () => void;
  toggle: () => void;
  seek: (beat: number) => void;
  setTempoFactor: (factor: number) => void;
  setLoop: (range: BeatRange | null) => void;
  /** True if play() was attempted while isAudioReady was false. Toolbar
   *  surfaces this as an inline "Tap play to enable audio" hint. */
  audioBlocked: boolean;
  currentTick: number;
  playerStatus: TabPlayerStatus;
}

/**
 * Wraps a `TabSession` with the playback callables the toolbar needs.
 * No-ops gracefully when `session` is null (pre-mount or after engine
 * load failure) so the toolbar can render unconditionally.
 */
export function useTabPlayback(input: UseTabPlaybackInput): UseTabPlayback {
  const { session, isAudioReady, playerStatus, currentTick } = input;
  const [audioBlocked, setAudioBlocked] = useState(false);

  const play = useCallback(() => {
    if (!session) return;
    if (!isAudioReady) {
      setAudioBlocked(true);
      return;
    }
    setAudioBlocked(false);
    session.play();
  }, [session, isAudioReady]);

  const pause = useCallback(() => { session?.pause(); }, [session]);
  const stop = useCallback(() => { session?.stop(); }, [session]);
  const toggle = useCallback(() => {
    if (playerStatus === "playing") pause();
    else play();
  }, [playerStatus, play, pause]);
  const seek = useCallback((beat: number) => { session?.seek(beat); }, [session]);
  const setTempoFactor = useCallback((factor: number) => {
    session?.setTempoFactor(factor);
  }, [session]);
  const setLoop = useCallback((range: BeatRange | null) => {
    session?.setLoop(range);
  }, [session]);

  return { play, pause, stop, toggle, seek, setTempoFactor, setLoop, audioBlocked, currentTick, playerStatus };
}
