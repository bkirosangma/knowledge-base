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
