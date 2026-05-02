import { describe, it, expect, beforeEach } from "vitest";
import { createTabRepository } from "./tabRepo";
import { FileSystemError } from "../domain/errors";

// Minimal FileSystemDirectoryHandle stub mirroring the shape used in
// other FSA-touching unit tests.
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
        async write(content: string) { store.set(path, content); },
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

describe("createTabRepository", () => {
  let dirHandle: FileSystemDirectoryHandle;
  let store: Map<string, string>;

  beforeEach(() => {
    const made = makeHandle({ "song.alphatex": "\\title \"hi\"\n." });
    dirHandle = made.dirHandle;
    store = made.store;
  });

  it("read returns raw alphaTex text", async () => {
    const repo = createTabRepository(dirHandle);
    await expect(repo.read("song.alphatex")).resolves.toBe("\\title \"hi\"\n.");
  });

  it("read throws FileSystemError(\"not-found\") for missing files", async () => {
    const repo = createTabRepository(dirHandle);
    await expect(repo.read("missing.alphatex")).rejects.toMatchObject({
      name: "FileSystemError",
      kind: "not-found",
    });
  });

  it("write persists the content (creates / overwrites)", async () => {
    const repo = createTabRepository(dirHandle);
    await repo.write("song.alphatex", "\\title \"new\"\n.");
    expect(store.get("song.alphatex")).toBe("\\title \"new\"\n.");
  });

  it("write surfaces FSA failures as FileSystemError", async () => {
    const repo = createTabRepository({
      ...dirHandle,
      async getFileHandle() {
        const e = new Error("denied") as Error & { name: string };
        e.name = "NotAllowedError";
        throw e;
      },
    } as unknown as FileSystemDirectoryHandle);

    await expect(repo.write("locked.alphatex", "x")).rejects.toBeInstanceOf(FileSystemError);
    await expect(repo.write("locked.alphatex", "x")).rejects.toMatchObject({
      kind: "permission",
    });
  });
});
