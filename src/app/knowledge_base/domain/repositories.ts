/**
 * Domain-layer repository interfaces for the knowledge-base app.
 *
 * The `domain/` layer owns shapes + contracts; the `infrastructure/` layer
 * provides concrete implementations that map the contracts onto the File
 * System Access API + IndexedDB. Hooks and components depend on the
 * interfaces here, not on any particular FS impl.
 *
 * Phase 3a: LinkIndex + VaultConfig interfaces.
 * Phase 3b: DiagramRepository + DocumentRepository.
 */

import type { LinkIndex } from "../features/document/types";
import type { VaultConfig, DiagramData } from "../shared/utils/types";

/**
 * Abstraction over the on-disk wiki-link index (`.archdesigner/_links.json`)
 * and per-document content reads needed to rebuild the index. Lets
 * `useLinkIndex` focus on the index update algorithm, not the FS plumbing.
 */
export interface LinkIndexRepository {
  /** Load the persisted index, or `null` if absent / unparseable. */
  load(): Promise<LinkIndex | null>;
  /** Persist the index; stamps `updatedAt` internally. */
  save(index: LinkIndex): Promise<void>;
  /** Read a document's raw text by vault-relative path. */
  readDocContent(docPath: string): Promise<string>;
}

/**
 * Abstraction over the vault config file (`.archdesigner/config.json`).
 * Wraps the initialise / read / touch lifecycle plus a pure type-guard.
 */
export interface VaultConfigRepository {
  /** Create a fresh vault config with the given name; returns the config. */
  init(vaultName: string): Promise<VaultConfig>;
  /** Read the persisted config, or `null` if absent / unparseable. */
  read(): Promise<VaultConfig | null>;
  /** Stamp `lastOpened = now` on the existing config. */
  touchLastOpened(): Promise<void>;
  /** Pure type-guard: does this look like a valid vault config? */
  isVault(config: VaultConfig | null): boolean;
}

/**
 * Abstraction over a markdown document file (`.md`). Simple read / write of
 * raw text at a vault-relative path.
 */
export interface DocumentRepository {
  /** Read the document's raw text content. */
  read(docPath: string): Promise<string>;
  /** Overwrite the document's content. Creates parent dirs + file as needed. */
  write(docPath: string, content: string): Promise<void>;
}

/**
 * Abstraction over a diagram file (`.json`). Reads + writes the structured
 * `DiagramData` shape; the repo handles (de)serialisation so callers work in
 * the domain type, not raw JSON.
 */
export interface DiagramRepository {
  /** Read + parse a diagram. Returns `null` if the file is absent / invalid. */
  read(diagramPath: string): Promise<DiagramData | null>;
  /** Serialise + write a diagram. Creates parent dirs + file as needed. */
  write(diagramPath: string, data: DiagramData): Promise<void>;
}
