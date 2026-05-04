/**
 * Workspace-scoped flat relations store. Each row links a markdown
 * document (by its vault-relative path) to one entity it is "attached to"
 * in a diagram or tab. Persisted at `<vault>/.kb/attachment-links.json`.
 */

export type EntityType =
  | "root"
  | "node"
  | "connection"
  | "flow"
  | "type"
  | "tab"
  | "tab-section"
  | "tab-track";

export interface AttachmentLink {
  docPath: string;
  entityType: EntityType;
  entityId: string;
}

export function isSameRow(a: AttachmentLink, b: AttachmentLink): boolean {
  return (
    a.docPath === b.docPath &&
    a.entityType === b.entityType &&
    a.entityId === b.entityId
  );
}

export function addRow(
  rows: AttachmentLink[],
  row: AttachmentLink,
): AttachmentLink[] {
  if (rows.some((r) => isSameRow(r, row))) return rows;
  return [...rows, row];
}

export function removeRow(
  rows: AttachmentLink[],
  row: AttachmentLink,
): AttachmentLink[] {
  if (!rows.some((r) => isSameRow(r, row))) return rows;
  return rows.filter((r) => !isSameRow(r, row));
}

/**
 * Remove every row matched by `matcher`. Returns the new array plus the
 * count removed. When zero rows match, returns the input `rows` reference
 * (so React consumers can skip re-renders) and `removed: 0`.
 */
export function removeMatchingRows(
  rows: AttachmentLink[],
  matcher: (row: AttachmentLink) => boolean,
): { rows: AttachmentLink[]; removed: number } {
  let removed = 0;
  const next = rows.filter((r) => {
    if (matcher(r)) {
      removed++;
      return false;
    }
    return true;
  });
  if (removed === 0) return { rows, removed: 0 };
  return { rows: next, removed };
}

/**
 * Remove every row whose `entityType ∈ entityTypes` AND `entityId ∈ entityIds`,
 * then concat `replacement`. Used by diagram-undo to swap a diagram's subset.
 */
export function replaceSubset(
  rows: AttachmentLink[],
  entityTypes: Set<string>,
  entityIds: Set<string>,
  replacement: AttachmentLink[],
): AttachmentLink[] {
  let removed = 0;
  const filtered = rows.filter((r) => {
    if (entityTypes.has(r.entityType) && entityIds.has(r.entityId)) {
      removed++;
      return false;
    }
    return true;
  });
  if (removed === 0 && replacement.length === 0) return rows;
  return [...filtered, ...replacement];
}

/**
 * Rewrite tab-scope ids per the supplied map. Only `tab-section` and
 * `tab-track` rows are eligible (matches the existing `migrateAttachments`
 * callback in `features/document/hooks/useDocuments.ts`).
 */
export function migrateRows(
  rows: AttachmentLink[],
  idMap: Map<string, string>,
): AttachmentLink[] {
  if (idMap.size === 0) return rows;
  let touched = false;
  const next = rows.map((r) => {
    if (r.entityType !== "tab-section" && r.entityType !== "tab-track") return r;
    const replacement = idMap.get(r.entityId);
    if (replacement === undefined) return r;
    touched = true;
    return { ...r, entityId: replacement };
  });
  return touched ? next : rows;
}
