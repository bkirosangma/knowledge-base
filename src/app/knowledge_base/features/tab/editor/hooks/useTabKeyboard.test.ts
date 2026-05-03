import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useTabKeyboard } from "./useTabKeyboard";
import type { NoteDuration } from "../../../../domain/tabEngine";

function fireKey(
  key: string,
  opts: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean } = {},
) {
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...opts }),
  );
}

const baseDeps = () => {
  const apply = vi.fn();
  const undo = vi.fn();
  const redo = vi.fn();
  const setCursor = vi.fn();
  const clearCursor = vi.fn();
  const moveBeat = vi.fn();
  const moveString = vi.fn();
  const moveBar = vi.fn();
  const activeDurationRef = { current: 4 as NoteDuration };
  return {
    apply,
    undo,
    redo,
    setCursor,
    clearCursor,
    moveBeat,
    moveString,
    moveBar,
    activeDurationRef,
  };
};

describe("useTabKeyboard", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("0-9 accumulates digits and commits set-fret after 500ms", () => {
    const d = baseDeps();
    renderHook(() =>
      useTabKeyboard({ ...d, cursor: { trackIndex: 0, beat: 4, string: 6 }, enabled: true }),
    );

    fireKey("1");
    fireKey("2");
    expect(d.apply).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(d.apply).toHaveBeenCalledWith({
      type: "set-fret",
      beat: 4,
      string: 6,
      fret: 12,
    });
  });

  it("digit accumulator commits on a following non-digit key (no timeout wait)", () => {
    const d = baseDeps();
    renderHook(() =>
      useTabKeyboard({ ...d, cursor: { trackIndex: 0, beat: 4, string: 6 }, enabled: true }),
    );

    fireKey("1");
    fireKey("h");
    expect(d.apply).toHaveBeenNthCalledWith(1, {
      type: "set-fret",
      beat: 4,
      string: 6,
      fret: 1,
    });
    expect(d.apply).toHaveBeenNthCalledWith(2, {
      type: "add-technique",
      beat: 4,
      string: 6,
      technique: "hammer-on",
    });
  });

  it("Q W E R T Y map to set-duration whole/half/quarter/eighth/sixteenth/thirty-second", () => {
    const d = baseDeps();
    renderHook(() =>
      useTabKeyboard({ ...d, cursor: { trackIndex: 0, beat: 0, string: 6 }, enabled: true }),
    );

    fireKey("q");
    fireKey("w");
    fireKey("e");
    fireKey("r");
    fireKey("t");
    fireKey("y");
    expect(d.apply).toHaveBeenNthCalledWith(1, { type: "set-duration", beat: 0, duration: 1 });
    expect(d.apply).toHaveBeenNthCalledWith(2, { type: "set-duration", beat: 0, duration: 2 });
    expect(d.apply).toHaveBeenNthCalledWith(3, { type: "set-duration", beat: 0, duration: 4 });
    expect(d.apply).toHaveBeenNthCalledWith(4, { type: "set-duration", beat: 0, duration: 8 });
    expect(d.apply).toHaveBeenNthCalledWith(5, { type: "set-duration", beat: 0, duration: 16 });
    expect(d.apply).toHaveBeenNthCalledWith(6, { type: "set-duration", beat: 0, duration: 32 });
  });

  it("bare H / P / B / S / L / ~ map to add-technique with the correct technique", () => {
    const d = baseDeps();
    renderHook(() =>
      useTabKeyboard({ ...d, cursor: { trackIndex: 0, beat: 0, string: 6 }, enabled: true }),
    );

    fireKey("h");
    expect(d.apply).toHaveBeenLastCalledWith({
      type: "add-technique",
      beat: 0,
      string: 6,
      technique: "hammer-on",
    });
    fireKey("p");
    expect(d.apply).toHaveBeenLastCalledWith({
      type: "add-technique",
      beat: 0,
      string: 6,
      technique: "pull-off",
    });
    fireKey("b");
    expect(d.apply).toHaveBeenLastCalledWith({
      type: "add-technique",
      beat: 0,
      string: 6,
      technique: "bend",
    });
    fireKey("s");
    expect(d.apply).toHaveBeenLastCalledWith({
      type: "add-technique",
      beat: 0,
      string: 6,
      technique: "slide",
    });
    fireKey("l");
    expect(d.apply).toHaveBeenLastCalledWith({
      type: "add-technique",
      beat: 0,
      string: 6,
      technique: "tie",
    });
    fireKey("~");
    expect(d.apply).toHaveBeenLastCalledWith({
      type: "add-technique",
      beat: 0,
      string: 6,
      technique: "vibrato",
    });
  });

  it("Shift+L maps to let-ring (not tie)", () => {
    const d = baseDeps();
    renderHook(() =>
      useTabKeyboard({ ...d, cursor: { trackIndex: 0, beat: 0, string: 6 }, enabled: true }),
    );
    fireKey("L", { shiftKey: true });
    expect(d.apply).toHaveBeenLastCalledWith({
      type: "add-technique",
      beat: 0,
      string: 6,
      technique: "let-ring",
    });
  });

  it("Shift+M maps to palm-mute", () => {
    const d = baseDeps();
    renderHook(() =>
      useTabKeyboard({ ...d, cursor: { trackIndex: 0, beat: 0, string: 6 }, enabled: true }),
    );
    fireKey("M", { shiftKey: true });
    expect(d.apply).toHaveBeenLastCalledWith({
      type: "add-technique",
      beat: 0,
      string: 6,
      technique: "palm-mute",
    });
  });

  it("ArrowLeft / Right call moveBeat", () => {
    const d = baseDeps();
    renderHook(() =>
      useTabKeyboard({ ...d, cursor: { trackIndex: 0, beat: 0, string: 6 }, enabled: true }),
    );
    fireKey("ArrowLeft");
    expect(d.moveBeat).toHaveBeenLastCalledWith(-1);
    fireKey("ArrowRight");
    expect(d.moveBeat).toHaveBeenLastCalledWith(1);
  });

  it("ArrowUp / Down call moveString (up = -1, down = +1)", () => {
    const d = baseDeps();
    renderHook(() =>
      useTabKeyboard({ ...d, cursor: { trackIndex: 0, beat: 0, string: 6 }, enabled: true }),
    );
    fireKey("ArrowUp");
    expect(d.moveString).toHaveBeenLastCalledWith(-1);
    fireKey("ArrowDown");
    expect(d.moveString).toHaveBeenLastCalledWith(1);
  });

  it("Tab / Shift+Tab call moveBar(+/-1)", () => {
    const d = baseDeps();
    renderHook(() =>
      useTabKeyboard({ ...d, cursor: { trackIndex: 0, beat: 0, string: 6 }, enabled: true }),
    );
    fireKey("Tab");
    expect(d.moveBar).toHaveBeenLastCalledWith(1);
    fireKey("Tab", { shiftKey: true });
    expect(d.moveBar).toHaveBeenLastCalledWith(-1);
  });

  it("Esc clears cursor", () => {
    const d = baseDeps();
    renderHook(() =>
      useTabKeyboard({ ...d, cursor: { trackIndex: 0, beat: 0, string: 6 }, enabled: true }),
    );
    fireKey("Escape");
    expect(d.clearCursor).toHaveBeenCalledOnce();
  });

  it("⌘Z and Ctrl+Z trigger undo", () => {
    const d = baseDeps();
    renderHook(() =>
      useTabKeyboard({ ...d, cursor: { trackIndex: 0, beat: 0, string: 6 }, enabled: true }),
    );
    fireKey("z", { metaKey: true });
    expect(d.undo).toHaveBeenCalledTimes(1);
    fireKey("z", { ctrlKey: true });
    expect(d.undo).toHaveBeenCalledTimes(2);
  });

  it("⌘⇧Z, Ctrl+Y, Ctrl+Shift+Z trigger redo", () => {
    const d = baseDeps();
    renderHook(() =>
      useTabKeyboard({ ...d, cursor: { trackIndex: 0, beat: 0, string: 6 }, enabled: true }),
    );
    fireKey("z", { metaKey: true, shiftKey: true });
    expect(d.redo).toHaveBeenCalledTimes(1);
    fireKey("y", { ctrlKey: true });
    expect(d.redo).toHaveBeenCalledTimes(2);
    fireKey("z", { ctrlKey: true, shiftKey: true });
    expect(d.redo).toHaveBeenCalledTimes(3);
  });

  it("does nothing when cursor is null", () => {
    const d = baseDeps();
    renderHook(() => useTabKeyboard({ ...d, cursor: null, enabled: true }));
    fireKey("1");
    fireKey("h");
    fireKey("ArrowLeft");
    expect(d.apply).not.toHaveBeenCalled();
    expect(d.moveBeat).not.toHaveBeenCalled();
  });

  it("does nothing when enabled=false", () => {
    const d = baseDeps();
    renderHook(() =>
      useTabKeyboard({ ...d, cursor: { trackIndex: 0, beat: 0, string: 6 }, enabled: false }),
    );
    fireKey("1");
    expect(d.apply).not.toHaveBeenCalled();
  });
});
