/**
 * Module-level helpers that back the `useFileExplorer` hook. Extracted here
 * so the hook file can focus on React state + operation wiring, and so the
 * pure functions are unit-testable without a mocked hook.
 *
 * Three groups:
 *
 * 1. **Tree / naming** — `isSupported`, `isDiagramData`, `uniqueName`,
 *    `collectFilePaths`, `collectAllFilePaths`, `findChildren`. Pure
 *    functions of `TreeNode[]`.
 * 2. **FileSystemDirectoryHandle navigation** — `resolveParentHandle`,
 *    `copyDirContents`. Async walkers over the File System Access API.
 *    TODO MVP-1d: delete resolveParentHandle + copyDirContents with FSA.
 * 3. **File I/O** — `readTextFile`, `writeTextFile`, `getSubdirectoryHandle`
 *    (already re-exported so any caller importing them from the hook file
 *    continues to work — see `useFileExplorer.ts` for the re-export).
 *    TODO MVP-1d: delete FSA I/O helpers when FSA layer is removed.
 */

import type { DiagramData } from "../utils/types";
import type { TreeNode } from "../utils/fileTree";
import type { DocumentRepository } from "../../domain/repositories";
import { updateWikiLinkPaths } from "../../features/document/utils/wikiLinkParser";

// TypeScript lib.dom doesn't ship the async iterator over FSA directory entries.
// This is part of the standard FSA spec, so augment here.
declare global {
  interface FileSystemDirectoryHandle {
    values(): AsyncIterableIterator<FileSystemDirectoryHandle | FileSystemFileHandle>;
  }
}

/** Minimal surface of `useLinkIndex` needed for wiki-link propagation helpers. */
export interface LinkPropagator {
  renameDocumentInIndex(
    oldPath: string,
    newPath: string,
  ): Promise<unknown>;
  getBacklinksFor(docPath: string): { sourcePath: string }[];
}

export function isSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export function isDiagramData(data: unknown): data is DiagramData {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  // Required top-level fields: title string + non-null array for each
  // of the three structural collections. Element shapes (NodeData etc.)
  // are validated at serialize/deserialize time; this guard stays a
  // cheap shallow schema check.
  if (typeof d.title !== "string") return false;
  if (!Array.isArray(d.layers) || !Array.isArray(d.nodes) || !Array.isArray(d.connections)) return false;
  // Optional fields: if present, must be the right kind — otherwise a
  // corrupt vault would still deserialise and downstream routing / flow
  // code would hit `undefined` at runtime.
  if (d.lineCurve !== undefined && d.lineCurve !== "straight" && d.lineCurve !== "bezier" && d.lineCurve !== "orthogonal") {
    return false;
  }
  if (d.flows !== undefined && !Array.isArray(d.flows)) return false;
  if (d.documents !== undefined && !Array.isArray(d.documents)) return false;
  if (d.attachedTo !== undefined && !Array.isArray(d.attachedTo)) return false;
  if (d.sources !== undefined && !Array.isArray(d.sources)) return false;
  if (d.layerManualSizes !== undefined && (typeof d.layerManualSizes !== "object" || d.layerManualSizes === null)) return false;
  return true;
}

/** Find a unique name like "untitled.json", "untitled-1.json", etc. */
export function uniqueName(siblings: TreeNode[], base: string, ext: string): string {
  const existing = new Set(siblings.map((n) => n.name));
  const first = `${base}${ext}`;
  if (!existing.has(first)) return first;
  for (let i = 1; ; i++) {
    const name = `${base}-${i}${ext}`;
    if (!existing.has(name)) return name;
  }
}

/** Collect all file paths under a folder path from the tree. */
export function collectFilePaths(nodes: TreeNode[], folderPath: string): string[] {
  const result: string[] = [];
  function walk(items: TreeNode[]) {
    for (const item of items) {
      if (item.type === "file" && item.path.startsWith(folderPath + "/")) {
        result.push(item.path);
      } else if (item.type === "folder" && item.children) {
        walk(item.children);
      }
    }
  }
  walk(nodes);
  return result;
}

/** Collect all file paths in the tree. */
export function collectAllFilePaths(nodes: TreeNode[]): Set<string> {
  const result = new Set<string>();
  function walk(items: TreeNode[]) {
    for (const item of items) {
      if (item.type === "file") result.add(item.path);
      else if (item.children) walk(item.children);
    }
  }
  walk(nodes);
  return result;
}

/** Resolve parent dir handle from a path. Empty string = root.
 *  TODO MVP-1d: delete with FSA layer. */
export async function resolveParentHandle(
  rootHandle: FileSystemDirectoryHandle,
  parentPath: string,
): Promise<FileSystemDirectoryHandle> {
  if (!parentPath) return rootHandle;
  let current = rootHandle;
  for (const part of parentPath.split("/")) {
    current = await current.getDirectoryHandle(part);
  }
  return current;
}

/** Find children of a given folder path in the tree. */
export function findChildren(tree: TreeNode[], folderPath: string): TreeNode[] {
  if (!folderPath) return tree;
  const parts = folderPath.split("/");
  let nodes = tree;
  for (const part of parts) {
    const folder = nodes.find((n) => n.type === "folder" && n.name === part);
    if (!folder?.children) return [];
    nodes = folder.children;
  }
  return nodes;
}

/** Recursively copy all contents from one directory to another.
 *  TODO MVP-1d: delete with FSA layer. */
export async function copyDirContents(
  src: FileSystemDirectoryHandle,
  dest: FileSystemDirectoryHandle,
): Promise<void> {
  for await (const entry of src.values()) {
    if (entry.kind === "file") {
      const fileHandle = entry as FileSystemFileHandle;
      const file = await fileHandle.getFile();
      const content = await file.arrayBuffer();
      const newHandle = await dest.getFileHandle(entry.name, { create: true });
      const writable = await newHandle.createWritable();
      await writable.write(content);
      await writable.close();
    } else if (entry.kind === "directory") {
      const dirHandle = entry as unknown as FileSystemDirectoryHandle;
      const newDir = await dest.getDirectoryHandle(entry.name, { create: true });
      await copyDirContents(dirHandle, newDir);
    }
  }
}

/* ── File I/O (FSA) — TODO MVP-1d: delete below with FSA layer ── */

export async function readTextFile(handle: FileSystemFileHandle): Promise<string> {
  const file = await handle.getFile();
  return file.text();
}

export async function writeTextFile(
  dirHandle: FileSystemDirectoryHandle,
  path: string,
  content: string,
): Promise<FileSystemFileHandle> {
  const parts = path.split("/");
  let current = dirHandle;
  for (const part of parts.slice(0, -1)) {
    current = await current.getDirectoryHandle(part, { create: true });
  }
  const fileHandle = await current.getFileHandle(parts[parts.length - 1], { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
  return fileHandle;
}

export async function getSubdirectoryHandle(
  rootHandle: FileSystemDirectoryHandle,
  path: string,
  create = false,
): Promise<FileSystemDirectoryHandle> {
  let current = rootHandle;
  for (const part of path.split("/").filter(Boolean)) {
    current = await current.getDirectoryHandle(part, { create });
  }
  return current;
}

/**
 * Update the link index and rewrite every backlink file after a rename.
 * Throws if the index update fails (caller decides whether to reportError).
 * Per-backlink file errors are swallowed so one unreadable file can't block
 * the rest.
 *
 * Uses `DocumentRepository` for file reads/writes — no FSA handles needed.
 */
export async function propagateRename(
  documentRepo: DocumentRepository,
  oldPath: string,
  newPath: string,
  lm: LinkPropagator,
): Promise<void> {
  await lm.renameDocumentInIndex(oldPath, newPath);
  for (const bl of lm.getBacklinksFor(oldPath)) {
    try {
      const content = await documentRepo.read(bl.sourcePath);
      const updated = updateWikiLinkPaths(content, oldPath, newPath);
      if (updated !== content) await documentRepo.write(bl.sourcePath, updated);
    } catch { /* skip unreadable/unwritable backlink files */ }
  }
}

/**
 * Propagate wiki-link updates after a move of a file or folder.
 * Computes old→new path mapping, then calls `propagateRename` for each
 * moved `.md`/`.json` file. Per-file index errors are swallowed so one
 * failure doesn't block the rest.
 *
 * Uses `DocumentRepository` for file reads/writes — no FSA handles needed.
 */
export async function propagateMoveLinks(
  documentRepo: DocumentRepository,
  sourcePath: string,
  targetFolderPath: string,
  tree: TreeNode[],
  lm: LinkPropagator,
): Promise<void> {
  const srcName = sourcePath.split("/").pop()!;
  const newBase = targetFolderPath ? `${targetFolderPath}/${srcName}` : srcName;
  const isFile = sourcePath.endsWith(".md") || sourcePath.endsWith(".json");
  const oldPaths = isFile ? [sourcePath] : collectFilePaths(tree, sourcePath);
  for (const oldFilePath of oldPaths) {
    const newFilePath = isFile ? newBase : oldFilePath.replace(sourcePath + "/", newBase + "/");
    try {
      await propagateRename(documentRepo, oldFilePath, newFilePath, lm);
    } catch { /* skip: one file's index failure doesn't block the rest */ }
  }
}

/**
 * Rename the undo-history sidecar that lives alongside a diagram file.
 * The sidecar is a hidden dotfile: `foo.json` → `.foo.history.json`.
 * Best-effort: silently does nothing if the sidecar is absent or the rename fails.
 * TODO MVP-1d: delete with FSA layer (history sidecar goes away).
 */
export async function renameSidecar(
  parentHandle: FileSystemDirectoryHandle,
  oldFileName: string,
  newFileName: string,
): Promise<void> {
  const newSidecar = `.${newFileName}.history.json`;
  // Try new naming (with extension) first, then fall back to legacy naming.
  const oldSidecarCandidates = [
    `.${oldFileName}.history.json`,
    `.${oldFileName.replace(/\.(json|md)$/, "")}.history.json`,
  ];
  for (const oldSidecar of oldSidecarCandidates) {
    try {
      const oldHandle = await parentHandle.getFileHandle(oldSidecar);
      const content = await (await oldHandle.getFile()).text();
      const newHandle = await parentHandle.getFileHandle(newSidecar, { create: true });
      const writable = await newHandle.createWritable();
      await writable.write(content);
      await writable.close();
      await parentHandle.removeEntry(oldSidecar);
      return;
    } catch {
      // Try next candidate
    }
  }
  // No sidecar exists or rename failed — best-effort
}
