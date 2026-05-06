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

// Restored back-compat coverage from the deleted documentAttachments.test.ts.
// Covers DIAG-3.18-06 (getDocumentsForEntity) and DIAG-3.18-07 (hasDocuments).
describe("entityAttachments — back-compat (restored coverage)", () => {
  const doc = (
    id: string,
    attached?: DocumentMeta["attachedTo"],
  ): DocumentMeta => ({ id, filename: `${id}.md`, title: id, attachedTo: attached });

  const fixtures: DocumentMeta[] = [
    doc("d1", [{ type: "node", id: "n1" }]),
    doc("d2", [{ type: "node", id: "n1" }, { type: "connection", id: "c1" }]),
    doc("d3", [{ type: "connection", id: "c1" }]),
    doc("d4", [{ type: "flow", id: "f1" }]),
    doc("d5"),                              // no attachments (undefined)
    doc("d6", []),                          // explicit empty attachments
    doc("d7", [{ type: "root", id: "root" }]),
  ];

  it("DIAG-3.18-07: hasDocuments returns true for every attachedTo.type variant (node/connection/flow/root)", () => {
    expect(hasDocuments(fixtures, "node", "n1")).toBe(true);
    expect(hasDocuments(fixtures, "connection", "c1")).toBe(true);
    expect(hasDocuments(fixtures, "flow", "f1")).toBe(true);
    expect(hasDocuments(fixtures, "root", "root")).toBe(true);
  });

  it("DIAG-3.18-07: hasDocuments returns false on an empty documents list", () => {
    expect(hasDocuments([], "node", "n1")).toBe(false);
  });

  it("DIAG-3.18-07: hasDocuments ignores docs with undefined or empty attachedTo", () => {
    const only = [doc("x"), doc("y", [])];
    expect(hasDocuments(only, "node", "n1")).toBe(false);
  });

  it("DIAG-3.18-06: getDocumentsForEntity returns empty array on an empty documents list", () => {
    expect(getDocumentsForEntity([], "node", "n1")).toEqual([]);
  });

  it("DIAG-3.18-06: getDocumentsForEntity does not leak across types — same id under a different type misses", () => {
    // d3 is attached to ('connection', 'c1'); asking for ('node', 'c1') must miss.
    expect(getDocumentsForEntity(fixtures, "node", "c1")).toEqual([]);
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

// Covers the matchesTarget private helper's three soft-equality branches around diagramPath.
describe("entityAttachments — diagramPath soft equality", () => {
  const docX: DocumentMeta = {
    id: "doc-x",
    filename: "x.md",
    title: "X",
    attachedTo: [{ type: "node", id: "n1", diagramPath: "foo.diagram" }],
  };
  const docLegacy: DocumentMeta = {
    id: "doc-legacy",
    filename: "legacy.md",
    title: "Legacy",
    // No diagramPath — represents legacy doc-centric rows.
    attachedTo: [{ type: "node", id: "n1" }],
  };
  const sources: EntitySources = {
    documents: [docX, docLegacy],
    diagrams: [],
    svgs: [],
    tabs: [],
  };

  it("matches when both target.diagramPath and attachedTo.diagramPath are equal", () => {
    const buckets = attachmentsByType(sources, {
      type: "node",
      id: "n1",
      diagramPath: "foo.diagram",
    });
    // docX matches by exact path; docLegacy matches because legacy rows lack diagramPath.
    expect(buckets.docs).toEqual([docX, docLegacy]);
  });

  it("does not match when both diagramPaths are defined but unequal", () => {
    const onlyX: EntitySources = { documents: [docX], diagrams: [], svgs: [], tabs: [] };
    const buckets = attachmentsByType(onlyX, {
      type: "node",
      id: "n1",
      diagramPath: "bar.diagram",
    });
    expect(buckets.docs).toEqual([]);
  });

  it("matches when target.diagramPath is undefined (caller-side wildcard)", () => {
    const buckets = attachmentsByType(sources, { type: "node", id: "n1" });
    expect(buckets.docs).toEqual([docX, docLegacy]);
  });

  it("matches when target.diagramPath is defined but row.diagramPath is undefined (legacy doc-centric row)", () => {
    const onlyLegacy: EntitySources = {
      documents: [docLegacy],
      diagrams: [],
      svgs: [],
      tabs: [],
    };
    const buckets = attachmentsByType(onlyLegacy, {
      type: "node",
      id: "n1",
      diagramPath: "foo.diagram",
    });
    expect(buckets.docs).toEqual([docLegacy]);
  });
});
