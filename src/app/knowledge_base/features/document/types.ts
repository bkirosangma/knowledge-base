export type EntityAttachmentTarget =
  | 'root'
  | 'node'
  | 'connection'
  | 'flow'
  | 'type'
  | 'tab'
  | 'tab-section'
  | 'tab-track';

export interface EntityAttachment {
  type: EntityAttachmentTarget;
  /** ID of the target. For 'root', the value is the diagram filename. */
  id: string;
  /** Optional — diagram filename when target is a diagram-scoped entity (node/connection/flow). */
  diagramPath?: string;
}

export interface DocumentMeta {
  id: string;
  filename: string;       // relative path from vault root
  title: string;
  attachedTo?: EntityAttachment[];
}

export interface OutboundLink {
  targetPath: string;
  type?: "document" | "diagram" | "tab";
}

export interface LinkIndexEntry {
  outboundLinks: OutboundLink[];
  sectionLinks: { targetPath: string; section: string }[];
}

export interface BacklinkEntry {
  linkedFrom: { sourcePath: string; section?: string; track?: string }[];
}

export interface LinkIndex {
  updatedAt: string;
  documents: Record<string, LinkIndexEntry>;
  backlinks: Record<string, BacklinkEntry>;
}
