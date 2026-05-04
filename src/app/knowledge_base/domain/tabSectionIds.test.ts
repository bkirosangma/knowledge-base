import { describe, it, expect } from "vitest";
import { resolveSectionIds } from "./tabSectionIds";
import type { TabRefsPayload } from "./tabRefs";

describe("resolveSectionIds", () => {
  it("uses slug fallback when no sidecar exists", () => {
    expect(resolveSectionIds([{ name: "Intro" }, { name: "Verse 1" }], null))
      .toEqual(["intro", "verse-1"]);
  });

  it("collision-suffixes duplicate slugs in slug fallback", () => {
    expect(resolveSectionIds([{ name: "Intro" }, { name: "Intro" }], null))
      .toEqual(["intro", "intro-2"]);
  });

  it("uses sidecar entry when currentName matches", () => {
    const refs: TabRefsPayload = {
      version: 2,
      sectionRefs: {
        "section-7": "Verse 1",
        "section-8": "Intro",
      },
      trackRefs: [],
    };
    expect(resolveSectionIds([{ name: "Intro" }, { name: "Verse 1" }], refs))
      .toEqual(["section-8", "section-7"]);
  });

  it("falls back to slug when sidecar has no entry for a current section", () => {
    const refs: TabRefsPayload = {
      version: 2,
      sectionRefs: { "section-7": "Verse 1" },
      trackRefs: [],
    };
    expect(resolveSectionIds([{ name: "Intro" }, { name: "Verse 1" }], refs))
      .toEqual(["intro", "section-7"]);
  });

  it("rename: same stableId resolves before and after the name change", () => {
    const refs: TabRefsPayload = {
      version: 2,
      sectionRefs: { "stable-x": "Verse 1" },
      trackRefs: [],
    };
    expect(resolveSectionIds([{ name: "Verse 1" }], refs)[0]).toBe("stable-x");
  });

  it("returns empty array for empty sections", () => {
    expect(resolveSectionIds([], null)).toEqual([]);
    expect(resolveSectionIds([], { version: 2, sectionRefs: {}, trackRefs: [] })).toEqual([]);
  });
});
