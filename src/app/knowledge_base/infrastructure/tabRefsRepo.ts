/**
 * File System Access API implementation of `TabRefsRepository`. Reads and
 * writes the `.alphatex.refs.json` sidecar file that maps stable section ids
 * to their current display names. Mirrors `tabRepo.ts`'s pattern exactly —
 * lazy creation only, `read` returns `null` when no sidecar exists.
 *
 * v1 → v2 migration: on read, v1 payloads are migrated in-memory to v2.
 * On write, v2 is always emitted (upgrading any previously-v1 file).
 */

import type {
  TabRefsPayload,
  TabRefsPayloadV1,
  TabRefsRepository,
} from "../domain/tabRefs";
import {
  readTextFile,
  writeTextFile,
} from "../shared/hooks/fileExplorerHelpers";
import { classifyError } from "../domain/errors";
import { readOrNull } from "../domain/repositoryHelpers";

const SIDECAR_SUFFIX = ".refs.json";

export function createTabRefsRepository(
  rootHandle: FileSystemDirectoryHandle,
): TabRefsRepository {
  return {
    async read(filePath: string) {
      const text = await readOrNull(async () => {
        try {
          const parts = sidecarPath(filePath).split("/");
          let dirHandle = rootHandle;
          for (const part of parts.slice(0, -1)) {
            dirHandle = await dirHandle.getDirectoryHandle(part);
          }
          const fileHandle = await dirHandle.getFileHandle(
            parts[parts.length - 1],
          );
          return await readTextFile(fileHandle);
        } catch (e) {
          throw classifyError(e);
        }
      });

      if (text === null) return null;

      try {
        const parsed = JSON.parse(text) as TabRefsPayload | TabRefsPayloadV1;
        if (parsed.version === 1) {
          // Migrate v1 → v2: flatten sectionRefs, add empty trackRefs.
          const v1 = parsed as TabRefsPayloadV1;
          const sectionRefs: Record<string, string> = {};
          for (const [stableId, entry] of Object.entries(v1.sections)) {
            sectionRefs[stableId] = entry.currentName;
          }
          return { version: 2, sectionRefs, trackRefs: [] };
        }
        if (parsed.version === 2) {
          return parsed as TabRefsPayload;
        }
        return null;
      } catch {
        return null;
      }
    },

    async write(filePath: string, payload: TabRefsPayload) {
      try {
        const v2: TabRefsPayload = {
          version: 2,
          sectionRefs: payload.sectionRefs,
          trackRefs: payload.trackRefs,
        };
        const json = JSON.stringify(v2, null, 2);
        await writeTextFile(rootHandle, sidecarPath(filePath), json);
      } catch (e) {
        throw classifyError(e);
      }
    },
  };
}

function sidecarPath(alphatexPath: string): string {
  return alphatexPath + SIDECAR_SUFFIX;
}
