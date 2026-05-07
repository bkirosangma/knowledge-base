/**
 * Merge a list of attached document paths with a list of wiki-link
 * backlinks for the same target file. De-duplicates by `sourcePath`;
 * when the same path appears in both lists, the attachment wins (i.e.
 * the row is rendered with the attachment affordances, not the
 * read-only wiki-link affordance).
 */

export interface BacklinkRef {
  sourcePath: string;
  /** Optional section anchor; preserved in the input but not used by the merge. */
  section?: string;
}

export interface MergedReference {
  sourcePath: string;
  source: "attachment" | "wiki-link";
}

export function mergeAttachmentsWithBacklinks(
  attachmentPaths: string[],
  backlinks: BacklinkRef[],
): MergedReference[] {
  const seen = new Set<string>();
  const out: MergedReference[] = [];
  for (const p of attachmentPaths) {
    if (seen.has(p)) continue;
    seen.add(p);
    out.push({ sourcePath: p, source: "attachment" });
  }
  for (const b of backlinks) {
    if (seen.has(b.sourcePath)) continue;
    seen.add(b.sourcePath);
    out.push({ sourcePath: b.sourcePath, source: "wiki-link" });
  }
  return out;
}
