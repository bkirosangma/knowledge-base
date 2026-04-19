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
import { FileSystemError, classifyError } from "../domain/errors";

const CONFIG_DIR = ".archdesigner";
const LINKS_FILE = "_links.json";

export function createLinkIndexRepository(
  rootHandle: FileSystemDirectoryHandle,
): LinkIndexRepository {
  return {
    async load() {
      let text: string;
      try {
        const configDir = await getSubdirectoryHandle(rootHandle, CONFIG_DIR);
        const fileHandle = await configDir.getFileHandle(LINKS_FILE);
        text = await readTextFile(fileHandle);
      } catch (e) {
        throw classifyError(e);
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        throw new FileSystemError(
          "malformed",
          `Link index at ${CONFIG_DIR}/${LINKS_FILE} is not valid JSON`,
          e,
        );
      }
      const p = parsed as Partial<LinkIndex> | null;
      if (!p || !p.documents || !p.backlinks) {
        throw new FileSystemError(
          "malformed",
          `Link index at ${CONFIG_DIR}/${LINKS_FILE} is missing required fields`,
        );
      }
      return p as LinkIndex;
    },

    async save(index: LinkIndex) {
      const updated = { ...index, updatedAt: new Date().toISOString() };
      try {
        await writeTextFile(
          rootHandle,
          `${CONFIG_DIR}/${LINKS_FILE}`,
          JSON.stringify(updated, null, 2),
        );
      } catch (e) {
        throw classifyError(e);
      }
    },

    async readDocContent(docPath: string) {
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
  };
}
