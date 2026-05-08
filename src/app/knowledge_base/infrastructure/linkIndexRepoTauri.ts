/**
 * Tauri implementation of `LinkIndexRepository`. Delegates JSON read/write
 * and document content reads to the vault VFS commands via `tauriBridge`.
 */

import type { LinkIndex } from "../features/document/types";
import type { LinkIndexRepository } from "../domain/repositories";
import { FileSystemError } from "../domain/errors";
import { tauriBridge } from "./tauriBridge";

const STORE = ".archdesigner/_links.json";

export function createLinkIndexRepositoryTauri(): LinkIndexRepository {
  return {
    async load(): Promise<LinkIndex> {
      // Missing file → throw "not-found"; malformed JSON → throw "malformed".
      if (!(await tauriBridge.exists(STORE))) {
        throw new FileSystemError(
          "not-found",
          `Link index at ${STORE} does not exist`,
        );
      }

      const parsed = await tauriBridge.readJson<unknown>(STORE);

      // Shape guard — validate required fields are present and correct type.
      const p = parsed as Partial<LinkIndex> | null;
      if (!p || !p.documents || !p.backlinks) {
        throw new FileSystemError(
          "malformed",
          `Link index at ${STORE} is missing required fields (documents or backlinks)`,
        );
      }

      return p as LinkIndex;
    },

    async save(index: LinkIndex): Promise<void> {
      const updated = { ...index, updatedAt: new Date().toISOString() };
      await tauriBridge.writeJson(STORE, updated);
    },

    async readDocContent(docPath: string): Promise<string> {
      return await tauriBridge.readText(docPath);
    },
  };
}
