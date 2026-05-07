import { describe, it, expect } from "vitest";
import { mergeAttachmentsWithBacklinks, type MergedReference } from "./mergeAttachmentsWithBacklinks";

describe("mergeAttachmentsWithBacklinks", () => {
  it("returns empty array when both inputs are empty", () => {
    expect(mergeAttachmentsWithBacklinks([], [])).toEqual([]);
  });

  it("preserves attachments only", () => {
    const got = mergeAttachmentsWithBacklinks(["a.md", "b.md"], []);
    expect(got).toEqual<MergedReference[]>([
      { sourcePath: "a.md", source: "attachment" },
      { sourcePath: "b.md", source: "attachment" },
    ]);
  });

  it("preserves backlinks only", () => {
    const got = mergeAttachmentsWithBacklinks([], [{ sourcePath: "x.md" }]);
    expect(got).toEqual<MergedReference[]>([
      { sourcePath: "x.md", source: "wiki-link" },
    ]);
  });

  it("attachment wins on duplicate path", () => {
    const got = mergeAttachmentsWithBacklinks(
      ["a.md"],
      [{ sourcePath: "a.md" }, { sourcePath: "b.md" }],
    );
    expect(got).toEqual<MergedReference[]>([
      { sourcePath: "a.md", source: "attachment" },
      { sourcePath: "b.md", source: "wiki-link" },
    ]);
  });

  it("preserves input order: attachments first, then unique backlinks", () => {
    const got = mergeAttachmentsWithBacklinks(
      ["z.md", "a.md"],
      [{ sourcePath: "m.md" }, { sourcePath: "z.md" }],
    );
    expect(got.map((r) => r.sourcePath)).toEqual(["z.md", "a.md", "m.md"]);
  });
});
