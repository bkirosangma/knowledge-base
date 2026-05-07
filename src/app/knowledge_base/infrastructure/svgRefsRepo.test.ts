// src/app/knowledge_base/infrastructure/svgRefsRepo.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { createSvgRefsRepository } from "./svgRefsRepo";
import type { SvgRefsPayload } from "../domain/svgRefs";

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
    async removeEntry(name: string) {
      store.delete(name);
    },
  } as unknown as FileSystemDirectoryHandle;
  return { dirHandle, store };
}

describe("createSvgRefsRepository", () => {
  let dirHandle: FileSystemDirectoryHandle;
  let store: Map<string, string>;

  beforeEach(() => {
    const made = makeHandle();
    dirHandle = made.dirHandle;
    store = made.store;
  });

  it("read returns null when no sidecar exists", async () => {
    const repo = createSvgRefsRepository(dirHandle);
    await expect(repo.read("drawing.svg")).resolves.toBeNull();
  });

  it("write then read round-trips a populated payload", async () => {
    const repo = createSvgRefsRepository(dirHandle);
    await repo.write("drawing.svg", {
      version: 1,
      sources: [{ url: "https://example.com", title: "Spec" }],
    });
    expect(await repo.read("drawing.svg")).toEqual({
      version: 1,
      sources: [{ url: "https://example.com", title: "Spec" }],
    });
  });

  it("write deletes the sidecar when sources and attachedTo are both empty", async () => {
    const repo = createSvgRefsRepository(dirHandle);
    await repo.write("drawing.svg", {
      version: 1,
      sources: [{ url: "https://example.com" }],
    });
    expect(store.has("drawing.svg.refs.json")).toBe(true);

    await repo.write("drawing.svg", { version: 1, sources: [] });
    expect(store.has("drawing.svg.refs.json")).toBe(false);
    expect(await repo.read("drawing.svg")).toBeNull();
  });

  it("write deletes the sidecar when payload has no sources or attachedTo", async () => {
    const repo = createSvgRefsRepository(dirHandle);
    await repo.write("drawing.svg", {
      version: 1,
      sources: [{ url: "https://example.com" }],
    });
    await repo.write("drawing.svg", { version: 1 });
    expect(store.has("drawing.svg.refs.json")).toBe(false);
  });

  it("malformed JSON in sidecar reads as null", async () => {
    const made = makeHandle({ "drawing.svg.refs.json": "{ not json" });
    const repo = createSvgRefsRepository(made.dirHandle);
    expect(await repo.read("drawing.svg")).toBeNull();
  });

  it("preserves attachedTo on round-trip (forward-compat)", async () => {
    const repo = createSvgRefsRepository(dirHandle);
    await repo.write("drawing.svg", {
      version: 1,
      attachedTo: [{ type: "root", documentPath: "notes.md" }],
    });
    const got = await repo.read("drawing.svg");
    expect(got?.attachedTo).toEqual([{ type: "root", documentPath: "notes.md" }]);
  });

  it("write omits empty arrays from emitted JSON when at least one field has content", async () => {
    const repo = createSvgRefsRepository(dirHandle);
    await repo.write("drawing.svg", {
      version: 1,
      sources: [{ url: "https://example.com" }],
      attachedTo: [],
    });
    const raw = store.get("drawing.svg.refs.json")!;
    expect(raw).not.toContain("attachedTo");
    expect(raw).toContain("sources");
  });

  it("ignores unknown version numbers and reads as null", async () => {
    const made = makeHandle({
      "drawing.svg.refs.json": JSON.stringify({ version: 99, sources: [] }),
    });
    const repo = createSvgRefsRepository(made.dirHandle);
    expect(await repo.read("drawing.svg")).toBeNull();
  });
});
