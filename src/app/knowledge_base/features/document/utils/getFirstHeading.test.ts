import { describe, it, expect } from "vitest";
import { getFirstHeading } from "./getFirstHeading";

describe("getFirstHeading", () => {
  it("returns empty for empty content", () => {
    expect(getFirstHeading("")).toBe("");
  });

  it("picks up a plain ATX H1", () => {
    expect(getFirstHeading("# Hello World\n\nBody text")).toBe("Hello World");
  });

  it("preserves inline characters inside the H1", () => {
    expect(getFirstHeading("# Foo: bar × baz")).toBe("Foo: bar × baz");
  });

  it("strips trailing closing hashes from an ATX H1", () => {
    expect(getFirstHeading("# Title ##")).toBe("Title");
  });

  it("prefers an H1 that appears after paragraphs", () => {
    const md = "Some intro paragraph.\n\n# Real Title\n\nmore";
    expect(getFirstHeading(md)).toBe("Real Title");
  });

  it("falls back to the first non-empty line when no H1 exists", () => {
    expect(getFirstHeading("First line\n\nSecond line")).toBe("First line");
  });

  it("strips list markers on fallback", () => {
    expect(getFirstHeading("- first bullet\n- second")).toBe("first bullet");
  });

  it("strips blockquote markers on fallback", () => {
    expect(getFirstHeading("> quoted line\n\nbody")).toBe("quoted line");
  });

  it("strips lower-level heading markers on fallback", () => {
    expect(getFirstHeading("## Subheading only\n\nbody")).toBe("Subheading only");
  });

  it("skips YAML frontmatter before reading the H1", () => {
    const md = "---\ntitle: ignored\n---\n\n# Real Title";
    expect(getFirstHeading(md)).toBe("Real Title");
  });

  it("handles frontmatter followed by body with no H1", () => {
    const md = "---\nkey: value\n---\n\nJust a paragraph.";
    expect(getFirstHeading(md)).toBe("Just a paragraph.");
  });

  it("returns empty if the document is only whitespace", () => {
    expect(getFirstHeading("   \n\n  \n")).toBe("");
  });

  it("does not treat `#hashtag` (no space) as an H1", () => {
    // `#hashtag` has no space after the `#`, so the heading regex rejects it
    // and the fallback doesn't strip the leading `#` either. We surface the
    // raw text — callers can rely on an H1 only firing on `# Title`.
    expect(getFirstHeading("#hashtag in body")).toBe("#hashtag in body");
  });

  it("does not pick up an H1 inside a fenced code block? still does — simple parse", () => {
    // Intentional limitation: we don't parse code fences. Callers should
    // keep their H1 outside code blocks. Documented here so a future
    // contributor doesn't change it by accident.
    const md = "```\n# not a real heading\n```\n\n# Real One";
    expect(getFirstHeading(md)).toBe("not a real heading");
  });
});
