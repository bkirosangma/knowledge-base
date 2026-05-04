/**
 * File System Access API implementation of `AttachmentLinksRepository`.
 * Persists the workspace-wide attachment-link store at
 * `<vault>/.kb/attachment-links.json`. Missing file → []; malformed JSON
 * → backup to `.broken` then []; wrong-shape JSON → FileSystemError.
 */

import type { AttachmentLink, EntityType } from "../domain/attachmentLinks";
import type { AttachmentLinksRepository } from "../domain/repositories";
import {
  readTextFile,
  writeTextFile,
} from "../shared/hooks/fileExplorerHelpers";
import {
  classifyError,
  FileSystemError,
} from "../domain/errors";

const ATTACHMENT_LINKS_PATH = ".kb/attachment-links.json";
const BACKUP_PATH = ".kb/attachment-links.json.broken";

const VALID_TYPES: ReadonlySet<EntityType> = new Set([
  "root", "node", "connection", "flow", "type", "tab", "tab-section", "tab-track",
]);

function isAttachmentLink(x: unknown): x is AttachmentLink {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.docPath === "string" &&
    typeof o.entityType === "string" &&
    VALID_TYPES.has(o.entityType as EntityType) &&
    typeof o.entityId === "string"
  );
}

export function createAttachmentLinksRepository(
  rootHandle: FileSystemDirectoryHandle,
): AttachmentLinksRepository {
  return {
    async read(): Promise<AttachmentLink[]> {
      let text: string;
      try {
        const parts = ATTACHMENT_LINKS_PATH.split("/");
        let dir = rootHandle;
        for (const part of parts.slice(0, -1)) {
          dir = await dir.getDirectoryHandle(part);
        }
        const fileHandle = await dir.getFileHandle(parts[parts.length - 1]);
        text = await readTextFile(fileHandle);
      } catch (e) {
        const err = e as Error & { name?: string };
        if (err?.name === "NotFoundError") return [];
        throw classifyError(e);
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        // Backup the malformed file so we don't lose user data on next write.
        try {
          await writeTextFile(rootHandle, BACKUP_PATH, text);
        } catch {
          // best-effort
        }
        return [];
      }

      if (!Array.isArray(parsed) || !parsed.every(isAttachmentLink)) {
        throw new FileSystemError(
          "malformed",
          `${ATTACHMENT_LINKS_PATH} does not match the AttachmentLink[] shape`,
        );
      }
      return parsed;
    },

    async write(rows: AttachmentLink[]): Promise<void> {
      try {
        await writeTextFile(rootHandle, ATTACHMENT_LINKS_PATH, JSON.stringify(rows, null, 2));
      } catch (e) {
        throw classifyError(e);
      }
    },
  };
}
