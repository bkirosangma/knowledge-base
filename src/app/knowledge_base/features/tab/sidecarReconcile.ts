/**
 * Sidecar reconciliation helpers for TabView (C2).
 *
 * These are exported for testability; they are private to the tab feature
 * and should not be imported from outside `features/tab/`.
 */
import { slugifySectionName } from "../../domain/tabEngine";
import type { TabRefsPayload } from "../../domain/tabRefs";
import type { TabEditOp } from "../../domain/tabEngine";

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
  const next: TabRefsPayload = {
    version: 2,
    sectionRefs: { ...current.sectionRefs },
    trackRefs: current.trackRefs ?? [],
  };

  if (oldName !== null) {
    // Find entry by old name.
    const matchKey = Object.keys(next.sectionRefs).find(
      (k) => next.sectionRefs[k] === oldName,
    );
    if (matchKey) {
      if (newName === null) {
        // Section removed.
        delete next.sectionRefs[matchKey];
      } else {
        // Rename in place — stableId preserved.
        next.sectionRefs[matchKey] = newName;
      }
      return next;
    }
  }

  // No existing entry — create one if newName is set.
  if (newName !== null) {
    const stableId = deriveUniqueSlug(newName, next.sectionRefs);
    next.sectionRefs[stableId] = newName;
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
  for (const [stableId, currentName] of Object.entries(current.sectionRefs)) {
    byName.set(currentName, stableId);
  }

  const next: TabRefsPayload = {
    version: 2,
    sectionRefs: {},
    trackRefs: current.trackRefs ?? [],
  };

  for (const section of currentSections) {
    const existing = byName.get(section.name);
    if (existing) {
      next.sectionRefs[existing] = current.sectionRefs[existing];
    } else {
      const stableId = deriveUniqueSlug(section.name, next.sectionRefs);
      next.sectionRefs[stableId] = section.name;
    }
  }

  return next;
}

/** Derive a collision-free slug for a new section entry. */
export function deriveUniqueSlug(
  name: string,
  existingSectionRefs: TabRefsPayload["sectionRefs"],
): string {
  const base = slugifySectionName(name);
  let candidate = base;
  let n = 1;
  while (existingSectionRefs[candidate]) {
    n++;
    candidate = `${base}-${n}`;
  }
  return candidate;
}

export interface UpdateSidecarContext {
  /** For add-track: the freshly generated UUID for the new track. */
  newTrackId?: string;
  /** For remove-track: the positional index of the track being removed. */
  removedPosition?: number;
  /** For add-bar / remove-bar: the post-edit metadata's section list. */
  currentSections?: { name: string }[];
  /** For set-section: the old section name (pre-edit), if any. */
  oldSectionName?: string | null;
}

/**
 * Unified op-aware sidecar reconciliation entry point.
 *
 * Returns the next TabRefsPayload after applying the given TabEditOp.
 * Throws on missing context for ops that need it.
 *
 * Caller responsibilities:
 * - For add-track: provide a fresh UUID via ctx.newTrackId.
 * - For remove-track: capture the position before the engine splice and pass via ctx.removedPosition.
 * - For add-bar / remove-bar: pass the post-edit metadata sections via ctx.currentSections.
 * - For set-section: pass ctx.oldSectionName (pre-edit), and op.name is the new name.
 */
export function updateSidecarOnEdit(
  prev: TabRefsPayload,
  op: TabEditOp,
  ctx: UpdateSidecarContext = {},
): TabRefsPayload {
  switch (op.type) {
    case "set-section":
      return reconcileSidecarForSetSection(prev, ctx.oldSectionName ?? null, op.name);
    case "add-bar":
    case "remove-bar":
      if (!ctx.currentSections) {
        throw new Error(`updateSidecarOnEdit(${op.type}) requires ctx.currentSections`);
      }
      return reconcileSidecarByName(prev, ctx.currentSections);
    case "add-track": {
      if (!ctx.newTrackId) {
        throw new Error("updateSidecarOnEdit(add-track) requires ctx.newTrackId");
      }
      return {
        ...prev,
        trackRefs: [...prev.trackRefs, { id: ctx.newTrackId, name: op.name }],
      };
    }
    case "remove-track": {
      if (typeof ctx.removedPosition !== "number") {
        throw new Error("updateSidecarOnEdit(remove-track) requires ctx.removedPosition");
      }
      return {
        ...prev,
        trackRefs: prev.trackRefs.filter((_, i) => i !== ctx.removedPosition),
      };
    }
    // All other ops don't touch the sidecar — return prev unchanged.
    default:
      return prev;
  }
}
