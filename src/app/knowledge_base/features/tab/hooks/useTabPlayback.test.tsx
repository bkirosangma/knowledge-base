import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { TabSession } from "../../../domain/tabEngine";
import { useTabPlayback } from "./useTabPlayback";

function makeSession() {
  return {
    play: vi.fn(),
    pause: vi.fn(),
    stop: vi.fn(),
    seek: vi.fn(),
    setTempoFactor: vi.fn(),
    setLoop: vi.fn(),
  };
}

describe("useTabPlayback", () => {
  let session: TabSession;

  beforeEach(() => {
    session = makeSession() as unknown as TabSession;
  });

  it("play / pause / stop delegate to the session", () => {
    const { result } = renderHook(() =>
      useTabPlayback({ session, isAudioReady: true, playerStatus: "paused", currentTick: 0 }),
    );
    act(() => result.current.play());
    expect(session.play).toHaveBeenCalledTimes(1);
    act(() => result.current.pause());
    expect(session.pause).toHaveBeenCalledTimes(1);
    act(() => result.current.stop());
    expect(session.stop).toHaveBeenCalledTimes(1);
  });

  it("toggle() flips between play and pause based on playerStatus", () => {
    const { result, rerender } = renderHook(
      ({ status }: { status: "playing" | "paused" }) =>
        useTabPlayback({ session, isAudioReady: true, playerStatus: status, currentTick: 0 }),
      { initialProps: { status: "paused" } },
    );
    act(() => result.current.toggle());
    expect(session.play).toHaveBeenCalledTimes(1);
    expect(session.pause).not.toHaveBeenCalled();

    rerender({ status: "playing" });
    act(() => result.current.toggle());
    expect(session.pause).toHaveBeenCalledTimes(1);
  });

  it("play() is a no-op (and sets audioBlocked=true) when isAudioReady is false", () => {
    const { result } = renderHook(() =>
      useTabPlayback({ session, isAudioReady: false, playerStatus: "paused", currentTick: 0 }),
    );
    act(() => result.current.play());
    expect(session.play).not.toHaveBeenCalled();
    expect(result.current.audioBlocked).toBe(true);
  });

  it("seek delegates to session.seek with the supplied beat", () => {
    const { result } = renderHook(() =>
      useTabPlayback({ session, isAudioReady: true, playerStatus: "paused", currentTick: 0 }),
    );
    act(() => result.current.seek(960));
    expect(session.seek).toHaveBeenCalledWith(960);
  });

  it("setTempoFactor delegates to session.setTempoFactor", () => {
    const { result } = renderHook(() =>
      useTabPlayback({ session, isAudioReady: true, playerStatus: "paused", currentTick: 0 }),
    );
    act(() => result.current.setTempoFactor(1.25));
    expect(session.setTempoFactor).toHaveBeenCalledWith(1.25);
  });

  it("setLoop delegates to session.setLoop", () => {
    const { result } = renderHook(() =>
      useTabPlayback({ session, isAudioReady: true, playerStatus: "paused", currentTick: 0 }),
    );
    act(() => result.current.setLoop({ start: 0, end: 1920 }));
    expect(session.setLoop).toHaveBeenCalledWith({ start: 0, end: 1920 });
    act(() => result.current.setLoop(null));
    expect(session.setLoop).toHaveBeenCalledWith(null);
  });

  it("calls become no-ops when session is null (pre-mount)", () => {
    const { result } = renderHook(() =>
      useTabPlayback({ session: null, isAudioReady: false, playerStatus: "paused", currentTick: 0 }),
    );
    act(() => result.current.play());
    act(() => result.current.pause());
    act(() => result.current.stop());
    act(() => result.current.seek(100));
    act(() => result.current.setTempoFactor(1));
    act(() => result.current.setLoop(null));
    // Nothing to assert about a `null` session — the test is that nothing throws.
  });
});
