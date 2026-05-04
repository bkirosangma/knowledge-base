// src/app/knowledge_base/features/tab/editor/hooks/useSelectedNoteDetails.ts
import { useMemo } from "react";
import type { Technique } from "../../../../domain/tabEngine";
import type { CursorLocation } from "./useTabCursor";

export interface SelectedNoteDetails {
  fret: number | null;
  techniques: Set<Technique>;
  bendAmount: number | null; // bendPoints[1].value when bend present; e.g. 50 = ½-step, 100 = full, 150 = 1½
  slideDirection: "up" | "down" | "target" | null;
  slideTargetFret: number | null;
}

export function useSelectedNoteDetails(
  score: unknown | null,
  cursor: CursorLocation | null,
): SelectedNoteDetails | null {
  return useMemo(() => {
    if (!score || !cursor) return null;
    return readNoteFromScore(score, cursor);
  }, [score, cursor]);
}

// Minimal structural shapes mirroring alphaTabEngine.ts NoteShape / BeatShape
interface BeatShapeMinimal {
  notes: Array<{
    string: number;
    fret: number;
    isHammerPullOrigin?: boolean;
    bendType?: number;
    bendPoints?: Array<{ value: number; offset: number }> | null;
    slideOutType?: number;
    isTieDestination?: boolean;
    isGhost?: boolean;
    vibrato?: number;
    isLetRing?: boolean;
    isPalmMute?: boolean;
    harmonicType?: number;
    beat?: { tap?: boolean; tremoloSpeed?: number | null };
  }>;
}

interface ScoreShapeMinimal {
  tracks: Array<{
    staves: Array<{
      bars: Array<{
        voices: Array<{ beats: BeatShapeMinimal[] }>;
      }>;
    }>;
  }>;
}

function readNoteFromScore(
  score: unknown,
  cursor: CursorLocation,
): SelectedNoteDetails | null {
  const s = score as ScoreShapeMinimal;
  // Mirror locateBeat in alphaTabEngine.ts — use trackIndex from cursor (defaults to tracks[0]).
  const trackIndex = cursor.trackIndex ?? 0;
  const track = s?.tracks?.[trackIndex];
  if (!track) return null;

  // Walk staves[0] → bars → voices[0] → beats to find the globalBeat.
  const stave = track.staves?.[0];
  if (!stave) return null;

  let counter = 0;
  let foundBeat: BeatShapeMinimal | null = null;
  for (const bar of stave.bars) {
    const beats = bar?.voices?.[0]?.beats;
    if (!beats) continue;
    for (const beat of beats) {
      if (counter === cursor.beat) {
        foundBeat = beat;
        break;
      }
      counter++;
    }
    if (foundBeat) break;
  }

  if (!foundBeat) return null;

  // Find the note for the cursor's string.
  const note = foundBeat.notes.find((n) => n.string === cursor.string);

  if (!note) {
    // No note at this cell — return empty details (section still renders).
    // NOTE: dispatching add-technique on an empty cell will throw in alphaTabEngine
    // since it requires an existing note. Callers should guard against this.
    return {
      fret: null,
      techniques: new Set(),
      bendAmount: null,
      slideDirection: null,
      slideTargetFret: null,
    };
  }

  // Build techniques set from note flags (inverse of TECHNIQUE_MUTATORS in alphaTabEngine.ts).
  const techniques = new Set<Technique>();
  if (note.isHammerPullOrigin === true) techniques.add("hammer-on");
  if (note.bendType !== undefined && note.bendType !== 0) techniques.add("bend");
  if (note.slideOutType !== undefined && note.slideOutType !== 0) techniques.add("slide");
  if (note.isTieDestination === true) techniques.add("tie");
  if (note.isGhost === true) techniques.add("ghost");
  if (note.vibrato !== undefined && note.vibrato !== 0) techniques.add("vibrato");
  if (note.isLetRing === true) techniques.add("let-ring");
  if (note.isPalmMute === true) techniques.add("palm-mute");
  if (note.harmonicType !== undefined && note.harmonicType !== 0) techniques.add("harmonic");
  // tap and tremolo are beat-level properties.
  if (note.beat?.tap === true) techniques.add("tap");
  if (note.beat?.tremoloSpeed != null) techniques.add("tremolo");

  // Bend amount from bendPoints[1].value.
  const bendAmount =
    note.bendPoints?.[1]?.value != null ? note.bendPoints[1].value : null;

  // Slide direction: map slideOutType numerically.
  // 0 = None, 1 = Shift ("up"), 2 = Legato ("down"), 3+ = target-fret style.
  // Exact enum values for 2/3+ are not verified without alphaTab d.ts — "up" is the
  // authorized T17 fallback (plan §"For T17, just read slideOutType numerically").
  let slideDirection: "up" | "down" | "target" | null = null;
  const sot = note.slideOutType ?? 0;
  if (sot === 1) slideDirection = "up";
  else if (sot === 2) slideDirection = "down";
  else if (sot >= 3) slideDirection = "target";

  return {
    fret: note.fret,
    techniques,
    bendAmount,
    slideDirection,
    slideTargetFret: null, // target fret decoding is out of T17 scope
  };
}
