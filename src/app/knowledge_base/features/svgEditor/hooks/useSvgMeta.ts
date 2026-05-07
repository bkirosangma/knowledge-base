"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRepositories } from "../../../shell/RepositoryContext";
import { useShellErrors } from "../../../shell/ShellErrorContext";
import type { SourceLink } from "../../../shared/types/sources";

const AUTOSAVE_DEBOUNCE_MS = 200;

export function useSvgMeta(filePath: string | null): {
  sources: SourceLink[];
  setSources: (next: SourceLink[]) => void;
  isDirty: boolean;
} {
  const { svgRefs: repo } = useRepositories();
  const { reportError } = useShellErrors();
  const [sources, setSourcesState] = useState<SourceLink[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repoRef = useRef(repo);
  repoRef.current = repo;
  const reportErrorRef = useRef(reportError);
  reportErrorRef.current = reportError;
  const filePathRef = useRef(filePath);
  filePathRef.current = filePath;
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;
  const dirtyRef = useRef(isDirty);
  dirtyRef.current = isDirty;

  // Load on file change.
  useEffect(() => {
    if (!filePath) {
      setSourcesState([]);
      setIsDirty(false);
      dirtyRef.current = false;
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const payload = await repoRef.current?.read(filePath);
        if (cancelled) return;
        setSourcesState(payload?.sources ?? []);
        setIsDirty(false);
        dirtyRef.current = false;
      } catch (e) {
        if (cancelled) return;
        reportErrorRef.current(e, `Loading metadata for ${filePath}`);
      }
    })();
    return () => { cancelled = true; };
  }, [filePath]);

  const flush = useCallback(async (path: string, next: SourceLink[]) => {
    const repo = repoRef.current;
    if (!repo) return;
    try {
      await repo.write(path, { version: 1, sources: next });
      if (filePathRef.current === path) {
        setIsDirty(false);
        dirtyRef.current = false;
      }
    } catch (e) {
      reportErrorRef.current(e, `Saving metadata for ${path}`);
    }
  }, []);

  // Cancel any pending debounce and write immediately if dirty.
  const flushPath = useCallback((path: string): void => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (!dirtyRef.current) return;
    void flush(path, sourcesRef.current);
  }, [flush]);

  // Flush pending write before loading the next file.
  useEffect(() => {
    const captured = filePath;
    return () => {
      if (captured) flushPath(captured);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath]);

  const setSources = useCallback((next: SourceLink[]) => {
    setSourcesState(next);
    setIsDirty(true);
    dirtyRef.current = true;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const path = filePathRef.current;
    if (!path) return;
    debounceRef.current = setTimeout(() => { flush(path, next); }, AUTOSAVE_DEBOUNCE_MS);
  }, [flush]);

  // Cleanup pending debounce on unmount.
  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  return { sources, setSources, isDirty };
}
