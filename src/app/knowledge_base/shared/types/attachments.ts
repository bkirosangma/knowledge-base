/**
 * Shared scope vocabulary for attachments. Used by SVG and Tab sidecar
 * payloads as a forward-compat field that MVP-2 SVG/Tab branches will
 * eventually wire. No UI in MVP-4b binds this — it is round-trip only.
 */
export type AttachedToScope =
  | "root"
  | "node"
  | "connection"
  | "flow"
  | "type"
  | "tab"
  | "tab-section"
  | "tab-track"
  | "svg"; // whole-file only; entityId is the vault-relative .svg path

export interface AttachedToEntry {
  type: AttachedToScope;
  /** Entity id; absent for "root". */
  id?: string;
  /** Document path the entity is attached to. */
  documentPath: string;
}
