"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRepositories } from "../../../shell/RepositoryContext";
import { useShellErrors } from "../../../shell/ShellErrorContext";
import type { SVGCanvasHandle } from "../components/SVGCanvas";

/**
 * SVG editor persistence (KB-005, 2026-04-27).
 *
 * Routes every read/write through `Repositories.svg` so failures surface
 * as classified `FileSystemError`s and reach `ShellErrorContext` instead
 * of being silently swallowed. `isDirty` only flips back to false on a
 * successful write — load failures, debounced-autosave failures, and
 * manual-save failures all leave the dirty marker on so the user can
 * retry.
 *
 * Autosave debounces at 200 ms (down from 1500 ms). The pending timer
 * is flushed on:
 *
 *   - manual save (`handleSave`)
 *   - active-file switch (effect cleanup writes the previous file)
 *   - component unmount (same cleanup, captured value)
 *   - window blur (`window.blur` event), as a defence-in-depth flush
 *     when the user tabs away mid-stroke
 */
const AUTOSAVE_DEBOUNCE_MS = 200;

export function useSVGPersistence(
  activeFile: string | null,
  canvasRef: React.RefObject<SVGCanvasHandle | null>,
) {
  const { svg: svgRepo } = useRepositories();
  const { reportError } = useShellErrors();
  const [isDirty, setIsDirty] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  const repoRef = useRef(svgRepo);
  repoRef.current = svgRepo;
  const reportErrorRef = useRef(reportError);
  reportErrorRef.current = reportError;

  const setDirty = useCallback((next: boolean) => {
    dirtyRef.current = next;
    setIsDirty(next);
  }, []);

  // Write the canvas's current SVG. Resets dirty only on success — and
  // only if the canvas hasn't changed during the await (otherwise edits
  // that arrived mid-write would silently be marked saved).
  const writeSvg = useCallback(async (path: string): Promise<void> => {
    const repo = repoRef.current;
    const canvas = canvasRef.current;
    if (!repo || !canvas) return;
    const snapshot = canvas.getSvgString();
    try {
      await repo.write(path, snapshot);
      if (canvas.getSvgString() === snapshot) {
        setDirty(false);
      }
    } catch (e) {
      reportErrorRef.current(e, `Saving ${path}`);
    }
  }, [canvasRef, setDirty]);

  // Load file when activeFile changes.
  useEffect(() => {
    if (!activeFile) return;
    const repo = repoRef.current;
    if (!repo) return;
    let cancelled = false;
    (async () => {
      try {
        const content = await repo.read(activeFile);
        if (cancelled) return;
        canvasRef.current?.setSvgString(content);
        setDirty(false);
      } catch (e) {
        if (cancelled) return;
        reportErrorRef.current(e, `Loading ${activeFile}`);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFile]);

  // Flush helper — cancel pending debounce, kick off the write if dirty.
  const flushPath = useCallback((path: string): void => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (!dirtyRef.current) return;
    void writeSvg(path);
  }, [writeSvg]);

  // Flush pending writes when the active file changes, and on unmount.
  // The cleanup captures `activeFile` at effect-run time so the flush
  // always targets the file the user was editing — not whatever came
  // next.
  useEffect(() => {
    const captured = activeFile;
    return () => {
      if (captured) flushPath(captured);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFile]);

  // Window blur: flush any pending edit so a user tabbing away does not
  // sit on un-persisted strokes. FSA writes are local and usually
  // complete before the tab is fully backgrounded.
  useEffect(() => {
    const onBlur = () => {
      if (activeFile) flushPath(activeFile);
    };
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [activeFile, flushPath]);

  const onChanged = useCallback(() => {
    setDirty(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!activeFile) return;
    const path = activeFile;
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      void writeSvg(path);
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [activeFile, setDirty, writeSvg]);

  const handleSave = useCallback(async () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (!activeFile) return;
    await writeSvg(activeFile);
  }, [activeFile, writeSvg]);

  const handleDiscard = useCallback(async () => {
    if (!activeFile) return;
    const repo = repoRef.current;
    if (!repo) return;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    try {
      const content = await repo.read(activeFile);
      canvasRef.current?.setSvgString(content);
      setDirty(false);
    } catch (e) {
      reportErrorRef.current(e, `Discarding changes to ${activeFile}`);
    }
  }, [activeFile, canvasRef, setDirty]);

  const flush = useCallback((): void => {
    if (activeFile) flushPath(activeFile);
  }, [activeFile, flushPath]);

  return { isDirty, onChanged, handleSave, handleDiscard, flush };
}
