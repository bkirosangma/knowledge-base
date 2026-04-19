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
import { FileSystemError, classifyError } from "../domain/errors";

export function createDiagramRepository(
  rootHandle: FileSystemDirectoryHandle,
): DiagramRepository {
  return {
    async read(diagramPath: string) {
      let text: string;
      try {
        const parts = diagramPath.split("/");
        let dirHandle = rootHandle;
        for (const part of parts.slice(0, -1)) {
          dirHandle = await dirHandle.getDirectoryHandle(part);
        }
        const fileHandle = await dirHandle.getFileHandle(parts[parts.length - 1]);
        text = await readTextFile(fileHandle);
      } catch (e) {
        throw classifyError(e);
      }
      // Parse + shape guard — both map to "malformed" so callers can tell
      // "this file is not a valid diagram" apart from "this file is missing".
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        throw new FileSystemError(
          "malformed",
          `Diagram ${diagramPath} is not valid JSON`,
          e,
        );
      }
      if (!isDiagramData(parsed)) {
        throw new FileSystemError(
          "malformed",
          `Diagram ${diagramPath} does not match the DiagramData shape`,
        );
      }
      return parsed;
    },

    async write(diagramPath: string, data: DiagramData) {
      try {
        await writeTextFile(rootHandle, diagramPath, JSON.stringify(data, null, 2));
      } catch (e) {
        throw classifyError(e);
      }
    },
  };
}
