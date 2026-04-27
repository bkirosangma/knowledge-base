/**
 * File System Access API implementation of `SVGRepository`. Reads and
 * writes raw SVG text at a vault-relative path. Mirrors `documentRepo`
 * — every failure rethrows as a classified `FileSystemError`.
 */

import type { SVGRepository } from "../domain/repositories";
import {
  readTextFile,
  writeTextFile,
} from "../shared/hooks/fileExplorerHelpers";
import { classifyError } from "../domain/errors";

export function createSVGRepository(
  rootHandle: FileSystemDirectoryHandle,
): SVGRepository {
  return {
    async read(svgPath: string) {
      try {
        const parts = svgPath.split("/");
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

    async write(svgPath: string, svgString: string) {
      try {
        await writeTextFile(rootHandle, svgPath, svgString);
      } catch (e) {
        throw classifyError(e);
      }
    },
  };
}
