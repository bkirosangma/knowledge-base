/**
 * File System Access API implementation of `VaultIndexRepository`. Wraps
 * the existing tree-scan and helper utilities so consumers can depend on
 * a typed repo instead of poking at FileSystemDirectoryHandle directly.
 *
 * This file goes away in MVP-1d alongside the rest of the FSA
 * infrastructure.
 */

import type { VaultIndexRepository } from "../domain/repositories";
import { scanTree } from "../shared/utils/fileTree";
import {
  resolveParentHandle,
  getSubdirectoryHandle,
} from "../shared/hooks/fileExplorerHelpers";

export function createVaultIndexRepositoryFsa(
  rootHandle: FileSystemDirectoryHandle,
): VaultIndexRepository {
  return {
    async scan() {
      return scanTree(rootHandle, "");
    },

    async rename(from: string, to: string) {
      // FSA has no native rename; copy-then-delete approach via the existing
      // pattern: get the parent of `from`, create the new name in parent of
      // `to`, copy content, then remove the old entry.
      const fromParts = from.split("/");
      const fromName = fromParts[fromParts.length - 1];
      const fromParentPath = fromParts.slice(0, -1).join("/");

      const toParts = to.split("/");
      const toName = toParts[toParts.length - 1];
      const toParentPath = toParts.slice(0, -1).join("/");

      const fromParent = await resolveParentHandle(rootHandle, fromParentPath);
      const toParent = await (toParentPath
        ? getSubdirectoryHandle(rootHandle, toParentPath, true)
        : Promise.resolve(rootHandle));

      // Try as file first, then directory
      let isFile = false;
      try {
        const fileHandle = await fromParent.getFileHandle(fromName);
        isFile = true;
        const file = await fileHandle.getFile();
        const content = await file.arrayBuffer();
        const newHandle = await toParent.getFileHandle(toName, { create: true });
        const writable = await newHandle.createWritable();
        await writable.write(content);
        await writable.close();
      } catch {
        if (!isFile) {
          // It's a directory — use recursive copy
          const srcDir = await fromParent.getDirectoryHandle(fromName);
          const destDir = await toParent.getDirectoryHandle(toName, { create: true });
          await copyDirContentsLocal(srcDir, destDir);
          await fromParent.removeEntry(fromName, { recursive: true });
          return;
        }
      }
      if (isFile) {
        await fromParent.removeEntry(fromName);
      }
    },

    async delete(path: string) {
      const parts = path.split("/");
      const name = parts[parts.length - 1];
      const parentPath = parts.slice(0, -1).join("/");
      const parent = await resolveParentHandle(rootHandle, parentPath);
      await parent.removeEntry(name, { recursive: true });
    },

    async exists(path: string) {
      const parts = path.split("/");
      const name = parts[parts.length - 1];
      const parentPath = parts.slice(0, -1).join("/");
      try {
        const parent = await resolveParentHandle(rootHandle, parentPath);
        try {
          await parent.getFileHandle(name);
          return true;
        } catch {
          try {
            await parent.getDirectoryHandle(name);
            return true;
          } catch {
            return false;
          }
        }
      } catch {
        return false;
      }
    },

    async createFolder(path: string) {
      await getSubdirectoryHandle(rootHandle, path, true);
    },
  };
}

async function copyDirContentsLocal(
  src: FileSystemDirectoryHandle,
  dest: FileSystemDirectoryHandle,
): Promise<void> {
  for await (const entry of src.values()) {
    if (entry.kind === "file") {
      const fileHandle = entry as FileSystemFileHandle;
      const file = await fileHandle.getFile();
      const content = await file.arrayBuffer();
      const newHandle = await dest.getFileHandle(entry.name, { create: true });
      const writable = await newHandle.createWritable();
      await writable.write(content);
      await writable.close();
    } else if (entry.kind === "directory") {
      const dirHandle = entry as unknown as FileSystemDirectoryHandle;
      const newDir = await dest.getDirectoryHandle(entry.name, { create: true });
      await copyDirContentsLocal(dirHandle, newDir);
    }
  }
}
