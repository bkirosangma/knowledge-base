/**
 * File System Access API implementation of `DiagramRepository`. Loads +
 * saves a structured `DiagramData` shape, handling (de)serialisation and a
 * shape guard so callers operate in the domain type rather than raw JSON.
 */

import type { DiagramData } from "../shared/utils/types";
import type { DiagramRepository } from "../domain/repositories";
import {
  readTextFile,
  writeTextFile,
  isDiagramData,
} from "../shared/hooks/fileExplorerHelpers";

export function createDiagramRepository(
  rootHandle: FileSystemDirectoryHandle,
): DiagramRepository {
  return {
    async read(diagramPath: string) {
      try {
        const parts = diagramPath.split("/");
        let dirHandle = rootHandle;
        for (const part of parts.slice(0, -1)) {
          dirHandle = await dirHandle.getDirectoryHandle(part);
        }
        const fileHandle = await dirHandle.getFileHandle(parts[parts.length - 1]);
        const text = await readTextFile(fileHandle);
        const parsed = JSON.parse(text);
        return isDiagramData(parsed) ? parsed : null;
      } catch {
        return null;
      }
    },

    async write(diagramPath: string, data: DiagramData) {
      await writeTextFile(rootHandle, diagramPath, JSON.stringify(data, null, 2));
    },
  };
}
