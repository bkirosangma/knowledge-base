// Pure post-query filter for SearchPanel chip selections (KB-010 /
// SEARCH-8.6-02). The worker stays untouched — chips operate on the
// already-returned `SearchResult[]`. The index already tags hits by
// `kind` and `field`, so chip composition is just predicate filtering.

import type { Field, SearchResult } from "./VaultIndex";

export interface ChipFilters {
  /** Active kind filter. `null` = "all". Mutually exclusive choice. */
  kind: "doc" | "diagram" | null;
  /** Active field filters. Empty set = "all"; otherwise a result must
   *  have at least one hit in any selected field to pass. */
  fields: Set<Field>;
  /** Active folder filters. Empty set = "all"; otherwise a result's
   *  path must start with one of the selected folder prefixes
   *  (matched against the leading path segment, e.g. "notes/"). */
  folders: Set<string>;
}

export function emptyChipFilters(): ChipFilters {
  return { kind: null, fields: new Set(), folders: new Set() };
}

/** Compose chip filters by intersection. A result passes when it
 *  matches every active chip type (no active chips of a type ⇒ that
 *  type is permissive). */
export function applyChipFilters(
  results: SearchResult[],
  filters: ChipFilters,
): SearchResult[] {
  return results.filter((r) => {
    if (filters.kind !== null && r.kind !== filters.kind) return false;
    if (filters.fields.size > 0) {
      const hasField = r.fieldHits.some((h) => filters.fields.has(h.field));
      if (!hasField) return false;
    }
    if (filters.folders.size > 0) {
      const top = topFolderOf(r.path);
      if (!filters.folders.has(top)) return false;
    }
    return true;
  });
}

/** Top-level folder of a path. Files at the vault root return `""`
 *  (the empty string) — selectable as the "(root)" chip. */
export function topFolderOf(path: string): string {
  const i = path.indexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

/** Distinct top-level folders present in the result set, sorted with
 *  the root bucket first. */
export function listResultFolders(results: SearchResult[]): string[] {
  const set = new Set<string>();
  for (const r of results) set.add(topFolderOf(r.path));
  const out = Array.from(set);
  out.sort((a, b) => {
    if (a === "") return -1;
    if (b === "") return 1;
    return a.localeCompare(b);
  });
  return out;
}
