/**
 * Tauri implementation of `AttachmentLinksRepository`. Delegates raw JSON
 * read/write to the vault VFS commands via `tauriBridge`, with shape validation.
 */

import type { AttachmentLink, EntityType } from "../domain/attachmentLinks";
import type { AttachmentLinksRepository } from "../domain/repositories";
import { FileSystemError } from "../domain/errors";
import { tauriBridge } from "./tauriBridge";

const STORE = ".kb/attachment-links.json";

const VALID_TYPES: ReadonlySet<EntityType> = new Set([
  "root", "node", "connection", "flow", "type", "tab", "tab-section", "tab-track", "svg",
]);

function isAttachmentLink(x: unknown): x is AttachmentLink {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.docPath === "string" &&
    o.docPath !== "" &&
    typeof o.entityType === "string" &&
    VALID_TYPES.has(o.entityType as EntityType) &&
    typeof o.entityId === "string" &&
    o.entityId !== ""
  );
}

export function createAttachmentLinksRepositoryTauri(): AttachmentLinksRepository {
  return {
    async read(): Promise<AttachmentLink[]> {
      // Missing file → return [].
      if (!(await tauriBridge.exists(STORE))) {
        return [];
      }

      const parsed = await tauriBridge.readJson<unknown>(STORE);

      // Shape guard — both invalid JSON and wrong shape map to "malformed"
      // so callers can tell "this file is not a valid attachment-links store"
      // apart from "this file is missing".
      if (!Array.isArray(parsed) || !parsed.every(isAttachmentLink)) {
        throw new FileSystemError(
          "malformed",
          `${STORE} does not match the AttachmentLink[] shape`,
        );
      }
      return parsed;
    },

    async write(rows: AttachmentLink[]): Promise<void> {
      await tauriBridge.writeJson(STORE, rows);
    },
  };
}
