import { describe, it, expect } from "vitest";
import { createAttachmentLinksRepository } from "./attachmentLinksRepo";
import type { AttachmentLink } from "../domain/attachmentLinks";
import { FileSystemError } from "../domain/errors";

function makeHandle(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  const fileHandle = (path: string) => ({
    kind: "file" as const,
    name: path.split("/").pop() ?? path,
    async getFile() {
      const text = store.get(path);
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
          store.set(path, content);
        },
        async close() {},
      } as unknown as FileSystemWritableFileStream;
    },
  });
  const dirHandle: FileSystemDirectoryHandle = {
    kind: "directory",
    name: "root",
    async getFileHandle(name: string) {
      return fileHandle(name);
    },
    async getDirectoryHandle() {
      return dirHandle;
    },
  } as unknown as FileSystemDirectoryHandle;
  return { dirHandle, store };
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

  it("malformed JSON triggers backup write and returns []", async () => {
    const { dirHandle, store } = makeHandle({
      "attachment-links.json": "{not json",
    });
    const repo = createAttachmentLinksRepository(dirHandle);
    expect(await repo.read()).toEqual([]);
    expect(store.get("attachment-links.json.broken")).toBe("{not json");
  });

  it("throws FileSystemError(malformed) on shape mismatch", async () => {
    const { dirHandle } = makeHandle({
      "attachment-links.json": JSON.stringify([{ wrong: "shape" }]),
    });
    const repo = createAttachmentLinksRepository(dirHandle);
    await expect(repo.read()).rejects.toBeInstanceOf(FileSystemError);
  });
});
