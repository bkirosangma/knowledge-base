// src/app/knowledge_base/features/tab/editHistory/inverseOf.ts
import type { NoteDuration, TabEditOp } from "../../../domain/tabEngine";

/**
 * Pre-state snapshots indexed by op type.
 * The caller (useTabEditHistory) captures whatever a given op needs before dispatching.
 */
export type PreState =
  | { fret: number | null }                            // for set-fret
  | { duration: number }                               // for set-duration
  | { bpm: number }                                    // for set-tempo
  | { name: string | null }                            // for set-section
  | { firstBeatOfNewBar: number }                      // for add-bar (beat of the inserted bar)
  | { positionBefore: number }                         // for remove-bar (afterBeat for the re-insertion)
  | { tuning: string[] }                               // for set-track-tuning
  | { fret: number }                                   // for set-track-capo
  | { trackCount: number }                             // for add-track (track count before add)
  | { removedTrack: { name: string; instrument: "guitar" | "bass"; tuning: string[]; capo: number } } // for remove-track
  | { technique: { bendType: number; bendValue?: number; slideOutType: number } }   // ← NEW (TAB-008b for bend/slide cycle)
  | Record<string, never>;                             // for add/remove-technique (no preState needed)

/**
 * Given a TabEditOp and a snapshot of pre-state, return the inverse op.
 *
 * Known limitation — remove-bar inverse is approximate:
 *   `add-bar` inserts an EMPTY bar with a single rest, so undoing a
 *   `remove-bar` of a content-bearing bar restores the bar slot but NOT the
 *   original notes. Full bar-content snapshot restoration is deferred.
 *
 * TODO: If full remove-bar reversibility is required, extend PreState to
 *   carry a serialised bar snapshot and teach applyEdit to hydrate it via
 *   a dedicated "restore-bar" op rather than repurposing add-bar.
 */
export function inverseOf(op: TabEditOp, preState: PreState): TabEditOp {
  switch (op.type) {
    case "set-fret":
      return {
        type: "set-fret",
        beat: op.beat,
        string: op.string,
        fret: (preState as { fret: number | null }).fret,
      };

    case "set-duration":
      return {
        type: "set-duration",
        beat: op.beat,
        duration: (preState as { duration: number }).duration as NoteDuration,
      };

    case "add-technique": {
      const pre = (preState as { technique?: { bendType: number; bendValue?: number; slideOutType: number } }).technique;
      if (op.technique === "bend") {
        if (pre && pre.bendType === 1 /* BendType.Bend */ && typeof pre.bendValue === "number") {
          return { type: "add-technique", beat: op.beat, string: op.string, technique: "bend", amount: pre.bendValue };
        }
        return { type: "remove-technique", beat: op.beat, string: op.string, technique: "bend" };
      }
      if (op.technique === "slide") {
        if (pre) {
          if (pre.slideOutType === 1 /* Shift = up */) {
            return { type: "add-technique", beat: op.beat, string: op.string, technique: "slide", direction: "up" };
          }
          if (pre.slideOutType === 4 /* OutDown = down */) {
            return { type: "add-technique", beat: op.beat, string: op.string, technique: "slide", direction: "down" };
          }
        }
        return { type: "remove-technique", beat: op.beat, string: op.string, technique: "slide" };
      }
      return { type: "remove-technique", beat: op.beat, string: op.string, technique: op.technique };
    }

    case "remove-technique": {
      const pre = (preState as { technique?: { bendType: number; bendValue?: number; slideOutType: number } }).technique;
      if (op.technique === "bend" && pre && pre.bendType === 1 && typeof pre.bendValue === "number") {
        return { type: "add-technique", beat: op.beat, string: op.string, technique: "bend", amount: pre.bendValue };
      }
      if (op.technique === "slide" && pre) {
        if (pre.slideOutType === 1) return { type: "add-technique", beat: op.beat, string: op.string, technique: "slide", direction: "up" };
        if (pre.slideOutType === 4) return { type: "add-technique", beat: op.beat, string: op.string, technique: "slide", direction: "down" };
      }
      return { type: "add-technique", beat: op.beat, string: op.string, technique: op.technique };
    }

    case "set-tempo":
      return { type: "set-tempo", beat: op.beat, bpm: (preState as { bpm: number }).bpm };

    case "set-section":
      return { type: "set-section", beat: op.beat, name: (preState as { name: string | null }).name };

    case "add-bar":
      // Inverse: remove the bar that was just inserted. preState.firstBeatOfNewBar
      // is the beat number assigned to the new bar's first beat.
      return {
        type: "remove-bar",
        beat: (preState as { firstBeatOfNewBar: number }).firstBeatOfNewBar,
      };

    case "remove-bar":
      // Approximate inverse — restores bar count but NOT original content.
      // See known limitation note above.
      return {
        type: "add-bar",
        afterBeat: (preState as { positionBefore: number }).positionBefore,
      };

    case "set-track-tuning":
      return {
        type: "set-track-tuning",
        trackId: op.trackId,
        tuning: (preState as { tuning: string[] }).tuning,
      };

    case "set-track-capo":
      return {
        type: "set-track-capo",
        trackId: op.trackId,
        fret: (preState as { fret: number }).fret,
      };

    case "add-track":
      return {
        type: "remove-track",
        trackId: String((preState as { trackCount: number }).trackCount),
      };

    case "remove-track": {
      const r = (preState as { removedTrack?: { name: string; instrument: "guitar" | "bass"; tuning: string[]; capo: number } }).removedTrack;
      if (!r) throw new Error("inverseOf(remove-track) needs removedTrack in preState");
      return { type: "add-track", name: r.name, instrument: r.instrument, tuning: r.tuning, capo: r.capo };
    }
  }

  throw new Error(`No inverse defined for op type: ${(op as { type: string }).type}`);
}
