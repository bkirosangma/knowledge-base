/**
 * File System Access API implementation of `LinkIndexRepository`. Reads and
 * writes `.archdesigner/_links.json` under the given vault root.
 */

import type { LinkIndex } from "../features/document/types";
import type { LinkIndexRepository } from "../domain/repositories";
import {
  readTextFile,
  writeTextFile,
  getSubdirectoryHandle,
} from "../shared/hooks/fileExplorerHelpers";

const CONFIG_DIR = ".archdesigner";
const LINKS_FILE = "_links.json";

export function createLinkIndexRepository(
  rootHandle: FileSystemDirectoryHandle,
): LinkIndexRepository {
  return {
    async load() {
      try {
        const configDir = await getSubdirectoryHandle(rootHandle, CONFIG_DIR);
        const fileHandle = await configDir.getFileHandle(LINKS_FILE);
        const text = await readTextFile(fileHandle);
        const parsed = JSON.parse(text);
        if (!parsed.documents || !parsed.backlinks) return null;
        return parsed as LinkIndex;
      } catch {
        return null;
      }
    },

    async save(index: LinkIndex) {
      const updated = { ...index, updatedAt: new Date().toISOString() };
      await writeTextFile(
        rootHandle,
        `${CONFIG_DIR}/${LINKS_FILE}`,
        JSON.stringify(updated, null, 2),
      );
    },

    async readDocContent(docPath: string) {
      const parts = docPath.split("/");
      let dirHandle = rootHandle;
      for (const part of parts.slice(0, -1)) {
        dirHandle = await dirHandle.getDirectoryHandle(part);
      }
      const fileHandle = await dirHandle.getFileHandle(parts[parts.length - 1]);
      return readTextFile(fileHandle);
    },
  };
}
