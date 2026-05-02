// src/app/knowledge_base/hooks/useLinkIndex.ts
"use client";

import { useState, useCallback, useRef } from "react";
import type { LinkIndex, OutboundLink } from "../types";
import { parseWikiLinks, resolveWikiLinkPath } from "../utils/wikiLinkParser";
import { emitCrossReferences, type CrossReference } from "../../../shared/utils/graphifyBridge";
import { createLinkIndexRepository } from "../../../infrastructure/linkIndexRepo";
import { readOrNull } from "../../../domain/repositoryHelpers";

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

/** Build a link-index entry for a diagram JSON file.
 *  Edges = the list of .md files attached to nodes/connections/flows in the diagram. */
function buildDiagramEntry(
  jsonContent: string,
): { outboundLinks: OutboundLink[]; sectionLinks: [] } {
  try {
    const data = JSON.parse(jsonContent) as { documents?: { filename?: string }[] };
    const outboundLinks: OutboundLink[] = (data.documents ?? [])
      .filter((d) => typeof d.filename === "string" && d.filename.length > 0)
      .map((d) => ({ targetPath: d.filename as string, type: "document" as const }));
    return { outboundLinks, sectionLinks: [] };
  } catch {
    return { outboundLinks: [], sectionLinks: [] };
  }
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
  // seenPerTarget tracks (sourcePath#section) keys per target to deduplicate
  // documents that link to the same target more than once (e.g. two [[link]]
  // occurrences in the same file) — duplicate entries cause React key collisions.
  const seenPerTarget = new Map<string, Set<string>>();

  const push = (targetPath: string, sourcePath: string, section?: string) => {
    let seen = seenPerTarget.get(targetPath);
    if (!seen) { seen = new Set(); seenPerTarget.set(targetPath, seen); }
    const key = `${sourcePath}#${section ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (!index.backlinks[targetPath]) index.backlinks[targetPath] = { linkedFrom: [] };
    index.backlinks[targetPath].linkedFrom.push(
      section !== undefined ? { sourcePath, section } : { sourcePath },
    );
  };

  for (const [sourcePath, entry] of Object.entries(index.documents)) {
    for (const link of entry.outboundLinks) {
      push(link.targetPath, sourcePath);
    }
    for (const sl of entry.sectionLinks) {
      push(sl.targetPath, sourcePath, sl.section);
    }
  }
}

export function useLinkIndex() {
  const [linkIndex, setLinkIndex] = useState<LinkIndex>(emptyIndex);
  // Always-current ref so write callbacks never read stale closure state.
  // Without this, a fullRebuild that calls setLinkIndex() followed by an
  // incremental updateDiagramLinks() before React re-renders would cause
  // the incremental call to overwrite the full rebuild on disk.
  const linkIndexRef = useRef(linkIndex);
  linkIndexRef.current = linkIndex;

  const loadIndex = useCallback(async (rootHandle: FileSystemDirectoryHandle) => {
    const repo = createLinkIndexRepository(rootHandle);
    // Missing index is not an error — the app starts with an empty index
    // and rebuilds on demand. Other failures (permission / malformed /
    // unknown) also fall back to empty here rather than blocking app
    // boot; the re-thrown FileSystemError can be caught and reported by
    // the boot wiring via the shell error surface.
    let loaded: LinkIndex | null = null;
    try {
      loaded = await readOrNull(() => repo.load());
    } catch {
      loaded = null;
    }
    if (loaded) {
      linkIndexRef.current = loaded;
      setLinkIndex(loaded);
      return loaded;
    }
    const fresh = emptyIndex();
    linkIndexRef.current = fresh;
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
    // Update the ref immediately after the disk write so any callback that
    // fires before React re-renders (e.g. onAfterDiagramSaved triggered by
    // a concurrent diagram load) reads the freshly-saved index rather than
    // stale pre-save state and overwrites the disk with fewer documents.
    linkIndexRef.current = updated;
    setLinkIndex(updated);
  }, []);

  const updateDocumentLinks = useCallback(async (
    rootHandle: FileSystemDirectoryHandle,
    docPath: string,
    markdownContent: string,
    currentIndex?: LinkIndex,
  ) => {
    const index = currentIndex ?? { ...linkIndexRef.current };
    const docDir = getDocDir(docPath);
    index.documents[docPath] = buildDocumentEntry(markdownContent, docDir);
    rebuildBacklinks(index);
    await saveIndex(rootHandle, index);
    emitCrossReferences(rootHandle, collectCrossReferences(index));
    return index;
  }, [saveIndex]);

  const removeDocumentFromIndex = useCallback(async (
    rootHandle: FileSystemDirectoryHandle,
    docPath: string,
    currentIndex?: LinkIndex,
  ) => {
    const index = currentIndex ?? { ...linkIndexRef.current };
    delete index.documents[docPath];
    rebuildBacklinks(index);
    await saveIndex(rootHandle, index);
    return index;
  }, [saveIndex]);

  const renameDocumentInIndex = useCallback(async (
    rootHandle: FileSystemDirectoryHandle,
    oldPath: string,
    newPath: string,
    currentIndex?: LinkIndex,
  ) => {
    const index = currentIndex ?? { ...linkIndexRef.current };
    if (index.documents[oldPath]) {
      index.documents[newPath] = index.documents[oldPath];
      delete index.documents[oldPath];
    }
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
  }, [saveIndex]);

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
        if (docPath.endsWith(".json")) {
          index.documents[docPath] = buildDiagramEntry(content);
        } else {
          const docDir = getDocDir(docPath);
          index.documents[docPath] = buildDocumentEntry(content, docDir);
        }
      } catch {
        // File read failed — skip
      }
    }
    rebuildBacklinks(index);
    await saveIndex(rootHandle, index);
    emitCrossReferences(rootHandle, collectCrossReferences(index));
    return index;
  }, [saveIndex]);

  /** Incrementally update the link index for a diagram when its document
   *  attachments change (on load or save). `docFilenames` is the list of
   *  `.md` paths currently attached to the diagram's entities. */
  const updateDiagramLinks = useCallback(async (
    rootHandle: FileSystemDirectoryHandle,
    diagramPath: string,
    docFilenames: string[],
    currentIndex?: LinkIndex,
  ) => {
    const index = currentIndex ?? { ...linkIndexRef.current };
    index.documents[diagramPath] = {
      outboundLinks: docFilenames.map((f) => ({ targetPath: f, type: "document" as const })),
      sectionLinks: [],
    };
    rebuildBacklinks(index);
    await saveIndex(rootHandle, index);
    emitCrossReferences(rootHandle, collectCrossReferences(index));
    return index;
  }, [saveIndex]);

  return {
    linkIndex,
    loadIndex,
    updateDocumentLinks,
    updateDiagramLinks,
    removeDocumentFromIndex,
    renameDocumentInIndex,
    getBacklinksFor,
    fullRebuild,
  };
}
