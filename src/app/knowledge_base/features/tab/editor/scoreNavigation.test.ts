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
