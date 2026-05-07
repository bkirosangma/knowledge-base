/**
 * File System Access API implementation of `TabRefsRepository`. Reads and
 * writes the `.alphatex.refs.json` sidecar file. Mirrors `tabRepo.ts`'s
 * pattern — lazy creation only, `read` returns `null` when no sidecar
 * exists.
 *
 * Migration: on read, v1 and v2 payloads are migrated in-memory to v3.
 * On write, v3 is always emitted (upgrading any previously-v1 or -v2 file).
 * Empty sources/attachedTo arrays are dropped from the emitted JSON.
 */

import type {
  TabRefsPayload,
  TabRefsPayloadV1,
  TabRefsPayloadV2,
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
    async read(filePath) {
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
        const parsed = JSON.parse(text) as
          | TabRefsPayload
          | TabRefsPayloadV2
          | TabRefsPayloadV1;
        if (parsed.version === 1) {
          const v1 = parsed as TabRefsPayloadV1;
          const sectionRefs: Record<string, string> = {};
          for (const [stableId, entry] of Object.entries(v1.sections)) {
            sectionRefs[stableId] = entry.currentName;
          }
          return { version: 3, sectionRefs, trackRefs: [] };
        }
        if (parsed.version === 2) {
          const v2 = parsed as TabRefsPayloadV2;
          return {
            version: 3,
            sectionRefs: v2.sectionRefs,
            trackRefs: v2.trackRefs,
          };
        }
        if (parsed.version === 3) {
          return parsed as TabRefsPayload;
        }
        return null;
      } catch {
        return null;
      }
    },

    async write(filePath, payload) {
      try {
        const sources = payload.sources ?? [];
        const attachedTo = payload.attachedTo ?? [];
        const cleaned: TabRefsPayload = {
          version: 3,
          sectionRefs: payload.sectionRefs,
          trackRefs: payload.trackRefs,
        };
        if (sources.length > 0) cleaned.sources = sources;
        if (attachedTo.length > 0) cleaned.attachedTo = attachedTo;
        const json = JSON.stringify(cleaned, null, 2);
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
