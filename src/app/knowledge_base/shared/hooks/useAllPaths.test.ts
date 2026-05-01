import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAllPaths, LINKABLE_EXTENSIONS } from "./useAllPaths";
import type { TreeNode } from "../utils/fileTree";

const tree: TreeNode[] = [
  { type: "file", name: "root.md", path: "root.md" },
  {
    type: "folder", name: "docs", path: "docs", children: [
      { type: "file", name: "a.md", path: "docs/a.md" },
      { type: "file", name: "b.json", path: "docs/b.json" },
      { type: "file", name: "c.svg", path: "docs/c.svg" },
    ],
  },
  { type: "file", name: "diagram.json", path: "diagram.json" },
];

describe("useAllPaths — KB-022 memo", () => {
  it("returns every file path in DFS order", () => {
    const { result } = renderHook(() => useAllPaths(tree));
    expect(result.current).toEqual([
      "root.md",
      "docs/a.md",
      "docs/b.json",
      "docs/c.svg",
      "diagram.json",
    ]);
  });

  it("filters to LINKABLE_EXTENSIONS when passed", () => {
    const { result } = renderHook(() => useAllPaths(tree, LINKABLE_EXTENSIONS));
    expect(result.current).toEqual([
      "root.md",
      "docs/a.md",
      "docs/b.json",
      "diagram.json",
    ]);
  });

  it("returns the same array reference across renders when the tree is unchanged", () => {
    const { result, rerender } = renderHook(({ t }) => useAllPaths(t), {
      initialProps: { t: tree },
    });
    const first = result.current;
    rerender({ t: tree });
    rerender({ t: tree });
    expect(result.current).toBe(first);
  });

  it("recomputes when the tree identity changes", () => {
    const { result, rerender } = renderHook(({ t }) => useAllPaths(t), {
      initialProps: { t: tree },
    });
    const first = result.current;
    // New top-level array, same content — counts as identity change.
    rerender({ t: [...tree] });
    expect(result.current).not.toBe(first);
  });

  it("memoises the filtered call separately from the unfiltered call", () => {
    const { result: rAll, rerender: rerenderAll } = renderHook(({ t }) => useAllPaths(t), {
      initialProps: { t: tree },
    });
    const { result: rDocs, rerender: rerenderDocs } = renderHook(
      ({ t }) => useAllPaths(t, LINKABLE_EXTENSIONS),
      { initialProps: { t: tree } },
    );
    const allFirst = rAll.current;
    const docsFirst = rDocs.current;
    rerenderAll({ t: tree });
    rerenderDocs({ t: tree });
    expect(rAll.current).toBe(allFirst);
    expect(rDocs.current).toBe(docsFirst);
  });
});
