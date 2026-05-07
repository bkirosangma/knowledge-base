/**
 * File System Access API implementation of `SvgRefsRepository`.
 * Mirrors `tabRefsRepo.ts` — lazy creation, `read` returns null on
 * missing or malformed sidecars. `write` deletes the sidecar when the
 * payload has no sources and no attachedTo (i.e. the user cleared all
 * metadata) so the vault stays tidy.
 */

import type { SvgRefsPayload, SvgRefsRepository } from "../domain/svgRefs";
import {
  readTextFile,
  writeTextFile,
} from "../shared/hooks/fileExplorerHelpers";
import { classifyError } from "../domain/errors";
import { readOrNull } from "../domain/repositoryHelpers";

const SIDECAR_SUFFIX = ".refs.json";

export function createSvgRefsRepository(
  rootHandle: FileSystemDirectoryHandle,
): SvgRefsRepository {
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
        const parsed = JSON.parse(text) as SvgRefsPayload;
        if (parsed.version !== 1) return null;
        return parsed;
      } catch {
        return null;
      }
    },

    async write(filePath, payload) {
      try {
        const sources = payload.sources ?? [];
        const attachedTo = payload.attachedTo ?? [];
        if (sources.length === 0 && attachedTo.length === 0) {
          await deleteSidecar(rootHandle, sidecarPath(filePath));
          return;
        }
        const cleaned: SvgRefsPayload = { version: 1 };
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

function sidecarPath(svgPath: string): string {
  return svgPath + SIDECAR_SUFFIX;
}

async function deleteSidecar(
  root: FileSystemDirectoryHandle,
  path: string,
): Promise<void> {
  const parts = path.split("/");
  let dir = root;
  try {
    for (const part of parts.slice(0, -1)) {
      dir = await dir.getDirectoryHandle(part);
    }
    await dir.removeEntry(parts[parts.length - 1]);
  } catch {
    // Already absent — ignore.
  }
}
