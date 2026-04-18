// src/app/knowledge_base/hooks/useLinkIndex.ts
"use client";

import { useState, useCallback } from "react";
import type { LinkIndex, OutboundLink } from "../types";
import { parseWikiLinks, resolveWikiLinkPath } from "../utils/wikiLinkParser";
import { emitCrossReferences, type CrossReference } from "../../../shared/utils/graphifyBridge";
import { createLinkIndexRepository } from "../../../infrastructure/linkIndexRepo";

function emptyIndex(): LinkIndex {
  return { updatedAt: new Date().toISOString(), documents: {}, backlinks: {} };
}

// Fix 4: Extract repeated docDir computation
function getDocDir(docPath: string): string {
  return docPath.includes("/") ? docPath.substring(0, docPath.lastIndexOf("/")) : "";
}

// Fix 2: Extract duplicated link-parsing logic
function getLinkType(resolvedPath: string): "document" | "diagram" {
  return resolvedPath.endsWith(".json") ? "diagram" : "document";
}

function buildDocumentEntry(
  content: string,
  docDir: string,
): { outboundLinks: OutboundLink[]; sectionLinks: { targetPath: string; section: string }[] } {
  const parsed = parseWikiLinks(content);
  const outboundLinks: OutboundLink[] = [];
  const sectionLinks: { targetPath: string; section: string }[] = [];
  for (const link of parsed) {
    const resolved = resolveWikiLinkPath(link.path, docDir);
    if (link.section) {
      sectionLinks.push({ targetPath: resolved, section: link.section });
    } else {
      outboundLinks.push({ targetPath: resolved, type: getLinkType(resolved) });
    }
  }
  return { outboundLinks, sectionLinks };
}

function collectCrossReferences(index: LinkIndex): CrossReference[] {
  const refs: CrossReference[] = [];
  for (const [source, entry] of Object.entries(index.documents)) {
    for (const link of entry.outboundLinks) {
      refs.push({
        source,
        target: link.targetPath,
        type: "references",
        sourceType: "document",
        targetType: link.type ?? "document",
      });
    }
  }
  return refs;
}

function rebuildBacklinks(index: LinkIndex): void {
  index.backlinks = {};
  for (const [sourcePath, entry] of Object.entries(index.documents)) {
    for (const link of entry.outboundLinks) {
      if (!index.backlinks[link.targetPath]) {
        index.backlinks[link.targetPath] = { linkedFrom: [] };
      }
      index.backlinks[link.targetPath].linkedFrom.push({ sourcePath });
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
    const repo = createLinkIndexRepository(rootHandle);
    const loaded = await repo.load();
    if (loaded) {
      setLinkIndex(loaded);
      return loaded;
    }
    const fresh = emptyIndex();
    setLinkIndex(fresh);
    return fresh;
  }, []);

  const saveIndex = useCallback(async (
    rootHandle: FileSystemDirectoryHandle,
    index: LinkIndex,
  ) => {
    const repo = createLinkIndexRepository(rootHandle);
    const updated = { ...index, updatedAt: new Date().toISOString() };
    await repo.save(updated);
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
    emitCrossReferences(rootHandle, collectCrossReferences(index));
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
      entry.outboundLinks = entry.outboundLinks.map(link =>
        link.targetPath === oldPath ? { ...link, targetPath: newPath } : link
      );
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
    const repo = createLinkIndexRepository(rootHandle);
    const index = emptyIndex();
    for (const docPath of allDocPaths) {
      try {
        const content = await repo.readDocContent(docPath);
        const docDir = getDocDir(docPath);
        index.documents[docPath] = buildDocumentEntry(content, docDir);
      } catch {
        // File read failed — skip
      }
    }
    rebuildBacklinks(index);
    await saveIndex(rootHandle, index);
    emitCrossReferences(rootHandle, collectCrossReferences(index));
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
