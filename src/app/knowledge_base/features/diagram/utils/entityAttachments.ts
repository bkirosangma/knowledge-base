import type {
  DocumentMeta,
  EntityAttachment,
  EntityAttachmentTarget,
  Attachable,
  EntitySources,
  AttachmentBuckets,
} from "../../document/types";

/** True if any document in `documents` is attached to the given entity. (Back-compat with `documentAttachments.hasDocuments`.) */
export function hasDocuments(
  documents: DocumentMeta[],
  entityType: string,
  entityId: string,
): boolean {
  return documents.some((d) =>
    d.attachedTo?.some((a) => a.type === entityType && a.id === entityId),
  );
}

/** Every document attached to the given entity (empty if none). (Back-compat with `documentAttachments.getDocumentsForEntity`.) */
export function getDocumentsForEntity(
  documents: DocumentMeta[],
  entityType: string,
  entityId: string,
): DocumentMeta[] {
  return documents.filter((d) =>
    d.attachedTo?.some((a) => a.type === entityType && a.id === entityId),
  );
}

interface TargetQuery {
  type: EntityAttachmentTarget;
  id: string;
  diagramPath?: string;
}

function matchesTarget(a: EntityAttachment, t: TargetQuery): boolean {
  if (a.type !== t.type) return false;
  if (a.id !== t.id) return false;
  if (t.diagramPath === undefined) return true;
  if (a.diagramPath === undefined) return true; // legacy doc-centric rows lack diagramPath
  return a.diagramPath === t.diagramPath;
}

/** Returns `{docs, diagrams, svgs, tabs}` for a target. In MVP-2b only `docs` is ever non-empty. */
export function attachmentsByType(
  sources: EntitySources,
  target: TargetQuery,
): AttachmentBuckets {
  const filter = (xs: Attachable[]): Attachable[] =>
    xs.filter((x) => x.attachedTo?.some((a) => matchesTarget(a, target)));
  return {
    docs: filter(sources.documents),
    diagrams: filter(sources.diagrams),
    svgs: filter(sources.svgs),
    tabs: filter(sources.tabs),
  };
}
