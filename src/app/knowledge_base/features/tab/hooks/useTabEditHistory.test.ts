// src/app/knowledge_base/features/tab/hooks/useTabEditHistory.test.ts
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useTabEditHistory } from "./useTabEditHistory";

/** Convenience: build the deps object with overrideable mocks. */
function makeDeps(overrides?: { captureState?: () => object }) {
  return {
    dispatch: vi.fn(),
    captureState: vi.fn().mockReturnValue(overrides?.captureState?.() ?? { fret: 5 }),
  };
}

describe("useTabEditHistory", () => {
  it("apply dispatches the op and pushes a frame; canUndo becomes true", () => {
    const deps = makeDeps();
    const { result } = renderHook(() => useTabEditHistory(deps));

    act(() => {
      result.current.apply({ type: "set-fret", beat: 0, string: 6, fret: 12 });
    });

    expect(deps.dispatch).toHaveBeenCalledTimes(1);
    expect(deps.dispatch).toHaveBeenLastCalledWith({ type: "set-fret", beat: 0, string: 6, fret: 12 });
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it("undo dispatches the inverse op and canUndo becomes false", () => {
    const deps = makeDeps();
    deps.captureState.mockReturnValue({ fret: 5 });
    const { result } = renderHook(() => useTabEditHistory(deps));

    act(() => {
      result.current.apply({ type: "set-fret", beat: 0, string: 6, fret: 12 });
    });
    act(() => {
      result.current.undo();
    });

    expect(deps.dispatch).toHaveBeenLastCalledWith({ type: "set-fret", beat: 0, string: 6, fret: 5 });
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
  });

  it("redo re-dispatches the original op after undo", () => {
    const deps = makeDeps();
    deps.captureState.mockReturnValue({ fret: 5 });
    const { result } = renderHook(() => useTabEditHistory(deps));

    act(() => {
      result.current.apply({ type: "set-fret", beat: 0, string: 6, fret: 12 });
    });
    act(() => {
      result.current.undo();
    });
    act(() => {
      result.current.redo();
    });

    expect(deps.dispatch).toHaveBeenLastCalledWith({ type: "set-fret", beat: 0, string: 6, fret: 12 });
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it("apply clears the future stack", () => {
    const deps = makeDeps();
    deps.captureState.mockReturnValue({ fret: 5 });
    const { result } = renderHook(() => useTabEditHistory(deps));

    // apply → undo → apply again
    act(() => {
      result.current.apply({ type: "set-fret", beat: 0, string: 6, fret: 12 });
    });
    act(() => {
      result.current.undo();
    });
    expect(result.current.canRedo).toBe(true);

    act(() => {
      result.current.apply({ type: "set-fret", beat: 0, string: 6, fret: 9 });
    });
    expect(result.current.canRedo).toBe(false);
  });

  it("canUndo / canRedo flags reflect stack state correctly across multiple ops", () => {
    const deps = makeDeps();
    deps.captureState.mockReturnValue({ bpm: 120 });
    const { result } = renderHook(() => useTabEditHistory(deps));

    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);

    act(() => {
      result.current.apply({ type: "set-tempo", beat: 0, bpm: 140 });
    });
    act(() => {
      result.current.apply({ type: "set-tempo", beat: 0, bpm: 160 });
    });
    expect(result.current.canUndo).toBe(true);

    act(() => {
      result.current.undo();
    });
    act(() => {
      result.current.undo();
    });
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
  });

  it("evicts oldest frame when past exceeds 200 (FIFO cap)", () => {
    const deps = makeDeps();
    deps.captureState.mockReturnValue({ fret: 0 });
    const { result } = renderHook(() => useTabEditHistory(deps));

    // Push 250 frames
    act(() => {
      for (let i = 0; i < 250; i++) {
        result.current.apply({ type: "set-fret", beat: i, string: 1, fret: i % 24 });
      }
    });

    // Can undo exactly 200 times, then no more
    for (let i = 0; i < 200; i++) {
      expect(result.current.canUndo).toBe(true);
      act(() => {
        result.current.undo();
      });
    }
    expect(result.current.canUndo).toBe(false);
  });
});
