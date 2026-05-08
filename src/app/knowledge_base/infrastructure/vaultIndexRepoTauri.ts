/**
 * Tauri implementation of `VaultIndexRepository`. Delegates to the
 * `tauriBridge` VFS primitives.
 *
 * Sort order mirrors the FSA `scanTree` in `fileTree.ts`: files first,
 * then folders, each group alphabetical.
 */

import type { VaultIndexRepository } from "../domain/repositories";
import type { TreeNode } from "../shared/utils/fileTree";
import { tauriBridge } from "./tauriBridge";

const KIND_BY_EXT: Record<string, TreeNode["fileType"]> = {
  ".md": "document",
  ".json": "diagram",
  ".svg": "svg",
  ".alphatex": "tab",
};
const HIDDEN_FOLDERS = new Set(["memory"]);
const HIDDEN_FILES = new Set(["CLAUDE.md", "MEMORY.md", "AGENTS.md"]);
const HISTORY_SIDECAR = /^\..*\.history\.json$/;

export function createVaultIndexRepositoryTauri(): VaultIndexRepository {
  return {
    scan: () => scanRecursive(""),
    rename: (from, to) => tauriBridge.rename(from, to),
    delete: (path) => tauriBridge.delete(path),
    exists: (path) => tauriBridge.exists(path),
    async createFolder(path) {
      // Tauri has no dedicated create_dir command; vault_write_text creates
      // parent dirs as a side effect. Write a sentinel `.kbkeep` file.
      // TODO: add a vault_create_dir command to avoid the sentinel artifact.
      await tauriBridge.writeText(`${path}/.kbkeep`, "");
    },
  };
}

async function scanRecursive(dir: string): Promise<TreeNode[]> {
  const entries = await tauriBridge.list(dir);
  const folders: TreeNode[] = [];
  const files: TreeNode[] = [];
  for (const e of entries) {
    if (e.kind === "directory") {
      if (HIDDEN_FOLDERS.has(e.name) || e.name.startsWith(".")) continue;
      folders.push({
        name: e.name,
        path: e.path,
        type: "folder",
        children: await scanRecursive(e.path),
      });
    } else {
      if (HIDDEN_FILES.has(e.name) || HISTORY_SIDECAR.test(e.name)) continue;
      const dot = e.name.lastIndexOf(".");
      const ext = dot >= 0 ? e.name.slice(dot) : "";
      const fileType = KIND_BY_EXT[ext];
      if (!fileType) continue;
      files.push({ name: e.name, path: e.path, type: "file", fileType });
    }
  }
  // files first, then folders — matches FSA scanTree sort order
  files.sort((a, b) => a.name.localeCompare(b.name));
  folders.sort((a, b) => a.name.localeCompare(b.name));
  return [...files, ...folders];
}
