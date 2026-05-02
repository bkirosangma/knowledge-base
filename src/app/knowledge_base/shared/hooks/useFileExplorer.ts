"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import type { DiagramData, NodeData, LayerDef, Connection, LineCurveAlgorithm, FlowDef } from "../utils/types";
import { loadDraft, createEmptyDiagram, saveDraft, clearViewport, migrateViewport, cleanupOrphanedData } from "../utils/persistence";
import { useDrafts } from "./useDrafts";
import { scanTree, flattenTree, type TreeNode } from "../utils/fileTree";
import { useDirectoryHandle } from "./useDirectoryHandle";
import {
  isDiagramData,
  uniqueName,
  collectFilePaths,
  collectAllFilePaths,
  resolveParentHandle,
  findChildren,
  copyDirContents,
  readTextFile,
  writeTextFile,
  getSubdirectoryHandle,
  renameSidecar,
} from "./fileExplorerHelpers";
import { createDiagramRepository } from "../../infrastructure/diagramRepo";
import { useShellErrors } from "../../shell/ShellErrorContext";
import { readOrNull } from "../../domain/repositoryHelpers";
export type { TreeNode };

// Re-export file-I/O helpers for callers that import them from this module.
export { readTextFile, writeTextFile, getSubdirectoryHandle };

const ACTIVE_FILE_KEY = "knowledge-base-active-file";

// Lightweight tree signature: path + lastModified for every node in DFS order.
// Used by watcherRescan to skip setTree when the vault tree hasn't changed.
function treeSignature(nodes: TreeNode[]): string {
  const parts: string[] = [];
  function walk(items: TreeNode[]) {
    for (const item of items) {
      parts.push(`${item.path}:${item.lastModified ?? 0}`);
      if (item.children) walk(item.children);
    }
  }
  walk(nodes);
  return parts.join("|");
}

/* ── Hook ── */

export function useFileExplorer() {
  const dirHandle = useDirectoryHandle();
  const { directoryName, dirHandleRef, rootHandle, inputRef, supported } = dirHandle;
  const { reportError } = useShellErrors();
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const drafts = useDrafts();
  const [pendingFile, setPendingFile] = useState<string | null>(null);

  const fileMap = useMemo(() => flattenTree(tree), [tree]);

  // Persist activeFile
  useEffect(() => {
    if (activeFile) localStorage.setItem(ACTIVE_FILE_KEY, activeFile);
  }, [activeFile]);

  // Restore from IndexedDB on mount
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    (async () => {
      const restored = await dirHandle.restoreSavedHandle();
      if (!restored) return;
      try {
        setIsLoading(true);
        const nodes = await scanTree(restored.handle, "");
        setTree(nodes);
        // Clean up localStorage for files that no longer exist on disk
        cleanupOrphanedData(collectAllFilePaths(nodes));
        drafts.refreshDrafts();
        setIsLoading(false);

        const lastFile = localStorage.getItem(ACTIVE_FILE_KEY);
        const flat = flattenTree(nodes);
        if (lastFile && flat.has(lastFile)) {
          setPendingFile(lastFile);
        }
      } catch {
        await dirHandle.clearSavedHandle();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rescan = useCallback(async () => {
    if (!dirHandleRef.current) return;
    const nodes = await scanTree(dirHandleRef.current, "");
    setTree(nodes);
    drafts.refreshDrafts();
  }, []);

  // Ref tracks the last signature so watcherRescan can skip setTree when nothing changed.
  const prevTreeSigRef = useRef("");

  // Quiet rescan for the file-watcher polling subscriber: no loading state, no
  // requestPermission call, and no-op if the tree content hasn't changed.
  const watcherRescan = useCallback(async () => {
    if (!dirHandleRef.current) return;
    const nodes = await scanTree(dirHandleRef.current, "");
    const sig = treeSignature(nodes);
    if (sig === prevTreeSigRef.current) return;
    prevTreeSigRef.current = sig;
    setTree(nodes);
  }, []);

  const openFolder = useCallback(async () => {
    if (!supported) {
      inputRef.current?.click();
      return;
    }
    const acquired = await dirHandle.acquirePickerHandle();
    if (!acquired) return;
    try {
      setIsLoading(true);
      const nodes = await scanTree(acquired.handle, "");
      setTree(nodes);
      setActiveFile(null);
      drafts.refreshDrafts();
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported]);

  // KB-012: pick a folder, run a seeder against the just-acquired
  // handle (e.g. unpack the bundled sample vault), then scan + open it.
  // The seeder runs inside the same loading window as the tree scan so
  // the UI doesn't flash the empty state between picker close and seed
  // completion.
  const openFolderWithSeed = useCallback(async (
    seed: (handle: FileSystemDirectoryHandle) => Promise<void>,
  ): Promise<{ handle: FileSystemDirectoryHandle } | null> => {
    if (!supported) return null;
    const acquired = await dirHandle.acquirePickerHandle();
    if (!acquired) return null;
    try {
      setIsLoading(true);
      await seed(acquired.handle);
      const nodes = await scanTree(acquired.handle, "");
      setTree(nodes);
      setActiveFile(null);
      drafts.refreshDrafts();
      return { handle: acquired.handle };
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported]);

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
    dirHandle.setDirectoryName(folderName);
    setTree(nodes);
    setActiveFile(null);
    drafts.refreshDrafts();
  }, []);

  const selectFile = useCallback(async (filePath: string): Promise<{ data: DiagramData; diskJson: string; hasDraft: boolean } | null> => {
    const rootHandle = dirHandleRef.current;
    let diskData: DiagramData | null = null;
    let diskJson = "";
    if (rootHandle) {
      const repo = createDiagramRepository(rootHandle);
      try {
        const loaded = await readOrNull(() => repo.read(filePath));
        if (loaded) {
          diskData = loaded;
          diskJson = JSON.stringify(loaded, null, 2);
        }
      } catch (e) {
        // Permission/malformed/unknown failures surface here; absent
        // file (readOrNull returned null) stays silent — that's treated
        // as "fall through to draft" below.
        reportError(e, `Loading ${filePath}`);
        return null;
      }
    }

    const draft = loadDraft(filePath);
    if (draft && isDiagramData(draft) && diskData) {
      setActiveFile(filePath);
      return { data: draft, diskJson, hasDraft: true };
    }

    if (!diskData) return null;
    setActiveFile(filePath);
    return { data: diskData, diskJson, hasDraft: false };
  }, [dirHandleRef, reportError]);

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

    const rootHandle = dirHandleRef.current;
    if (rootHandle) {
      try {
        const repo = createDiagramRepository(rootHandle);
        await repo.write(filePath, data);
        drafts.removeDraft(filePath);
        return true;
      } catch (e) {
        reportError(e, `Saving ${filePath}`);
        return false;
      }
    }
    // Fallback download (no directory picker available — browser lacks FSA).
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filePath.split("/").pop() || "diagram.json";
    a.click();
    URL.revokeObjectURL(url);
    drafts.removeDraft(filePath);
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirHandleRef]);

  /** Create a new file with a default name. Returns { path, data } or null. */
  const createFile = useCallback(async (parentPath: string = ""): Promise<{ path: string; data: DiagramData } | null> => {
    if (!dirHandleRef.current) return null;
    try {
      const siblings = findChildren(tree, parentPath);
      const fileName = uniqueName(siblings, "untitled", ".json");
      const filePath = parentPath ? `${parentPath}/${fileName}` : fileName;
      const title = fileName.replace(/\.json$/, "").replace(/[-_]/g, " ");
      const data = createEmptyDiagram(title);
      const repo = createDiagramRepository(dirHandleRef.current);
      await repo.write(filePath, data);

      await rescan();
      // Pre-seed localStorage so new diagrams open in edit mode by default.
      try { localStorage.setItem(`diagram-read-only:${filePath}`, "false"); } catch { /* ignore */ }
      setActiveFile(filePath);
      return { path: filePath, data };
    } catch (e) {
      reportError(e, `Creating file in ${parentPath || "(root)"}`);
      return null;
    }
  }, [tree, rescan, reportError]);

  /** Create a new empty markdown document. Returns the path or null. */
  const createDocument = useCallback(async (parentPath: string = ""): Promise<string | null> => {
    if (!dirHandleRef.current) return null;
    try {
      const siblings = findChildren(tree, parentPath);
      const fileName = uniqueName(siblings, "untitled", ".md");
      const filePath = parentPath ? `${parentPath}/${fileName}` : fileName;
      await writeTextFile(dirHandleRef.current, filePath, "");
      await rescan();
      // Pre-seed localStorage so new documents open in edit mode by default.
      try { localStorage.setItem(`document-read-only:${filePath}`, "false"); } catch { /* ignore */ }
      return filePath;
    } catch (e) {
      reportError(e, `Creating document in ${parentPath || "(root)"}`);
      return null;
    }
  }, [tree, rescan, reportError]);

  /** Create a new SVG file with minimal content. Returns the path or null. */
  const createSVG = useCallback(async (parentPath: string = ""): Promise<string | null> => {
    if (!dirHandleRef.current) return null;
    try {
      const siblings = findChildren(tree, parentPath);
      const fileName = uniqueName(siblings, "untitled", ".svg");
      const filePath = parentPath ? `${parentPath}/${fileName}` : fileName;
      const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"></svg>`;
      await writeTextFile(dirHandleRef.current, filePath, svgContent);
      await rescan();
      return filePath;
    } catch (e) {
      reportError(e, `Creating SVG in ${parentPath || "(root)"}`);
      return null;
    }
  }, [tree, rescan, reportError]);

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
    } catch (e) {
      reportError(e, `Creating folder in ${parentPath || "(root)"}`);
      return null;
    }
  }, [tree, rescan, reportError]);

  const deleteFile = useCallback(async (filePath: string): Promise<boolean> => {
    if (!dirHandleRef.current) return false;
    try {
      const parts = filePath.split("/");
      const name = parts.pop()!;
      const parentPath = parts.join("/");
      const parentHandle = await resolveParentHandle(dirHandleRef.current, parentPath);
      await parentHandle.removeEntry(name);
      drafts.removeDraft(filePath);
      await rescan();
      if (activeFile === filePath) {
        setActiveFile(null);
        localStorage.removeItem(ACTIVE_FILE_KEY);
      }
      // Defer viewport cleanup so it runs after the viewport persistence
      // effect saves on file switch (which would otherwise re-create the key)
      setTimeout(() => clearViewport(filePath), 0);
      return true;
    } catch (e) {
      reportError(e, `Deleting ${filePath}`);
      return false;
    }
  }, [rescan, activeFile, drafts, reportError]);

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
        drafts.removeDraft(fp);
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
    } catch (e) {
      reportError(e, `Deleting folder ${folderPath}`);
      return false;
    }
  }, [rescan, activeFile, drafts, tree, reportError]);

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
      // Create new file — preserve original extension if the caller didn't supply one
      const originalExt = oldName.includes(".") ? oldName.slice(oldName.lastIndexOf(".")) : "";
      const finalName = newName.includes(".") ? newName : `${newName}${originalExt}`;
      const newHandle = await parentHandle.getFileHandle(finalName, { create: true });
      const writable = await newHandle.createWritable();
      await writable.write(content);
      await writable.close();
      // Delete old
      await parentHandle.removeEntry(oldName);
      await renameSidecar(parentHandle, oldName, finalName);
      drafts.removeDraft(oldPath);

      const newPath = parentPath ? `${parentPath}/${finalName}` : finalName;
      migrateViewport(oldPath, newPath);
      await rescan();
      if (activeFile === oldPath) setActiveFile(newPath);
      return newPath;
    } catch (e) {
      reportError(e, `Renaming ${oldPath} → ${newName}`);
      return null;
    }
  }, [rescan, activeFile, drafts, reportError]);

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
          drafts.removeDraft(fp);
        }
      }
      await rescan();
      // Update activeFile if it was inside the renamed folder
      if (activeFile?.startsWith(oldPath + "/")) {
        setActiveFile(activeFile.replace(oldPath, newPath));
      }
      return newPath;
    } catch (e) {
      reportError(e, `Renaming folder ${oldPath} → ${newName}`);
      return null;
    }
  }, [rescan, activeFile, tree, drafts, reportError]);

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
    } catch (e) {
      reportError(e, `Duplicating ${sourcePath}`);
      return null;
    }
  }, [fileMap, tree, rescan, reportError]);

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
          drafts.removeDraft(sourcePath);
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
    } catch (e) {
      reportError(e, `Moving ${sourcePath} → ${targetFolderPath || "(root)"}`);
      return null;
    }
  }, [fileMap, tree, rescan, activeFile, drafts, reportError]);

  /** Read file from disk, ignoring drafts. Clears any draft. Returns DiagramData or null. */
  const discardFile = useCallback(async (filePath: string): Promise<DiagramData | null> => {
    const rootHandle = dirHandleRef.current;
    if (!rootHandle) return null;
    const repo = createDiagramRepository(rootHandle);
    try {
      const parsed = await repo.read(filePath);
      drafts.removeDraft(filePath);
      setActiveFile(filePath);
      return parsed;
    } catch (e) {
      reportError(e, `Discarding draft of ${filePath}`);
      return null;
    }
  }, [dirHandleRef, drafts, reportError]);

  const refresh = useCallback(async () => {
    if (dirHandleRef.current) {
      setIsLoading(true);
      try {
        const perm = await dirHandleRef.current.requestPermission({ mode: "readwrite" });
        if (perm !== "granted") {
          setTree([]);
          await dirHandle.clearSavedHandle();
          setIsLoading(false);
          return;
        }
        await rescan();
      } catch (e) {
        // The handle is gone (folder moved / permission fully revoked).
        // Report so the user knows we're not just being slow to respond;
        // then reset to the no-folder state.
        reportError(e, "Re-reading the vault folder");
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
    rootHandle,
    tree,
    activeFile,
    isLoading,
    supported,
    dirtyFiles: drafts.dirtyFiles,
    pendingFile,
    clearPendingFile,
    openFolder,
    openFolderWithSeed,
    selectFile,
    saveFile,
    createFile,
    createDocument,
    createSVG,
    createFolder,
    deleteFile,
    deleteFolder,
    renameFile,
    renameFolder,
    duplicateFile,
    moveItem,
    discardFile,
    markDirty: drafts.markDirty,
    refresh,
    watcherRescan,
    handleFallbackInput,
    inputRef,
    setActiveFile,
    dirHandleRef,
  };
}
