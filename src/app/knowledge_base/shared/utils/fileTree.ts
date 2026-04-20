/**
 * Vault tree construction helpers.  Extracted from `useFileExplorer` so they
 * can be unit-tested without a rendered hook.  `scanTree` recursively walks
 * a `FileSystemDirectoryHandle` and returns a sorted tree of `TreeNode`s;
 * `flattenTree` converts that tree into a path → handle lookup map.
 *
 * Rules the scanner enforces (covered by `fileTree.test.ts`):
 *   - Only `.md` and `.json` files appear in the tree.
 *   - History sidecars matching `/^\..*\.history\.json$/` are excluded.
 *   - System files (`CLAUDE.md`, `MEMORY.md`, `AGENTS.md`) are excluded.
 *   - Dot-prefixed folders (`.archdesigner`, `.claude`, etc.) and the
 *     `memory` folder are excluded.
 *   - Entries are sorted: folders first, then files, each group alphabetical.
 *   - Every file carries `fileType` (`"diagram"` for `.json`, `"document"`
 *     for `.md`), the raw `FileSystemFileHandle`, and `lastModified` from
 *     `File.lastModified` (best-effort; swallowed on error).
 */

const HIDDEN_FOLDER_NAMES = new Set(["memory"]);
const HIDDEN_FILE_NAMES = new Set(["CLAUDE.md", "MEMORY.md", "AGENTS.md"]);

export interface TreeNode {
  name: string;
  /** Relative path from root, e.g. "notes/sub/doc.md" */
  path: string;
  type: "file" | "folder";
  /** Derived from extension; only set on files. */
  fileType?: "diagram" | "document";
  children?: TreeNode[];
  handle?: FileSystemFileHandle;
  dirHandle?: FileSystemDirectoryHandle;
  lastModified?: number;
}

export async function scanTree(
  handle: FileSystemDirectoryHandle,
  prefix: string,
): Promise<TreeNode[]> {
  const folders: TreeNode[] = [];
  const files: TreeNode[] = [];

  for await (const entry of handle.values()) {
    if (entry.kind === "directory") {
      if (entry.name.startsWith(".") || HIDDEN_FOLDER_NAMES.has(entry.name)) continue;
      const dirHandle = entry as unknown as FileSystemDirectoryHandle;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      const children = await scanTree(dirHandle, path);
      const maxMod = children.reduce(
        (max, c) => Math.max(max, c.lastModified ?? 0),
        0,
      );
      folders.push({
        name: entry.name,
        path,
        type: "folder",
        dirHandle,
        children,
        lastModified: maxMod || undefined,
      });
    } else if (entry.kind === "file") {
      if (HIDDEN_FILE_NAMES.has(entry.name)) continue;
      const isJson =
        entry.name.endsWith(".json") && !/^\..*\.history\.json$/.test(entry.name);
      const isMd = entry.name.endsWith(".md");
      if (!isJson && !isMd) continue;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      const fileHandle = entry as FileSystemFileHandle;
      let lastModified: number | undefined;
      try {
        const file = await fileHandle.getFile();
        lastModified = file.lastModified;
      } catch {
        /* ignore — best-effort metadata */
      }
      const fileType: "diagram" | "document" = isJson ? "diagram" : "document";
      files.push({
        name: entry.name,
        path,
        type: "file",
        fileType,
        handle: fileHandle,
        lastModified,
      });
    }
  }

  folders.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.name.localeCompare(b.name));
  return [...folders, ...files];
}

export function flattenTree(
  nodes: TreeNode[],
): Map<string, { handle?: FileSystemFileHandle; dirHandle?: FileSystemDirectoryHandle }> {
  const map = new Map<
    string,
    { handle?: FileSystemFileHandle; dirHandle?: FileSystemDirectoryHandle }
  >();
  function walk(items: TreeNode[]) {
    for (const item of items) {
      if (item.type === "file") {
        map.set(item.path, { handle: item.handle });
      } else {
        map.set(item.path, { dirHandle: item.dirHandle });
        if (item.children) walk(item.children);
      }
    }
  }
  walk(nodes);
  return map;
}
