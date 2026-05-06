/**
 * Asset URLs consumed by `AlphaTabEngine`. Centralised here so the
 * SoundFont path (TAB-005) and any future assets (worker bundle, fonts)
 * have one swap-point.
 *
 * The SoundFont file itself is added to `public/soundfonts/` and the
 * service worker precache in TAB-005; `enablePlayer` stays `false` until
 * then, so this constant is unused in TAB-004.
 */
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
export const SOUNDFONT_URL = `${BASE_PATH}/soundfonts/sonivox.sf2`;

// alphaTab worker bundle URL. AlphaTab uses this to spawn its renderer
// worker AND its synthesizer worker. Auto-detection picks the wrong path
// under Next.js/Turbopack chunked bundling, so we vendor the file to
// `public/alphatab/` via the `copy-alphatab` postinstall script and point
// alphaTab at it explicitly.
//
// Must be an ABSOLUTE URL — alphaTab spawns the worker from a blob:// URL,
// and `importScripts(...)` inside that worker resolves relative paths
// against the blob's origin (not the page's), so a path-only string
// throws "URL is invalid". `getAlphaTabScriptFile()` defers reading
// `window.location.origin` until call time, since this module is imported
// by code that may be evaluated during SSR.
export function getAlphaTabScriptFile(): string {
  // Unminified bundle so patch-package patches (knowledge-base loop-wrap
  // mask, etc.) apply inside the worker too. The synth always runs in a
  // worker (alphaTab calls createWorkerPlayer regardless of useWorkers),
  // and the worker loads its source via importScripts(scriptFile) — if we
  // pointed at alphaTab.min.js, our node_modules patches would only be
  // visible on the main thread and skipped by the synth where they matter.
  const path = `${BASE_PATH}/alphatab/alphaTab.js`;
  if (typeof window === "undefined") return path;
  return new URL(path, window.location.origin).href;
}
