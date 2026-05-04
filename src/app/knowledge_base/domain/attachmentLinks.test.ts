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
