"use client";

import { useEffect, useRef } from "react";
import { getSectionIds } from "../../../domain/tabEngine";
import type { TabMetadata } from "../../../domain/tabEngine";

/**
 * Diff `metadata.sections` against the previous snapshot (per file) and
 * fire `onMigrate` with position-aligned id rewrites. Trailing deletions
 * orphan by design — surfaced in the UI rather than silently re-bound.
 * Cache is keyed by `filePath`; switching files resets the snapshot so
 * the new file's first observation establishes a baseline (no spurious
 * migrations).
 */
export function useTabSectionSync(
  filePath: string,
  metadata: TabMetadata | null,
  onMigrate: (filePath: string, migrations: { from: string; to: string }[]) => void,
): void {
  const lastIdsRef = useRef<{ filePath: string; ids: string[] } | null>(null);

  useEffect(() => {
    if (metadata === null) return;
    const nextIds = getSectionIds(metadata.sections);
    const prev = lastIdsRef.current;
    lastIdsRef.current = { filePath, ids: nextIds };

    if (prev === null || prev.filePath !== filePath) return;

    const overlap = Math.min(prev.ids.length, nextIds.length);
    const migrations: { from: string; to: string }[] = [];
    for (let i = 0; i < overlap; i++) {
      if (prev.ids[i] !== nextIds[i]) {
        migrations.push({ from: prev.ids[i], to: nextIds[i] });
      }
    }
    if (migrations.length > 0) onMigrate(filePath, migrations);
  }, [filePath, metadata, onMigrate]);
}
