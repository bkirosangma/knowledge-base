"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import type { DiagramData, NodeData, LayerDef, Connection, LineCurveAlgorithm, FlowDef } from "../utils/types";
import { loadDraft, createEmptyDiagram, saveDraft, clearViewport, migrateViewport } from "../utils/persistence";
import { useDrafts } from "./useDrafts";
import { flattenTree, type TreeNode } from "../utils/fileTree";
import { useRepositories } from "../../shell/RepositoryContext";
import { tauriBridge } from "../../infrastructure/tauriBridge";
import {
  isDiagramData,
  uniqueName,
  collectFilePaths,
  findChildren,
  readTextFile,
  writeTextFile,
  getSubdirectoryHandle,
} from "./fileExplorerHelpers";
import { useShellErrors } from "../../shell/ShellErrorContext";
import { readOrNull } from "../../domain/repositoryHelpers";
import * as settingsStore from "../../infrastructure/settingsStore";
export type { TreeNode };

// Re-export file-I/O helpers for callers that import them from this module.
export { readTextFile, writeTextFile, getSubdirectoryHandle };

const ACTIVE_FILE_KEY = "knowledge-base-active-file";
const DIR_NAME_KEY = "knowledge-base-directory-name";

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
  const repos = useRepositories();
  const { reportError } = useShellErrors();

  const [vaultPath, setVaultPath] = useState<string | null>(null);
  const vaultPathRef = useRef<string | null>(null);

  // Keep ref in sync with state.
  useEffect(() => {
    vaultPathRef.current = vaultPath;
  }, [vaultPath]);

  // directoryName derived from vaultPath (last path segment).
  const [directoryName, setDirectoryName] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(DIR_NAME_KEY);
  });

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

  // Restore from persisted vault path on mount via tauri-plugin-store.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    void (async () => {
      const settings = await settingsStore.getSettings();
      const lastPath = settings.vault.lastPath;
      if (!lastPath) return;
      try {
        // vault_set_root canonicalizes the path; a deleted/moved directory
        // surfaces here as a rejection, not a silent succeed-with-stale-root.
        await tauriBridge.setRoot(lastPath);
        setVaultPath(lastPath);
        const name = lastPath.split("/").pop() ?? lastPath.split("\\").pop() ?? lastPath;
        setDirectoryName(name);
      } catch (e) {
        reportError(e, "Restoring last vault");
        await settingsStore.clearLastPath();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rescan = useCallback(async () => {
    if (!repos.vaultIndex) return;
    const nodes = await repos.vaultIndex.scan();
    setTree(nodes);
    drafts.refreshDrafts();
  }, [repos.vaultIndex, drafts]);

  // After vaultPath becomes truthy, rescan automatically.
  useEffect(() => {
    if (vaultPath) {
      void rescan();
    } else {
      setTree([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultPath]);

  // Re-scan when repos.vaultIndex transitions from null → populated (after
  // KnowledgeBaseWithProvider receives the new vaultPath and re-renders the
  // RepositoryProvider). Without this, a vault pick sets vaultPath but the
  // first rescan no-ops because repos.vaultIndex is still null at that point.
  const prevVaultIndexRef = useRef<typeof repos.vaultIndex>(null);
  useEffect(() => {
    if (repos.vaultIndex && !prevVaultIndexRef.current && vaultPath) {
      void rescan();
    }
    prevVaultIndexRef.current = repos.vaultIndex;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repos.vaultIndex]);

  // Ref tracks the last signature so watcherRescan can skip setTree when nothing changed.
  const prevTreeSigRef = useRef("");

  // Quiet rescan for the file-watcher polling subscriber: no loading state, no
  // requestPermission call, and no-op if the tree content hasn't changed.
  const watcherRescan = useCallback(async () => {
    if (!repos.vaultIndex) return;
    const nodes = await repos.vaultIndex.scan();
    const sig = treeSignature(nodes);
    if (sig === prevTreeSigRef.current) return;
    prevTreeSigRef.current = sig;
    setTree(nodes);
  }, [repos.vaultIndex]);

  const openFolder = useCallback(async () => {
    const picked = await tauriBridge.pick();
    if (!picked) return;
    try {
      setIsLoading(true);
      await tauriBridge.setRoot(picked);
      setVaultPath(picked);
      const name = picked.split("/").pop() ?? picked.split("\\").pop() ?? picked;
      setDirectoryName(name);
      setActiveFile(null);
      await settingsStore.setLastPath(picked);
      await settingsStore.pushRecent(picked);
      // rescan will fire via the vaultPath effect above, but repos won't be
      // populated yet — knowledgeBase.tsx must re-render with the new vaultPath
      // first (via RepositoryProvider). The effect handles the scan once repos
      // are live.
    } catch (e) {
      reportError(e, "Opening vault folder");
    } finally {
      setIsLoading(false);
    }
  }, [reportError]);

  // KB-012: pick a folder, run a seeder against the just-acquired handle
  // (e.g. unpack the bundled sample vault), then scan + open it.
  //
  // NOTE: The `seed` callback still accepts `FileSystemDirectoryHandle` in its
  // type signature for backwards compat. In the Tauri world there is no real
  // handle object — this parameter will be `null` until seedSampleVault is
  // ported in Task 28a/b. The return type also preserves `{ handle }` for the
  // same reason. Both will become `(repos: Repositories) => Promise<void>` in
  // Task 28a.
  const openFolderWithSeed = useCallback(async (
    seed: (handle: FileSystemDirectoryHandle) => Promise<void>,
  ): Promise<{ handle: FileSystemDirectoryHandle } | null> => {
    const picked = await tauriBridge.pick();
    if (!picked) return null;
    try {
      setIsLoading(true);
      await tauriBridge.setRoot(picked);
      // TODO 28a: pass typed repos to seed once seedSampleVault is ported.
      // For now pass null cast to appease the legacy callback shape.
      await seed(null as unknown as FileSystemDirectoryHandle);
      setVaultPath(picked);
      const name = picked.split("/").pop() ?? picked.split("\\").pop() ?? picked;
      setDirectoryName(name);
      localStorage.setItem(DIR_NAME_KEY, name);
      setActiveFile(null);
      // Scan will fire via the vaultPath effect.
      // Return a minimal object so callers that check `result?.handle` don't crash.
      // TODO 28a: remove the handle shim once FirstRunHero is ported.
      return { handle: null as unknown as FileSystemDirectoryHandle };
    } catch (e) {
      reportError(e, "Opening vault folder with seed");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [reportError]);

  // Fallback input handler for environments without the FSA picker.
  // Tauri always has a native picker, so this is a no-op stub.
  // TODO 28b: prune once FSA fallback machinery is dropped entirely.
  const handleFallbackInput = useCallback((_fileList: FileList | null) => {
    // No-op: Tauri uses tauriBridge.pick() exclusively.
  }, []);

  const selectFile = useCallback(async (filePath: string): Promise<{ data: DiagramData; diskJson: string; hasDraft: boolean } | null> => {
    if (!repos.diagram) return null;
    let diskData: DiagramData | null = null;
    let diskJson = "";
    try {
      const loaded = await readOrNull(() => repos.diagram!.read(filePath));
      if (loaded) {
        diskData = loaded;
        diskJson = JSON.stringify(loaded, null, 2);
      }
    } catch (e) {
      reportError(e, `Loading ${filePath}`);
      return null;
    }

    const draft = loadDraft(filePath);
    if (draft && isDiagramData(draft) && diskData) {
      setActiveFile(filePath);
      return { data: draft, diskJson, hasDraft: true };
    }

    if (!diskData) return null;
    setActiveFile(filePath);
    return { data: diskData, diskJson, hasDraft: false };
  }, [repos.diagram, reportError]);

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
    sources?: DiagramData["sources"],
  ): Promise<boolean> => {
    const data: DiagramData = {
      title, layers, nodes: serializeNodesFn(nodes), connections, layerManualSizes, lineCurve, flows,
      ...(documents && documents.length > 0 ? { documents } : {}),
      ...(sources && sources.length > 0 ? { sources } : {}),
    };

    if (!repos.diagram) {
      // Fallback download (no vault active — should not happen in Tauri, but
      // kept for safety during the transition period).
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
    }
    try {
      await repos.diagram.write(filePath, data);
      drafts.removeDraft(filePath);
      return true;
    } catch (e) {
      reportError(e, `Saving ${filePath}`);
      return false;
    }
  }, [repos.diagram, drafts, reportError]);

  /** Create a new file with a default name. Returns { path, data } or null. */
  const createFile = useCallback(async (parentPath: string = ""): Promise<{ path: string; data: DiagramData } | null> => {
    if (!repos.diagram || !repos.vaultIndex) return null;
    try {
      const siblings = findChildren(tree, parentPath);
      const fileName = uniqueName(siblings, "untitled", ".json");
      const filePath = parentPath ? `${parentPath}/${fileName}` : fileName;
      const title = fileName.replace(/\.json$/, "").replace(/[-_]/g, " ");
      const data = createEmptyDiagram(title);
      await repos.diagram.write(filePath, data);

      await rescan();
      // Pre-seed localStorage so new diagrams open in edit mode by default.
      try { localStorage.setItem(`diagram-read-only:${filePath}`, "false"); } catch { /* ignore */ }
      setActiveFile(filePath);
      return { path: filePath, data };
    } catch (e) {
      reportError(e, `Creating file in ${parentPath || "(root)"}`);
      return null;
    }
  }, [repos.diagram, repos.vaultIndex, tree, rescan, reportError]);

  /** Create a new empty markdown document. Returns the path or null. */
  const createDocument = useCallback(async (parentPath: string = ""): Promise<string | null> => {
    if (!repos.document || !repos.vaultIndex) return null;
    try {
      const siblings = findChildren(tree, parentPath);
      const fileName = uniqueName(siblings, "untitled", ".md");
      const filePath = parentPath ? `${parentPath}/${fileName}` : fileName;
      await repos.document.write(filePath, "");
      await rescan();
      // Pre-seed localStorage so new documents open in edit mode by default.
      try { localStorage.setItem(`document-read-only:${filePath}`, "false"); } catch { /* ignore */ }
      return filePath;
    } catch (e) {
      reportError(e, `Creating document in ${parentPath || "(root)"}`);
      return null;
    }
  }, [repos.document, repos.vaultIndex, tree, rescan, reportError]);

  /** Create a new SVG file with minimal content. Returns the path or null. */
  const createSVG = useCallback(async (parentPath: string = ""): Promise<string | null> => {
    if (!repos.svg || !repos.vaultIndex) return null;
    try {
      const siblings = findChildren(tree, parentPath);
      const fileName = uniqueName(siblings, "untitled", ".svg");
      const filePath = parentPath ? `${parentPath}/${fileName}` : fileName;
      const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"></svg>`;
      await repos.svg.write(filePath, svgContent);
      await rescan();
      return filePath;
    } catch (e) {
      reportError(e, `Creating SVG in ${parentPath || "(root)"}`);
      return null;
    }
  }, [repos.svg, repos.vaultIndex, tree, rescan, reportError]);

  /** Create a new folder with a default name. Returns the path or null. */
  const createFolder = useCallback(async (parentPath: string = ""): Promise<string | null> => {
    if (!repos.vaultIndex) return null;
    try {
      const siblings = findChildren(tree, parentPath);
      const folderName = uniqueName(siblings, "new-folder", "");
      const folderPath = parentPath ? `${parentPath}/${folderName}` : folderName;
      await repos.vaultIndex.createFolder(folderPath);
      await rescan();
      return folderPath;
    } catch (e) {
      reportError(e, `Creating folder in ${parentPath || "(root)"}`);
      return null;
    }
  }, [repos.vaultIndex, tree, rescan, reportError]);

  const deleteFile = useCallback(async (filePath: string): Promise<boolean> => {
    if (!repos.vaultIndex) return false;
    try {
      await repos.vaultIndex.delete(filePath);
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
  }, [repos.vaultIndex, rescan, activeFile, drafts, reportError]);

  const deleteFolder = useCallback(async (folderPath: string): Promise<boolean> => {
    if (!repos.vaultIndex) return false;
    try {
      // Clean up localStorage for all files in the folder
      const folderFiles = collectFilePaths(tree, folderPath);
      for (const fp of folderFiles) {
        drafts.removeDraft(fp);
      }
      await repos.vaultIndex.delete(folderPath);
      await rescan();
      // If active file was inside this folder, clear it
      if (activeFile?.startsWith(folderPath + "/")) {
        setActiveFile(null);
        localStorage.removeItem(ACTIVE_FILE_KEY);
      }
      // Defer viewport cleanup
      setTimeout(() => { for (const fp of folderFiles) clearViewport(fp); }, 0);
      return true;
    } catch (e) {
      reportError(e, `Deleting folder ${folderPath}`);
      return false;
    }
  }, [repos.vaultIndex, rescan, activeFile, drafts, tree, reportError]);

  const renameFile = useCallback(async (oldPath: string, newName: string): Promise<string | null> => {
    if (!repos.vaultIndex) return null;
    const parts = oldPath.split("/");
    const oldName = parts.pop()!;
    const parentPath = parts.join("/");
    if (oldName === newName) return oldPath;
    try {
      // Preserve original extension if the caller didn't supply one
      const originalExt = oldName.includes(".") ? oldName.slice(oldName.lastIndexOf(".")) : "";
      const finalName = newName.includes(".") ? newName : `${newName}${originalExt}`;
      const newPath = parentPath ? `${parentPath}/${finalName}` : finalName;

      // Rename the main file via vaultIndex (atomic in Tauri)
      await repos.vaultIndex.rename(oldPath, newPath);

      // Rename the history sidecar if it exists
      const oldSidecar = parentPath ? `${parentPath}/.${oldName}.history.json` : `.${oldName}.history.json`;
      const newSidecar = parentPath ? `${parentPath}/.${finalName}.history.json` : `.${finalName}.history.json`;
      try {
        if (await repos.vaultIndex.exists(oldSidecar)) {
          await repos.vaultIndex.rename(oldSidecar, newSidecar);
        }
      } catch {
        // Sidecar absent or rename failed — non-fatal
      }

      drafts.removeDraft(oldPath);
      migrateViewport(oldPath, newPath);
      await rescan();
      if (activeFile === oldPath) setActiveFile(newPath);
      return newPath;
    } catch (e) {
      reportError(e, `Renaming ${oldPath} → ${newName}`);
      return null;
    }
  }, [repos.vaultIndex, rescan, activeFile, drafts, reportError]);

  const renameFolder = useCallback(async (oldPath: string, newName: string): Promise<string | null> => {
    if (!repos.vaultIndex) return null;
    const parts = oldPath.split("/");
    const oldName = parts.pop()!;
    const parentPath = parts.join("/");
    if (oldName === newName) return oldPath;

    try {
      const newPath = parentPath ? `${parentPath}/${newName}` : newName;

      // Tauri's vault_rename handles directories atomically — no manual
      // copy-then-delete dance needed (unlike the FSA workaround this replaces).
      await repos.vaultIndex.rename(oldPath, newPath);

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
  }, [repos.vaultIndex, rescan, activeFile, tree, drafts, reportError]);

  /** Duplicate a file. Returns { path, data } for the new copy, or null. */
  const duplicateFile = useCallback(async (sourcePath: string): Promise<{ path: string; data: DiagramData } | null> => {
    if (!repos.diagram || !repos.vaultIndex) return null;
    // Check the file exists in the tree (no handle needed)
    if (!fileMap.has(sourcePath)) return null;
    try {
      const content = JSON.stringify(await repos.diagram.read(sourcePath), null, 2);

      const parts = sourcePath.split("/");
      const srcName = parts.pop()!;
      const parentPath = parts.join("/");
      const siblings = findChildren(tree, parentPath);

      // Generate copy name: "thanos-copy.json", "thanos-copy-1.json", etc.
      const baseName = srcName.replace(/\.json$/, "");
      const copyName = uniqueName(siblings, `${baseName}-copy`, ".json");
      const newPath = parentPath ? `${parentPath}/${copyName}` : copyName;

      const parsed = JSON.parse(content) as unknown;
      const data = isDiagramData(parsed) ? parsed : createEmptyDiagram(copyName.replace(/\.json$/, ""));
      await repos.diagram.write(newPath, data);

      await rescan();
      setActiveFile(newPath);
      return { path: newPath, data };
    } catch (e) {
      reportError(e, `Duplicating ${sourcePath}`);
      return null;
    }
  }, [repos.diagram, repos.vaultIndex, fileMap, tree, rescan, reportError]);

  /** Move a file or folder into a target folder. Returns new path or null. */
  const moveItem = useCallback(async (sourcePath: string, targetFolderPath: string): Promise<string | null> => {
    if (!repos.vaultIndex) return null;

    // Prevent moving into self or child
    if (sourcePath === targetFolderPath) return null;
    if (targetFolderPath.startsWith(sourcePath + "/")) return null;

    const srcParts = sourcePath.split("/");
    const srcName = srcParts.pop()!;
    const srcParentPath = srcParts.join("/");

    // Already in target folder
    if (srcParentPath === targetFolderPath) return null;

    try {
      const targetSiblings = findChildren(tree, targetFolderPath);
      let resolvedName = srcName;

      const entry = fileMap.get(sourcePath);
      if (entry !== undefined) {
        // Resolve name collision
        if (targetSiblings.some((n) => n.name === srcName)) {
          const ext = srcName.includes(".") ? srcName.slice(srcName.lastIndexOf(".")) : "";
          const base = ext ? srcName.slice(0, srcName.lastIndexOf(".")) : srcName;
          resolvedName = uniqueName(targetSiblings, base, ext);
        }

        const finalPath = targetFolderPath ? `${targetFolderPath}/${resolvedName}` : resolvedName;
        await repos.vaultIndex.rename(sourcePath, finalPath);

        // Migrate draft and viewport for files; for folders, migrate all children.
        const isFolder = tree.some((n) => n.path === sourcePath && n.type === "folder") ||
          (function findNode(nodes: TreeNode[]): boolean {
            for (const n of nodes) {
              if (n.path === sourcePath && n.type === "folder") return true;
              if (n.children && findNode(n.children)) return true;
            }
            return false;
          })(tree);

        if (isFolder) {
          const oldFiles = collectFilePaths(tree, sourcePath);
          for (const fp of oldFiles) {
            const newFp = fp.replace(sourcePath, finalPath);
            migrateViewport(fp, newFp);
            const draft = loadDraft(fp);
            if (draft) {
              saveDraft(newFp, draft.title ?? "", draft.layers, draft.nodes as never[], draft.connections, draft.layerManualSizes ?? {}, draft.lineCurve ?? "orthogonal");
              drafts.removeDraft(fp);
            }
          }
        } else {
          const draft = loadDraft(sourcePath);
          if (draft) {
            saveDraft(finalPath, draft.title ?? "", draft.layers, draft.nodes as never[], draft.connections, draft.layerManualSizes ?? {}, draft.lineCurve ?? "orthogonal");
            drafts.removeDraft(sourcePath);
          }
          migrateViewport(sourcePath, finalPath);
        }

        const newPath = finalPath;
        await rescan();

        // Update activeFile if it was moved
        if (activeFile === sourcePath) {
          setActiveFile(newPath);
        } else if (activeFile?.startsWith(sourcePath + "/")) {
          setActiveFile(activeFile.replace(sourcePath, newPath));
        }

        return newPath;
      } else {
        return null;
      }
    } catch (e) {
      reportError(e, `Moving ${sourcePath} → ${targetFolderPath || "(root)"}`);
      return null;
    }
  }, [repos.vaultIndex, fileMap, tree, rescan, activeFile, drafts, reportError]);

  /** Read file from disk, ignoring drafts. Clears any draft. Returns DiagramData or null. */
  const discardFile = useCallback(async (filePath: string): Promise<DiagramData | null> => {
    if (!repos.diagram) return null;
    try {
      const parsed = await repos.diagram.read(filePath);
      drafts.removeDraft(filePath);
      setActiveFile(filePath);
      return parsed;
    } catch (e) {
      reportError(e, `Discarding draft of ${filePath}`);
      return null;
    }
  }, [repos.diagram, drafts, reportError]);

  const refresh = useCallback(async () => {
    // requestPermission removed: Tauri has no FSA permission model.
    // Just rescan if a vault is active; nothing else to do.
    if (vaultPathRef.current) {
      setIsLoading(true);
      try {
        await rescan();
      } catch (e) {
        reportError(e, "Re-reading the vault folder");
        setTree([]);
      }
      setIsLoading(false);
    }
    // else: no vault active — no-op (FSA fallback inputRef.current?.click() removed).
  }, [rescan, reportError]);

  const clearSavedHandle = useCallback(async () => {
    setVaultPath(null);
    setDirectoryName(null);
    localStorage.removeItem(DIR_NAME_KEY);
    // TODO MVP-1c: clear persisted vault path from tauri-plugin-store.
    // TODO MVP-1c: previously also called clearDirHandle() + clearDirectoryScope().
  }, []);

  const clearPendingFile = useCallback(() => setPendingFile(null), []);

  // inputRef and supported are FSA fallback stubs.
  // TODO 28b: prune once FSA fallback machinery is dropped entirely.
  const inputRef = useRef<HTMLInputElement | null>(null);
  const supported = true; // Tauri always has a native picker.

  // rootHandle is kept as a stub null so knowledgeBase.tsx (Task 28a) still compiles.
  // TODO 28a: remove rootHandle from this return once knowledgeBase.tsx stops reading it.
  const rootHandle = null as unknown as (FileSystemDirectoryHandle | null);

  // dirHandleRef is kept as a stub (always null current) so consumers in
  // knowledgeBase.tsx/DiagramOverlays/etc. (Task 28a/b) still compile.
  // TODO 28a: remove dirHandleRef from this return once all consumers are migrated.
  const dirHandleRef = useRef<FileSystemDirectoryHandle | null>(null);

  return {
    directoryName: tree.length > 0 || vaultPath ? directoryName : null,
    rootHandle,
    vaultPath,
    vaultPathRef,
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
    /** @deprecated Use vaultPathRef instead. Kept for Task-28a/b migration. */
    dirHandleRef,
    clearSavedHandle,
  };
}
