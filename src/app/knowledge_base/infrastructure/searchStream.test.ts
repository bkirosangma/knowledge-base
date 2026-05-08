import { describe, it, expect } from "vitest";
import { diagramFields, readForSearchIndex } from "./searchStream";
import type { DiagramData } from "../shared/utils/types";
import type { DocumentRepository } from "../domain/repositories";
import { FileSystemError } from "../domain/errors";

describe("diagramFields", () => {
  it("extracts title, layer titles, node labels (+ subs), and flow names", () => {
    const data: DiagramData = {
      title: "topology",
      layers: [
        { id: "l1", title: "frontend", bg: "#fff", border: "#000" },
        { id: "l2", title: "backend", bg: "#fff", border: "#000" },
      ],
      nodes: [
        {
          id: "n1",
          label: "alpha service",
          sub: "ingress",
          icon: "default",
          x: 0,
          y: 0,
          w: 1,
          layer: "l1",
        },
        {
          id: "n2",
          label: "beta",
          icon: "default",
          x: 1,
          y: 0,
          w: 1,
          layer: "l2",
        },
      ],
      connections: [],
      flows: [
        { id: "f1", name: "alpha flow", connectionIds: [] },
      ],
    };

    expect(diagramFields(data)).toEqual({
      title: "topology",
      layerTitles: ["frontend", "backend"],
      nodeLabels: ["alpha service", "ingress", "beta"],
      flowNames: ["alpha flow"],
    });
  });

  it("tolerates missing flows and empty layers/nodes", () => {
    const data: DiagramData = {
      title: "empty",
      layers: [],
      nodes: [],
      connections: [],
    };
    expect(diagramFields(data)).toEqual({
      title: "empty",
      layerTitles: [],
      nodeLabels: [],
      flowNames: [],
    });
  });

  it("skips empty layer titles and flow names", () => {
    const data: DiagramData = {
      title: "x",
      layers: [
        { id: "l1", title: "", bg: "#fff", border: "#000" },
        { id: "l2", title: "real", bg: "#fff", border: "#000" },
      ],
      nodes: [],
      connections: [],
      flows: [
        { id: "f1", name: "", connectionIds: [] },
        { id: "f2", name: "named", connectionIds: [] },
      ],
    };
    const out = diagramFields(data);
    expect(out.layerTitles).toEqual(["real"]);
    expect(out.flowNames).toEqual(["named"]);
  });
});

/**
 * Build a DocumentRepository stub from a flat path→content record.
 * `read` returns the content or throws FileSystemError("not-found").
 * `write` is a no-op (search index tests don't need it).
 */
function makeDocumentRepo(files: Record<string, string>): DocumentRepository {
  return {
    async read(path: string): Promise<string> {
      if (path in files) return files[path];
      throw new FileSystemError("not-found", `Not found: ${path}`);
    },
    async write(_path: string, _content: string): Promise<void> {
      // no-op for search index tests
    },
  };
}

describe("readForSearchIndex", () => {
  it("reads a markdown body", async () => {
    const root = makeDocumentRepo({ "notes/a.md": "# Hello\n\nBody alpha." });
    const out = await readForSearchIndex(root, "notes/a.md");
    expect(out).toEqual({
      path: "notes/a.md",
      kind: "doc",
      fields: { body: "# Hello\n\nBody alpha." },
    });
  });

  it("reads a diagram and extracts indexable fields", async () => {
    const data: DiagramData = {
      title: "topo",
      layers: [{ id: "l1", title: "front", bg: "#fff", border: "#000" }],
      nodes: [
        { id: "n1", label: "alpha", icon: "default", x: 0, y: 0, w: 1, layer: "l1" },
      ],
      connections: [],
    };
    const root = makeDocumentRepo({ "d.json": JSON.stringify(data) });
    const out = await readForSearchIndex(root, "d.json");
    expect(out?.kind).toBe("diagram");
    expect(out?.fields).toEqual({
      title: "topo",
      layerTitles: ["front"],
      nodeLabels: ["alpha"],
      flowNames: [],
    });
  });

  it("returns null for unknown extensions", async () => {
    const root = makeDocumentRepo({ "x.txt": "ignored" });
    expect(await readForSearchIndex(root, "x.txt")).toBeNull();
  });

  it("returns null for missing files", async () => {
    const root = makeDocumentRepo({});
    expect(await readForSearchIndex(root, "missing.md")).toBeNull();
  });

  it("reads a .alphatex tab and extracts indexable fields", async () => {
    const src = [
      `\\title "Wonderwall"`,
      `\\artist "Oasis"`,
      `\\key "F# minor"`,
      `\\tuning E5 B4 G4 D4 A3 E3`,
      `\\track "Acoustic"`,
      `\\track "Lead"`,
      `\\lyrics "Today is gonna be the day"`,
      `. r.4 |`,
    ].join("\n");
    const root = makeDocumentRepo({ "songs/wonderwall.alphatex": src });
    const out = await readForSearchIndex(root, "songs/wonderwall.alphatex");
    expect(out?.kind).toBe("tab");
    expect(out?.fields.title).toBe("Wonderwall");
    expect(out?.fields.body).toContain("Oasis");
    expect(out?.fields.body).toContain("F# minor");
    expect(out?.fields.body).toContain("E5 B4 G4 D4 A3 E3");
    expect(out?.fields.body).toContain("Acoustic, Lead");
    expect(out?.fields.body).toContain("Today is gonna be the day");
  });

  it("indexes a .alphatex tab even when only \\title is present", async () => {
    const root = makeDocumentRepo({ "minimal.alphatex": `\\title "X"\n. r.4 |` });
    const out = await readForSearchIndex(root, "minimal.alphatex");
    expect(out).toEqual({
      path: "minimal.alphatex",
      kind: "tab",
      fields: { title: "X", body: "" },
    });
  });

  it("returns null for an unreadable .alphatex file", async () => {
    const root = makeDocumentRepo({});
    expect(await readForSearchIndex(root, "missing.alphatex")).toBeNull();
  });
});
