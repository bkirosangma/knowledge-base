// src/app/knowledge_base/hooks/useLinkIndex.ts
"use client";

import { useState, useCallback, useRef } from "react";
import type { LinkIndex, LinkIndexEntry, OutboundLink } from "../types";
import { parseWikiLinks, resolveWikiLinkPath, updateWikiLinkAnchors } from "../utils/wikiLinkParser";
import { extractHeaders, type HeaderInfo } from "../utils/extractHeaders";
import { emitCrossReferences, type CrossReference } from "../../../shared/utils/graphifyBridge";
import { createLinkIndexRepository } from "../../../infrastructure/linkIndexRepo";
import { readOrNull } from "../../../domain/repositoryHelpers";
import { readTextFile, writeTextFile } from "../../../shared/hooks/fileExplorerHelpers";

function emptyIndex(): LinkIndex {
  return { updatedAt: new Date().toISOString(), documents: {}, backlinks: {} };
}

// Fix 4: Extract repeated docDir computation
function getDocDir(docPath: string): string {
  return docPath.includes("/") ? docPath.substring(0, docPath.lastIndexOf("/")) : "";
}

// Fix 2: Extract duplicated link-parsing logic
function getLinkType(resolvedPath: string): "document" | "diagram" | "tab" {
  if (resolvedPath.endsWith(".alphatex")) return "tab";
  if (resolvedPath.endsWith(".json")) return "diagram";
  return "document";
}

function buildDocumentEntry(
  content: string,
  docDir: string,
): LinkIndexEntry {
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
  const headers = extractHeaders(content);
  return { outboundLinks, sectionLinks, headers };
}

/** Build a link-index entry for a diagram JSON file.
 *  Edges = the list of .md files attached to nodes/connections/flows in the diagram. */
function buildDiagramEntry(
  jsonContent: string,
): LinkIndexEntry {
  try {
    const data = JSON.parse(jsonContent) as { documents?: { filename?: string }[] };
    const outboundLinks: OutboundLink[] = (data.documents ?? [])
      .filter((d) => typeof d.filename === "string" && d.filename.length > 0)
      .map((d) => ({ targetPath: d.filename as string, type: "document" as const }));
    return { outboundLinks, sectionLinks: [], headers: [] };
  } catch {
    return { outboundLinks: [], sectionLinks: [], headers: [] };
  }
}

/** Build a link-index entry for an alphaTex tab file (TAB-011).
 *  Outbound links come from `[[…]]` tokens on lines that start with
 *  `// references:` (the alphaTex line-comment convention; spec L309). */
function buildTabEntry(
  content: string,
  docDir: string,
): LinkIndexEntry {
  const REFERENCES_LINE = /^\s*\/\/\s*references\s*:\s*(.*)$/gim;
  const outboundLinks: OutboundLink[] = [];
  const sectionLinks: { targetPath: string; section: string }[] = [];
  for (const lineMatch of content.matchAll(REFERENCES_LINE)) {
    // parseWikiLinks handles [[path#section|alias]] syntax for us.
    const parsed = parseWikiLinks(lineMatch[1] ?? "");
    for (const link of parsed) {
      const resolved = resolveWikiLinkPath(link.path, docDir);
      if (link.section) {
        sectionLinks.push({ targetPath: resolved, section: link.section });
      } else {
        outboundLinks.push({ targetPath: resolved, type: getLinkType(resolved) });
      }
    }
  }
  return { outboundLinks, sectionLinks, headers: [] };
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

/** Surface state for the broken-anchor banner: populated when a save deletes
 *  one or more headings that other docs were linking to. Sticky — only
 *  cleared via `clearBrokenAnchorState()`. */
export interface BrokenAnchorState {
  docPath: string;
  deletedIds: string[];
  affectedRefs: Array<{ sourcePath: string; anchor: string }>;
}

export function useLinkIndex() {
  const [linkIndex, setLinkIndex] = useState<LinkIndex>(emptyIndex);
  const [brokenAnchorState, setBrokenAnchorState] = useState<BrokenAnchorState | null>(null);
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
      // Backfill `headers` on entries persisted before MVP 3 added the field.
      for (const entry of Object.values(loaded.documents)) {
        if (!Array.isArray((entry as Partial<LinkIndexEntry>).headers)) {
          (entry as LinkIndexEntry).headers = [];
        }
      }
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

    // Task 8: detect heading rename/delete BEFORE the entry is overwritten.
    const prevHeaders = index.documents[docPath]?.headers ?? [];
    const nextHeaders = extractHeaders(markdownContent);
    const { renames, deletions } = findHeaderRename(prevHeaders, nextHeaders);

    // Apply renames in-place to every doc's sectionLinks. outboundLinks carry
    // no section info (see buildDocumentEntry) — they don't need rewriting.
    if (renames.length > 0) {
      const renameMap = new Map(renames.map((r) => [r.from, r.to]));
      // Capture consuming-doc paths BEFORE the in-memory rewrite mutates
      // section ids. Used below to walk source markdown on disk.
      const consumingPaths: string[] = [];
      for (const [sourcePath, entry] of Object.entries(index.documents)) {
        if (sourcePath === docPath) continue;
        const matches = entry.sectionLinks.some(
          (sl) => sl.targetPath === docPath && renameMap.has(sl.section),
        );
        if (matches) consumingPaths.push(sourcePath);
      }
      for (const entry of Object.values(index.documents)) {
        entry.sectionLinks = entry.sectionLinks.map((sl) => {
          if (sl.targetPath !== docPath) return sl;
          const to = renameMap.get(sl.section);
          return to ? { ...sl, section: to } : sl;
        });
      }

      // Rewrite consuming docs' source markdown on disk. buildDocumentEntry
      // re-derives sectionLinks from raw markdown on every save, so the
      // in-memory rewrite above is ephemeral unless the source file is
      // also updated.
      const renameRecord: Record<string, string> = {};
      for (const r of renames) renameRecord[r.from] = r.to;
      for (const sourcePath of consumingPaths) {
        try {
          const parts = sourcePath.split("/");
          let dh: FileSystemDirectoryHandle = rootHandle;
          for (const part of parts.slice(0, -1)) dh = await dh.getDirectoryHandle(part);
          const fh = await dh.getFileHandle(parts[parts.length - 1]);
          const oldContent = await readTextFile(fh);
          const newContent = updateWikiLinkAnchors(oldContent, docPath, renameRecord);
          if (newContent !== oldContent) {
            await writeTextFile(rootHandle, sourcePath, newContent);
            const sourceDocDir = getDocDir(sourcePath);
            const fresh = buildDocumentEntry(newContent, sourceDocDir);
            index.documents[sourcePath] = {
              ...index.documents[sourcePath],
              outboundLinks: fresh.outboundLinks,
              sectionLinks: fresh.sectionLinks,
              headers: fresh.headers,
            };
          }
        } catch {
          // Skip unreadable/unwritable consuming files; the index-only
          // rewrite already happened, and the next save of the consuming
          // file will resolve consistency one way or the other.
        }
      }
    }

    // Compute affectedRefs for deletions: source docs whose sectionLinks point
    // at a heading we just deleted from this doc.
    const affectedRefs: Array<{ sourcePath: string; anchor: string }> = [];
    if (deletions.length > 0) {
      const deletedSet = new Set(deletions);
      for (const [sourcePath, entry] of Object.entries(index.documents)) {
        if (sourcePath === docPath) continue;
        for (const sl of entry.sectionLinks) {
          if (sl.targetPath === docPath && deletedSet.has(sl.section)) {
            affectedRefs.push({ sourcePath, anchor: sl.section });
          }
        }
      }
    }

    index.documents[docPath] = buildDocumentEntry(markdownContent, docDir);
    rebuildBacklinks(index);
    await saveIndex(rootHandle, index);
    emitCrossReferences(rootHandle, collectCrossReferences(index));

    if (deletions.length > 0) {
      setBrokenAnchorState({ docPath, deletedIds: deletions, affectedRefs });
    }

    return index;
  }, [saveIndex]);

  const clearBrokenAnchorState = useCallback(() => {
    setBrokenAnchorState(null);
  }, []);

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

  // T24: backlinks may carry track?: string when a wiki-link targets a tab-track
  // entity (e.g. [[file.alphatex#track:uuid]]). The link parser does not yet
  // populate this field — the surface is in place so future link-parsing work
  // can surface track backlinks without changing the consumer interface.
  const getBacklinksFor = useCallback((docPath: string): { sourcePath: string; section?: string; track?: string }[] => {
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
        } else if (docPath.endsWith(".alphatex")) {
          const docDir = getDocDir(docPath);
          index.documents[docPath] = buildTabEntry(content, docDir);
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
      headers: [],
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
    /** Sticky banner state: set on a save that deletes a heading other docs link to.
     *  Cleared only via `clearBrokenAnchorState`. */
    brokenAnchorState,
    clearBrokenAnchorState,
  };
}

/** Diff two header sets (prev vs next) for the same document and classify the
 *  change as rename(s) or deletion(s). Used by Task 8's auto-refactor: when a
 *  user renames a single heading, link references to its old slug are
 *  rewritten to the new one. Multi-edit churn falls through to deletions only
 *  to avoid mis-pairing unrelated changes. */
export function findHeaderRename(
  prev: { id: string; text: string; level: number }[],
  next: { id: string; text: string; level: number }[],
): { renames: Array<{ from: string; to: string }>; deletions: string[] } {
  const removed = prev.filter((p) => !next.some((n) => n.id === p.id));
  const added = next.filter((n) => !prev.some((p) => p.id === n.id));
  const renames: Array<{ from: string; to: string }> = [];
  const deletions: string[] = [];
  if (removed.length === 1 && added.length === 1) {
    if (removed[0].level === added[0].level || removed[0].text === added[0].text) {
      renames.push({ from: removed[0].id, to: added[0].id });
    } else {
      deletions.push(removed[0].id);
    }
  } else {
    deletions.push(...removed.map((r) => r.id));
  }
  return { renames, deletions };
}

export type { HeaderInfo };
