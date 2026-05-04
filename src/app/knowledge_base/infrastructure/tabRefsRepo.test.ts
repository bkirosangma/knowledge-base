import { describe, it, expect, beforeEach } from "vitest";
import { createTabRefsRepository } from "./tabRefsRepo";
import { emptyTabRefs } from "../domain/tabRefs";
import { FileSystemError } from "../domain/errors";
import type { TabRefsPayload } from "../domain/tabRefs";

// Minimal FileSystemDirectoryHandle stub mirroring the shape used in
// tabRepo.test.ts. The store is keyed on full flat paths; getDirectoryHandle
// returns the same root handle so subdirectory walks resolve fine.
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

// v1 on-disk format — seeded into the fake FS as stored JSON.
const V1_ON_DISK = JSON.stringify({
  version: 1,
  sections: {
    abc123: { currentName: "Intro", createdAt: 1700000000000 },
  },
});

// What read() returns after migrating the v1 sidecar above to v2.
const VALID_PAYLOAD: TabRefsPayload = {
  version: 2,
  sectionRefs: { abc123: "Intro" },
  trackRefs: [],
};

describe("createTabRefsRepository", () => {
  let dirHandle: FileSystemDirectoryHandle;
  let store: Map<string, string>;

  beforeEach(() => {
    const made = makeHandle({
      "song.alphatex.refs.json": V1_ON_DISK,
    });
    dirHandle = made.dirHandle;
    store = made.store;
  });

  it("read returns null when the sidecar does not exist", async () => {
    const repo = createTabRefsRepository(dirHandle);
    await expect(repo.read("missing.alphatex")).resolves.toBeNull();
  });

  it("write then read round-trips a v2 payload", async () => {
    const repo = createTabRefsRepository(dirHandle);
    const payload: TabRefsPayload = {
      ...emptyTabRefs(),
      sectionRefs: { xyz789: "Verse 1" },
    };
    await repo.write("new.alphatex", payload);
    const result = await repo.read("new.alphatex");
    expect(result).toEqual(payload);
  });

  it("read returns a v2-migrated payload from an existing v1 sidecar", async () => {
    const repo = createTabRefsRepository(dirHandle);
    await expect(repo.read("song.alphatex")).resolves.toEqual(VALID_PAYLOAD);
  });

  it("write surfaces FSA failures as FileSystemError", async () => {
    const repo = createTabRefsRepository({
      ...dirHandle,
      async getFileHandle() {
        const e = new Error("denied") as Error & { name: string };
        e.name = "NotAllowedError";
        throw e;
      },
    } as unknown as FileSystemDirectoryHandle);

    await expect(
      repo.write("locked.alphatex", emptyTabRefs()),
    ).rejects.toBeInstanceOf(FileSystemError);
    await expect(
      repo.write("locked.alphatex", emptyTabRefs()),
    ).rejects.toMatchObject({ kind: "permission" });
  });

  it("read in nested subdirectories", async () => {
    // Populate a sidecar at the flat key the stub resolves to.
    // getDirectoryHandle returns the same root, so "subdir/song.alphatex.refs.json"
    // resolves to the same key as the flat path — exercises the path-walking loop.
    store.set("song.alphatex.refs.json", V1_ON_DISK);
    const repo = createTabRefsRepository(dirHandle);
    await expect(repo.read("subdir/song.alphatex")).resolves.toEqual(
      VALID_PAYLOAD,
    );
  });

  it("read returns null on corrupt JSON", async () => {
    store.set("bad.alphatex.refs.json", "{ this is not valid json !!!");
    const repo = createTabRefsRepository(dirHandle);
    await expect(repo.read("bad.alphatex")).resolves.toBeNull();
  });

  it("read returns null when version is not recognized", async () => {
    store.set(
      "future.alphatex.refs.json",
      JSON.stringify({ version: 99, sectionRefs: {} }),
    );
    const repo = createTabRefsRepository(dirHandle);
    await expect(repo.read("future.alphatex")).resolves.toBeNull();
  });
});

describe("tabRefsRepo v2 — trackRefs", () => {
  it("round-trips a v2 payload with sectionRefs + trackRefs", async () => {
    const { dirHandle: dh } = makeHandle();
    const repo = createTabRefsRepository(dh);
    const payload = {
      version: 2 as const,
      sectionRefs: { intro: "Intro" },
      trackRefs: [
        { id: "tk-lead-uuid", name: "Lead" },
        { id: "tk-bass-uuid", name: "Bass" },
      ],
    };
    await repo.write("song.alphatex", payload);
    const read = await repo.read("song.alphatex");
    expect(read).toEqual(payload);
  });

  it("reads a v1 payload (no trackRefs) as v2 with empty trackRefs array", async () => {
    // v1 on-disk uses sections: Record<string, { currentName, createdAt }>
    const { dirHandle: dh } = makeHandle({
      "song.alphatex.refs.json": JSON.stringify({
        version: 1,
        sections: { intro: { currentName: "Intro", createdAt: 1700000000000 } },
      }),
    });
    const repo = createTabRefsRepository(dh);
    const read = await repo.read("song.alphatex");
    expect(read).toEqual({
      version: 2,
      sectionRefs: { intro: "Intro" },
      trackRefs: [],
    });
  });

  it("write upgrades v1 to v2 on next write", async () => {
    const { dirHandle: dh, store: st } = makeHandle({
      "song.alphatex.refs.json": JSON.stringify({
        version: 1,
        sections: { intro: { currentName: "Intro", createdAt: 1700000000000 } },
      }),
    });
    const repo = createTabRefsRepository(dh);
    const read = await repo.read("song.alphatex");
    await repo.write("song.alphatex", read!);
    const after = JSON.parse(st.get("song.alphatex.refs.json")!);
    expect(after.version).toBe(2);
    expect(after.trackRefs).toEqual([]);
  });
});
