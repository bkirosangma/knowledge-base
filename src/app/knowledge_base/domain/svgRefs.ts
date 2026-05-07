/**
 * Domain types for the `<file>.svg.refs.json` sidecar.
 *
 * Lazy creation only — the sidecar exists only when the user has added
 * at least one source link (or, in a future MVP, an `attachedTo` entry).
 * Read returns `null` when no sidecar exists. Write deletes the sidecar
 * when both `sources` and `attachedTo` are empty/absent.
 */

import type { SourceLink } from "../shared/types/sources";
import type { AttachedToEntry } from "../shared/types/attachments";

export interface SvgRefsPayload {
  version: 1;
  sources?: SourceLink[];
  /** Reserved for MVP-2 SVG attachments; not wired in MVP-4b. */
  attachedTo?: AttachedToEntry[];
}

export interface SvgRefsRepository {
  read(filePath: string): Promise<SvgRefsPayload | null>;
  write(filePath: string, payload: SvgRefsPayload): Promise<void>;
}

/** Return an empty but valid payload (no sources, no attachedTo). */
export function emptySvgRefs(): SvgRefsPayload {
  return { version: 1 };
}
