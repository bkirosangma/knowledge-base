/**
 * Domain types for the `.alphatex.refs.json` sidecar file.
 *
 * Migration history:
 *   v1 → v2 (TAB-009): `sections` → `sectionRefs`; `trackRefs` added.
 *   v2 → v3 (MVP-4b): optional `sources` and reserved `attachedTo` added.
 *
 * Read path is forward-compatible (v1 reads as v3 with empty `trackRefs`,
 * no sources, no attachedTo). Write always emits v3 and drops empty
 * sources/attachedTo arrays from the JSON.
 */

import type { SourceLink } from "../shared/types/sources";
import type { AttachedToEntry } from "../shared/types/attachments";

export interface TabRefEntry {
  id: string; // stable UUID, never reused
  name: string; // display name, mirrors current Track.name
}

export interface TabRefsPayload {
  version: 3;
  sectionRefs: Record<string, string>;
  trackRefs: TabRefEntry[];
  /** File-level source links. */
  sources?: SourceLink[];
  /** Reserved for MVP-2 Tab attachments; not wired in MVP-4b. */
  attachedTo?: AttachedToEntry[];
}

export interface TabRefsPayloadV2 {
  version: 2;
  sectionRefs: Record<string, string>;
  trackRefs: TabRefEntry[];
}

export interface TabRefsPayloadV1 {
  version: 1;
  sections: Record<string, { currentName: string; createdAt: number }>;
}

export interface TabRefsRepository {
  read(filePath: string): Promise<TabRefsPayload | null>;
  write(filePath: string, payload: TabRefsPayload): Promise<void>;
}

export function emptyTabRefs(): TabRefsPayload {
  return { version: 3, sectionRefs: {}, trackRefs: [] };
}
