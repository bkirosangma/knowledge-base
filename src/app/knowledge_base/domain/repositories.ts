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
 * Phase 5c (2026-04-19): every method throws `FileSystemError` on any
 * failure (including "file not found"). Consumers that want the common
 * "absent file is not an error" ergonomic wrap the read in the domain
 * `readOrNull` helper; consumers that want to branch on error kind
 * try/catch and inspect `.kind`. The previous "return null on any
 * failure" contract was hiding data-loss bugs and has been removed.
 */

import type { LinkIndex } from "../features/document/types";
import type { VaultConfig, DiagramData } from "../shared/utils/types";

/**
 * Abstraction over the on-disk wiki-link index (`.archdesigner/_links.json`)
 * and per-document content reads needed to rebuild the index. Lets
 * `useLinkIndex` focus on the index update algorithm, not the FS plumbing.
 */
export interface LinkIndexRepository {
  /** Load the persisted index. Throws `FileSystemError` ("not-found" if the
   *  file is absent; "malformed" on parse failure; etc). */
  load(): Promise<LinkIndex>;
  /** Persist the index; stamps `updatedAt` internally. Throws on failure. */
  save(index: LinkIndex): Promise<void>;
  /** Read a document's raw text by vault-relative path. Throws on failure. */
  readDocContent(docPath: string): Promise<string>;
}

/**
 * Abstraction over the vault config file (`.archdesigner/config.json`).
 * Wraps the initialise / read / touch lifecycle plus a pure type-guard.
 */
export interface VaultConfigRepository {
  /** Create a fresh vault config with the given name; returns the config.
   *  Throws on write failure. */
  init(vaultName: string): Promise<VaultConfig>;
  /** Read the persisted config. Throws `FileSystemError` ("not-found" when
   *  `.archdesigner/config.json` is absent; "malformed" on parse or shape
   *  failure). */
  read(): Promise<VaultConfig>;
  /** Stamp `lastOpened = now` on the existing config. Throws on failure. */
  touchLastOpened(): Promise<void>;
  /** Read-merge-write a partial patch (e.g. `{ theme: "dark" }`). Returns
   *  the new full config. Throws if the file is absent or write fails. */
  update(patch: Partial<VaultConfig>): Promise<VaultConfig>;
  /** Pure type-guard: does this look like a valid vault config? */
  isVault(config: VaultConfig | null): boolean;
}

/**
 * Abstraction over a markdown document file (`.md`). Simple read / write of
 * raw text at a vault-relative path.
 */
export interface DocumentRepository {
  /** Read the document's raw text content. Throws `FileSystemError` on any
   *  failure. */
  read(docPath: string): Promise<string>;
  /** Overwrite the document's content. Creates parent dirs + file as
   *  needed. Throws on failure. */
  write(docPath: string, content: string): Promise<void>;
}

/**
 * Abstraction over a diagram file (`.json`). Reads + writes the structured
 * `DiagramData` shape; the repo handles (de)serialisation so callers work in
 * the domain type, not raw JSON.
 */
export interface DiagramRepository {
  /** Read + parse a diagram. Throws `FileSystemError` ("not-found" if file
   *  absent; "malformed" if JSON or shape guard fails; "permission" if
   *  FSA rejects). */
  read(diagramPath: string): Promise<DiagramData>;
  /** Serialise + write a diagram. Creates parent dirs + file as needed.
   *  Throws on failure. */
  write(diagramPath: string, data: DiagramData): Promise<void>;
}
