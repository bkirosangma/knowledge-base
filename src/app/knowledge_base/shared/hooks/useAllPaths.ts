"use client";

import { useMemo } from "react";
import type { TreeNode } from "../utils/fileTree";

/**
 * KB-022: memoised flatten of the file-explorer tree to a list of every
 * file path. Keyed on tree object identity — `useFileExplorer` only
 * issues a new tree array via `setTree`, and `watcherRescan` skips that
 * call when the DFS path / lastModified signature is unchanged, so the
 * memo holds across renders that don't alter the vault.
 *
 * Replaces two inline walks: one in `handleNavigateWikiLink`
 * (`knowledgeBase.tsx`, every wiki-link click rebuilt the set) and one
 * in `DocumentView.allDocPaths` (the audit's keystroke complaint —
 * centralising it here lets every consumer share the same memo).
 *
 * Call as `useAllPaths(tree)` for every file (default), or pass an
 * `extensions` array (use the exported `LINKABLE_EXTENSIONS` for the
 * standard `.md` + `.json` filter) to narrow.
 */
export const LINKABLE_EXTENSIONS = [".md", ".json"] as const;

export function useAllPaths(
  tree: TreeNode[],
  extensions?: readonly string[],
): string[] {
  return useMemo(() => {
    const out: string[] = [];
    const walk = (items: TreeNode[]) => {
      for (const item of items) {
        if (item.type === "file") {
          if (!extensions || extensions.some((ext) => item.path.endsWith(ext))) {
            out.push(item.path);
          }
        }
        if (item.children) walk(item.children);
      }
    };
    walk(tree);
    return out;
    // `extensions` should be a stable reference (e.g. the exported
    // `LINKABLE_EXTENSIONS` constant). Inline arrays would bust the memo
    // on every render — which is exactly what KB-022 is fixing.
  }, [tree, extensions]);
}
