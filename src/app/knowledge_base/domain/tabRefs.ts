/**
 * Domain types for the `.alphatex.refs.json` sidecar file.
 *
 * The sidecar stores stable section ids alongside the current display name
 * so that cross-references survive section renames. Version 1 is the
 * initial schema — bump and add a migration when the shape changes.
 */

export interface TabRefsPayload {
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

/** Return an empty but valid `TabRefsPayload` (version 1, no sections). */
export function emptyTabRefs(): TabRefsPayload {
  return { version: 1, sections: {} };
}
