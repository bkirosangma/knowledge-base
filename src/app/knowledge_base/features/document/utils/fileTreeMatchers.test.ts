import { describe, it, expect } from "vitest";
import type { AttachmentLink } from "../../../domain/attachmentLinks";
import type { TreeNode } from "../../../shared/hooks/useFileExplorer";
import {
  tabFileMatcher,
  diagramFileMatcher,
  mdFileMatcher,
  collectAttachableFilePaths,
} from "./fileTreeMatchers";

// ─── Factories ───────────────────────────────────────────────────────────────

function row(
  entityType: AttachmentLink["entityType"],
  entityId: string,
  docPath = "some-doc.md",
): AttachmentLink {
  return { entityType, entityId, docPath };
}

// ─── tabFileMatcher ──────────────────────────────────────────────────────────

describe("tabFileMatcher", () => {
  const PATH = "songs/intro.alphatex";
  const match = tabFileMatcher(PATH);

  it("TAB-11.10-01: matches tab row with exact path", () => {
    expect(match(row("tab", PATH))).toBe(true);
  });

  it("TAB-11.10-02: matches tab-section row with path#fragment", () => {
    expect(match(row("tab-section", PATH + "#verse"))).toBe(true);
  });

  it("TAB-11.10-03: matches tab-track row with path#fragment", () => {
    expect(match(row("tab-track", PATH + "#track-0"))).toBe(true);
  });

  it("TAB-11.10-04: does not match tab row for a different file", () => {
    expect(match(row("tab", "songs/other.alphatex"))).toBe(false);
  });

  it("TAB-11.10-05: does not match tab-section row for a different file", () => {
    expect(match(row("tab-section", "songs/other.alphatex#verse"))).toBe(false);
  });

  it("TAB-11.10-06: does not match tab-section row without # separator (bare prefix)", () => {
    // 'songs/intro.alphatex' must not match 'songs/intro.alphatex.bak#sec1'
    expect(match(row("tab-section", PATH + ".bak#sec1"))).toBe(false);
  });

  it("TAB-11.10-07: does not match node/connection/flow rows", () => {
    expect(match(row("node", PATH))).toBe(false);
    expect(match(row("connection", PATH))).toBe(false);
    expect(match(row("flow", PATH))).toBe(false);
  });
});

// ─── diagramFileMatcher ──────────────────────────────────────────────────────

describe("diagramFileMatcher", () => {
  const IDS = new Set(["node-1", "conn-abc", "flow-x"]);
  const match = diagramFileMatcher(IDS);

  it("DIAG-3.14-01: matches node row whose id is in the set", () => {
    expect(match(row("node", "node-1"))).toBe(true);
  });

  it("DIAG-3.14-02: matches connection row whose id is in the set", () => {
    expect(match(row("connection", "conn-abc"))).toBe(true);
  });

  it("DIAG-3.14-03: matches flow row whose id is in the set", () => {
    expect(match(row("flow", "flow-x"))).toBe(true);
  });

  it("DIAG-3.14-04: does not match node row not in the set", () => {
    expect(match(row("node", "node-99"))).toBe(false);
  });

  it("DIAG-3.14-05: does not match tab/tab-section/tab-track rows even if id matches", () => {
    expect(match(row("tab", "node-1"))).toBe(false);
    expect(match(row("tab-section", "conn-abc"))).toBe(false);
    expect(match(row("tab-track", "flow-x"))).toBe(false);
  });

  it("DIAG-3.14-06: empty id set matches nothing", () => {
    const empty = diagramFileMatcher(new Set());
    expect(empty(row("node", "node-1"))).toBe(false);
    expect(empty(row("connection", "conn-abc"))).toBe(false);
    expect(empty(row("flow", "flow-x"))).toBe(false);
  });
});

// ─── mdFileMatcher ───────────────────────────────────────────────────────────

describe("mdFileMatcher", () => {
  const DOC_PATH = "notes/planning.md";

  it("matches row whose docPath equals the deleted path", () => {
    const r: AttachmentLink = { entityType: "node", entityId: "node-1", docPath: DOC_PATH };
    expect(mdFileMatcher(DOC_PATH)(r)).toBe(true);
  });

  it("does not match row with different docPath", () => {
    const r: AttachmentLink = { entityType: "node", entityId: "node-1", docPath: "notes/other.md" };
    expect(mdFileMatcher(DOC_PATH)(r)).toBe(false);
  });

  it("does not match row with a docPath that merely starts with the deleted path", () => {
    const r: AttachmentLink = {
      entityType: "node",
      entityId: "node-1",
      docPath: DOC_PATH + "-archive.md",
    };
    expect(mdFileMatcher(DOC_PATH)(r)).toBe(false);
  });
});

// ─── collectAttachableFilePaths ───────────────────────────────────────────────

function fileNode(path: string, fileType: TreeNode["fileType"] = "document"): TreeNode {
  return { name: path.split("/").pop()!, path, type: "file", fileType };
}

function folderNode(path: string, children: TreeNode[]): TreeNode {
  return { name: path.split("/").pop()!, path, type: "folder", children };
}

describe("collectAttachableFilePaths", () => {
  const tree: TreeNode[] = [
    folderNode("docs", [
      fileNode("docs/notes.md", "document"),
      fileNode("docs/diagram.kbjson", "diagram"),
      fileNode("docs/song.alphatex", "tab"),
      fileNode("docs/image.svg", "svg"),
      folderNode("docs/sub", [
        fileNode("docs/sub/nested.md", "document"),
        fileNode("docs/sub/nested.kbjson", "diagram"),
      ]),
    ]),
    fileNode("root.md", "document"),
  ];

  it("FS-2.3-68: returns .md files in the target folder subtree", () => {
    const paths = collectAttachableFilePaths(tree, "docs");
    expect(paths).toContain("docs/notes.md");
    expect(paths).toContain("docs/sub/nested.md");
  });

  it("FS-2.3-69: returns .kbjson files in the target folder subtree", () => {
    const paths = collectAttachableFilePaths(tree, "docs");
    expect(paths).toContain("docs/diagram.kbjson");
    expect(paths).toContain("docs/sub/nested.kbjson");
  });

  it("FS-2.3-70: returns .alphatex files in the target folder subtree", () => {
    const paths = collectAttachableFilePaths(tree, "docs");
    expect(paths).toContain("docs/song.alphatex");
  });

  it("FS-2.3-68/69/70: does not include non-attachable extensions (svg)", () => {
    const paths = collectAttachableFilePaths(tree, "docs");
    expect(paths).not.toContain("docs/image.svg");
  });

  it("FS-2.3-71: returns empty array for a folder path not in the tree", () => {
    const paths = collectAttachableFilePaths(tree, "nonexistent");
    expect(paths).toEqual([]);
  });

  it("FS-2.3-71: returns empty array for an empty tree", () => {
    const paths = collectAttachableFilePaths([], "docs");
    expect(paths).toEqual([]);
  });

  it("does not include files from outside the target folder subtree", () => {
    const paths = collectAttachableFilePaths(tree, "docs/sub");
    expect(paths).not.toContain("docs/notes.md");
    expect(paths).not.toContain("root.md");
    expect(paths).toContain("docs/sub/nested.md");
  });
});
