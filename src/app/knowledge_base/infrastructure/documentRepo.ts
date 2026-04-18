/**
 * File System Access API implementation of `DocumentRepository`. Reads and
 * writes raw markdown text at a vault-relative path.
 */

import type { DocumentRepository } from "../domain/repositories";
import {
  readTextFile,
  writeTextFile,
} from "../shared/hooks/fileExplorerHelpers";

export function createDocumentRepository(
  rootHandle: FileSystemDirectoryHandle,
): DocumentRepository {
  return {
    async read(docPath: string) {
      const parts = docPath.split("/");
      let dirHandle = rootHandle;
      for (const part of parts.slice(0, -1)) {
        dirHandle = await dirHandle.getDirectoryHandle(part);
      }
      const fileHandle = await dirHandle.getFileHandle(parts[parts.length - 1]);
      return readTextFile(fileHandle);
    },

    async write(docPath: string, content: string) {
      await writeTextFile(rootHandle, docPath, content);
    },
  };
}
