/**
 * File System Access API implementation of `AttachmentRepository`. Writes
 * binary blobs into `<vault>/.attachments/` addressed by content hash.
 */

import type { AttachmentRepository } from "../domain/repositories";
import { classifyError } from "../domain/errors";

const ATTACHMENTS_DIR = ".attachments";

export function createAttachmentRepository(
  rootHandle: FileSystemDirectoryHandle,
): AttachmentRepository {
  async function getAttachmentsDir(): Promise<FileSystemDirectoryHandle> {
    return rootHandle.getDirectoryHandle(ATTACHMENTS_DIR, { create: true });
  }

  return {
    async exists(filename: string): Promise<boolean> {
      try {
        const dir = await getAttachmentsDir();
        await dir.getFileHandle(filename);
        return true;
      } catch {
        return false;
      }
    },

    async write(filename: string, bytes: ArrayBuffer): Promise<void> {
      try {
        const dir = await getAttachmentsDir();
        const fileHandle = await dir.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(bytes);
        await writable.close();
      } catch (e) {
        throw classifyError(e);
      }
    },

    async read(filename: string): Promise<Blob> {
      try {
        const dir = await getAttachmentsDir();
        const fileHandle = await dir.getFileHandle(filename);
        return await fileHandle.getFile();
      } catch (e) {
        throw classifyError(e);
      }
    },
  };
}
