/**
 * Adapt a user-chosen colour for the active theme.
 *
 * Diagram nodes and layers store their bg / border / text colours in the
 * vault JSON, which means light-mode pastels look out of place once the
 * canvas surface flips dark. We don't rewrite the JSON — instead we
 * compute a dark-mode equivalent at render time by inverting the HSL
 * lightness and clamping into a sane range so very-light pastels become
 * very-dark variants and dark text becomes light text, while keeping
 * hue + saturation intact so user intent ("blue layer", "amber border")
 * still reads.
 *
 * Inputs supported: hex (#rrggbb / #rgb) and rgb()/rgba(). Anything else
 * (named colours, "transparent", malformed strings) passes through as-is.
 */

const CSS_KEYWORDS = /^(transparent|currentColor|inherit|initial|unset|none)$/i;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function parseHex(input: string): [number, number, number] | null {
  const m = input.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const hex = m[1];
  if (hex.length === 3) {
    return [
      parseInt(hex[0] + hex[0], 16),
      parseInt(hex[1] + hex[1], 16),
      parseInt(hex[2] + hex[2], 16),
    ];
  }
  return [
    parseInt(hex.substring(0, 2), 16),
    parseInt(hex.substring(2, 4), 16),
    parseInt(hex.substring(4, 6), 16),
  ];
}

function parseRgb(input: string): [number, number, number, number?] | null {
  const m = input.match(
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i,
  );
  if (!m) return null;
  return [+m[1], +m[2], +m[3], m[4] !== undefined ? +m[4] : undefined];
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const r1 = r / 255;
  const g1 = g / 255;
  const b1 = b / 255;
  const max = Math.max(r1, g1, b1);
  const min = Math.min(r1, g1, b1);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r1) h = (g1 - b1) / d + (g1 < b1 ? 6 : 0);
    else if (max === g1) h = (b1 - r1) / d + 2;
    else h = (r1 - g1) / d + 4;
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

/**
 * Token hex values for SVG attributes that can't read CSS variables (SVG
 * `fill="…"` / `stroke="…"` parse colour literals only). Mirrors the
 * `--surface` / `--line` definitions in `src/app/styles/tokens.css`.
 *
 * Use for the small/mid chrome inside diagram SVG (label backplates, line
 * fallback strokes, etc.). For Tailwind class targets prefer the
 * `bg-surface` / `border-line` utilities — they read CSS vars and flip
 * automatically.
 */
export function tokenColors(theme: "light" | "dark"): {
  surface: string;
  line: string;
} {
  return theme === "dark"
    ? { surface: "#0f172a", line: "#334155" }
    : { surface: "#ffffff", line: "#e2e8f0" };
}

export function adaptUserColor(
  color: string,
  theme: "light" | "dark",
): string {
  if (theme !== "dark" || !color) return color;
  const trimmed = color.trim();
  if (CSS_KEYWORDS.test(trimmed)) return color;

  const hex = parseHex(trimmed);
  let r: number;
  let g: number;
  let b: number;
  let a: number | undefined;
  if (hex) {
    [r, g, b] = hex;
  } else {
    const rgb = parseRgb(trimmed);
    if (!rgb) return color;
    [r, g, b, a] = rgb;
  }

  const { h, s, l } = rgbToHsl(r, g, b);
  // Invert lightness around 50, clamped so we never collapse to pure
  // black/white. 10–90 keeps near-whites visibly mid-dark and near-blacks
  // visibly mid-light, which is what reads as "swapped" on the eye.
  const darkL = clamp(100 - l, 10, 90);
  const hue = Math.round(h);
  const sat = Math.round(s);
  const lightness = Math.round(darkL);
  return a !== undefined
    ? `hsla(${hue}, ${sat}%, ${lightness}%, ${a})`
    : `hsl(${hue}, ${sat}%, ${lightness}%)`;
}
