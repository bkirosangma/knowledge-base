import { describe, it, expect } from "vitest";
import { adaptUserColor } from "./themeAdapter";

function parseHsl(str: string): { h: number; s: number; l: number; a?: number } | null {
  const m = str.match(
    /^hsla?\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*(?:,\s*([\d.]+)\s*)?\)$/,
  );
  if (!m) return null;
  return { h: +m[1], s: +m[2], l: +m[3], a: m[4] ? +m[4] : undefined };
}

describe("adaptUserColor", () => {
  it("returns the color unchanged in light mode", () => {
    expect(adaptUserColor("#eef2ff", "light")).toBe("#eef2ff");
    expect(adaptUserColor("rgb(255, 255, 255)", "light")).toBe("rgb(255, 255, 255)");
  });

  it("flips a near-white hex to a dark variant in dark mode", () => {
    const out = adaptUserColor("#ffffff", "dark");
    const hsl = parseHsl(out);
    expect(hsl).not.toBeNull();
    // 100 - 100 = 0, clamped to floor 10.
    expect(hsl!.l).toBe(10);
  });

  it("flips a near-black hex to a light variant in dark mode", () => {
    const out = adaptUserColor("#000000", "dark");
    const hsl = parseHsl(out);
    expect(hsl).not.toBeNull();
    // 100 - 0 = 100, clamped to ceiling 90.
    expect(hsl!.l).toBe(90);
  });

  it("preserves hue when flipping a light pastel", () => {
    // #eef2ff is indigo-50 (≈ hue 225).
    const out = adaptUserColor("#eef2ff", "dark");
    const hsl = parseHsl(out);
    expect(hsl).not.toBeNull();
    expect(hsl!.h).toBeGreaterThanOrEqual(220);
    expect(hsl!.h).toBeLessThanOrEqual(240);
    expect(hsl!.l).toBeLessThan(20); // started at L≈97 → flipped to L≈3 → clamped to 10
  });

  it("supports rgb() input", () => {
    const out = adaptUserColor("rgb(238, 242, 255)", "dark");
    const hsl = parseHsl(out);
    expect(hsl).not.toBeNull();
    // Same as the #eef2ff case.
    expect(hsl!.h).toBeGreaterThanOrEqual(220);
    expect(hsl!.h).toBeLessThanOrEqual(240);
  });

  it("supports rgba() input and preserves alpha in hsla() output", () => {
    const out = adaptUserColor("rgba(238, 242, 255, 0.5)", "dark");
    const hsl = parseHsl(out);
    expect(hsl).not.toBeNull();
    expect(hsl!.a).toBe(0.5);
  });

  it("supports 3-digit hex shorthand", () => {
    const out = adaptUserColor("#fff", "dark");
    const hsl = parseHsl(out);
    expect(hsl).not.toBeNull();
    expect(hsl!.l).toBe(10);
  });

  it("passes through transparent / currentColor / inherit", () => {
    expect(adaptUserColor("transparent", "dark")).toBe("transparent");
    expect(adaptUserColor("currentColor", "dark")).toBe("currentColor");
    expect(adaptUserColor("inherit", "dark")).toBe("inherit");
  });

  it("returns the input unchanged when it can't parse the color", () => {
    expect(adaptUserColor("not-a-color", "dark")).toBe("not-a-color");
    expect(adaptUserColor("", "dark")).toBe("");
  });

  it("leaves mid-tone gray near 50% lightness", () => {
    const out = adaptUserColor("#808080", "dark");
    const hsl = parseHsl(out);
    expect(hsl).not.toBeNull();
    // Gray at L≈50 — flip gives L≈50.
    expect(Math.abs(hsl!.l - 50)).toBeLessThanOrEqual(1);
  });
});
