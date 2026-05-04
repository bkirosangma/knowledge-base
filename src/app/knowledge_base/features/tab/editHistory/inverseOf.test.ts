// src/app/knowledge_base/features/tab/editHistory/inverseOf.test.ts
import { describe, expect, it } from "vitest";
import { inverseOf } from "./inverseOf";

describe("inverseOf", () => {
  it("set-fret(beat,string,X) ↔ set-fret(beat,string,prevValue)", () => {
    const op = { type: "set-fret" as const, beat: 4, string: 3, fret: 12 };
    const inverse = inverseOf(op, { fret: 5 });
    expect(inverse).toEqual({ type: "set-fret", beat: 4, string: 3, fret: 5 });
  });

  it("set-fret with new note (preState.fret = null) inverts to remove (fret = null)", () => {
    const op = { type: "set-fret" as const, beat: 0, string: 6, fret: 7 };
    const inverse = inverseOf(op, { fret: null });
    expect(inverse).toEqual({ type: "set-fret", beat: 0, string: 6, fret: null });
  });

  it("set-duration uses preState duration", () => {
    const op = { type: "set-duration" as const, beat: 2, duration: 8 as const };
    const inverse = inverseOf(op, { duration: 4 });
    expect(inverse).toEqual({ type: "set-duration", beat: 2, duration: 4 });
  });

  it("add-technique ↔ remove-technique", () => {
    const op = { type: "add-technique" as const, beat: 1, string: 2, technique: "bend" as const };
    const inverse = inverseOf(op, {});
    expect(inverse).toEqual({ type: "remove-technique", beat: 1, string: 2, technique: "bend" });
  });

  it("remove-technique ↔ add-technique", () => {
    const op = { type: "remove-technique" as const, beat: 3, string: 1, technique: "vibrato" as const };
    const inverse = inverseOf(op, {});
    expect(inverse).toEqual({ type: "add-technique", beat: 3, string: 1, technique: "vibrato" });
  });

  it("set-tempo uses preState bpm", () => {
    const op = { type: "set-tempo" as const, beat: 0, bpm: 140 };
    const inverse = inverseOf(op, { bpm: 120 });
    expect(inverse).toEqual({ type: "set-tempo", beat: 0, bpm: 120 });
  });

  it("set-section uses preState name (string)", () => {
    const op = { type: "set-section" as const, beat: 8, name: "Chorus" };
    const inverse = inverseOf(op, { name: "Verse" });
    expect(inverse).toEqual({ type: "set-section", beat: 8, name: "Verse" });
  });

  it("set-section uses preState name (null — removing a section marker)", () => {
    const op = { type: "set-section" as const, beat: 8, name: null };
    const inverse = inverseOf(op, { name: "Intro" });
    expect(inverse).toEqual({ type: "set-section", beat: 8, name: "Intro" });
  });

  it("add-bar ↔ remove-bar at the inserted position", () => {
    const op = { type: "add-bar" as const, afterBeat: 16 };
    // preState tells us the new bar's first beat (e.g. 17)
    const inverse = inverseOf(op, { firstBeatOfNewBar: 17 });
    expect(inverse).toEqual({ type: "remove-bar", beat: 17 });
  });

  it("remove-bar ↔ add-bar at the position before (approximate — content not restored)", () => {
    const op = { type: "remove-bar" as const, beat: 17 };
    // preState tells us afterBeat for re-insertion (beat just before the removed bar)
    const inverse = inverseOf(op, { positionBefore: 16 });
    expect(inverse).toEqual({ type: "add-bar", afterBeat: 16 });
  });

  it("set-track-tuning uses preState tuning", () => {
    const op = {
      type: "set-track-tuning" as const,
      trackId: "t1",
      tuning: ["E2", "A2", "D3", "G3", "B3", "E4"],
    };
    const prev = ["E2", "A2", "D3", "G3", "B3", "D4"];
    const inverse = inverseOf(op, { tuning: prev });
    expect(inverse).toEqual({ type: "set-track-tuning", trackId: "t1", tuning: prev });
  });

  it("set-track-capo uses preState fret", () => {
    const op = { type: "set-track-capo" as const, trackId: "t1", fret: 3 };
    const inverse = inverseOf(op, { fret: 0 });
    expect(inverse).toEqual({ type: "set-track-capo", trackId: "t1", fret: 0 });
  });
});
