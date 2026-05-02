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

function treeWithMtime(entries: ReadonlyArray<{ path: string; mtime: number }>): TreeNode[] {
  return entries.map<TreeNode>(({ path, mtime }) => ({
    name: path.split("/").pop() ?? path,
    path,
    type: "file",
    fileType: path.endsWith(".json") ? "diagram" : "document",
    lastModified: mtime,
  }));
}

function emptyIndex(): LinkIndex {
  return { updatedAt: new Date().toISOString(), documents: {}, backlinks: {} };
}

const ALL_TYPES: GraphFilters = {
  folders: null,
  fileTypes: new Set(["md", "json"]),
  orphansOnly: false,
  recentOnly: false,
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

describe("useGraphData — recentOnly filter", () => {
  it("GRAPH-5.4-12: keeps the 100 most-recently-modified nodes and drops the rest", async () => {
    const { applyFilters: applyFiltersImpl, RECENT_LIMIT } = await import("./useGraphData");
    expect(RECENT_LIMIT).toBe(100);
    const entries = Array.from({ length: 150 }, (_, i) => ({
      path: `note-${String(i).padStart(3, "0")}.md`,
      mtime: 1_000 + i,
    }));
    const t = treeWithMtime(entries);
    const data = buildGraphData(t, emptyIndex());
    const result = applyFiltersImpl(data, { ...ALL_TYPES, recentOnly: true });
    expect(result.nodes).toHaveLength(RECENT_LIMIT);
    const ids = new Set(result.nodes.map((n) => n.id));
    // Keeps note-050..note-149 (the 100 most recent); drops note-000..note-049.
    expect(ids.has("note-149.md")).toBe(true);
    expect(ids.has("note-050.md")).toBe(true);
    expect(ids.has("note-049.md")).toBe(false);
    expect(ids.has("note-000.md")).toBe(false);
  });

  it("GRAPH-5.4-12: tie-breaks by id ascending so the slice is deterministic", async () => {
    const { applyFilters: applyFiltersImpl, RECENT_LIMIT } = await import("./useGraphData");
    // 101 files all sharing the same mtime — RECENT_LIMIT is exceeded by 1.
    const entries = Array.from({ length: RECENT_LIMIT + 1 }, (_, i) => ({
      path: `tie-${String(i).padStart(3, "0")}.md`,
      mtime: 5_000,
    }));
    const data = buildGraphData(treeWithMtime(entries), emptyIndex());
    const result = applyFiltersImpl(data, { ...ALL_TYPES, recentOnly: true });
    const ids = result.nodes.map((n) => n.id).sort();
    expect(ids).toHaveLength(RECENT_LIMIT);
    // Lowest id wins under id-ascending tie break, so tie-100 is the one dropped.
    expect(ids[0]).toBe("tie-000.md");
    expect(ids).not.toContain("tie-100.md");
  });

  it("GRAPH-5.4-12: returns every node when fewer than RECENT_LIMIT nodes exist", async () => {
    const { applyFilters: applyFiltersImpl } = await import("./useGraphData");
    const entries = [
      { path: "a.md", mtime: 1 },
      { path: "b.md", mtime: 2 },
      { path: "c.md", mtime: 3 },
    ];
    const data = buildGraphData(treeWithMtime(entries), emptyIndex());
    const result = applyFiltersImpl(data, { ...ALL_TYPES, recentOnly: true });
    expect(result.nodes.map((n) => n.id).sort()).toEqual(["a.md", "b.md", "c.md"]);
  });

  it("GRAPH-5.4-13: drops edges whose endpoints fell outside the recent slice", async () => {
    const { applyFilters: applyFiltersImpl, RECENT_LIMIT } = await import("./useGraphData");
    // RECENT_LIMIT (100) recent files plus one stale file the recent slice should drop.
    const entries = [
      { path: "stale.md", mtime: 1 },
      ...Array.from({ length: RECENT_LIMIT }, (_, i) => ({
        path: `recent-${String(i).padStart(3, "0")}.md`,
        mtime: 10_000 + i,
      })),
    ];
    const t = treeWithMtime(entries);
    const idx = emptyIndex();
    idx.documents["recent-099.md"] = {
      outboundLinks: [{ targetPath: "stale.md", type: "document" }],
      sectionLinks: [],
    };
    const data = buildGraphData(t, idx);
    const result = applyFiltersImpl(data, { ...ALL_TYPES, recentOnly: true });
    expect(result.nodes.find((n) => n.id === "stale.md")).toBeUndefined();
    expect(result.links.find((e) => e.target === "stale.md")).toBeUndefined();
  });

  it("propagates lastModified onto built GraphNodes", () => {
    const t = treeWithMtime([{ path: "a.md", mtime: 42 }]);
    const data = buildGraphData(t, emptyIndex());
    expect(data.nodes[0].lastModified).toBe(42);
  });
});

describe("GRAPH_NODE_GUARD_THRESHOLD", () => {
  it("equals 300 (KB-042 contract)", async () => {
    const mod = await import("./useGraphData");
    expect(mod.GRAPH_NODE_GUARD_THRESHOLD).toBe(300);
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
