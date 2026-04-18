/**
 * Domain-layer repository interfaces for the knowledge-base app.
 *
 * The `domain/` layer owns shapes + contracts; the `infrastructure/` layer
 * provides concrete implementations that map the contracts onto the File
 * System Access API + IndexedDB. Hooks and components depend on the
 * interfaces here, not on any particular FS impl.
 *
 * Phase 3a (this file): LinkIndex + VaultConfig interfaces.
 * Phase 3b (planned):   DiagramRepository + DocumentRepository.
 */

import type { LinkIndex } from "../features/document/types";
import type { VaultConfig } from "../shared/utils/types";

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
