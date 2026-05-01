import { describe, it, expect } from "vitest";
import { diagramFields, readForSearchIndex } from "./searchStream";
import type { DiagramData } from "../shared/utils/types";

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

// Minimal mock of the FileSystemDirectoryHandle surface used by the
// document + diagram repositories. Only `getFileHandle` and the file's
// `text()` are exercised — `readTextFile` ultimately calls `getFile()
// .then(f => f.text())`.
interface MockFile {
  text: () => Promise<string>;
}
interface MockFileHandle {
  kind: "file";
  getFile: () => Promise<MockFile>;
}
interface MockDirHandle {
  getFileHandle: (name: string) => Promise<MockFileHandle>;
  getDirectoryHandle: (name: string) => Promise<MockDirHandle>;
}

function makeFsRoot(files: Record<string, string>): FileSystemDirectoryHandle {
  function makeDir(prefix: string): MockDirHandle {
    return {
      async getFileHandle(name: string) {
        const path = prefix ? `${prefix}/${name}` : name;
        const content = files[path];
        if (content === undefined) {
          const err = new Error(`Not found: ${path}`);
          (err as Error & { name: string }).name = "NotFoundError";
          throw err;
        }
        return {
          kind: "file",
          getFile: async () => ({ text: async () => content }),
        };
      },
      async getDirectoryHandle(name: string) {
        return makeDir(prefix ? `${prefix}/${name}` : name);
      },
    };
  }
  return makeDir("") as unknown as FileSystemDirectoryHandle;
}

describe("readForSearchIndex", () => {
  it("reads a markdown body", async () => {
    const root = makeFsRoot({ "notes/a.md": "# Hello\n\nBody alpha." });
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
    const root = makeFsRoot({ "d.json": JSON.stringify(data) });
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
    const root = makeFsRoot({ "x.txt": "ignored" });
    expect(await readForSearchIndex(root, "x.txt")).toBeNull();
  });

  it("returns null for missing files", async () => {
    const root = makeFsRoot({});
    expect(await readForSearchIndex(root, "missing.md")).toBeNull();
  });
});
