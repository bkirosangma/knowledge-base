/**
 * File System Access API implementation of `TabRepository`. Reads and
 * writes raw alphaTex text at a vault-relative path. Mirrors
 * `createDocumentRepository` exactly — kept as its own module so tabs
 * can grow type-specific behaviour later (e.g. `.gp` import pre-flight)
 * without leaking through the document path.
 */

import type { TabRepository } from "../domain/repositories";
import {
  readTextFile,
  writeTextFile,
} from "../shared/hooks/fileExplorerHelpers";
import { classifyError } from "../domain/errors";

export function createTabRepository(
  rootHandle: FileSystemDirectoryHandle,
): TabRepository {
  return {
    async read(tabPath: string) {
      try {
        const parts = tabPath.split("/");
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

    async write(tabPath: string, content: string) {
      try {
        await writeTextFile(rootHandle, tabPath, content);
      } catch (e) {
        throw classifyError(e);
      }
    },
  };
}
