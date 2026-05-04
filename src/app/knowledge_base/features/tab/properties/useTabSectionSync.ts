"use client";

import { useEffect, useRef, useState } from "react";
import { getSectionIds } from "../../../domain/tabEngine";
import type { TabMetadata } from "../../../domain/tabEngine";
import { useRepositories } from "../../../shell/RepositoryContext";

/**
 * Diff `metadata.sections` against the previous snapshot (per file) and
 * fire `onMigrate` with position-aligned id rewrites. Trailing deletions
 * orphan by design — surfaced in the UI rather than silently re-bound.
 * Cache is keyed by `filePath`; switching files resets the snapshot so
 * the new file's first observation establishes a baseline (no spurious
 * migrations).
 *
 * Sidecar branch (T18): when a `.alphatex.refs.json` sidecar exists AND
 * contains at least one section entry, the sidecar is the source of truth
 * and position-based migrations are suppressed entirely. This prevents
 * spurious id rewrites after the editor writes stable ids into the sidecar.
 * When no sidecar exists (no rootHandle, missing file, or empty sections),
 * the original position-based reconciliation runs unchanged.
 *
 * NOTE (follow-up): The write-side (calling tabRefs.write after apply
 * succeeds for set-section / add-bar / remove-bar) is deferred to the
 * TabEditor.tsx editor-chunk wiring — not part of T18.
 */
export function useTabSectionSync(
  filePath: string,
  metadata: TabMetadata | null,
  onMigrate: (filePath: string, migrations: { from: string; to: string }[]) => void,
): void {
  const { tabRefs } = useRepositories();
  const lastIdsRef = useRef<{ filePath: string; ids: string[] } | null>(null);

  // hasSidecar: true when the sidecar file exists AND has at least one section.
  // Default false = fall through to position-based reconciliation.
  const [hasSidecar, setHasSidecar] = useState(false);

  useEffect(() => {
    if (!tabRefs || !filePath) {
      setHasSidecar(false);
      return;
    }
    let cancelled = false;
    tabRefs
      .read(filePath)
      .then((payload) => {
        if (!cancelled) {
          setHasSidecar(
            payload !== null && Object.keys(payload.sectionRefs).length > 0,
          );
        }
      })
      .catch(() => {
        if (!cancelled) setHasSidecar(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tabRefs, filePath]);

  useEffect(() => {
    if (metadata === null) return;
    // When the sidecar is present and non-empty, it is the source of truth —
    // skip position-based migration entirely.
    if (hasSidecar) return;

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
  }, [filePath, metadata, onMigrate, hasSidecar]);
}
