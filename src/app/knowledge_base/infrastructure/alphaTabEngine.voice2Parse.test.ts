/**
 * TAB-008b parked-item #18 — voice-2 parser probe.
 *
 * Question: does alphaTab's AlphaTexImporter materialize a populated
 * `bar.voices[1]` when given alphatex source with a `\voice` directive?
 *
 * The render half of parked-item #18 stays manual (Bravura font + canvas
 * cannot be reliably asserted in headless environments — see
 * `docs/superpowers/plans/2026-05-04-tab-008b-voice-render-probe.md`).
 *
 * This test covers the **parser** half of the assumption stack named in
 * `features/tab/editor/TabEditorToolbar.tsx` line 37 — i.e. that voice 1
 * data flows through alphaTab's grammar into the score model.  If this
 * test fails, parked-item #18 has a confirmed parser-side gap and the
 * data layer assumption is wrong.
 */
import { describe, it, expect } from "vitest";

async function parseAlphaTex(source: string) {
  const mod = await import("@coderline/alphatab");
  const importer = new mod.importer.AlphaTexImporter();
  const settings = new mod.Settings();
  importer.init(mod.io.ByteBuffer.empty(), settings);
  importer.initFromString(source, settings);
  return importer.readScore();
}

describe("AlphaTexImporter — voice 2 grammar", () => {
  it("populates bar.voices[1] when source uses \\voice in StaffWise mode (default)", async () => {
    // Default voice mode is StaffWise: each `\voice` directive starts a new
    // voice that runs the full bar sequence again.  Two bars worth of voice 0
    // followed by `\voice` then two bars of voice 1 → both voices populated.
    const source =
      `\\title "Voice2 Probe"\n` +
      `.\n` +
      `:4 5.6 0.6 0.6 0.6 | 5.6 0.6 0.6 0.6 |\n` +
      `\\voice\n` +
      `:4 7.5 0.5 0.5 0.5 | 7.5 0.5 0.5 0.5 |\n`;

    const score = await parseAlphaTex(source);
    const bar = score.tracks[0].staves[0].bars[0];
    expect(bar.voices.length).toBeGreaterThanOrEqual(2);
    expect(bar.voices[0].beats.length).toBeGreaterThan(0);
    expect(bar.voices[1].beats.length).toBeGreaterThan(0);
    expect(bar.isMultiVoice).toBe(true);
  });

  it("first beats of voice 0 and voice 1 carry distinct fret values", async () => {
    // Confirms the parser routes the correct notes to each voice rather than
    // collapsing both into voice 0 (or duplicating).
    //
    // Two bars per voice: alphaTab's StaffWise voice mode (the default)
    // resets `barIndex` to 0 on `\voice`, so the second voice runs over
    // bars 0..N in parallel with the first.  Single-bar fixtures don't
    // populate voice 1 reliably — the parser appears to need at least
    // a multi-bar sequence per voice.
    const source =
      `\\title "Voice2 Distinct Notes"\n` +
      `.\n` +
      `:4 5.6 0.6 0.6 0.6 | 5.6 0.6 0.6 0.6 |\n` +
      `\\voice\n` +
      `:4 7.5 0.5 0.5 0.5 | 7.5 0.5 0.5 0.5 |\n`;

    const score = await parseAlphaTex(source);
    const bar = score.tracks[0].staves[0].bars[0];
    const v0FirstFret = bar.voices[0].beats[0].notes[0]?.fret;
    const v1FirstFret = bar.voices[1].beats[0].notes[0]?.fret;
    expect(v0FirstFret).toBe(5);
    expect(v1FirstFret).toBe(7);
  });

  it("filledVoices set contains both voice indices", async () => {
    // alphaTab's own render path consults `bar.filledVoices` (Set<number>) to
    // decide which voices to paint.  If voice 1 isn't in the set, alphaTab's
    // renderer will skip it regardless of beat content.
    const source =
      `\\title "Voice2 FilledSet"\n` +
      `.\n` +
      `:4 5.6 0.6 0.6 0.6 | 5.6 0.6 0.6 0.6 |\n` +
      `\\voice\n` +
      `:4 7.5 0.5 0.5 0.5 | 7.5 0.5 0.5 0.5 |\n`;

    const score = await parseAlphaTex(source);
    const bar = score.tracks[0].staves[0].bars[0];
    expect(bar.filledVoices.has(0)).toBe(true);
    expect(bar.filledVoices.has(1)).toBe(true);
  });
});
