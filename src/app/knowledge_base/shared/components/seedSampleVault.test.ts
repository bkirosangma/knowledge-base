import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedSampleVault } from "./seedSampleVault";

// Minimal in-memory FileSystemDirectoryHandle mock — only the surface
// the seeder touches.

interface MemFile {
  bytes: Uint8Array;
}

class MemDir {
  readonly children: Map<string, MemDir | MemFile> = new Map();
  constructor(public readonly name: string) {}

  async getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<MemDir> {
    const existing = this.children.get(name);
    if (existing && existing instanceof MemDir) return existing;
    if (!opts?.create) throw new Error(`No such directory ${name}`);
    const dir = new MemDir(name);
    this.children.set(name, dir);
    return dir;
  }

  async getFileHandle(name: string, opts?: { create?: boolean }): Promise<MemFileHandle> {
    let entry = this.children.get(name);
    if (!entry) {
      if (!opts?.create) throw new Error(`No such file ${name}`);
      entry = { bytes: new Uint8Array(0) };
      this.children.set(name, entry);
    }
    if (entry instanceof MemDir) throw new Error(`${name} is a directory`);
    return new MemFileHandle(entry);
  }
}

class MemFileHandle {
  constructor(private file: MemFile) {}
  async createWritable(): Promise<MemWritable> {
    return new MemWritable(this.file);
  }
}

class MemWritable {
  private chunks: Uint8Array[] = [];
  constructor(private target: MemFile) {}
  async write(data: ArrayBuffer | string): Promise<void> {
    if (typeof data === "string") {
      this.chunks.push(new TextEncoder().encode(data));
    } else {
      this.chunks.push(new Uint8Array(data));
    }
  }
  async close(): Promise<void> {
    let total = 0;
    for (const c of this.chunks) total += c.byteLength;
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of this.chunks) {
      out.set(c, offset);
      offset += c.byteLength;
    }
    this.target.bytes = out;
  }
}

function readText(root: MemDir, path: string): string {
  const parts = path.split("/");
  let current: MemDir | MemFile | undefined = root;
  for (const p of parts) {
    if (current instanceof MemDir) current = current.children.get(p);
    else throw new Error("traversal hit a file mid-path");
  }
  if (!current || current instanceof MemDir) {
    throw new Error(`No file at ${path}`);
  }
  return new TextDecoder().decode(current.bytes);
}

function readBytes(root: MemDir, path: string): Uint8Array {
  const parts = path.split("/");
  let current: MemDir | MemFile | undefined = root;
  for (const p of parts) {
    if (current instanceof MemDir) current = current.children.get(p);
    else throw new Error("traversal hit a file mid-path");
  }
  if (!current || current instanceof MemDir) {
    throw new Error(`No file at ${path}`);
  }
  return current.bytes;
}

describe("seedSampleVault", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("writes every file from the manifest into the target dir", async () => {
    const manifest = {
      version: 1,
      description: "test",
      files: [
        { path: "README.md", kind: "text" as const },
        { path: "topo.json", kind: "text" as const },
        { path: ".attachments/image.png", kind: "binary" as const },
      ],
    };

    globalThis.fetch = vi.fn(async (url: RequestInfo | URL): Promise<Response> => {
      const u = String(url);
      if (u === "/sample-vault/manifest.json") {
        return new Response(JSON.stringify(manifest), { status: 200 });
      }
      if (u === "/sample-vault/README.md") {
        return new Response("# Hello", { status: 200 });
      }
      if (u === "/sample-vault/topo.json") {
        return new Response('{"title":"x"}', { status: 200 });
      }
      if (u === "/sample-vault/.attachments/image.png") {
        return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), { status: 200 });
      }
      return new Response(null, { status: 404 });
    }) as typeof globalThis.fetch;

    const root = new MemDir("vault");
    const result = await seedSampleVault(root as unknown as FileSystemDirectoryHandle);

    expect(result.fileCount).toBe(3);
    expect(readText(root, "README.md")).toBe("# Hello");
    expect(readText(root, "topo.json")).toBe('{"title":"x"}');
    expect(Array.from(readBytes(root, ".attachments/image.png"))).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it("creates intermediate directories for nested paths", async () => {
    const manifest = {
      version: 1,
      description: "test",
      files: [{ path: "a/b/c.md", kind: "text" as const }],
    };
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL): Promise<Response> => {
      const u = String(url);
      if (u === "/sample-vault/manifest.json") {
        return new Response(JSON.stringify(manifest), { status: 200 });
      }
      return new Response("nested", { status: 200 });
    }) as typeof globalThis.fetch;

    const root = new MemDir("vault");
    await seedSampleVault(root as unknown as FileSystemDirectoryHandle);
    expect(readText(root, "a/b/c.md")).toBe("nested");
  });

  it("throws on a manifest fetch failure", async () => {
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 500 })) as typeof globalThis.fetch;
    const root = new MemDir("vault");
    await expect(
      seedSampleVault(root as unknown as FileSystemDirectoryHandle),
    ).rejects.toThrow(/manifest fetch failed/);
  });
});
