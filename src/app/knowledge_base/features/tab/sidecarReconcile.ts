/**
 * Sidecar reconciliation helpers for TabView (C2).
 *
 * These are exported for testability; they are private to the tab feature
 * and should not be imported from outside `features/tab/`.
 */
import { slugifySectionName } from "../../domain/tabEngine";
import type { TabRefsPayload } from "../../domain/tabRefs";

/**
 * Op-aware reconciliation for set-section (rename).
 *
 * Finds the sidecar entry whose currentName matches `oldName` and updates it
 * to `newName` (preserving stableId). If `oldName` is null or has no entry,
 * and `newName` is non-null, creates a new entry. If `newName` is null, the
 * section is being removed — drop the entry.
 */
export function reconcileSidecarForSetSection(
  current: TabRefsPayload,
  oldName: string | null,
  newName: string | null,
): TabRefsPayload {
  const next: TabRefsPayload = { version: 1, sections: { ...current.sections } };

  if (oldName !== null) {
    // Find entry by old name.
    const matchKey = Object.keys(next.sections).find(
      (k) => next.sections[k].currentName === oldName,
    );
    if (matchKey) {
      if (newName === null) {
        // Section removed.
        delete next.sections[matchKey];
      } else {
        // Rename in place — stableId preserved.
        next.sections[matchKey] = { ...next.sections[matchKey], currentName: newName };
      }
      return next;
    }
  }

  // No existing entry — create one if newName is set.
  if (newName !== null) {
    const stableId = deriveUniqueSlug(newName, next.sections);
    next.sections[stableId] = { currentName: newName, createdAt: Date.now() };
  }

  return next;
}

/**
 * Name-based reconciliation for add-bar / remove-bar.
 *
 * Drops entries whose currentName no longer appears in currentSections.
 * Adds new entries for sections not yet in the sidecar.
 */
export function reconcileSidecarByName(
  current: TabRefsPayload,
  currentSections: { name: string }[],
): TabRefsPayload {
  const byName = new Map<string, string>();
  for (const [stableId, entry] of Object.entries(current.sections)) {
    byName.set(entry.currentName, stableId);
  }

  const next: TabRefsPayload = { version: 1, sections: {} };

  for (const section of currentSections) {
    const existing = byName.get(section.name);
    if (existing) {
      next.sections[existing] = current.sections[existing];
    } else {
      const stableId = deriveUniqueSlug(section.name, next.sections);
      next.sections[stableId] = { currentName: section.name, createdAt: Date.now() };
    }
  }

  return next;
}

/** Derive a collision-free slug for a new section entry. */
export function deriveUniqueSlug(
  name: string,
  existingSections: TabRefsPayload["sections"],
): string {
  const base = slugifySectionName(name);
  let candidate = base;
  let n = 1;
  while (existingSections[candidate]) {
    n++;
    candidate = `${base}-${n}`;
  }
  return candidate;
}
