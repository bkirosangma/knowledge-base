import { describe, it, expect } from "vitest";
import { paneTitleFor } from "./paneTitle";

describe("paneTitleFor (TAB-11.2-12 helper)", () => {
  it("returns the score title when present", () => {
    expect(paneTitleFor("/vault/song.alphatex", "Greensleeves")).toBe("Greensleeves");
  });

  it("falls back to basename without extension when title is absent", () => {
    expect(paneTitleFor("/vault/untitled-no-title.alphatex", undefined)).toBe("untitled-no-title");
  });

  it("falls back to basename when score title is the alphaTab 'Untitled' sentinel", () => {
    expect(paneTitleFor("/vault/scarborough_fair.alphatex", "Untitled")).toBe("scarborough_fair");
  });

  it("preserves a real title that happens to share the sentinel — accepted edge cost", () => {
    // Documented trade-off: a user who literally names their tab "Untitled"
    // will see the basename instead. Cheap to revisit if it ever bites.
    expect(paneTitleFor("/vault/foo.alphatex", "Untitled")).toBe("foo");
  });

  it("handles paths without a directory prefix", () => {
    expect(paneTitleFor("song.alphatex", undefined)).toBe("song");
  });

  it("handles paths without an extension", () => {
    expect(paneTitleFor("/vault/README", undefined)).toBe("README");
  });

  it("handles dotfiles without stripping the leading dot", () => {
    expect(paneTitleFor("/vault/.hidden", undefined)).toBe("");
  });

  it("strips only the final extension on multi-dot filenames", () => {
    expect(paneTitleFor("/vault/song.v2.alphatex", undefined)).toBe("song.v2");
  });
});
