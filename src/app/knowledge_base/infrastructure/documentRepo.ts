/**
 * File System Access API implementation of `DocumentRepository`. Reads and
 * writes raw markdown text at a vault-relative path.
 */

import type { DocumentRepository } from "../domain/repositories";
import {
  readTextFile,
  writeTextFile,
} from "../shared/hooks/fileExplorerHelpers";
import { classifyError } from "../domain/errors";

export function createDocumentRepository(
  rootHandle: FileSystemDirectoryHandle,
): DocumentRepository {
  return {
    async read(docPath: string) {
      try {
        const parts = docPath.split("/");
        let dirHandle = rootHandle;
        for (const part of parts.slice(0, -1)) {
          dirHandle = await dirHandle.getDirectoryHandle(part);
        }
        const fileHandle = await dirHandle.getFileHandle(parts[parts.length - 1]);
        return await readTextFile(fileHandle);
      } catch (e) {
        throw classifyError(e);
      }
    },

    async write(docPath: string, content: string) {
      try {
        await writeTextFile(rootHandle, docPath, content);
      } catch (e) {
        throw classifyError(e);
      }
    },
  };
}
