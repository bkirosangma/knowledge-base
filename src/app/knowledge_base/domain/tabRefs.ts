/**
 * Domain types for the `.alphatex.refs.json` sidecar file.
 *
 * The sidecar stores stable section and track ids alongside current display
 * names so that cross-references survive renames.
 *
 * v1 → v2 migration (TAB-009):
 *   - `sections` (Record<stableId, { currentName, createdAt }>) renamed to
 *     `sectionRefs` (Record<stableId, currentName>) — createdAt dropped,
 *     shape flattened.
 *   - `trackRefs` ordered array added. Index = track position in score.
 * Read path is forward-compatible (v1 reads as v2 with empty `trackRefs`).
 * Write always emits v2.
 */

export interface TabRefEntry {
  id: string; // stable UUID, never reused
  name: string; // display name, mirrors current Track.name
}

export interface TabRefsPayload {
  version: 2;
  sectionRefs: Record<string /* stableId */, string /* currentName */>;
  trackRefs: TabRefEntry[]; // ordered array; index = track position in score
}

/** Internal v1 shape kept only for the read-path migration. */
export interface TabRefsPayloadV1 {
  version: 1;
  sections: Record<
    string /* stableId */,
    {
      currentName: string;
      createdAt: number;
    }
  >;
}

export interface TabRefsRepository {
  read(filePath: string): Promise<TabRefsPayload | null>;
  write(filePath: string, payload: TabRefsPayload): Promise<void>;
}

/** Return an empty but valid `TabRefsPayload` (version 2, no sections, no tracks). */
export function emptyTabRefs(): TabRefsPayload {
  return { version: 2, sectionRefs: {}, trackRefs: [] };
}
