"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { createDocumentRepository } from "../../../infrastructure/documentRepo";

export interface DocumentPaneBridge {
  save: () => Promise<void>;
  readonly dirty: boolean;
  readonly filePath: string | null;
  readonly content: string;
}

/**
 * Per-pane document content manager.
 * Each DocumentView instance gets its own content/dirty state,
 * similar to how DiagramView manages its own diagram data.
 */
export function useDocumentContent(
  dirHandleRef: React.RefObject<FileSystemDirectoryHandle | null>,
  filePath: string | null,
) {
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const prevPathRef = useRef<string | null>(null);
  const contentRef = useRef("");
  const dirtyRef = useRef(false);

  // Keep refs in sync for save-on-switch and bridge getters
  contentRef.current = content;
  dirtyRef.current = dirty;

  // Save helper
  const save = useCallback(async () => {
    const rootHandle = dirHandleRef.current;
    if (!rootHandle || !filePath) return;
    const repo = createDocumentRepository(rootHandle);
    await repo.write(filePath, contentRef.current);
    setDirty(false);
  }, [dirHandleRef, filePath]);

  // Load content when filePath changes; auto-save previous if dirty
  useEffect(() => {
    const prevPath = prevPathRef.current;
    prevPathRef.current = filePath;

    if (filePath === prevPath) return;

    (async () => {
      const rootHandle = dirHandleRef.current;

      // Auto-save previous document if dirty
      if (prevPath && dirtyRef.current && rootHandle) {
        try {
          const repo = createDocumentRepository(rootHandle);
          await repo.write(prevPath, contentRef.current);
        } catch { /* best-effort */ }
      }

      // Load new document
      if (!filePath || !rootHandle) {
        setContent("");
        setDirty(false);
        return;
      }

      try {
        const repo = createDocumentRepository(rootHandle);
        const text = await repo.read(filePath);
        setContent(text);
        setDirty(false);
      } catch {
        setContent("");
        setDirty(false);
      }
    })();
  }, [filePath, dirHandleRef]);

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
