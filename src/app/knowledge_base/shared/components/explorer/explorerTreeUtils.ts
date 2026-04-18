import type { TreeNode } from "../../hooks/useFileExplorer";
import type { SortField, SortDirection, SortGrouping } from "./ExplorerPanel";
import type { ExplorerFilter } from "../../utils/types";

/**
 * Recursively sort a tree of {@link TreeNode}s by name or lastModified, with
 * folders grouped at the top / bottom / mixed with files. Both "created" and
 * "modified" sort fields use `lastModified` (the only timestamp available via
 * the File System Access API).
 */
export function sortTreeNodes(
  nodes: TreeNode[],
  field: SortField,
  direction: SortDirection,
  grouping: SortGrouping,
): TreeNode[] {
  const compare = (a: TreeNode, b: TreeNode): number => {
    let result: number;
    if (field === "name") {
      result = a.name.localeCompare(b.name);
    } else {
      // Both "created" and "modified" use lastModified (only timestamp available from File API)
      result = (a.lastModified ?? 0) - (b.lastModified ?? 0);
    }
    return direction === "desc" ? -result : result;
  };

  const sorted = [...nodes].map((n) =>
    n.type === "folder" && n.children
      ? { ...n, children: sortTreeNodes(n.children, field, direction, grouping) }
      : n,
  );

  if (grouping === "folders-first") {
    const folders = sorted.filter((n) => n.type === "folder").sort(compare);
    const files = sorted.filter((n) => n.type === "file").sort(compare);
    return [...folders, ...files];
  } else if (grouping === "files-first") {
    const files = sorted.filter((n) => n.type === "file").sort(compare);
    const folders = sorted.filter((n) => n.type === "folder").sort(compare);
    return [...files, ...folders];
  } else {
    return sorted.sort(compare);
  }
}

/**
 * Filter a tree by file-type category. Folders with no surviving children are
 * removed. `null` / `"all"` returns the input unchanged (referentially).
 */
export function filterTreeNodes(
  nodes: TreeNode[],
  filter: ExplorerFilter | null | undefined,
): TreeNode[] {
  if (!filter || filter === "all") return nodes;
  return nodes
    .map((node): TreeNode | null => {
      if (node.type === "folder") {
        const children = filterTreeNodes(node.children ?? [], filter);
        if (children.length === 0) return null;
        return { ...node, children };
      }
      if (filter === "diagrams") return node.fileType === "diagram" ? node : null;
      if (filter === "documents") return node.fileType === "document" ? node : null;
      return node;
    })
    .filter((n): n is TreeNode => n !== null);
}
