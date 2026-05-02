"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useRepositories } from "../../../shell/RepositoryContext";
import { useShellErrors } from "../../../shell/ShellErrorContext";
import { FileSystemError, classifyError } from "../../../domain/errors";
import { fnv1a } from "../../../shared/utils/historyPersistence";
import {
  saveDocumentDraft,
  loadDocumentDraft,
  clearDraft,
} from "../../../shared/utils/persistence";

const DRAFT_DEBOUNCE_MS = 500;

/**
 * Handed back to consumers when an autosaved draft was restored on mount.
 * Drives the [Discard] [Keep] banner in DocumentView (KB-002).
 */
export interface PendingDraft {
  /** When the draft was last persisted to localStorage. */
  savedAt: number;
}

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
 * Routes every `.md` read/write through `useRepositories().document`.
 * The typed-error surface closes the load-fail data-loss vector: a
 * failing `.read()` no longer sets an empty content — it records the
 * classified error, leaves the prior content
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
  // KB-002: when a draft was restored from localStorage on mount and the
  // restored content differs from disk, surface a banner offering Keep /
  // Discard. `null` once the user dismisses it (or on a clean load).
  const [pendingDraft, setPendingDraft] = useState<PendingDraft | null>(null);
  /** The filePath whose content is currently held in `content`. Set after
   *  every successful load (and on null/no-repo branches). Consumers can
   *  compare `loadedPath === filePath` to know that content is fresh for
   *  the current file — e.g. to safely call `initHistory`. */
  const [loadedPath, setLoadedPath] = useState<string | null>(null);
  const prevPathRef = useRef<string | null>(null);
  const contentRef = useRef("");
  const dirtyRef = useRef(false);
  const loadErrorRef = useRef<FileSystemError | null>(null);
  const diskChecksumRef = useRef<string>("");
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
    // If the most recent load failed, contentRef.current is the
    // previous document's content (we no longer reset to empty on
    // load failure). Refuse to save, otherwise we could overwrite a
    // real file with stale content.
    if (loadErrorRef.current) return;
    try {
      await repo.write(filePath, contentRef.current);
      diskChecksumRef.current = fnv1a(contentRef.current);
      setDirty(false);
      // KB-002: a successful save means the in-memory state matches disk,
      // so any persisted draft is now redundant. Drop it and dismiss the
      // restore banner if it was still showing.
      clearDraft(filePath);
      setPendingDraft(null);
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

      // Auto-save previous document if dirty. Failures surface to the
      // shell banner instead of being silently dropped — the switch
      // proceeds either way so the user isn't stuck on the old pane,
      // but they see the error and can retry.
      // KB-002: a successful auto-save means the prev path no longer
      // has unsaved work, so its draft is now stale — clear it. On
      // failure leave the draft so a future reopen can restore.
      if (prevPath && dirtyRef.current && repo) {
        try {
          await repo.write(prevPath, contentRef.current);
          clearDraft(prevPath);
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
        setPendingDraft(null);
        return;
      }
      if (!repo) {
        // Pre-picker — can't read. Not an error; show empty.
        setContent("");
        setDirty(false);
        setLoadError(null);
        setLoadedPath(filePath);
        setPendingDraft(null);
        return;
      }

      try {
        const text = await repo.read(filePath);
        const draft = loadDocumentDraft(filePath);
        // KB-002 restore-on-mount: if the stored draft differs from disk
        // it represents unsaved work — restore it as the in-memory state
        // (dirty=true) and raise the [Discard] [Keep] banner. If the
        // draft matches disk it's stale (the user must have saved on
        // another tab) — silently clear it.
        if (draft && draft.content !== text) {
          setContent(draft.content);
          diskChecksumRef.current = fnv1a(text);
          setDirty(true);
          setLoadError(null);
          setLoadedPath(filePath);
          setPendingDraft({ savedAt: draft.savedAt });
        } else {
          if (draft) clearDraft(filePath);
          setContent(text);
          diskChecksumRef.current = fnv1a(text);
          setDirty(false);
          setLoadError(null);
          setLoadedPath(filePath);
          setPendingDraft(null);
        }
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
    // If the most recent load failed, edits are ignored so the user
    // can't type into a stale buffer and save-over the real file.
    if (loadErrorRef.current) return;
    // Skip if content is identical — Tiptap can fire onUpdate for structural
    // normalizations (trailing nodes, decoration changes) that don't change
    // the serialized Markdown. Without this guard, clicking in the doc after
    // a save would spuriously re-enable the Save/Discard buttons.
    if (markdown === contentRef.current) return;
    setContent(markdown);
    setDirty(true);
  }, []);

  const getContentFromDisk = useCallback(async (): Promise<{ text: string; checksum: string } | null> => {
    const repo = documentRepoRef.current;
    if (!repo || !filePath) return null;
    try {
      const text = await repo.read(filePath);
      return { text, checksum: fnv1a(text) };
    } catch {
      return null;
    }
  }, [filePath]);

  const updateDiskChecksum = useCallback((checksum: string) => {
    diskChecksumRef.current = checksum;
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
      // KB-002: discard wipes unsaved edits, so any persisted draft is
      // also discarded. Dismiss the restore banner too — it's about to
      // become inaccurate.
      clearDraft(filePath);
      setPendingDraft(null);
    } catch (e) {
      reportError(e, `Discarding changes to ${filePath}`);
    }
  }, [filePath, reportError]);

  // KB-002: debounced autosave of dirty content into the per-vault draft
  // entry. Mirrors useDiagramPersistence's 500ms cadence. Failures route
  // through the shell banner so quota/permission issues are surfaced
  // instead of silently dropping the user's edits.
  useEffect(() => {
    if (!filePath || !dirty) return;
    const t = setTimeout(() => {
      try {
        saveDocumentDraft(filePath, content);
      } catch (e) {
        reportError(e, `Auto-saving draft of ${filePath}`);
      }
    }, DRAFT_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [filePath, content, dirty, reportError]);

  // KB-002: "Keep" handler. Leaves the restored draft as the live
  // (dirty) in-memory state and just hides the banner — the next
  // debounced tick re-persists it. The "Discard" handler is the
  // existing `discard()` (now also clears the draft + banner), so the
  // banner does not need a separate disk-restore helper.
  const dismissDraftBanner = useCallback(() => {
    setPendingDraft(null);
  }, []);

  // Bridge object with ref-backed getters so parent reads latest values
  // without triggering re-renders on every keystroke
  const bridge = useMemo<DocumentPaneBridge>(() => ({
    save,
    discard,
    get dirty() { return dirtyRef.current; },
    get filePath() { return filePath; },
    get content() { return contentRef.current; },
  }), [save, discard, filePath]);

  return {
    content,
    dirty,
    loadError,
    loadedPath,
    save,
    discard,
    resetToContent,
    updateContent,
    bridge,
    diskChecksumRef,
    getContentFromDisk,
    updateDiskChecksum,
    // KB-002 — draft restore banner state + control.
    pendingDraft,
    dismissDraftBanner,
  };
}
