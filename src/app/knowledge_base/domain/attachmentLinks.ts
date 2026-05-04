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
