import { renderHook, act } from "@testing-library/react";
import { useTabCursor } from "./useTabCursor";
import type { TabMetadata } from "../../../../domain/tabEngine";

const sixStringTuning = ["E2", "A2", "D3", "G3", "B3", "E4"];
const meta: TabMetadata = {
  title: "Test",
  tempo: 120,
  timeSignature: { numerator: 4, denominator: 4 },
  capo: 0,
  tuning: sixStringTuning,
  tracks: [{ id: "0", name: "Guitar", instrument: "guitar" }],
  sections: [],
  totalBeats: 16,
  durationSeconds: 0,
};

describe("useTabCursor", () => {
  it("starts with cursor null", () => {
    const { result } = renderHook(() => useTabCursor(meta));
    expect(result.current.cursor).toBeNull();
  });

  it("setCursor updates state", () => {
    const { result } = renderHook(() => useTabCursor(meta));
    act(() => result.current.setCursor({ trackIndex: 0, beat: 4, string: 6 }));
    expect(result.current.cursor).toEqual({ trackIndex: 0, beat: 4, string: 6 });
  });

  it("clear sets cursor to null", () => {
    const { result } = renderHook(() => useTabCursor(meta));
    act(() => result.current.setCursor({ trackIndex: 0, beat: 4, string: 6 }));
    act(() => result.current.clear());
    expect(result.current.cursor).toBeNull();
  });

  it("moveBeat(+1) advances within bounds", () => {
    const { result } = renderHook(() => useTabCursor(meta));
    act(() => result.current.setCursor({ trackIndex: 0, beat: 4, string: 6 }));
    act(() => result.current.moveBeat(1));
    expect(result.current.cursor!.beat).toBe(5);
  });

  it("moveBeat(+1) at end clamps", () => {
    const { result } = renderHook(() => useTabCursor(meta));
    act(() => result.current.setCursor({ trackIndex: 0, beat: 15, string: 6 }));
    act(() => result.current.moveBeat(1));
    expect(result.current.cursor!.beat).toBe(15); // clamps at totalBeats - 1
  });

  it("moveBeat(-1) at start clamps", () => {
    const { result } = renderHook(() => useTabCursor(meta));
    act(() => result.current.setCursor({ trackIndex: 0, beat: 0, string: 6 }));
    act(() => result.current.moveBeat(-1));
    expect(result.current.cursor!.beat).toBe(0);
  });

  it("moveString(-1) moves toward higher-pitched string (smaller string number)", () => {
    const { result } = renderHook(() => useTabCursor(meta));
    act(() => result.current.setCursor({ trackIndex: 0, beat: 4, string: 6 }));
    act(() => result.current.moveString(-1));
    expect(result.current.cursor!.string).toBe(5);
  });

  it("moveString(-1) at top string (string=1) clamps", () => {
    const { result } = renderHook(() => useTabCursor(meta));
    act(() => result.current.setCursor({ trackIndex: 0, beat: 4, string: 1 }));
    act(() => result.current.moveString(-1));
    expect(result.current.cursor!.string).toBe(1);
  });

  it("moveString(+1) at bottom string (string=tuning.length) clamps", () => {
    const { result } = renderHook(() => useTabCursor(meta));
    act(() => result.current.setCursor({ trackIndex: 0, beat: 4, string: 6 }));
    act(() => result.current.moveString(1));
    expect(result.current.cursor!.string).toBe(6); // 6-string guitar; can't go to 7
  });

  it("moveBar(+1) snaps to first beat of next bar", () => {
    const barStartBeats = [0, 4, 8, 12]; // 4 bars at 4/4
    const { result } = renderHook(() => useTabCursor(meta, barStartBeats));
    act(() => result.current.setCursor({ trackIndex: 0, beat: 5, string: 6 }));
    act(() => result.current.moveBar(1));
    expect(result.current.cursor!.beat).toBe(8);
  });

  it("moveBar(-1) snaps to first beat of previous bar", () => {
    const barStartBeats = [0, 4, 8, 12];
    const { result } = renderHook(() => useTabCursor(meta, barStartBeats));
    act(() => result.current.setCursor({ trackIndex: 0, beat: 5, string: 6 }));
    act(() => result.current.moveBar(-1));
    expect(result.current.cursor!.beat).toBe(0);
  });

  it("moveBar(+1) at last bar clamps", () => {
    const barStartBeats = [0, 4, 8, 12];
    const { result } = renderHook(() => useTabCursor(meta, barStartBeats));
    act(() => result.current.setCursor({ trackIndex: 0, beat: 14, string: 6 }));
    act(() => result.current.moveBar(1));
    expect(result.current.cursor!.beat).toBe(12); // already in last bar; stays at first beat of last bar
  });

  it("moveBar with no barStartBeats is a no-op", () => {
    const { result } = renderHook(() => useTabCursor(meta));
    act(() => result.current.setCursor({ trackIndex: 0, beat: 5, string: 6 }));
    act(() => result.current.moveBar(1));
    expect(result.current.cursor!.beat).toBe(5);
  });

  it("move methods are no-ops when cursor is null", () => {
    const { result } = renderHook(() => useTabCursor(meta));
    act(() => result.current.moveBeat(1));
    act(() => result.current.moveString(1));
    act(() => result.current.moveBar(1));
    expect(result.current.cursor).toBeNull();
  });
});
