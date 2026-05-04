import type { AttachmentLink } from "../../../domain/attachmentLinks";

/**
 * Attachment-row matcher for `.alphatex` file-tree deletions.
 *
 * Matches:
 *   - `tab` rows whose entityId equals the file path exactly.
 *   - `tab-section` and `tab-track` rows whose entityId is prefixed with
 *     `<path>#` (fragment separator for sub-entity ids scoped to this file).
 */
export function tabFileMatcher(
  path: string,
): (r: AttachmentLink) => boolean {
  return (r: AttachmentLink) =>
    (r.entityType === "tab" && r.entityId === path) ||
    ((r.entityType === "tab-section" || r.entityType === "tab-track") &&
      r.entityId.startsWith(path + "#"));
}

/**
 * Attachment-row matcher for `.kbjson` file-tree deletions.
 *
 * Matches `node`, `connection`, and `flow` rows whose entityId appears in
 * the pre-collected set of ids belonging to the deleted diagram.
 */
export function diagramFileMatcher(
  ids: Set<string>,
): (r: AttachmentLink) => boolean {
  return (r: AttachmentLink) =>
    (r.entityType === "node" ||
      r.entityType === "connection" ||
      r.entityType === "flow") &&
    ids.has(r.entityId);
}

/**
 * Attachment-row matcher for `.md` file-tree deletions.
 *
 * Matches all rows whose `docPath` equals the deleted file path.
 */
export function mdFileMatcher(
  path: string,
): (r: AttachmentLink) => boolean {
  return (r: AttachmentLink) => r.docPath === path;
}
