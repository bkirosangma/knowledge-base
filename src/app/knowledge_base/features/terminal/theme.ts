import type { ITheme } from "@xterm/xterm";

/** Build an xterm.js theme from the app's CSS custom properties. */
export function buildTerminalTheme(): ITheme {
  if (typeof window === "undefined") return {};
  const cs = window.getComputedStyle(document.documentElement);
  const get = (name: string, fallback: string) => {
    const v = cs.getPropertyValue(name).trim();
    return v.length > 0 ? v : fallback;
  };
  return {
    background: get("--bg-surface", "#0e0f12"),
    foreground: get("--text-ink", "#e6e6e6"),
    cursor: get("--accent", "#7aa2f7"),
    cursorAccent: get("--bg-surface", "#0e0f12"),
    selectionBackground: get("--accent", "#7aa2f7") + "33", // 20% alpha
  };
}
