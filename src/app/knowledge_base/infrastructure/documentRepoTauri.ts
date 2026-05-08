/**
 * Tauri implementation of `DocumentRepository`. Delegates raw read/write
 * to the vault VFS commands via `tauriBridge`.
 */

import type { DocumentRepository } from "../domain/repositories";
import { tauriBridge } from "./tauriBridge";

export function createDocumentRepositoryTauri(): DocumentRepository {
  return {
    read(docPath) {
      return tauriBridge.readText(docPath);
    },
    write(docPath, content) {
      return tauriBridge.writeText(docPath, content);
    },
  };
}
