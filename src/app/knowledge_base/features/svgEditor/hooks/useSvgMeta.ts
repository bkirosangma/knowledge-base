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

  // Load on file change.
  useEffect(() => {
    if (!filePath) {
      setSourcesState([]);
      setIsDirty(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const payload = await repoRef.current?.read(filePath);
        if (cancelled) return;
        setSourcesState(payload?.sources ?? []);
        setIsDirty(false);
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
      if (filePathRef.current === path) setIsDirty(false);
    } catch (e) {
      reportErrorRef.current(e, `Saving metadata for ${path}`);
    }
  }, []);

  const setSources = useCallback((next: SourceLink[]) => {
    setSourcesState(next);
    setIsDirty(true);
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
