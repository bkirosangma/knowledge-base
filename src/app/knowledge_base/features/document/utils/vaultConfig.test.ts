import { describe, it, expect, beforeEach } from 'vitest'
import {
  initVault,
  readVaultConfig,
  updateVaultLastOpened,
  isVaultDirectory,
} from './vaultConfig'
import type { VaultConfig } from '../../../shared/utils/types'

// Covers FS-2.2-01 through 2.2-06. See test-cases/02-file-system.md §2.2.
//
// The File System Access API isn't available in jsdom. We construct a minimal
// in-memory mock that implements the subset vaultConfig uses:
//   Dir.getDirectoryHandle(name, {create})
//   Dir.getFileHandle(name, {create})
//   FileHandle.createWritable() → { write, close }
//   FileHandle.getFile() → { text() }

class MockFileContents {
  constructor(public data: string = '') {}
}

class MockFileHandle {
  kind = 'file' as const
  constructor(public name: string, public contents: MockFileContents) {}
  async createWritable() {
    return {
      write: async (data: string) => { this.contents.data = data },
      close: async () => {},
    }
  }
  async getFile() {
    return { text: async () => this.contents.data }
  }
}

class MockDirHandle {
  kind = 'directory' as const
  dirs = new Map<string, MockDirHandle>()
  files = new Map<string, MockFileHandle>()
  constructor(public name: string = 'root') {}

  async getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<MockDirHandle> {
    if (this.dirs.has(name)) return this.dirs.get(name)!
    if (opts?.create) {
      const d = new MockDirHandle(name)
      this.dirs.set(name, d)
      return d
    }
    const err = new Error(`NotFoundError: ${name}`)
    err.name = 'NotFoundError'
    throw err
  }

  async getFileHandle(name: string, opts?: { create?: boolean }): Promise<MockFileHandle> {
    if (this.files.has(name)) return this.files.get(name)!
    if (opts?.create) {
      const fh = new MockFileHandle(name, new MockFileContents())
      this.files.set(name, fh)
      return fh
    }
    const err = new Error(`NotFoundError: ${name}`)
    err.name = 'NotFoundError'
    throw err
  }
}

function asRootHandle(dir: MockDirHandle): FileSystemDirectoryHandle {
  return dir as unknown as FileSystemDirectoryHandle
}

let root: MockDirHandle

beforeEach(() => {
  root = new MockDirHandle()
})

describe('initVault', () => {
  it('FS-2.2-01: creates .archdesigner/config.json with version/name/timestamps', async () => {
    const config = await initVault(asRootHandle(root), 'my-vault')

    expect(config.version).toBe('1.0')
    expect(config.name).toBe('my-vault')
    // ISO timestamps
    expect(config.created).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(config.lastOpened).toMatch(/^\d{4}-\d{2}-\d{2}T/)

    // Verify it was actually written to the mock FS.
    const configDir = root.dirs.get('.archdesigner')
    expect(configDir).toBeDefined()
    const fileHandle = configDir!.files.get('config.json')
    expect(fileHandle).toBeDefined()
    const text = fileHandle!.contents.data
    expect(JSON.parse(text)).toEqual(config)
  })

  it('FS-2.2-01: file content is JSON-pretty-printed (2-space indent)', async () => {
    await initVault(asRootHandle(root), 'v')
    const text = root.dirs.get('.archdesigner')!.files.get('config.json')!.contents.data
    expect(text).toContain('\n  "version"')
  })
})

describe('readVaultConfig', () => {
  it('FS-2.2-02: returns parsed config when present', async () => {
    await initVault(asRootHandle(root), 'my-vault')
    const config = await readVaultConfig(asRootHandle(root))
    expect(config).not.toBeNull()
    expect(config!.name).toBe('my-vault')
    expect(config!.version).toBe('1.0')
  })

  it('FS-2.2-03: returns null when .archdesigner is missing (no throw)', async () => {
    expect(await readVaultConfig(asRootHandle(root))).toBeNull()
  })

  it('FS-2.2-03: returns null when config.json is missing inside an existing .archdesigner', async () => {
    await root.getDirectoryHandle('.archdesigner', { create: true })
    expect(await readVaultConfig(asRootHandle(root))).toBeNull()
  })

  it('FS-2.2-04: returns null when config.json is malformed JSON', async () => {
    const configDir = await root.getDirectoryHandle('.archdesigner', { create: true })
    const fh = await configDir.getFileHandle('config.json', { create: true })
    const w = await fh.createWritable()
    await w.write('{not valid json')
    await w.close()
    expect(await readVaultConfig(asRootHandle(root))).toBeNull()
  })
})

describe('updateVaultLastOpened', () => {
  it('FS-2.2-05: advances lastOpened while leaving other fields untouched', async () => {
    const original = await initVault(asRootHandle(root), 'v')
    // Wait one tick so timestamps definitely differ at ms resolution.
    await new Promise((r) => setTimeout(r, 5))

    await updateVaultLastOpened(asRootHandle(root))

    const after = await readVaultConfig(asRootHandle(root))
    expect(after).not.toBeNull()
    expect(after!.version).toBe(original.version)
    expect(after!.name).toBe(original.name)
    expect(after!.created).toBe(original.created)
    expect(new Date(after!.lastOpened).getTime()).toBeGreaterThanOrEqual(
      new Date(original.lastOpened).getTime(),
    )
  })

  it('FS-2.2-05: silently no-ops when config does not exist', async () => {
    // Should not throw even though .archdesigner/config.json is absent.
    await expect(updateVaultLastOpened(asRootHandle(root))).resolves.toBeUndefined()
    // And still no config after the call.
    expect(await readVaultConfig(asRootHandle(root))).toBeNull()
  })
})

describe('isVaultDirectory', () => {
  it('FS-2.2-06: true when config has a version field', () => {
    const config: VaultConfig = {
      version: '1.0', name: 'v', created: 'x', lastOpened: 'x',
    }
    expect(isVaultDirectory(config)).toBe(true)
  })

  it('FS-2.2-06: false for null', () => {
    expect(isVaultDirectory(null)).toBe(false)
  })

  it('FS-2.2-06: false when version is missing', () => {
    expect(isVaultDirectory({
      name: 'v', created: 'x', lastOpened: 'x',
    } as unknown as VaultConfig)).toBe(false)
  })
})
