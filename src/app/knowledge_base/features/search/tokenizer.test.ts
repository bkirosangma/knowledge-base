import { describe, it, expect } from "vitest";
import { tokenize, tokenizeWithPositions } from "./tokenizer";

describe("tokenizer", () => {
  it("SEARCH-8.1-01: lowercases input", () => {
    expect(tokenize("Hello World")).toEqual(["hello", "world"]);
  });

  it("SEARCH-8.1-02: strips Markdown punctuation and link syntax", () => {
    // Note: "x" is dropped by the 2-char minimum (SEARCH-8.1-03).
    expect(tokenize("**bold** _italic_ [link](http://x)")).toEqual([
      "bold",
      "italic",
      "link",
      "http",
    ]);
  });

  it("SEARCH-8.1-03: drops tokens shorter than 2 characters", () => {
    expect(tokenize("a b cat")).toEqual(["cat"]);
  });

  it("SEARCH-8.1-04: preserves unicode word characters", () => {
    expect(tokenize("café résumé")).toEqual(["café", "résumé"]);
  });

  it("SEARCH-8.1-05: tokenizeWithPositions returns character offsets", () => {
    const out = tokenizeWithPositions("hello there world");
    expect(out).toEqual([
      { token: "hello", position: 0 },
      { token: "there", position: 6 },
      { token: "world", position: 12 },
    ]);
  });

  it("handles empty input", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenizeWithPositions("")).toEqual([]);
  });

  it("handles whitespace and newlines as separators", () => {
    expect(tokenize("  alpha\n\tbeta   gamma  ")).toEqual(["alpha", "beta", "gamma"]);
  });

  it("treats numbers as word characters", () => {
    expect(tokenize("v1 release 2024")).toEqual(["v1", "release", "2024"]);
  });
});
