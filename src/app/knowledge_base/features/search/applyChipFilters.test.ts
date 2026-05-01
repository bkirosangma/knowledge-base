import { describe, it, expect } from "vitest";
import {
  applyChipFilters,
  emptyChipFilters,
  listResultFolders,
  topFolderOf,
} from "./applyChipFilters";
import type { SearchResult } from "./VaultIndex";

function r(
  path: string,
  kind: SearchResult["kind"],
  fields: SearchResult["fieldHits"],
): SearchResult {
  return { path, kind, fieldHits: fields, snippet: "", score: 1 };
}

describe("topFolderOf", () => {
  it("returns the leading segment", () => {
    expect(topFolderOf("notes/a.md")).toBe("notes");
    expect(topFolderOf("notes/sub/b.md")).toBe("notes");
  });
  it("returns empty string for root files", () => {
    expect(topFolderOf("a.md")).toBe("");
  });
});

describe("listResultFolders", () => {
  it("returns distinct folders, root first", () => {
    const out = listResultFolders([
      r("notes/a.md", "doc", []),
      r("a.md", "doc", []),
      r("docs/b.md", "doc", []),
      r("notes/c.md", "doc", []),
    ]);
    expect(out).toEqual(["", "docs", "notes"]);
  });
});

describe("applyChipFilters", () => {
  const results: SearchResult[] = [
    r("a.md", "doc", [{ field: "body", firstPosition: 0 }]),
    r("notes/b.md", "doc", [{ field: "body", firstPosition: 0 }]),
    r("topo.json", "diagram", [{ field: "label", firstPosition: 0 }]),
    r("notes/topo2.json", "diagram", [
      { field: "title", firstPosition: 0 },
      { field: "flow", firstPosition: 0 },
    ]),
  ];

  it("SEARCH-8.6-02a: empty filters pass everything", () => {
    expect(applyChipFilters(results, emptyChipFilters())).toEqual(results);
  });

  it("SEARCH-8.6-02b: kind chip narrows by result kind", () => {
    const out = applyChipFilters(results, {
      kind: "diagram",
      fields: new Set(),
      folders: new Set(),
    });
    expect(out.map((r) => r.path)).toEqual(["topo.json", "notes/topo2.json"]);
  });

  it("SEARCH-8.6-02c: field chip narrows by per-field hits", () => {
    const out = applyChipFilters(results, {
      kind: null,
      fields: new Set(["label"]),
      folders: new Set(),
    });
    expect(out.map((r) => r.path)).toEqual(["topo.json"]);
  });

  it("multiple field chips compose by union (any matching field passes)", () => {
    const out = applyChipFilters(results, {
      kind: null,
      fields: new Set(["title", "label"]),
      folders: new Set(),
    });
    expect(out.map((r) => r.path).sort()).toEqual([
      "notes/topo2.json",
      "topo.json",
    ]);
  });

  it("SEARCH-8.6-02d: folder chip narrows by top-level folder", () => {
    const out = applyChipFilters(results, {
      kind: null,
      fields: new Set(),
      folders: new Set(["notes"]),
    });
    expect(out.map((r) => r.path)).toEqual(["notes/b.md", "notes/topo2.json"]);
  });

  it("root folder chip selects only root-level files", () => {
    const out = applyChipFilters(results, {
      kind: null,
      fields: new Set(),
      folders: new Set([""]),
    });
    expect(out.map((r) => r.path)).toEqual(["a.md", "topo.json"]);
  });

  it("SEARCH-8.6-02e: chip types compose by intersection", () => {
    const out = applyChipFilters(results, {
      kind: "diagram",
      fields: new Set(["title"]),
      folders: new Set(["notes"]),
    });
    expect(out.map((r) => r.path)).toEqual(["notes/topo2.json"]);
  });
});
