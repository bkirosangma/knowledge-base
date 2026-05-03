import { slugifySectionName, getSectionIds } from "./tabEngine";
import type { TabRefsPayload } from "./tabRefs";

/**
 * Resolve stable section ids for a tab's current sections.
 *
 * - With no sidecar: identical to today's `getSectionIds` (slug + collision suffix).
 * - With a sidecar: sections matching by `currentName` use their stable id;
 *   any unmatched sections fall back to slug-based ids (the editor seeds these
 *   into the sidecar on the next write).
 */
export function resolveSectionIds(
  sections: { name: string }[],
  refs: TabRefsPayload | null,
): string[] {
  if (!refs) return getSectionIds(sections);
  const byName = invertSections(refs.sections);
  const usedFallbacks = new Map<string, number>();
  return sections.map((s) => {
    const stable = byName.get(s.name);
    if (stable) return stable;
    const base = slugifySectionName(s.name);
    const seen = usedFallbacks.get(base) ?? 0;
    usedFallbacks.set(base, seen + 1);
    return seen === 0 ? base : `${base}-${seen + 1}`;
  });
}

function invertSections(sections: TabRefsPayload["sections"]): Map<string, string> {
  const m = new Map<string, string>();
  for (const [stable, entry] of Object.entries(sections)) m.set(entry.currentName, stable);
  return m;
}
