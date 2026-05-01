import { describe, it, expect } from "vitest";
import { basenameOf, exportFilename, stripVaultExtension } from "./exportFilename";

describe("basenameOf", () => {
  it("strips directories", () => {
    expect(basenameOf("notes/sub/a.md")).toBe("a.md");
    expect(basenameOf("a.md")).toBe("a.md");
  });
  it("returns null for empty / null / trailing-slash inputs", () => {
    expect(basenameOf(null)).toBeNull();
    expect(basenameOf("")).toBeNull();
    expect(basenameOf("notes/")).toBeNull();
  });
});

describe("stripVaultExtension", () => {
  it("drops .md / .json", () => {
    expect(stripVaultExtension("a.md")).toBe("a");
    expect(stripVaultExtension("topo.json")).toBe("topo");
  });
  it("leaves other names alone", () => {
    expect(stripVaultExtension("notes")).toBe("notes");
    expect(stripVaultExtension("file.txt")).toBe("file.txt");
  });
});

describe("exportFilename", () => {
  it("EXPORT-9.5-01: produces <basename>.<ext>", () => {
    expect(exportFilename("notes/topo.json", "svg", "diagram")).toBe("topo.svg");
    expect(exportFilename("notes/topo.json", "png", "diagram")).toBe("topo.png");
    expect(exportFilename("intro.md", "pdf", "document")).toBe("intro.pdf");
  });
  it("EXPORT-9.5-02: falls back to default when path is missing", () => {
    expect(exportFilename(null, "svg", "diagram")).toBe("diagram.svg");
    expect(exportFilename("", "pdf", "document")).toBe("document.pdf");
    expect(exportFilename("notes/", "png", "diagram")).toBe("diagram.png");
  });
});
