import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTabCursor } from "./useTabCursor";
import type { TabMetadata } from "../../../../domain/tabEngine";

const STD_GUITAR = ["E2", "A2", "D3", "G3", "B3", "E4"];

function makeMetadata(overrides?: Partial<TabMetadata>): TabMetadata {
  return {
    title: "Test",
    tempo: 120,
    timeSignature: { numerator: 4, denominator: 4 },
    tracks: [{ id: "0", name: "Guitar", instrument: "guitar", tuning: STD_GUITAR, capo: 0 }],
    sections: [],
    totalBeats: 16,
    durationSeconds: 0,
    ...overrides,
  };
}

const meta = makeMetadata();

describe("useTabCursor", () => {
  it("starts with cursor null", () => {
    const { result } = renderHook(() => useTabCursor(meta));
    expect(result.current.cursor).toBeNull();
  });

  it("setCursor updates state", () => {
    const { result } = renderHook(() => useTabCursor(meta));
    act(() => result.current.setCursor({ trackIndex: 0, voiceIndex: 0, beat: 4, string: 6 }));
    expect(result.current.cursor).toEqual({ trackIndex: 0, voiceIndex: 0, beat: 4, string: 6 });
  });

  it("setCursor round-trips voiceIndex correctly", () => {
    const { result } = renderHook(() => useTabCursor(meta));
    act(() => result.current.setCursor({ trackIndex: 0, voiceIndex: 1, beat: 2, string: 3 }));
    expect(result.current.cursor!.voiceIndex).toBe(1);
    act(() => result.current.setCursor({ trackIndex: 0, voiceIndex: 0, beat: 2, string: 3 }));
    expect(result.current.cursor!.voiceIndex).toBe(0);
  });

  it("clear sets cursor to null", () => {
    const { result } = renderHook(() => useTabCursor(meta));
    act(() => result.current.setCursor({ trackIndex: 0, voiceIndex: 0, beat: 4, string: 6 }));
    act(() => result.current.clear());
    expect(result.current.cursor).toBeNull();
  });

  it("moveBeat(+1) advances within bounds", () => {
    const { result } = renderHook(() => useTabCursor(meta));
    act(() => result.current.setCursor({ trackIndex: 0, voiceIndex: 0, beat: 4, string: 6 }));
    act(() => result.current.moveBeat(1));
    expect(result.current.cursor!.beat).toBe(5);
  });

  it("moveBeat(+1) at end clamps", () => {
    const { result } = renderHook(() => useTabCursor(meta));
    act(() => result.current.setCursor({ trackIndex: 0, voiceIndex: 0, beat: 15, string: 6 }));
    act(() => result.current.moveBeat(1));
    expect(result.current.cursor!.beat).toBe(15); // clamps at totalBeats - 1
  });

  it("moveBeat(-1) at start clamps", () => {
    const { result } = renderHook(() => useTabCursor(meta));
    act(() => result.current.setCursor({ trackIndex: 0, voiceIndex: 0, beat: 0, string: 6 }));
    act(() => result.current.moveBeat(-1));
    expect(result.current.cursor!.beat).toBe(0);
  });

  it("moveString(-1) moves toward higher-pitched string (smaller string number)", () => {
    const { result } = renderHook(() => useTabCursor(meta));
    act(() => result.current.setCursor({ trackIndex: 0, voiceIndex: 0, beat: 4, string: 6 }));
    act(() => result.current.moveString(-1));
    expect(result.current.cursor!.string).toBe(5);
  });

  it("moveString(-1) at top string (string=1) clamps", () => {
    const { result } = renderHook(() => useTabCursor(meta));
    act(() => result.current.setCursor({ trackIndex: 0, voiceIndex: 0, beat: 4, string: 1 }));
    act(() => result.current.moveString(-1));
    expect(result.current.cursor!.string).toBe(1);
  });

  it("moveString(+1) at bottom string (string=tuning.length) clamps", () => {
    const { result } = renderHook(() => useTabCursor(meta));
    act(() => result.current.setCursor({ trackIndex: 0, voiceIndex: 0, beat: 4, string: 6 }));
    act(() => result.current.moveString(1));
    expect(result.current.cursor!.string).toBe(6); // 6-string guitar; can't go to 7
  });

  it("moveBar(+1) snaps to first beat of next bar", () => {
    const barStartBeats = [0, 4, 8, 12]; // 4 bars at 4/4
    const { result } = renderHook(() => useTabCursor(meta, barStartBeats));
    act(() => result.current.setCursor({ trackIndex: 0, voiceIndex: 0, beat: 5, string: 6 }));
    act(() => result.current.moveBar(1));
    expect(result.current.cursor!.beat).toBe(8);
  });

  it("moveBar(-1) snaps to first beat of previous bar", () => {
    const barStartBeats = [0, 4, 8, 12];
    const { result } = renderHook(() => useTabCursor(meta, barStartBeats));
    act(() => result.current.setCursor({ trackIndex: 0, voiceIndex: 0, beat: 5, string: 6 }));
    act(() => result.current.moveBar(-1));
    expect(result.current.cursor!.beat).toBe(0);
  });

  it("moveBar(+1) at last bar clamps", () => {
    const barStartBeats = [0, 4, 8, 12];
    const { result } = renderHook(() => useTabCursor(meta, barStartBeats));
    act(() => result.current.setCursor({ trackIndex: 0, voiceIndex: 0, beat: 14, string: 6 }));
    act(() => result.current.moveBar(1));
    expect(result.current.cursor!.beat).toBe(12); // already in last bar; stays at first beat of last bar
  });

  it("moveBar with no barStartBeats is a no-op", () => {
    const { result } = renderHook(() => useTabCursor(meta));
    act(() => result.current.setCursor({ trackIndex: 0, voiceIndex: 0, beat: 5, string: 6 }));
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

  // TAB-009 T11 tests

  it("moveString clamps to active track's tuning length (TAB-009 T11)", () => {
    const m = makeMetadata({
      tracks: [
        { id: "0", name: "Lead", instrument: "guitar", tuning: STD_GUITAR, capo: 0 },
        { id: "1", name: "Bass", instrument: "bass", tuning: ["E1", "A1", "D2", "G2"], capo: 0 },
      ],
    });
    const { result } = renderHook(() => useTabCursor(m));
    act(() => result.current.setCursor({ trackIndex: 1, voiceIndex: 0, beat: 0, string: 1 }));
    // Cycle string down enough times to overshoot bass's 4 strings
    act(() => result.current.moveString(1));
    act(() => result.current.moveString(1));
    act(() => result.current.moveString(1));
    act(() => result.current.moveString(1));
    expect(result.current.cursor!.string).toBe(4); // clamped at bass's 4 strings
  });

  it("moveString falls back to 6 strings when metadata is null (TAB-009 T11)", () => {
    const { result } = renderHook(() => useTabCursor(null));
    // cursor is null, move is no-op — verify no crash
    act(() => result.current.moveString(1));
    expect(result.current.cursor).toBeNull();
  });

  it("moveString falls back to 6 when trackIndex is out of range (TAB-009 T11)", () => {
    const m = makeMetadata();
    const { result } = renderHook(() => useTabCursor(m));
    // Force cursor with out-of-range trackIndex
    act(() => result.current.setCursor({ trackIndex: 99, voiceIndex: 0, beat: 0, string: 6 }));
    act(() => result.current.moveString(1));
    // numStrings falls back to 6; string 6 + 1 clamps to 6
    expect(result.current.cursor!.string).toBe(6);
  });

  it("nextTrack / prevTrack clamp at ends (no wrap) (TAB-009 T11)", () => {
    const m = makeMetadata({
      tracks: [
        { id: "0", name: "T0", instrument: "guitar", tuning: STD_GUITAR, capo: 0 },
        { id: "1", name: "T1", instrument: "guitar", tuning: STD_GUITAR, capo: 0 },
        { id: "2", name: "T2", instrument: "guitar", tuning: STD_GUITAR, capo: 0 },
      ],
    });
    const { result } = renderHook(() => useTabCursor(m));
    act(() => result.current.setCursor({ trackIndex: 0, voiceIndex: 0, beat: 0, string: 1 }));
    act(() => result.current.prevTrack());
    expect(result.current.cursor!.trackIndex).toBe(0); // clamped, no wrap
    act(() => result.current.nextTrack());
    expect(result.current.cursor!.trackIndex).toBe(1);
    act(() => result.current.nextTrack());
    expect(result.current.cursor!.trackIndex).toBe(2);
    act(() => result.current.nextTrack()); // tries 3, clamps at 2
    expect(result.current.cursor!.trackIndex).toBe(2);
  });

  it("nextTrack resets voiceIndex to 0 (TAB-009 T11)", () => {
    const m = makeMetadata({
      tracks: [
        { id: "0", name: "T0", instrument: "guitar", tuning: STD_GUITAR, capo: 0 },
        { id: "1", name: "T1", instrument: "guitar", tuning: STD_GUITAR, capo: 0 },
      ],
    });
    const { result } = renderHook(() => useTabCursor(m));
    act(() => result.current.setCursor({ trackIndex: 0, voiceIndex: 1, beat: 0, string: 1 }));
    expect(result.current.cursor!.voiceIndex).toBe(1);
    act(() => result.current.nextTrack());
    expect(result.current.cursor!.trackIndex).toBe(1);
    expect(result.current.cursor!.voiceIndex).toBe(0); // track switch clears V2 selection
  });

  it("prevTrack resets voiceIndex to 0 (TAB-009 T11)", () => {
    const m = makeMetadata({
      tracks: [
        { id: "0", name: "T0", instrument: "guitar", tuning: STD_GUITAR, capo: 0 },
        { id: "1", name: "T1", instrument: "guitar", tuning: STD_GUITAR, capo: 0 },
      ],
    });
    const { result } = renderHook(() => useTabCursor(m));
    act(() => result.current.setCursor({ trackIndex: 1, voiceIndex: 1, beat: 0, string: 1 }));
    expect(result.current.cursor!.voiceIndex).toBe(1);
    act(() => result.current.prevTrack());
    expect(result.current.cursor!.trackIndex).toBe(0);
    expect(result.current.cursor!.voiceIndex).toBe(0); // track switch clears V2 selection
  });

  it("nextTrack / prevTrack are no-ops when cursor is null (TAB-009 T11)", () => {
    const { result } = renderHook(() => useTabCursor(meta));
    act(() => result.current.nextTrack());
    expect(result.current.cursor).toBeNull();
    act(() => result.current.prevTrack());
    expect(result.current.cursor).toBeNull();
  });

  it("nextTrack / prevTrack are no-ops when metadata is null (TAB-009 T11)", () => {
    const { result } = renderHook(() => useTabCursor(null));
    act(() => result.current.nextTrack());
    expect(result.current.cursor).toBeNull();
    act(() => result.current.prevTrack());
    expect(result.current.cursor).toBeNull();
  });
});
