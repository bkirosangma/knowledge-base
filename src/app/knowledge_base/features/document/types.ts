export interface DocumentMeta {
  id: string;
  filename: string;       // relative path from vault root
  title: string;
  attachedTo?: {
    type: 'root' | 'node' | 'connection' | 'flow' | 'type';
    id: string;
  }[];
}

export interface LinkIndexEntry {
  outboundLinks: string[];
  sectionLinks: { targetPath: string; section: string }[];
}

export interface BacklinkEntry {
  linkedFrom: { sourcePath: string; section?: string }[];
}

export interface LinkIndex {
  updatedAt: string;
  documents: Record<string, LinkIndexEntry>;
  backlinks: Record<string, BacklinkEntry>;
}
