/**
 * Tauri implementation of `DiagramRepository`. Delegates raw JSON read/write
 * to the vault VFS commands via `tauriBridge`, with shape validation.
 */

import type { DiagramRepository } from "../domain/repositories";
import type { DiagramData } from "../shared/utils/types";
import { isDiagramData } from "../shared/hooks/fileExplorerHelpers";
import { FileSystemError } from "../domain/errors";
import { tauriBridge } from "./tauriBridge";

export function createDiagramRepositoryTauri(): DiagramRepository {
  return {
    async read(diagramPath: string): Promise<DiagramData> {
      const parsed = await tauriBridge.readJson<unknown>(diagramPath);

      // Shape guard — both invalid JSON and wrong shape map to "malformed"
      // so callers can tell "this file is not a valid diagram" apart from
      // "this file is missing".
      if (!isDiagramData(parsed)) {
        throw new FileSystemError(
          "malformed",
          `Diagram ${diagramPath} does not match the DiagramData shape`,
        );
      }
      return parsed;
    },

    async write(diagramPath: string, data: DiagramData): Promise<void> {
      await tauriBridge.writeJson(diagramPath, data);
    },
  };
}
