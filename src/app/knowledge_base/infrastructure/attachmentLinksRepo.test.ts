import { describe, it, expect } from "vitest";
import { createAttachmentLinksRepository } from "./attachmentLinksRepo";
import type { AttachmentLink } from "../domain/attachmentLinks";
import { FileSystemError } from "../domain/errors";

function makeHandle(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));

  function fileHandle(fullPath: string) {
    return {
      kind: "file" as const,
      name: fullPath.split("/").pop() ?? fullPath,
      async getFile() {
        const text = store.get(fullPath);
        if (text === undefined) {
          const e = new Error("not here") as Error & { name: string };
          e.name = "NotFoundError";
          throw e;
        }
        return { text: async () => text } as unknown as File;
      },
      async createWritable() {
        return {
          async write(content: string) {
            store.set(fullPath, content);
          },
          async close() {},
        } as unknown as FileSystemWritableFileStream;
      },
    };
  }

  function directoryHandle(prefix: string): FileSystemDirectoryHandle {
    return {
      kind: "directory",
      name: prefix === "" ? "root" : prefix.split("/").pop() ?? prefix,
      async getFileHandle(name: string, _opts?: { create?: boolean }) {
        const fullPath = prefix === "" ? name : `${prefix}/${name}`;
        return fileHandle(fullPath);
      },
      async getDirectoryHandle(name: string, _opts?: { create?: boolean }) {
        const fullPath = prefix === "" ? name : `${prefix}/${name}`;
        return directoryHandle(fullPath);
      },
    } as unknown as FileSystemDirectoryHandle;
  }

  return { dirHandle: directoryHandle(""), store };
}

const A: AttachmentLink = { docPath: "a.md", entityType: "node", entityId: "n1" };
const B: AttachmentLink = { docPath: "b.md", entityType: "flow", entityId: "f1" };

describe("attachmentLinksRepo", () => {
  it("read on missing file returns []", async () => {
    const { dirHandle } = makeHandle();
    const repo = createAttachmentLinksRepository(dirHandle);
    expect(await repo.read()).toEqual([]);
  });

  it("write then read round-trips", async () => {
    const { dirHandle } = makeHandle();
    const repo = createAttachmentLinksRepository(dirHandle);
    await repo.write([A, B]);
    expect(await repo.read()).toEqual([A, B]);
  });

  it("write places file at .kb/attachment-links.json", async () => {
    const { dirHandle, store } = makeHandle();
    const repo = createAttachmentLinksRepository(dirHandle);
    await repo.write([A]);
    expect(store.has(".kb/attachment-links.json")).toBe(true);
  });

  it("malformed JSON triggers backup write and returns []", async () => {
    const { dirHandle, store } = makeHandle({
      ".kb/attachment-links.json": "{not json",
    });
    const repo = createAttachmentLinksRepository(dirHandle);
    expect(await repo.read()).toEqual([]);
    expect(store.get(".kb/attachment-links.json.broken")).toBe("{not json");
  });

  it("throws FileSystemError(malformed) on shape mismatch", async () => {
    const { dirHandle } = makeHandle({
      ".kb/attachment-links.json": JSON.stringify([{ wrong: "shape" }]),
    });
    const repo = createAttachmentLinksRepository(dirHandle);
    await expect(repo.read()).rejects.toBeInstanceOf(FileSystemError);
  });

  it("rejects rows with empty docPath or empty entityId", async () => {
    const { dirHandle } = makeHandle({
      ".kb/attachment-links.json": JSON.stringify([
        { docPath: "", entityType: "node", entityId: "n1" },
      ]),
    });
    const repo = createAttachmentLinksRepository(dirHandle);
    await expect(repo.read()).rejects.toBeInstanceOf(FileSystemError);
  });
});
