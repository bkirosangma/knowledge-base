import type { SourceLink } from "../../shared/types/sources";

export type EntityAttachmentTarget =
  | 'root'
  | 'node'
  | 'connection'
  | 'flow'
  | 'type'
  | 'tab'
  | 'tab-section'
  | 'tab-track'
  | 'svg'; // whole-file only; entityId is the vault-relative .svg path

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
  sources?: SourceLink[];
}

export interface OutboundLink {
  targetPath: string;
  type?: "document" | "diagram" | "tab";
}

export interface LinkIndexEntry {
  outboundLinks: OutboundLink[];
  sectionLinks: { targetPath: string; section: string }[];
  /** Headings declared in this document, in document order. */
  headers: { id: string; text: string; level: 1 | 2 | 3 | 4 | 5 | 6 }[];
}

export interface BacklinkEntry {
  linkedFrom: { sourcePath: string; section?: string; track?: string }[];
}

export interface LinkIndex {
  updatedAt: string;
  documents: Record<string, LinkIndexEntry>;
  backlinks: Record<string, BacklinkEntry>;
}

/** Minimal shape any attachable entity satisfies. `DocumentMeta` already conforms structurally; future `SvgFile`/`TabFile`/diagram entries will too once their persistence sidecars exist. */
export interface Attachable {
  filename: string;
  title?: string;
  attachedTo?: EntityAttachment[];
}

/** Per-source-type list shape. MVP-2b only populates `documents`; the other three are reserved for future SVG/Tab/Diagram-source MVPs. */
export interface EntitySources {
  documents: Attachable[];
  diagrams: Attachable[]; // always [] in MVP-2b
  svgs: Attachable[];     // always [] in MVP-2b
  tabs: Attachable[];     // always [] in MVP-2b
}

export interface AttachmentBuckets {
  docs: Attachable[];
  diagrams: Attachable[];
  svgs: Attachable[];
  tabs: Attachable[];
}
