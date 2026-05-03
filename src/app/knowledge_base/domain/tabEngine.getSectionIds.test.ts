import { describe, it, expect } from "vitest";
import { getSectionIds } from "./tabEngine";

const at = (name: string) => ({ name, startBeat: 0 });

describe("getSectionIds", () => {
  it("returns slugified ids aligned 1:1 with input", () => {
    expect(getSectionIds([at("Intro"), at("Verse 1"), at("Chorus")])).toEqual([
      "intro",
      "verse-1",
      "chorus",
    ]);
  });

  it("suffixes -2, -3 on duplicate slugs in order of appearance", () => {
    expect(getSectionIds([at("Verse"), at("Chorus"), at("Verse"), at("Verse")])).toEqual([
      "verse",
      "chorus",
      "verse-2",
      "verse-3",
    ]);
  });

  it("handles empty input", () => {
    expect(getSectionIds([])).toEqual([]);
  });

  it("treats slug-equivalent names (case/punct only) as collisions", () => {
    expect(getSectionIds([at("Verse 1"), at("verse 1"), at("VERSE-1")])).toEqual([
      "verse-1",
      "verse-1-2",
      "verse-1-3",
    ]);
  });

  it("handles all-empty / punctuation-only names by colliding on 'section'", () => {
    expect(getSectionIds([at(""), at("!!!"), at("   ")])).toEqual([
      "section",
      "section-2",
      "section-3",
    ]);
  });
});
