import { describe, it, expect } from "vitest";
import {
  addRow,
  removeRow,
  isSameRow,
  type AttachmentLink,
} from "./attachmentLinks";

const A: AttachmentLink = { docPath: "a.md", entityType: "node", entityId: "n1" };
const B: AttachmentLink = { docPath: "b.md", entityType: "flow", entityId: "f1" };

describe("isSameRow", () => {
  it("returns true for identical tuple", () => {
    expect(isSameRow(A, { ...A })).toBe(true);
  });
  it("returns false when any field differs", () => {
    expect(isSameRow(A, { ...A, docPath: "x.md" })).toBe(false);
    expect(isSameRow(A, { ...A, entityType: "flow" })).toBe(false);
    expect(isSameRow(A, { ...A, entityId: "n2" })).toBe(false);
  });
});

describe("addRow", () => {
  it("appends a new row", () => {
    expect(addRow([], A)).toEqual([A]);
  });
  it("is idempotent on duplicate (returns same array reference)", () => {
    const rows = [A];
    expect(addRow(rows, { ...A })).toBe(rows);
  });
  it("appends when only one field matches", () => {
    expect(addRow([A], B)).toEqual([A, B]);
  });
});

describe("removeRow", () => {
  it("removes an existing row", () => {
    expect(removeRow([A, B], A)).toEqual([B]);
  });
  it("returns same array reference when row absent", () => {
    const rows = [A];
    expect(removeRow(rows, B)).toBe(rows);
  });
});

import {
  removeMatchingRows,
  replaceSubset,
  migrateRows,
} from "./attachmentLinks";

describe("removeMatchingRows", () => {
  it("removes rows matching the predicate, returns count", () => {
    const rows: AttachmentLink[] = [
      { docPath: "a.md", entityType: "node", entityId: "n1" },
      { docPath: "a.md", entityType: "node", entityId: "n2" },
      { docPath: "b.md", entityType: "flow", entityId: "f1" },
    ];
    const result = removeMatchingRows(rows, (r) => r.entityType === "node");
    expect(result.removed).toBe(2);
    expect(result.rows).toEqual([
      { docPath: "b.md", entityType: "flow", entityId: "f1" },
    ]);
  });
  it("returns same array reference when no match", () => {
    const rows: AttachmentLink[] = [
      { docPath: "a.md", entityType: "node", entityId: "n1" },
    ];
    const result = removeMatchingRows(rows, (r) => r.entityType === "flow");
    expect(result.rows).toBe(rows);
    expect(result.removed).toBe(0);
  });
});

describe("replaceSubset", () => {
  it("removes rows matching (entityTypes, entityIds), then adds replacements", () => {
    const rows: AttachmentLink[] = [
      { docPath: "a.md", entityType: "node", entityId: "n1" },
      { docPath: "a.md", entityType: "tab-track", entityId: "t.alphatex#track:u1" },
    ];
    const replacement: AttachmentLink[] = [
      { docPath: "a.md", entityType: "node", entityId: "n2" },
    ];
    const next = replaceSubset(
      rows,
      new Set(["node", "connection", "flow", "type", "root"]),
      new Set(["n1"]),
      replacement,
    );
    expect(next).toEqual([
      { docPath: "a.md", entityType: "tab-track", entityId: "t.alphatex#track:u1" },
      { docPath: "a.md", entityType: "node", entityId: "n2" },
    ]);
  });
  it("preserves rows whose entityType is outside the subset entityTypes", () => {
    const rows: AttachmentLink[] = [
      { docPath: "a.md", entityType: "tab-track", entityId: "x" },
    ];
    const next = replaceSubset(
      rows,
      new Set(["node"]),
      new Set(["n1"]),
      [],
    );
    expect(next).toEqual(rows);
  });
});

describe("migrateRows", () => {
  it("rewrites tab-section / tab-track ids per the map", () => {
    const rows: AttachmentLink[] = [
      { docPath: "a.md", entityType: "tab-section", entityId: "f.alphatex#old" },
      { docPath: "a.md", entityType: "tab-track", entityId: "f.alphatex#track:T" },
      { docPath: "a.md", entityType: "node", entityId: "n1" },
    ];
    const next = migrateRows(rows, new Map([
      ["f.alphatex#old", "f.alphatex#new"],
    ]));
    expect(next).toEqual([
      { docPath: "a.md", entityType: "tab-section", entityId: "f.alphatex#new" },
      { docPath: "a.md", entityType: "tab-track", entityId: "f.alphatex#track:T" },
      { docPath: "a.md", entityType: "node", entityId: "n1" },
    ]);
  });
  it("leaves diagram-scope ids untouched even if the map has matching keys", () => {
    const rows: AttachmentLink[] = [
      { docPath: "a.md", entityType: "node", entityId: "n1" },
    ];
    const next = migrateRows(rows, new Map([["n1", "n2"]]));
    expect(next).toEqual(rows);
  });
});
