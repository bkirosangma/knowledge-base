import { describe, it, expect } from "vitest";
import type { DocumentMeta, EntitySources } from "../../document/types";
import { hasDocuments, getDocumentsForEntity, attachmentsByType } from "./entityAttachments";

const docA: DocumentMeta = {
  id: "doc-a",
  filename: "a.md",
  title: "A",
  attachedTo: [{ type: "node", id: "n1" }],
};
const docB: DocumentMeta = {
  id: "doc-b",
  filename: "b.md",
  title: "B",
  attachedTo: [{ type: "node", id: "n1" }, { type: "connection", id: "c1" }],
};

describe("entityAttachments — back-compat helpers", () => {
  it("hasDocuments returns true when any document is attached", () => {
    expect(hasDocuments([docA, docB], "node", "n1")).toBe(true);
  });

  it("hasDocuments returns false when nothing is attached", () => {
    expect(hasDocuments([docA, docB], "node", "n2")).toBe(false);
  });

  it("getDocumentsForEntity returns matching docs only", () => {
    expect(getDocumentsForEntity([docA, docB], "node", "n1")).toEqual([docA, docB]);
    expect(getDocumentsForEntity([docA, docB], "connection", "c1")).toEqual([docB]);
    expect(getDocumentsForEntity([docA, docB], "flow", "f1")).toEqual([]);
  });
});

describe("entityAttachments — attachmentsByType (4-way buckets)", () => {
  const sources: EntitySources = { documents: [docA, docB], diagrams: [], svgs: [], tabs: [] };

  it("returns matching docs in the docs bucket; other buckets empty", () => {
    const buckets = attachmentsByType(sources, { type: "node", id: "n1" });
    expect(buckets.docs).toEqual([docA, docB]);
    expect(buckets.diagrams).toEqual([]);
    expect(buckets.svgs).toEqual([]);
    expect(buckets.tabs).toEqual([]);
  });

  it("returns all-empty buckets when no source matches the target", () => {
    const buckets = attachmentsByType(sources, { type: "node", id: "n999" });
    expect(buckets).toEqual({ docs: [], diagrams: [], svgs: [], tabs: [] });
  });

  it("returns all-empty buckets when sources are empty", () => {
    const empty: EntitySources = { documents: [], diagrams: [], svgs: [], tabs: [] };
    const buckets = attachmentsByType(empty, { type: "node", id: "n1" });
    expect(buckets).toEqual({ docs: [], diagrams: [], svgs: [], tabs: [] });
  });
});
