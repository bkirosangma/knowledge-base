/**
 * Tauri implementation of `AttachmentRepository`. Stores binary blobs at
 * `.attachments/<filename>`; skips writes when the file already exists
 * (hash-dedup contract from the FSA implementation).
 */

import type { AttachmentRepository } from "../domain/repositories";
import { tauriBridge } from "./tauriBridge";

const ATTACH_DIR = ".attachments";

export function createAttachmentRepositoryTauri(): AttachmentRepository {
  return {
    async write(filename, bytes) {
      const path = `${ATTACH_DIR}/${filename}`;
      if (await tauriBridge.exists(path)) return;
      await tauriBridge.writeBytes(path, bytes);
    },
    exists(filename) {
      return tauriBridge.exists(`${ATTACH_DIR}/${filename}`);
    },
    async read(filename) {
      const path = `${ATTACH_DIR}/${filename}`;
      const buf = await tauriBridge.readBytes(path);
      return new Blob([buf]);
    },
  };
}
