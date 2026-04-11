// src/app/architecture_designer/hooks/useLinkIndex.ts
"use client";

import { useState, useCallback } from "react";
import type { LinkIndex } from "../utils/types";
import { parseWikiLinks, resolveWikiLinkPath } from "../utils/wikiLinkParser";
import { readTextFile, writeTextFile, getSubdirectoryHandle } from "./useFileExplorer";

const LINKS_FILE = "_links.json";
const CONFIG_DIR = ".archdesigner";

function emptyIndex(): LinkIndex {
  return { updatedAt: new Date().toISOString(), documents: {}, backlinks: {} };
}

// Fix 4: Extract repeated docDir computation
function getDocDir(docPath: string): string {
  return docPath.includes("/") ? docPath.substring(0, docPath.lastIndexOf("/")) : "";
}

// Fix 2: Extract duplicated link-parsing logic
function buildDocumentEntry(
  content: string,
  docDir: string,
): { outboundLinks: string[]; sectionLinks: { targetPath: string; section: string }[] } {
  const parsed = parseWikiLinks(content);
  const outboundLinks: string[] = [];
  const sectionLinks: { targetPath: string; section: string }[] = [];
  for (const link of parsed) {
    const resolved = resolveWikiLinkPath(link.path, docDir);
    if (link.section) {
      sectionLinks.push({ targetPath: resolved, section: link.section });
    } else {
      outboundLinks.push(resolved);
    }
  }
  return { outboundLinks, sectionLinks };
}

function rebuildBacklinks(index: LinkIndex): void {
  index.backlinks = {};
  for (const [sourcePath, entry] of Object.entries(index.documents)) {
    for (const targetPath of entry.outboundLinks) {
      if (!index.backlinks[targetPath]) {
        index.backlinks[targetPath] = { linkedFrom: [] };
      }
      index.backlinks[targetPath].linkedFrom.push({ sourcePath });
    }
    for (const sl of entry.sectionLinks) {
      if (!index.backlinks[sl.targetPath]) {
        index.backlinks[sl.targetPath] = { linkedFrom: [] };
      }
      index.backlinks[sl.targetPath].linkedFrom.push({
        sourcePath,
        section: sl.section,
      });
    }
  }
}

export function useLinkIndex() {
  const [linkIndex, setLinkIndex] = useState<LinkIndex>(emptyIndex);

  const loadIndex = useCallback(async (rootHandle: FileSystemDirectoryHandle) => {
    try {
      const configDir = await getSubdirectoryHandle(rootHandle, CONFIG_DIR);
      const fileHandle = await configDir.getFileHandle(LINKS_FILE);
      const text = await readTextFile(fileHandle);
      // Fix 3: Add JSON shape validation
      const parsed = JSON.parse(text);
      if (!parsed.documents || !parsed.backlinks) {
        throw new Error("Invalid link index format");
      }
      setLinkIndex(parsed as LinkIndex);
      return parsed as LinkIndex;
    } catch {
      const fresh = emptyIndex();
      setLinkIndex(fresh);
      return fresh;
    }
  }, []);

  const saveIndex = useCallback(async (
    rootHandle: FileSystemDirectoryHandle,
    index: LinkIndex,
  ) => {
    // Fix 1: Don't mutate the argument; clone with updated timestamp
    const updated = { ...index, updatedAt: new Date().toISOString() };
    await writeTextFile(rootHandle, `${CONFIG_DIR}/${LINKS_FILE}`, JSON.stringify(updated, null, 2));
    setLinkIndex(updated);
  }, []);

  const updateDocumentLinks = useCallback(async (
    rootHandle: FileSystemDirectoryHandle,
    docPath: string,
    markdownContent: string,
    currentIndex?: LinkIndex,
  ) => {
    const index = currentIndex ?? { ...linkIndex };
    // Fix 2 & 4: use shared helpers
    const docDir = getDocDir(docPath);
    index.documents[docPath] = buildDocumentEntry(markdownContent, docDir);
    rebuildBacklinks(index);
    await saveIndex(rootHandle, index);
    return index;
  }, [linkIndex, saveIndex]);

  const removeDocumentFromIndex = useCallback(async (
    rootHandle: FileSystemDirectoryHandle,
    docPath: string,
    currentIndex?: LinkIndex,
  ) => {
    const index = currentIndex ?? { ...linkIndex };
    delete index.documents[docPath];
    rebuildBacklinks(index);
    await saveIndex(rootHandle, index);
    return index;
  }, [linkIndex, saveIndex]);

  const renameDocumentInIndex = useCallback(async (
    rootHandle: FileSystemDirectoryHandle,
    oldPath: string,
    newPath: string,
    currentIndex?: LinkIndex,
  ) => {
    const index = currentIndex ?? { ...linkIndex };
    // Move the document's own entry
    if (index.documents[oldPath]) {
      index.documents[newPath] = index.documents[oldPath];
      delete index.documents[oldPath];
    }
    // Update all outbound links that pointed to oldPath
    for (const entry of Object.values(index.documents)) {
      entry.outboundLinks = entry.outboundLinks.map(p => p === oldPath ? newPath : p);
      entry.sectionLinks = entry.sectionLinks.map(sl =>
        sl.targetPath === oldPath ? { ...sl, targetPath: newPath } : sl
      );
    }
    rebuildBacklinks(index);
    await saveIndex(rootHandle, index);
    return index;
  }, [linkIndex, saveIndex]);

  const getBacklinksFor = useCallback((docPath: string): { sourcePath: string; section?: string }[] => {
    return linkIndex.backlinks[docPath]?.linkedFrom ?? [];
  }, [linkIndex]);

  const fullRebuild = useCallback(async (
    rootHandle: FileSystemDirectoryHandle,
    allDocPaths: string[],
  ) => {
    const index = emptyIndex();
    for (const docPath of allDocPaths) {
      try {
        const parts = docPath.split("/");
        let dirHandle = rootHandle;
        for (const part of parts.slice(0, -1)) {
          dirHandle = await dirHandle.getDirectoryHandle(part);
        }
        const fileHandle = await dirHandle.getFileHandle(parts[parts.length - 1]);
        const content = await readTextFile(fileHandle);
        // Fix 2 & 4: use shared helpers
        const docDir = getDocDir(docPath);
        index.documents[docPath] = buildDocumentEntry(content, docDir);
      } catch {
        // File read failed — skip
      }
    }
    rebuildBacklinks(index);
    await saveIndex(rootHandle, index);
    return index;
  }, [saveIndex]);

  return {
    linkIndex,
    loadIndex,
    updateDocumentLinks,
    removeDocumentFromIndex,
    renameDocumentInIndex,
    getBacklinksFor,
    fullRebuild,
  };
}
