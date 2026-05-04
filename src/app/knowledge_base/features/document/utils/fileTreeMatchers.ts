import type { AttachmentLink } from "../../../domain/attachmentLinks";
import type { TreeNode } from "../../../shared/hooks/useFileExplorer";

/**
 * Attachment-row matcher for `.alphatex` file-tree deletions.
 *
 * Matches:
 *   - `tab` rows whose entityId equals the file path exactly.
 *   - `tab-section` and `tab-track` rows whose entityId is prefixed with
 *     `<path>#` (fragment separator for sub-entity ids scoped to this file).
 */
export function tabFileMatcher(
  path: string,
): (r: AttachmentLink) => boolean {
  return (r: AttachmentLink) =>
    (r.entityType === "tab" && r.entityId === path) ||
    ((r.entityType === "tab-section" || r.entityType === "tab-track") &&
      r.entityId.startsWith(path + "#"));
}

/**
 * Attachment-row matcher for `.kbjson` file-tree deletions.
 *
 * Matches `node`, `connection`, and `flow` rows whose entityId appears in
 * the pre-collected set of ids belonging to the deleted diagram.
 */
export function diagramFileMatcher(
  ids: Set<string>,
): (r: AttachmentLink) => boolean {
  return (r: AttachmentLink) =>
    (r.entityType === "node" ||
      r.entityType === "connection" ||
      r.entityType === "flow") &&
    ids.has(r.entityId);
}

/**
 * Attachment-row matcher for `.md` file-tree deletions.
 *
 * Matches all rows whose `docPath` equals the deleted file path.
 */
export function mdFileMatcher(
  path: string,
): (r: AttachmentLink) => boolean {
  return (r: AttachmentLink) => r.docPath === path;
}

/**
 * Walk the subtree rooted at `folderPath` within `tree` and collect every
 * file path whose extension matches our attachment-cleanup branches:
 * `.md`, `.kbjson`, `.alphatex`. Used by folder-delete to compute the set
 * of attachment-link paths to clean up before the folder is unlinked.
 */
export function collectAttachableFilePaths(
  tree: TreeNode[],
  folderPath: string,
): string[] {
  const paths: string[] = [];

  function isAttachable(nodePath: string): boolean {
    return (
      nodePath.endsWith(".md") ||
      nodePath.endsWith(".kbjson") ||
      nodePath.endsWith(".alphatex")
    );
  }

  function walk(nodes: TreeNode[]): void {
    for (const node of nodes) {
      if (node.type === "file" && isAttachable(node.path)) {
        paths.push(node.path);
      }
      if (node.children) {
        walk(node.children);
      }
    }
  }

  function findSubtree(nodes: TreeNode[], path: string): TreeNode[] | null {
    for (const node of nodes) {
      if (node.path === path) {
        return node.children ?? [];
      }
      if (node.children) {
        const found = findSubtree(node.children, path);
        if (found) return found;
      }
    }
    return null;
  }

  const subtree = findSubtree(tree, folderPath);
  if (subtree) {
    walk(subtree);
  }
  return paths;
}
