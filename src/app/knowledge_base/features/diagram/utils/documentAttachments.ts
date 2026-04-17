import type { DocumentMeta } from "../../document/types";

/** True if any document in `documents` is attached to the given entity. */
export function hasDocuments(
  documents: DocumentMeta[],
  entityType: string,
  entityId: string,
): boolean {
  return documents.some((d) =>
    d.attachedTo?.some((a) => a.type === entityType && a.id === entityId),
  );
}

/** Every document attached to the given entity (empty array if none). */
export function getDocumentsForEntity(
  documents: DocumentMeta[],
  entityType: string,
  entityId: string,
): DocumentMeta[] {
  return documents.filter((d) =>
    d.attachedTo?.some((a) => a.type === entityType && a.id === entityId),
  );
}
