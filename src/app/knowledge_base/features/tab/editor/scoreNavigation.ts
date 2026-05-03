/**
 * Score navigation helpers — walk the alphaTab score object's structural
 * shape to locate beats, notes, and master-bars by global beat index.
 *
 * These helpers use `any` intentionally: the alphaTab score is typed as
 * `unknown` at the domain boundary (TabSession.score). Callers must guard
 * `score !== null` before calling.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Walk staves[0] of tracks[0] to find the beat at `globalBeatIndex`.
 * Returns null when the beat is out of range.
 */
export function findBeat(score: any, globalBeatIndex: number): any | null {
  const bars: any[] = score?.tracks?.[0]?.staves?.[0]?.bars ?? [];
  let counter = 0;
  for (const bar of bars) {
    const beats: any[] = bar?.voices?.[0]?.beats ?? [];
    if (counter + beats.length > globalBeatIndex) {
      return beats[globalBeatIndex - counter] ?? null;
    }
    counter += beats.length;
  }
  return null;
}

/**
 * Find a specific note by string number within the beat at `globalBeatIndex`.
 * Returns null when beat or note is not found.
 */
export function findNote(
  score: any,
  globalBeatIndex: number,
  stringNum: number,
): any | null {
  const beat = findBeat(score, globalBeatIndex);
  return beat?.notes?.find((n: any) => n.string === stringNum) ?? null;
}

/**
 * Return the master-bar (or track-bar fallback) that contains `globalBeatIndex`.
 * master-bars carry tempo automations and section info; falls back to the
 * track bar object when masterBars[i] is absent.
 */
export function findBarByBeat(score: any, globalBeatIndex: number): any | null {
  const masterBars: any[] = score?.masterBars ?? [];
  const trackBars: any[] = score?.tracks?.[0]?.staves?.[0]?.bars ?? [];
  let counter = 0;
  for (let i = 0; i < trackBars.length; i++) {
    const beats: any[] = trackBars[i]?.voices?.[0]?.beats ?? [];
    if (counter + beats.length > globalBeatIndex) {
      return masterBars[i] ?? trackBars[i];
    }
    counter += beats.length;
  }
  return null;
}
