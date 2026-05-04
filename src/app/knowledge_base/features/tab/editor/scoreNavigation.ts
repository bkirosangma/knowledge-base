/**
 * Score navigation helpers — walk the alphaTab score object's structural
 * shape to locate beats, notes, and master-bars by global beat index.
 *
 * These helpers use `any` intentionally: the alphaTab score is typed as
 * `unknown` at the domain boundary (TabSession.score). Callers must guard
 * `score !== null` before calling.
 *
 * TAB-009 T4: optional `trackId` and `voiceIndex` params added to all helpers.
 * Defaults to track 0 + voice 0, preserving single-track call-site ergonomics.
 * Voice 1 absent in a bar → falls back to voice 0 (mirrors alphaTabEngine helpers).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Walk staves[0] of the given track to find the beat at `globalBeatIndex`.
 * Returns null when the beat is out of range or the track is not found.
 *
 * @param trackId    Matched against `String(track.index)`.  Defaults to the
 *                   first track, preserving existing single-track call-sites.
 * @param voiceIndex 0 = primary voice, 1 = secondary.  Falls back to voice 0
 *                   if the requested voice index does not exist in a bar.
 */
export function findBeat(
  score: any,
  globalBeatIndex: number,
  trackId?: string,
  voiceIndex: 0 | 1 = 0,
): any | null {
  const tracks: any[] = score?.tracks ?? [];
  const track = trackId !== undefined
    ? (tracks.find((t: any) => String(t.index) === trackId) ?? null)
    : (tracks[0] ?? null);
  if (!track) return null;
  const bars: any[] = track?.staves?.[0]?.bars ?? [];
  let counter = 0;
  for (const bar of bars) {
    const voice = bar?.voices?.[voiceIndex] ?? bar?.voices?.[0] ?? null;
    const beats: any[] = voice?.beats ?? [];
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
 *
 * @param trackId    Matched against `String(track.index)`.  Defaults to track 0.
 * @param voiceIndex 0 = primary voice, 1 = secondary.  Falls back to voice 0.
 */
export function findNote(
  score: any,
  globalBeatIndex: number,
  stringNum: number,
  trackId?: string,
  voiceIndex: 0 | 1 = 0,
): any | null {
  const beat = findBeat(score, globalBeatIndex, trackId, voiceIndex);
  return beat?.notes?.find((n: any) => n.string === stringNum) ?? null;
}

/**
 * Return the master-bar (or track-bar fallback) that contains `globalBeatIndex`.
 * master-bars carry tempo automations and section info; falls back to the
 * track bar object when masterBars[i] is absent.
 *
 * @param trackId    Matched against `String(track.index)`.  Defaults to track 0.
 * @param voiceIndex 0 = primary voice, 1 = secondary.  Falls back to voice 0.
 */
export function findBarByBeat(
  score: any,
  globalBeatIndex: number,
  trackId?: string,
  voiceIndex: 0 | 1 = 0,
): any | null {
  const masterBars: any[] = score?.masterBars ?? [];
  const tracks: any[] = score?.tracks ?? [];
  const track = trackId !== undefined
    ? (tracks.find((t: any) => String(t.index) === trackId) ?? null)
    : (tracks[0] ?? null);
  const trackBars: any[] = track?.staves?.[0]?.bars ?? [];
  let counter = 0;
  for (let i = 0; i < trackBars.length; i++) {
    const voice = trackBars[i]?.voices?.[voiceIndex] ?? trackBars[i]?.voices?.[0] ?? null;
    const beats: any[] = voice?.beats ?? [];
    if (counter + beats.length > globalBeatIndex) {
      return masterBars[i] ?? trackBars[i];
    }
    counter += beats.length;
  }
  return null;
}
