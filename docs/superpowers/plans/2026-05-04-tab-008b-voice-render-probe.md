# TAB-008b — Voice 1 Render Verification Probe (#18)

**Date:** 2026-05-04
**Branch:** `plan/guitar-tabs-008b`
**Question:** Does alphaTab visually render `voices[1]` content when a second voice is present in a `.alphatex` file?

## Background

TAB-009 T15 shipped `<VoiceToggle>` letting the user switch the editor cursor between voice 0 and voice 1. Engine-level tests confirm that beat ops with `voiceIndex: 1` correctly mutate `bar.voices[1]`. The visual render question — "does alphaTab paint voice-1 notes on the canvas" — was deferred to TAB-008b as parked item #18.

## Reproduction recipe

1. Run the dev server: `npm run dev` and open the app at `http://localhost:3000`.
2. Pick a vault with at least one `.alphatex` file or import a `.gp` to bootstrap one.
3. Open the file in a tab pane. Engage Edit mode (toolbar toggle).
4. With cursor on a beat, place a few notes via numeric input on voice 0 (toolbar V1/V2 toggle defaults to V1 = voice 0).
5. Toggle the toolbar to V2 (voice 1).
6. With the cursor still on the same bar (or a different bar), place a few more notes.
7. Wait for the debounced flush (≈500 ms) — the file is now persisted with both voices.
8. Observe the canvas:
   - Are the voice-1 notes visible?
   - Are they distinguishable from voice 0 (different stem direction, opacity, colour, layout)?
   - Are simultaneous beats vertically aligned (i.e., a stack at the same beat) rather than overlapping or only voice-0 visible?

## Findings

**Status:** TBD (manual observation; populate during PR-time smoke test).

**Outcome A — voice 1 renders correctly:** mark parked-item #18 as ✅ closed in `docs/superpowers/handoffs/2026-05-03-guitar-tabs.md`. Add a one-line note in `Features.md` §11.10 confirming that TAB-009's `VoiceToggle` produces visible secondary-voice content end-to-end.

**Outcome B — voice 1 does not render** (or renders incorrectly): leave parked-item #18 open with the reproduction recipe above. Add a comment to `VoiceToggle.tsx` documenting the limitation: "Toggle routes data correctly into `bar.voices[1]`, but visual rendering depends on a future engine-side fix tracked in handoff parked-item #18." No engine fix in TAB-008b.

## Note

The probe is intentionally manual because:
- alphaTab's render output goes through a Bravura-font glyph layer that Playwright can't reliably assert against (Bravura is a music notation font; visual diffs would require a snapshot engine that handles font rendering deterministically).
- The user's preview MCP also cannot drive interactive UI clicks reliably (per memory `feedback_preview_verification_limits.md`).

The recipe is captured here so any future session — or the user themselves — can reproduce the check in 2 minutes.

— end of probe doc.
