"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useRepositories } from "../../../shell/RepositoryContext";

export interface DocumentPaneBridge {
  save: () => Promise<void>;
  readonly dirty: boolean;
  readonly filePath: string | null;
  readonly content: string;
}

/**
 * Per-pane document content manager. Each DocumentView instance gets its
 * own content/dirty state, similar to how DiagramView manages diagram data.
 *
 * Routes every `.md` read/write through `useRepositories().document`
 * (Phase 3e, 2026-04-19). A null repo (pre-picker) produces the same
 * early-return behaviour as the prior inline `dirHandleRef.current` guard.
 */
export function useDocumentContent(filePath: string | null) {
  const { document: documentRepo } = useRepositories();
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const prevPathRef = useRef<string | null>(null);
  const contentRef = useRef("");
  const dirtyRef = useRef(false);
  const documentRepoRef = useRef(documentRepo);
  documentRepoRef.current = documentRepo;

  // Keep refs in sync for save-on-switch and bridge getters
  contentRef.current = content;
  dirtyRef.current = dirty;

  // Save helper
  const save = useCallback(async () => {
    const repo = documentRepoRef.current;
    if (!repo || !filePath) return;
    await repo.write(filePath, contentRef.current);
    setDirty(false);
  }, [filePath]);

  // Load content when filePath changes; auto-save previous if dirty
  useEffect(() => {
    const prevPath = prevPathRef.current;
    prevPathRef.current = filePath;

    if (filePath === prevPath) return;

    (async () => {
      const repo = documentRepoRef.current;

      // Auto-save previous document if dirty
      if (prevPath && dirtyRef.current && repo) {
        try {
          await repo.write(prevPath, contentRef.current);
        } catch { /* best-effort */ }
      }

      // Load new document
      if (!filePath || !repo) {
        setContent("");
        setDirty(false);
        return;
      }

      try {
        const text = await repo.read(filePath);
        setContent(text);
        setDirty(false);
      } catch {
        setContent("");
        setDirty(false);
      }
    })();
  }, [filePath]);

  const updateContent = useCallback((markdown: string) => {
    setContent(markdown);
    setDirty(true);
  }, []);

  // Bridge object with ref-backed getters so parent reads latest values
  // without triggering re-renders on every keystroke
  const bridge = useMemo<DocumentPaneBridge>(() => ({
    save,
    get dirty() { return dirtyRef.current; },
    get filePath() { return filePath; },
    get content() { return contentRef.current; },
  }), [save, filePath]);

  return { content, dirty, save, updateContent, bridge };
}
