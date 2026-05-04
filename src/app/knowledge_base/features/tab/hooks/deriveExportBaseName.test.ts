import { describe, it, expect } from "vitest";
import { deriveExportBaseName } from "./deriveExportBaseName";

describe("deriveExportBaseName", () => {
  it("strips path and .alphatex suffix", () => {
    expect(deriveExportBaseName("songs/wonderwall.alphatex")).toBe("wonderwall");
  });
  it("handles nested paths", () => {
    expect(deriveExportBaseName("a/b/c/song.alphatex")).toBe("song");
  });
  it("handles a bare filename without path separators", () => {
    expect(deriveExportBaseName("song.alphatex")).toBe("song");
  });
  it("returns 'tab' when filePath is null", () => {
    expect(deriveExportBaseName(null)).toBe("tab");
  });
  it("returns 'tab' for an empty string", () => {
    expect(deriveExportBaseName("")).toBe("tab");
  });
  it("preserves names without an .alphatex suffix as-is", () => {
    expect(deriveExportBaseName("a/b/odd.txt")).toBe("odd.txt");
  });
});
