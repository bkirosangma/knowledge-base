import { describe, it, expect } from "vitest";
import { extractHeaders } from "./extractHeaders";

describe("extractHeaders", () => {
  it("returns empty for content with no headers", () => {
    expect(extractHeaders("just text")).toEqual([]);
  });
  it("parses ATX headers H1–H6", () => {
    expect(extractHeaders("# A\n## B\n### C")).toEqual([
      { id: "a", text: "A", level: 1 },
      { id: "b", text: "B", level: 2 },
      { id: "c", text: "C", level: 3 },
    ]);
  });
  it("ignores hash inside code blocks", () => {
    const md = "```\n# not a header\n```\n# real header";
    expect(extractHeaders(md)).toEqual([{ id: "real-header", text: "real header", level: 1 }]);
  });
  it("ignores hash inside indented code", () => {
    expect(extractHeaders("    # indented")).toEqual([]);
  });
  it("trims trailing spaces in heading text", () => {
    expect(extractHeaders("## Foo   ")).toEqual([{ id: "foo", text: "Foo", level: 2 }]);
  });
  it("strips ATX closing-hash run", () => {
    expect(extractHeaders("## Foo ##")).toEqual([{ id: "foo", text: "Foo", level: 2 }]);
    expect(extractHeaders("### Hello ###")).toEqual([{ id: "hello", text: "Hello", level: 3 }]);
    // No leading whitespace before the closing hashes → not a closing run; the # stays in text.
    expect(extractHeaders("## Bar##")).toEqual([{ id: "bar", text: "Bar##", level: 2 }]);
  });
});
