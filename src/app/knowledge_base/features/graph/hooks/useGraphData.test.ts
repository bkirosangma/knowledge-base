import { describe, it, expect } from "vitest";
import {
  buildGraphData,
  applyFilters,
  listTopFolders,
  collectAllPaths,
  type GraphFilters,
} from "./useGraphData";
import type { TreeNode } from "../../../shared/hooks/useFileExplorer";
import type { LinkIndex } from "../../document/types";

function tree(...paths: string[]): TreeNode[] {
  // Flat list of files at the root — sufficient for unit tests.
  return paths.map<TreeNode>((p) => ({
    name: p.split("/").pop() ?? p,
    path: p,
    type: "file",
    fileType: p.endsWith(".json") ? "diagram" : "document",
  }));
}

function emptyIndex(): LinkIndex {
  return { updatedAt: new Date().toISOString(), documents: {}, backlinks: {} };
}

const ALL_TYPES: GraphFilters = {
  folders: null,
  fileTypes: new Set(["md", "json"]),
  orphansOnly: false,
};

describe("useGraphData — buildGraphData", () => {
  it("emits one node per .md / .json file in the tree", () => {
    const t = tree("a.md", "b.md", "c.json");
    const result = buildGraphData(t, emptyIndex());
    expect(result.nodes.map((n) => n.id).sort()).toEqual(["a.md", "b.md", "c.json"]);
    expect(result.links).toEqual([]);
  });

  it("derives label = basename without extension", () => {
    const t = tree("notes/sub/foo.md");
    const result = buildGraphData(t, emptyIndex());
    expect(result.nodes[0].label).toBe("foo");
  });

  it("flags orphans = nodes with 0 incoming + 0 outgoing edges", () => {
    const t = tree("a.md", "b.md", "c.md");
    const idx = emptyIndex();
    idx.documents["a.md"] = {
      outboundLinks: [{ targetPath: "b.md", type: "document" }],
      sectionLinks: [],
    };
    const result = buildGraphData(t, idx);
    const byId = new Map(result.nodes.map((n) => [n.id, n]));
    expect(byId.get("a.md")?.orphan).toBe(false);
    expect(byId.get("b.md")?.orphan).toBe(false);
    expect(byId.get("c.md")?.orphan).toBe(true);
  });

  it("includes orphan diagrams (.json with no incoming links)", () => {
    const t = tree("doc.md", "diagram.json");
    const result = buildGraphData(t, emptyIndex());
    const byId = new Map(result.nodes.map((n) => [n.id, n]));
    expect(byId.get("diagram.json")?.orphan).toBe(true);
    expect(byId.get("diagram.json")?.fileType).toBe("json");
  });

  it("dedupes edges from the same source to the same target", () => {
    const t = tree("a.md", "b.md");
    const idx = emptyIndex();
    idx.documents["a.md"] = {
      outboundLinks: [{ targetPath: "b.md", type: "document" }],
      sectionLinks: [{ targetPath: "b.md", section: "foo" }],
    };
    const result = buildGraphData(t, idx);
    expect(result.links.length).toBe(1);
  });

  it("merges cached layout into nodes", () => {
    const t = tree("a.md");
    const result = buildGraphData(t, emptyIndex(), { "a.md": { x: 100, y: 200 } });
    expect(result.nodes[0].x).toBe(100);
    expect(result.nodes[0].y).toBe(200);
  });

  it("derives folder = top-level path segment", () => {
    const t = tree("docs/a.md", "diagrams/b.json", "root.md");
    const result = buildGraphData(t, emptyIndex());
    const byId = new Map(result.nodes.map((n) => [n.id, n]));
    expect(byId.get("docs/a.md")?.folder).toBe("docs");
    expect(byId.get("diagrams/b.json")?.folder).toBe("diagrams");
    expect(byId.get("root.md")?.folder).toBe("");
  });
});

describe("useGraphData — applyFilters", () => {
  const t = tree("docs/a.md", "diagrams/b.json", "orphan.md");
  const idx: LinkIndex = {
    updatedAt: "now",
    documents: {
      "docs/a.md": {
        outboundLinks: [{ targetPath: "diagrams/b.json", type: "diagram" }],
        sectionLinks: [],
      },
    },
    backlinks: {},
  };

  it("filters out file types that are deselected", () => {
    const data = buildGraphData(t, idx);
    const result = applyFilters(data, {
      ...ALL_TYPES,
      fileTypes: new Set(["md"]),
    });
    expect(result.nodes.find((n) => n.id === "diagrams/b.json")).toBeUndefined();
    // Edge to diagrams/b.json drops because the target was filtered out.
    expect(result.links.length).toBe(0);
  });

  it("filters by folder set", () => {
    const data = buildGraphData(t, idx);
    const result = applyFilters(data, {
      ...ALL_TYPES,
      folders: new Set(["docs"]),
    });
    expect(result.nodes.map((n) => n.id)).toEqual(["docs/a.md"]);
  });

  it("orphansOnly hides connected nodes", () => {
    const data = buildGraphData(t, idx);
    const result = applyFilters(data, { ...ALL_TYPES, orphansOnly: true });
    expect(result.nodes.map((n) => n.id)).toEqual(["orphan.md"]);
  });
});

describe("listTopFolders", () => {
  it("returns sorted distinct top-level folders, root first", () => {
    const t = tree("zeta/a.md", "alpha/b.md", "root.md");
    expect(listTopFolders(t)).toEqual(["", "alpha", "zeta"]);
  });
});

describe("collectAllPaths", () => {
  it("recurses children", () => {
    const t: TreeNode[] = [
      {
        name: "docs",
        path: "docs",
        type: "folder",
        children: [
          { name: "a.md", path: "docs/a.md", type: "file", fileType: "document" },
        ],
      },
    ];
    expect(collectAllPaths(t)).toEqual(["docs/a.md"]);
  });
});
