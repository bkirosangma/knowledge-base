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
export const ALPHATAB_SCRIPT_FILE = `${BASE_PATH}/alphatab/alphaTab.min.js`;
