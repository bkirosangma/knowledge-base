"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import type { DiagramData, NodeData, LayerDef, Connection, LineCurveAlgorithm, FlowDef } from "../utils/types";
import { loadDraft, clearDraft, listDrafts, createEmptyDiagram, saveDraft, clearViewport, migrateViewport, cleanupOrphanedData } from "../utils/persistence";
import { setDirectoryScope, clearDirectoryScope } from "../utils/directoryScope";
import { saveDirHandle, loadDirHandle, clearDirHandle } from "../utils/idbHandles";

/* ── Tree types ── */

export interface TreeNode {
  name: string;
  path: string; // relative path from root, e.g. "data/thanos.json"
  type: "file" | "folder";
  fileType?: "diagram" | "document"; // derived from extension
  children?: TreeNode[];
  handle?: FileSystemFileHandle;
  dirHandle?: FileSystemDirectoryHandle;
  lastModified?: number;
}

const DIR_NAME_KEY = "knowledge-base-directory-name";
const ACTIVE_FILE_KEY = "knowledge-base-active-file";

/* ── Helpers ── */

function isSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

function isDiagramData(data: unknown): data is DiagramData {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return Array.isArray(d.layers) && Array.isArray(d.nodes) && Array.isArray(d.connections);
}

/** Recursively scan a directory and build a tree. Include .json and .md files. */
async function scanTree(handle: FileSystemDirectoryHandle, prefix: string): Promise<TreeNode[]> {
  const folders: TreeNode[] = [];
  const files: TreeNode[] = [];

  for await (const entry of handle.values()) {
    if (entry.kind === "directory") {
      const dirHandle = entry as unknown as FileSystemDirectoryHandle;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      const children = await scanTree(dirHandle, path);
      // Folder lastModified = max of children's lastModified
      const maxMod = children.reduce((max, c) => Math.max(max, c.lastModified ?? 0), 0);
      folders.push({ name: entry.name, path, type: "folder", dirHandle, children, lastModified: maxMod || undefined });
    } else if (entry.kind === "file") {
      const isJson = entry.name.endsWith(".json") && !/^\..*\.history\.json$/.test(entry.name);
      const isMd = entry.name.endsWith(".md");
      if (!isJson && !isMd) continue;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      const fileHandle = entry as FileSystemFileHandle;
      let lastModified: number | undefined;
      try {
        const file = await fileHandle.getFile();
        lastModified = file.lastModified;
      } catch { /* ignore */ }
      const fileType: "diagram" | "document" = isJson ? "diagram" : "document";
      files.push({ name: entry.name, path, type: "file", fileType, handle: fileHandle, lastModified });
    }
  }

  folders.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.name.localeCompare(b.name));
  return [...folders, ...files];
}

/** Flatten tree to a map of path → handle for quick lookup. */
function flattenTree(nodes: TreeNode[]): Map<string, { handle?: FileSystemFileHandle; dirHandle?: FileSystemDirectoryHandle }> {
  const map = new Map<string, { handle?: FileSystemFileHandle; dirHandle?: FileSystemDirectoryHandle }>();
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

/** Find a unique name like "untitled.json", "untitled-1.json", etc. */
function uniqueName(siblings: TreeNode[], base: string, ext: string): string {
  const existing = new Set(siblings.map((n) => n.name));
  const first = `${base}${ext}`;
  if (!existing.has(first)) return first;
  for (let i = 1; ; i++) {
    const name = `${base}-${i}${ext}`;
    if (!existing.has(name)) return name;
  }
}

/** Collect all file paths under a folder path from the tree. */
function collectFilePaths(nodes: TreeNode[], folderPath: string): string[] {
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
function collectAllFilePaths(nodes: TreeNode[]): Set<string> {
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

/** Resolve parent dir handle from a path. Empty string = root. */
async function resolveParentHandle(
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
function findChildren(tree: TreeNode[], folderPath: string): TreeNode[] {
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

/** Recursively copy all contents from one directory to another. */
async function copyDirContents(src: FileSystemDirectoryHandle, dest: FileSystemDirectoryHandle): Promise<void> {
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

/* ── File system utilities ── */

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

/* ── Hook ── */

export function useFileExplorer() {
  const [directoryName, setDirectoryName] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(DIR_NAME_KEY);
  });
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [dirtyFiles, setDirtyFiles] = useState<Set<string>>(() => listDrafts());
  const [pendingFile, setPendingFile] = useState<string | null>(null);
  const dirHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const fileMap = useMemo(() => flattenTree(tree), [tree]);

  // Persist activeFile
  useEffect(() => {
    if (activeFile) localStorage.setItem(ACTIVE_FILE_KEY, activeFile);
  }, [activeFile]);

  // Restore from IndexedDB on mount
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current || !isSupported()) return;
    restoredRef.current = true;

    (async () => {
      const stored = await loadDirHandle();
      if (!stored) return;
      const { handle, scopeId } = stored;
      try {
        const perm = await handle.requestPermission({ mode: "readwrite" });
        if (perm !== "granted") return;

        dirHandleRef.current = handle;
        setDirectoryScope(scopeId);
        setDirectoryName(handle.name);
        localStorage.setItem(DIR_NAME_KEY, handle.name);
        setIsLoading(true);

        const nodes = await scanTree(handle, "");
        setTree(nodes);
        // Clean up localStorage for files that no longer exist on disk
        cleanupOrphanedData(collectAllFilePaths(nodes));
        setDirtyFiles(listDrafts());
        setIsLoading(false);

        const lastFile = localStorage.getItem(ACTIVE_FILE_KEY);
        const flat = flattenTree(nodes);
        if (lastFile && flat.has(lastFile)) {
          setPendingFile(lastFile);
        }
      } catch {
        await clearDirHandle();
        clearDirectoryScope();
        localStorage.removeItem(DIR_NAME_KEY);
        setDirectoryName(null);
      }
    })();
  }, []);

  const rescan = useCallback(async () => {
    if (!dirHandleRef.current) return;
    const nodes = await scanTree(dirHandleRef.current, "");
    setTree(nodes);
    setDirtyFiles(listDrafts());
  }, []);

  const openFolder = useCallback(async () => {
    if (isSupported()) {
      try {
        const handle = await window.showDirectoryPicker({ mode: "readwrite" });
        dirHandleRef.current = handle;
        const scopeId = crypto.randomUUID().slice(0, 8);
        setDirectoryScope(scopeId);
        setDirectoryName(handle.name);
        localStorage.setItem(DIR_NAME_KEY, handle.name);
        await saveDirHandle(handle, scopeId);
        setIsLoading(true);
        const nodes = await scanTree(handle, "");
        setTree(nodes);
        setActiveFile(null);
        setDirtyFiles(listDrafts());
        setIsLoading(false);
      } catch (e: unknown) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setIsLoading(false);
      }
    } else {
      inputRef.current?.click();
    }
  }, []);

  const handleFallbackInput = useCallback((fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    // Fallback: flat file list, no tree structure
    const nodes: TreeNode[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      if (f.name.endsWith(".json")) {
        nodes.push({ type: "file", name: f.name, path: f.name });
      }
    }
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    const pathParts = fileList[0]?.webkitRelativePath?.split("/");
    const folderName = pathParts?.[0] ?? "Folder";
    setDirectoryName(folderName);
    localStorage.setItem(DIR_NAME_KEY, folderName);
    setTree(nodes);
    setActiveFile(null);
    setDirtyFiles(listDrafts());
  }, []);

  const selectFile = useCallback(async (filePath: string): Promise<{ data: DiagramData; diskJson: string; hasDraft: boolean } | null> => {
    const entry = fileMap.get(filePath);
    let diskData: DiagramData | null = null;
    let diskJson = "";
    if (entry?.handle) {
      try {
        const file = await entry.handle.getFile();
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (isDiagramData(parsed)) {
          diskData = parsed;
          diskJson = text;
        }
      } catch { /* ignore */ }
    }

    const draft = loadDraft(filePath);
    if (draft && isDiagramData(draft) && diskData) {
      setActiveFile(filePath);
      return { data: draft, diskJson, hasDraft: true };
    }

    if (!diskData) return null;
    setActiveFile(filePath);
    return { data: diskData, diskJson, hasDraft: false };
  }, [fileMap]);

  const saveFile = useCallback(async (
    filePath: string,
    title: string,
    layers: LayerDef[],
    nodes: NodeData[],
    connections: Connection[],
    layerManualSizes: Record<string, { left?: number; width?: number; top?: number; height?: number }>,
    lineCurve: LineCurveAlgorithm,
    serializeNodesFn: (nodes: NodeData[]) => DiagramData["nodes"],
    flows: FlowDef[] = [],
    documents?: DiagramData["documents"],
  ): Promise<boolean> => {
    const data: DiagramData = { title, layers, nodes: serializeNodesFn(nodes), connections, layerManualSizes, lineCurve, flows, ...(documents && documents.length > 0 ? { documents } : {}) };
    const json = JSON.stringify(data, null, 2);

    const entry = fileMap.get(filePath);
    if (entry?.handle) {
      try {
        const writable = await entry.handle.createWritable();
        await writable.write(json);
        await writable.close();
        clearDraft(filePath);
        setDirtyFiles((prev) => { const next = new Set(prev); next.delete(filePath); return next; });
        return true;
      } catch { return false; }
    }
    // Fallback download
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filePath.split("/").pop() || "diagram.json";
    a.click();
    URL.revokeObjectURL(url);
    clearDraft(filePath);
    setDirtyFiles((prev) => { const next = new Set(prev); next.delete(filePath); return next; });
    return true;
  }, [fileMap]);

  /** Create a new file with a default name. Returns { path, data } or null. */
  const createFile = useCallback(async (parentPath: string = ""): Promise<{ path: string; data: DiagramData } | null> => {
    if (!dirHandleRef.current) return null;
    try {
      const parentHandle = await resolveParentHandle(dirHandleRef.current, parentPath);
      const siblings = findChildren(tree, parentPath);
      const fileName = uniqueName(siblings, "untitled", ".json");
      const fileHandle = await parentHandle.getFileHandle(fileName, { create: true });
      const filePath = parentPath ? `${parentPath}/${fileName}` : fileName;
      const title = fileName.replace(/\.json$/, "").replace(/[-_]/g, " ");
      const data = createEmptyDiagram(title);
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify(data, null, 2));
      await writable.close();

      await rescan();
      setActiveFile(filePath);
      return { path: filePath, data };
    } catch { return null; }
  }, [tree, rescan]);

  /** Create a new folder with a default name. Returns the path or null. */
  const createFolder = useCallback(async (parentPath: string = ""): Promise<string | null> => {
    if (!dirHandleRef.current) return null;
    try {
      const parentHandle = await resolveParentHandle(dirHandleRef.current, parentPath);
      const siblings = findChildren(tree, parentPath);
      const folderName = uniqueName(siblings, "new-folder", "");
      await parentHandle.getDirectoryHandle(folderName, { create: true });
      const folderPath = parentPath ? `${parentPath}/${folderName}` : folderName;
      await rescan();
      return folderPath;
    } catch { return null; }
  }, [tree, rescan]);

  const deleteFile = useCallback(async (filePath: string): Promise<boolean> => {
    if (!dirHandleRef.current) return false;
    try {
      const parts = filePath.split("/");
      const name = parts.pop()!;
      const parentPath = parts.join("/");
      const parentHandle = await resolveParentHandle(dirHandleRef.current, parentPath);
      await parentHandle.removeEntry(name);
      clearDraft(filePath);
      await rescan();
      if (activeFile === filePath) {
        setActiveFile(null);
        localStorage.removeItem(ACTIVE_FILE_KEY);
      }
      // Defer viewport cleanup so it runs after the viewport persistence
      // effect saves on file switch (which would otherwise re-create the key)
      setTimeout(() => clearViewport(filePath), 0);
      return true;
    } catch { return false; }
  }, [rescan, activeFile]);

  const deleteFolder = useCallback(async (folderPath: string): Promise<boolean> => {
    if (!dirHandleRef.current) return false;
    try {
      const parts = folderPath.split("/");
      const name = parts.pop()!;
      const parentPath = parts.join("/");
      const parentHandle = await resolveParentHandle(dirHandleRef.current, parentPath);
      // Clean up localStorage for all files in the folder
      const folderFiles = collectFilePaths(tree, folderPath);
      for (const fp of folderFiles) {
        clearDraft(fp);
      }
      await parentHandle.removeEntry(name, { recursive: true });
      await rescan();
      // If active file was inside this folder, clear it
      if (activeFile?.startsWith(folderPath + "/")) {
        setActiveFile(null);
        localStorage.removeItem(ACTIVE_FILE_KEY);
      }
      // Defer viewport cleanup so it runs after viewport persistence effect
      setTimeout(() => { for (const fp of folderFiles) clearViewport(fp); }, 0);
      return true;
    } catch { return false; }
  }, [rescan, activeFile]);

  const renameFile = useCallback(async (oldPath: string, newName: string): Promise<string | null> => {
    if (!dirHandleRef.current) return null;
    const parts = oldPath.split("/");
    const oldName = parts.pop()!;
    const parentPath = parts.join("/");
    if (oldName === newName) return oldPath;
    try {
      const parentHandle = await resolveParentHandle(dirHandleRef.current, parentPath);
      // Read old content
      const oldHandle = await parentHandle.getFileHandle(oldName);
      const oldFile = await oldHandle.getFile();
      const content = await oldFile.text();
      // Create new file
      const finalName = newName.endsWith(".json") ? newName : `${newName}.json`;
      const newHandle = await parentHandle.getFileHandle(finalName, { create: true });
      const writable = await newHandle.createWritable();
      await writable.write(content);
      await writable.close();
      // Delete old
      await parentHandle.removeEntry(oldName);
      clearDraft(oldPath);

      const newPath = parentPath ? `${parentPath}/${finalName}` : finalName;
      migrateViewport(oldPath, newPath);
      await rescan();
      if (activeFile === oldPath) setActiveFile(newPath);
      return newPath;
    } catch { return null; }
  }, [rescan, activeFile]);

  const renameFolder = useCallback(async (oldPath: string, newName: string): Promise<string | null> => {
    if (!dirHandleRef.current) return null;
    const parts = oldPath.split("/");
    const oldName = parts.pop()!;
    const parentPath = parts.join("/");
    if (oldName === newName) return oldPath;

    try {
      const parentHandle = await resolveParentHandle(dirHandleRef.current, parentPath);
      // Create new folder
      const newDirHandle = await parentHandle.getDirectoryHandle(newName, { create: true });
      // Copy all files from old folder to new folder (shallow)
      const oldDirHandle = await parentHandle.getDirectoryHandle(oldName);
      for await (const entry of oldDirHandle.values()) {
        if (entry.kind === "file") {
          const fileHandle = entry as FileSystemFileHandle;
          const file = await fileHandle.getFile();
          const content = await file.arrayBuffer();
          const newFileHandle = await newDirHandle.getFileHandle(entry.name, { create: true });
          const writable = await newFileHandle.createWritable();
          await writable.write(content);
          await writable.close();
        }
        // For simplicity, skip nested directories in rename
      }
      // Delete old folder
      await parentHandle.removeEntry(oldName, { recursive: true });

      const newPath = parentPath ? `${parentPath}/${newName}` : newName;
      // Migrate localStorage for all files in the renamed folder
      const oldFiles = collectFilePaths(tree, oldPath);
      for (const fp of oldFiles) {
        const newFp = fp.replace(oldPath, newPath);
        migrateViewport(fp, newFp);
        const draft = loadDraft(fp);
        if (draft) {
          saveDraft(newFp, draft.title ?? "", draft.layers, draft.nodes as never[], draft.connections, draft.layerManualSizes ?? {}, draft.lineCurve ?? "orthogonal");
          clearDraft(fp);
        }
      }
      await rescan();
      // Update activeFile if it was inside the renamed folder
      if (activeFile?.startsWith(oldPath + "/")) {
        setActiveFile(activeFile.replace(oldPath, newPath));
      }
      return newPath;
    } catch { return null; }
  }, [rescan, activeFile]);

  /** Duplicate a file. Returns { path, data } for the new copy, or null. */
  const duplicateFile = useCallback(async (sourcePath: string): Promise<{ path: string; data: DiagramData } | null> => {
    if (!dirHandleRef.current) return null;
    const entry = fileMap.get(sourcePath);
    if (!entry?.handle) return null;
    try {
      const file = await entry.handle.getFile();
      const content = await file.text();

      const parts = sourcePath.split("/");
      const srcName = parts.pop()!;
      const parentPath = parts.join("/");
      const parentHandle = await resolveParentHandle(dirHandleRef.current, parentPath);
      const siblings = findChildren(tree, parentPath);

      // Generate copy name: "thanos-copy.json", "thanos-copy-1.json", etc.
      const baseName = srcName.replace(/\.json$/, "");
      const copyName = uniqueName(siblings, `${baseName}-copy`, ".json");
      const newHandle = await parentHandle.getFileHandle(copyName, { create: true });
      const writable = await newHandle.createWritable();
      await writable.write(content);
      await writable.close();

      const newPath = parentPath ? `${parentPath}/${copyName}` : copyName;
      await rescan();
      setActiveFile(newPath);

      const parsed = JSON.parse(content);
      if (isDiagramData(parsed)) return { path: newPath, data: parsed };
      return { path: newPath, data: createEmptyDiagram(copyName.replace(/\.json$/, "")) };
    } catch { return null; }
  }, [fileMap, tree, rescan]);

  /** Move a file or folder into a target folder. Returns new path or null. */
  const moveItem = useCallback(async (sourcePath: string, targetFolderPath: string): Promise<string | null> => {
    if (!dirHandleRef.current) return null;

    // Prevent moving into self or child
    if (sourcePath === targetFolderPath) return null;
    if (targetFolderPath.startsWith(sourcePath + "/")) return null;

    const srcParts = sourcePath.split("/");
    const srcName = srcParts.pop()!;
    const srcParentPath = srcParts.join("/");

    // Already in target folder
    if (srcParentPath === targetFolderPath) return null;

    try {
      const srcParentHandle = await resolveParentHandle(dirHandleRef.current, srcParentPath);
      const targetHandle = await resolveParentHandle(dirHandleRef.current, targetFolderPath);
      const targetSiblings = findChildren(tree, targetFolderPath);
      let resolvedName = srcName;

      const entry = fileMap.get(sourcePath);
      if (entry?.handle) {
        // Resolve name collision for files
        if (targetSiblings.some((n) => n.name === srcName)) {
          const baseName = srcName.replace(/\.json$/, "");
          resolvedName = uniqueName(targetSiblings, baseName, ".json");
        }

        const file = await entry.handle.getFile();
        const content = await file.arrayBuffer();
        const newHandle = await targetHandle.getFileHandle(resolvedName, { create: true });
        const writable = await newHandle.createWritable();
        await writable.write(content);
        await writable.close();
        await srcParentHandle.removeEntry(srcName);

        // Migrate draft and viewport
        const finalPath = targetFolderPath ? `${targetFolderPath}/${resolvedName}` : resolvedName;
        const draft = loadDraft(sourcePath);
        if (draft) {
          saveDraft(finalPath, draft.title ?? "", draft.layers, draft.nodes as never[], draft.connections, draft.layerManualSizes ?? {}, draft.lineCurve ?? "orthogonal");
          clearDraft(sourcePath);
        }
        migrateViewport(sourcePath, finalPath);
      } else if (entry?.dirHandle) {
        // Resolve name collision for folders
        if (targetSiblings.some((n) => n.name === srcName)) {
          resolvedName = uniqueName(targetSiblings, srcName, "");
        }

        const newDirHandle = await targetHandle.getDirectoryHandle(resolvedName, { create: true });
        await copyDirContents(entry.dirHandle, newDirHandle);
        await srcParentHandle.removeEntry(srcName, { recursive: true });
      } else {
        return null;
      }

      const newPath = targetFolderPath ? `${targetFolderPath}/${resolvedName}` : resolvedName;
      await rescan();

      // Update activeFile if it was moved
      if (activeFile === sourcePath) {
        setActiveFile(newPath);
      } else if (activeFile?.startsWith(sourcePath + "/")) {
        setActiveFile(activeFile.replace(sourcePath, newPath));
      }

      return newPath;
    } catch { return null; }
  }, [fileMap, tree, rescan, activeFile]);

  /** Read file from disk, ignoring drafts. Clears any draft. Returns DiagramData or null. */
  const discardFile = useCallback(async (filePath: string): Promise<DiagramData | null> => {
    const entry = fileMap.get(filePath);
    if (!entry?.handle) return null;
    try {
      const file = await entry.handle.getFile();
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!isDiagramData(parsed)) return null;
      clearDraft(filePath);
      setDirtyFiles((prev) => { const next = new Set(prev); next.delete(filePath); return next; });
      setActiveFile(filePath);
      return parsed;
    } catch { return null; }
  }, [fileMap]);

  const markDirty = useCallback((filePath: string, dirty: boolean) => {
    setDirtyFiles((prev) => {
      const next = new Set(prev);
      if (dirty) next.add(filePath);
      else next.delete(filePath);
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    if (dirHandleRef.current) {
      setIsLoading(true);
      try {
        const perm = await dirHandleRef.current.requestPermission({ mode: "readwrite" });
        if (perm !== "granted") {
          dirHandleRef.current = null;
          setTree([]);
          setDirectoryName(null);
          clearDirectoryScope();
          localStorage.removeItem(DIR_NAME_KEY);
          await clearDirHandle();
          setIsLoading(false);
          return;
        }
        await rescan();
      } catch {
        dirHandleRef.current = null;
        setTree([]);
      }
      setIsLoading(false);
    } else {
      inputRef.current?.click();
    }
  }, [rescan]);

  const clearPendingFile = useCallback(() => setPendingFile(null), []);

  return {
    directoryName: tree.length > 0 || dirHandleRef.current ? directoryName : null,
    tree,
    activeFile,
    isLoading,
    supported: isSupported(),
    dirtyFiles,
    pendingFile,
    clearPendingFile,
    openFolder,
    selectFile,
    saveFile,
    createFile,
    createFolder,
    deleteFile,
    deleteFolder,
    renameFile,
    renameFolder,
    duplicateFile,
    moveItem,
    discardFile,
    markDirty,
    refresh,
    handleFallbackInput,
    inputRef,
    setActiveFile,
    dirHandleRef,
  };
}
