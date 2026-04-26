"use client";

import { useState, useCallback, useEffect } from "react";

const RECENTS_KEY = "kb-recents";
const MAX_RECENTS = 10;

function loadRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string").slice(0, MAX_RECENTS);
  } catch {
    return [];
  }
}

function saveRecents(recents: string[]): void {
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(recents));
  } catch { /* ignore */ }
}

export function useRecentFiles() {
  // Start with empty array on server to avoid SSR/client hydration mismatch.
  // localStorage is only available client-side, so we hydrate after mount.
  const [recentFiles, setRecentFiles] = useState<string[]>([]);

  useEffect(() => {
    setRecentFiles(loadRecents());
  }, []);

  const addToRecents = useCallback((path: string) => {
    setRecentFiles((prev) => {
      // Deduplicate: remove existing entry for this path, then prepend, then slice to max
      const deduped = prev.filter((p) => p !== path);
      const next = [path, ...deduped].slice(0, MAX_RECENTS);
      saveRecents(next);
      return next;
    });
  }, []);

  return { recentFiles, addToRecents };
}
