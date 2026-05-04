import { describe, it, expect } from "vitest";
import type { TabMetadata } from "./tabEngine";

describe("TabMetadata shape", () => {
  it("requires tuning + capo on each track", () => {
    const m: TabMetadata = {
      title: "x", tempo: 120,
      timeSignature: { numerator: 4, denominator: 4 },
      tracks: [{
        id: "0", name: "Lead", instrument: "guitar",
        tuning: ["E2","A2","D3","G3","B3","E4"], capo: 0,
      }],
      sections: [], totalBeats: 0, durationSeconds: 0,
    };
    expect(m.tracks[0].tuning).toHaveLength(6);
    expect(m.tracks[0].capo).toBe(0);
  });

  it("does not allow top-level tuning/capo", () => {
    // @ts-expect-error -- top-level tuning removed
    const _bad: TabMetadata = { tuning: [] };
    expect(true).toBe(true);
  });
});
