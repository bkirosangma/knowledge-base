import { describe, it, expect } from "vitest";
import { findBeat, findNote, findBarByBeat } from "./scoreNavigation";

/**
 * Minimal score fixture that mirrors the shape used by alphaTabEngine.
 * tracks[0].staves[0].bars[i].voices[0].beats[j]
 *   - bar 0: beats [{ duration: 4, notes: [{ string: 6, fret: 5 }] }, { duration: 4, notes: [] }]
 *   - bar 1: beats [{ duration: 8, notes: [{ string: 1, fret: 12 }] }]
 * masterBars[0].tempoAutomations[0].value = 120
 * masterBars[1].tempoAutomations[0].value = 90
 */
function makeScore() {
  return {
    masterBars: [
      { tempoAutomations: [{ value: 120 }], section: null },
      { tempoAutomations: [{ value: 90 }], section: { text: "Chorus" } },
    ],
    tracks: [
      {
        staves: [
          {
            bars: [
              {
                voices: [
                  {
                    beats: [
                      { duration: 4, notes: [{ string: 6, fret: 5 }] },
                      { duration: 4, notes: [] },
                    ],
                  },
                ],
              },
              {
                voices: [
                  {
                    beats: [
                      { duration: 8, notes: [{ string: 1, fret: 12 }] },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

describe("findBeat", () => {
  it("returns beat 0 (bar 0, index 0)", () => {
    expect(findBeat(makeScore(), 0)).toMatchObject({ duration: 4 });
  });

  it("returns beat 1 (bar 0, index 1)", () => {
    expect(findBeat(makeScore(), 1)).toMatchObject({ duration: 4 });
  });

  it("returns beat 2 (bar 1, index 0)", () => {
    expect(findBeat(makeScore(), 2)).toMatchObject({ duration: 8 });
  });

  it("returns null for out-of-range index", () => {
    expect(findBeat(makeScore(), 99)).toBeNull();
  });

  it("returns null for null score", () => {
    expect(findBeat(null, 0)).toBeNull();
  });
});

describe("findNote", () => {
  it("C1: finds note at beat=0 string=6 (fret=5)", () => {
    const note = findNote(makeScore(), 0, 6);
    expect(note).not.toBeNull();
    expect(note.fret).toBe(5);
  });

  it("C1: finds note at beat=2 string=1 (fret=12)", () => {
    const note = findNote(makeScore(), 2, 1);
    expect(note).not.toBeNull();
    expect(note.fret).toBe(12);
  });

  it("returns null when string not found on beat", () => {
    expect(findNote(makeScore(), 0, 3)).toBeNull(); // no note on string 3
  });

  it("returns null for out-of-range beat", () => {
    expect(findNote(makeScore(), 99, 6)).toBeNull();
  });
});

describe("findBarByBeat", () => {
  it("beat 0 → masterBars[0] (tempo=120)", () => {
    const bar = findBarByBeat(makeScore(), 0);
    expect(bar?.tempoAutomations?.[0]?.value).toBe(120);
  });

  it("beat 1 → masterBars[0] (still in bar 0)", () => {
    const bar = findBarByBeat(makeScore(), 1);
    expect(bar?.tempoAutomations?.[0]?.value).toBe(120);
  });

  it("beat 2 → masterBars[1] (tempo=90, section=Chorus)", () => {
    const bar = findBarByBeat(makeScore(), 2);
    expect(bar?.tempoAutomations?.[0]?.value).toBe(90);
    expect(bar?.section?.text).toBe("Chorus");
  });

  it("returns null for out-of-range beat", () => {
    expect(findBarByBeat(makeScore(), 99)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Multi-track / multi-voice tests (TAB-009 T4)
// Uses a hand-rolled two-track score mirroring the locate helpers tests in
// alphaTabEngine.applyEdit.test.ts.
//   track 0 (index 0): 1 bar, voice 0 → [beat0a, beat0b]; no voice 1
//   track 1 (index 1): 1 bar, voice 0 → [beat1a_v0]; voice 1 → [beat1b_v1]
// masterBars[0] carries a sentinel tempo so findBarByBeat tests can confirm
// they returned the right bar vs. track-bar fallback.
// ---------------------------------------------------------------------------
function makeMultiTrackScore() {
  const beat0a = { duration: 4, notes: [{ string: 6, fret: 5 }] };
  const beat0b = { duration: 4, notes: [] };
  const beat1a_v0 = { duration: 4, notes: [{ string: 3, fret: 3 }] };
  const beat1b_v1 = { duration: 4, notes: [{ string: 3, fret: 7 }] };

  return {
    _beats: { beat0a, beat0b, beat1a_v0, beat1b_v1 },
    masterBars: [
      { tempoAutomations: [{ value: 120 }], section: null },
    ],
    tracks: [
      {
        index: 0,
        staves: [
          {
            bars: [
              {
                voices: [
                  { beats: [beat0a, beat0b] },
                  // no voice 1 — for fallback tests
                ],
              },
            ],
          },
        ],
      },
      {
        index: 1,
        staves: [
          {
            bars: [
              {
                voices: [
                  { beats: [beat1a_v0] },
                  { beats: [beat1b_v1] },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

describe("findBeat — multi-track / voice (TAB-009 T4)", () => {
  it("defaults to track 0 voice 0 (backward compat)", () => {
    const s = makeMultiTrackScore();
    expect(findBeat(s, 0)).toBe(s._beats.beat0a);
    expect(findBeat(s, 1)).toBe(s._beats.beat0b);
  });

  it("locates beat on track 1 voice 0 when trackId='1'", () => {
    const s = makeMultiTrackScore();
    expect(findBeat(s, 0, "1", 0)).toBe(s._beats.beat1a_v0);
  });

  it("locates beat on track 1 voice 1 when trackId='1' voiceIndex=1", () => {
    const s = makeMultiTrackScore();
    expect(findBeat(s, 0, "1", 1)).toBe(s._beats.beat1b_v1);
  });

  it("falls back to voice 0 when voiceIndex=1 is absent on track 0", () => {
    const s = makeMultiTrackScore();
    expect(findBeat(s, 0, "0", 1)).toBe(s._beats.beat0a);
  });

  it("returns null for unknown trackId", () => {
    expect(findBeat(makeMultiTrackScore(), 0, "99")).toBeNull();
  });
});

describe("findNote — multi-track (TAB-009 T4)", () => {
  it("finds note on track 1 by string number", () => {
    const s = makeMultiTrackScore();
    const note = findNote(s, 0, 3, "1", 0);
    expect(note).not.toBeNull();
    expect(note.fret).toBe(3);
  });

  it("finds note on track 1 voice 1 by string number", () => {
    const s = makeMultiTrackScore();
    const note = findNote(s, 0, 3, "1", 1);
    expect(note).not.toBeNull();
    expect(note.fret).toBe(7);
  });

  it("returns null for unknown trackId", () => {
    expect(findNote(makeMultiTrackScore(), 0, 3, "99")).toBeNull();
  });
});

describe("findBarByBeat — multi-track (TAB-009 T4)", () => {
  it("defaults to track 0 voice 0 (backward compat)", () => {
    const s = makeMultiTrackScore();
    const bar = findBarByBeat(s, 0);
    expect(bar?.tempoAutomations?.[0]?.value).toBe(120);
  });

  it("locates bar on track 1 using trackId='1'", () => {
    const s = makeMultiTrackScore();
    const bar = findBarByBeat(s, 0, "1");
    expect(bar?.tempoAutomations?.[0]?.value).toBe(120);
  });

  it("falls back to voice 0 when voiceIndex=1 absent on track 0", () => {
    const s = makeMultiTrackScore();
    const bar = findBarByBeat(s, 0, "0", 1);
    expect(bar?.tempoAutomations?.[0]?.value).toBe(120);
  });

  it("returns null for unknown trackId", () => {
    expect(findBarByBeat(makeMultiTrackScore(), 0, "99")).toBeNull();
  });
});
