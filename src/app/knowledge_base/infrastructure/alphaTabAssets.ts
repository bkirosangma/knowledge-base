/**
 * Asset URLs consumed by `AlphaTabEngine`. Centralised here so the
 * SoundFont path, the Bravura font directory, and any future assets
 * (worker bundle, etc.) share one basePath swap-point.
 *
 * AlphaTab fetches Bravura font files at runtime from `fontDirectory`;
 * on GitHub Pages the app lives under `/knowledge-base/`, so a hardcoded
 * `/font/` would 404. `NEXT_PUBLIC_BASE_PATH` is empty locally and
 * `/knowledge-base` on Pages, mirroring `next.config.ts`.
 */
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
export const SOUNDFONT_URL = `${BASE_PATH}/soundfonts/sonivox.sf2`;
export const FONT_DIRECTORY = `${BASE_PATH}/font/`;
