import { describe, it, expect } from "vitest";
import { slugifySectionName } from "./tabEngine";

describe("slugifySectionName", () => {
  it("lowercases and joins words with hyphens", () => {
    expect(slugifySectionName("Verse 1")).toBe("verse-1");
  });

  it("collapses runs of whitespace", () => {
    expect(slugifySectionName("  Pre   Chorus  ")).toBe("pre-chorus");
  });

  it("strips punctuation", () => {
    expect(slugifySectionName("Solo (Lead)")).toBe("solo-lead");
    expect(slugifySectionName("Chorus!?")).toBe("chorus");
  });

  it("preserves alphanumerics across cases and digits", () => {
    expect(slugifySectionName("Bridge 2B")).toBe("bridge-2b");
  });

  it("strips diacritics to ASCII equivalents", () => {
    expect(slugifySectionName("Refrão Final")).toBe("refrao-final");
  });

  it("returns 'section' for empty / whitespace / punctuation-only input", () => {
    expect(slugifySectionName("")).toBe("section");
    expect(slugifySectionName("   ")).toBe("section");
    expect(slugifySectionName("!!!")).toBe("section");
  });
});
