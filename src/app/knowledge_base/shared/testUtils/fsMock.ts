// Minimal in-memory mock of the subset of File System Access API that the
// knowledge-base app actually touches:
//
//   Dir.getDirectoryHandle(name, { create })
//   Dir.getFileHandle(name, { create })
//   FileHandle.createWritable() → { write, close }
//   FileHandle.getFile() → { text() }
//
// Cast the root handle with `as unknown as FileSystemDirectoryHandle` at the
// test boundary. See test-cases/README.md for the testing conventions.

export class MockFile {
  constructor(public data: string = "") {}
}

export class MockFileHandle {
  readonly kind = "file" as const;
  constructor(public name: string, public file: MockFile) {}
  async createWritable() {
    return {
      write: async (data: string) => {
        this.file.data = data;
      },
      close: async () => {},
    };
  }
  async getFile() {
    const data = this.file.data
    return {
      text: async () => (typeof data === 'string' ? data : ''),
      arrayBuffer: async () => new TextEncoder().encode(typeof data === 'string' ? data : '').buffer,
      lastModified: 0,
    }
  }
}

export class MockDir {
  readonly kind = "directory" as const;
  dirs = new Map<string, MockDir>();
  files = new Map<string, MockFileHandle>();
  constructor(public name: string = "root") {}

  async getDirectoryHandle(
    name: string,
    opts?: { create?: boolean }
  ): Promise<MockDir> {
    if (this.dirs.has(name)) return this.dirs.get(name)!;
    if (opts?.create) {
      const d = new MockDir(name);
      this.dirs.set(name, d);
      return d;
    }
    const err = new Error(`NotFoundError: ${name}`);
    err.name = "NotFoundError";
    throw err;
  }

  async getFileHandle(
    name: string,
    opts?: { create?: boolean }
  ): Promise<MockFileHandle> {
    if (this.files.has(name)) return this.files.get(name)!;
    if (opts?.create) {
      const fh = new MockFileHandle(name, new MockFile());
      this.files.set(name, fh);
      return fh;
    }
    const err = new Error(`NotFoundError: ${name}`);
    err.name = "NotFoundError";
    throw err;
  }

  async *values(): AsyncIterableIterator<MockDir | MockFileHandle> {
    for (const d of this.dirs.values()) yield d
    for (const f of this.files.values()) yield f
  }

  async removeEntry(name: string): Promise<void> {
    if (this.files.has(name)) { this.files.delete(name); return; }
    if (this.dirs.has(name)) { this.dirs.delete(name); return; }
    const err = new Error(`NotFoundError: ${name}`);
    err.name = "NotFoundError";
    throw err;
  }
}
