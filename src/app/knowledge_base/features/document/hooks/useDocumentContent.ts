"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useRepositories } from "../../../shell/RepositoryContext";
import { useShellErrors } from "../../../shell/ShellErrorContext";
import { FileSystemError, classifyError } from "../../../domain/errors";

export interface DocumentPaneBridge {
  save: () => Promise<void>;
  /**
   * Revert unsaved edits by re-reading the file from disk. If the file
   * can't be read the error surfaces to the shell banner and the in-memory
   * content is left untouched.
   */
  discard: () => Promise<void>;
  readonly dirty: boolean;
  readonly filePath: string | null;
  readonly content: string;
}

/**
 * Per-pane document content manager. Each DocumentView instance gets its
 * own content/dirty state, similar to how DiagramView manages diagram data.
 *
 * Routes every `.md` read/write through `useRepositories().document`
 * (Phase 3e, 2026-04-19). Phase 5c (2026-04-19) closes the load-fail
 * data-loss vector: a failing `.read()` no longer sets an empty
 * content — it records the classified error, leaves the prior content
 * untouched (so the editor renders the last-good doc, or stays empty if
 * none), and refuses to `save()` while `loadError` is set. Callers
 * (`DocumentView` / `MarkdownPane`) read the returned `loadError` to
 * render an error state instead of a blank editable surface. Every
 * actionable failure (load, save-on-switch, explicit save) also calls
 * `reportError` so the shell banner renders it.
 */
export function useDocumentContent(filePath: string | null) {
  const { document: documentRepo } = useRepositories();
  const { reportError } = useShellErrors();
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [loadError, setLoadError] = useState<FileSystemError | null>(null);
  /** The filePath whose content is currently held in `content`. Set after
   *  every successful load (and on null/no-repo branches). Consumers can
   *  compare `loadedPath === filePath` to know that content is fresh for
   *  the current file — e.g. to safely call `initHistory`. */
  const [loadedPath, setLoadedPath] = useState<string | null>(null);
  const prevPathRef = useRef<string | null>(null);
  const contentRef = useRef("");
  const dirtyRef = useRef(false);
  const loadErrorRef = useRef<FileSystemError | null>(null);
  const documentRepoRef = useRef(documentRepo);
  documentRepoRef.current = documentRepo;

  // Keep refs in sync for save-on-switch and bridge getters
  contentRef.current = content;
  dirtyRef.current = dirty;
  loadErrorRef.current = loadError;

  // Save helper
  const save = useCallback(async () => {
    const repo = documentRepoRef.current;
    if (!repo || !filePath) return;
    // Phase 5c: if the most recent load failed, contentRef.current is
    // the previous document's content (we no longer reset to empty on
    // load failure). Refuse to save, otherwise we could overwrite a
    // real file with stale content.
    if (loadErrorRef.current) return;
    try {
      await repo.write(filePath, contentRef.current);
      setDirty(false);
    } catch (e) {
      reportError(e, `Saving ${filePath}`);
    }
  }, [filePath, reportError]);

  // Load content when filePath changes; auto-save previous if dirty
  useEffect(() => {
    const prevPath = prevPathRef.current;
    prevPathRef.current = filePath;

    if (filePath === prevPath) return;

    (async () => {
      const repo = documentRepoRef.current;

      // Auto-save previous document if dirty. Phase 5c: failures surface
      // to the shell banner instead of being silently dropped — the
      // switch proceeds either way so the user isn't stuck on the old
      // pane, but they see the error and can retry.
      if (prevPath && dirtyRef.current && repo) {
        try {
          await repo.write(prevPath, contentRef.current);
        } catch (e) {
          reportError(e, `Auto-saving ${prevPath} on switch`);
        }
      }

      // Load new document
      if (!filePath) {
        setContent("");
        setDirty(false);
        setLoadError(null);
        setLoadedPath(null);
        return;
      }
      if (!repo) {
        // Pre-picker — can't read. Not an error; show empty.
        setContent("");
        setDirty(false);
        setLoadError(null);
        setLoadedPath(filePath);
        return;
      }

      try {
        const text = await repo.read(filePath);
        setContent(text);
        setDirty(false);
        setLoadError(null);
        setLoadedPath(filePath);
      } catch (e) {
        const fsErr = e instanceof FileSystemError ? e : classifyError(e);
        setLoadError(fsErr);
        setDirty(false);
        // Leave contentRef.current at the last-successful doc. Save is
        // blocked while loadError is set so the prior content is never
        // written over the failing path.
        reportError(fsErr, `Loading ${filePath}`);
        // Do NOT set loadedPath here — the load failed, so content is
        // still the previous document's content. Consumers waiting for
        // loadedPath === filePath will correctly skip until a retry.
      }
    })();
  }, [filePath, reportError]);

  const updateContent = useCallback((markdown: string) => {
    // Phase 5c: if the most recent load failed, edits are ignored so the
    // user can't type into a stale buffer and save-over the real file.
    if (loadErrorRef.current) return;
    setContent(markdown);
    setDirty(true);
  }, []);

  // Apply a snapshot string directly — no disk I/O. Used when history can
  // restore the saved state without re-reading the file (history-first discard).
  const resetToContent = useCallback((text: string) => {
    setContent(text);
    setDirty(false);
  }, []);

  // Discard helper: re-read the file from disk, throwing away unsaved edits.
  // Symmetrical to `save`: refuses to run while a prior load failed (so we
  // don't wipe the in-memory last-good copy with yet another failing read).
  const discard = useCallback(async () => {
    const repo = documentRepoRef.current;
    if (!repo || !filePath) return;
    if (loadErrorRef.current) return;
    try {
      const text = await repo.read(filePath);
      setContent(text);
      setDirty(false);
    } catch (e) {
      reportError(e, `Discarding changes to ${filePath}`);
    }
  }, [filePath, reportError]);

  // Bridge object with ref-backed getters so parent reads latest values
  // without triggering re-renders on every keystroke
  const bridge = useMemo<DocumentPaneBridge>(() => ({
    save,
    discard,
    get dirty() { return dirtyRef.current; },
    get filePath() { return filePath; },
    get content() { return contentRef.current; },
  }), [save, discard, filePath]);

  return { content, dirty, loadError, loadedPath, save, discard, resetToContent, updateContent, bridge };
}
