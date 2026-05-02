import { describe, it, expect, beforeEach } from 'vitest'
import {
  initVault,
  readVaultConfig,
  updateVaultConfig,
  updateVaultLastOpened,
  isVaultDirectory,
} from './vaultConfig'
import type { VaultConfig } from '../../../shared/utils/types'
import { MockDir } from '../../../shared/testUtils/fsMock'

// Covers FS-2.2-01 through 2.2-06. See test-cases/02-file-system.md §2.2.

function asRootHandle(dir: MockDir): FileSystemDirectoryHandle {
  return dir as unknown as FileSystemDirectoryHandle
}

let root: MockDir

beforeEach(() => {
  root = new MockDir()
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
    const text = fileHandle!.file.data
    expect(JSON.parse(text)).toEqual(config)
  })

  it('FS-2.2-01: file content is JSON-pretty-printed (2-space indent)', async () => {
    await initVault(asRootHandle(root), 'v')
    const text = root.dirs.get('.archdesigner')!.files.get('config.json')!.file.data
    expect(text).toContain('\n  "version"')
  })
})

describe('readVaultConfig', () => {
  it('FS-2.2-02: returns parsed config when present', async () => {
    await initVault(asRootHandle(root), 'my-vault')
    const config = await readVaultConfig(asRootHandle(root))
    expect(config.name).toBe('my-vault')
    expect(config.version).toBe('1.0')
  })

  it('FS-2.2-03: throws not-found when .archdesigner is missing', async () => {
    await expect(readVaultConfig(asRootHandle(root))).rejects.toMatchObject({
      name: 'FileSystemError', kind: 'not-found',
    })
  })

  it('FS-2.2-03: throws not-found when config.json is missing inside an existing .archdesigner', async () => {
    await root.getDirectoryHandle('.archdesigner', { create: true })
    await expect(readVaultConfig(asRootHandle(root))).rejects.toMatchObject({
      name: 'FileSystemError', kind: 'not-found',
    })
  })

  it('FS-2.2-04: throws malformed when config.json is not valid JSON', async () => {
    const configDir = await root.getDirectoryHandle('.archdesigner', { create: true })
    const fh = await configDir.getFileHandle('config.json', { create: true })
    const w = await fh.createWritable()
    await w.write('{not valid json')
    await w.close()
    await expect(readVaultConfig(asRootHandle(root))).rejects.toMatchObject({
      name: 'FileSystemError', kind: 'malformed',
    })
  })

  it('FS-2.2-07: throws malformed when config parses but fails shape check', async () => {
    const configDir = await root.getDirectoryHandle('.archdesigner', { create: true })
    const fh = await configDir.getFileHandle('config.json', { create: true })
    const w = await fh.createWritable()
    await w.write(JSON.stringify({ version: '1.0', name: 'v' }))
    await w.close()
    await expect(readVaultConfig(asRootHandle(root))).rejects.toMatchObject({
      name: 'FileSystemError', kind: 'malformed',
    })
  })
})

describe('updateVaultLastOpened', () => {
  it('FS-2.2-05: advances lastOpened while leaving other fields untouched', async () => {
    const original = await initVault(asRootHandle(root), 'v')
    // Wait one tick so timestamps definitely differ at ms resolution.
    await new Promise((r) => setTimeout(r, 5))

    await updateVaultLastOpened(asRootHandle(root))

    const after = await readVaultConfig(asRootHandle(root))
    expect(after.version).toBe(original.version)
    expect(after.name).toBe(original.name)
    expect(after.created).toBe(original.created)
    expect(new Date(after.lastOpened).getTime()).toBeGreaterThanOrEqual(
      new Date(original.lastOpened).getTime(),
    )
  })

  it('FS-2.2-05: silently no-ops when config does not exist (not-found is still swallowed)', async () => {
    // Best-effort behaviour: a missing config is not actionable, so the
    // timestamp touch silently resolves. Non-not-found errors now surface.
    await expect(updateVaultLastOpened(asRootHandle(root))).resolves.toBeUndefined()
    // readVaultConfig on the still-missing folder now throws not-found.
    await expect(readVaultConfig(asRootHandle(root))).rejects.toMatchObject({
      name: 'FileSystemError', kind: 'not-found',
    })
  })
})

describe('updateVaultConfig', () => {
  it('FS-2.2-08: deep-merges nested objects so sibling keys survive a partial nested patch', async () => {
    // Seed a config where `graph` already has multiple sibling fields.
    // We use a cast because `graph` accepts a `layout` map per the type,
    // but for this test we want to assert that ANY sibling under `graph`
    // (e.g. a future `zoom` field) is preserved when `layout` is patched.
    await initVault(asRootHandle(root), 'v')
    const seeded: VaultConfig = {
      ...(await readVaultConfig(asRootHandle(root))),
      graph: {
        layout: { 'a.md': { x: 1, y: 1 } },
        // Future-sibling — stored via cast; the merge MUST preserve it.
        ...({ zoom: 2 } as Record<string, unknown>),
      } as VaultConfig['graph'],
    }
    const configDir = root.dirs.get('.archdesigner')!
    const fh = configDir.files.get('config.json')!
    const w = await fh.createWritable()
    await w.write(JSON.stringify(seeded))
    await w.close()

    // Patch only `graph.layout` — `graph.zoom` must NOT be wiped.
    const next = await updateVaultConfig(asRootHandle(root), {
      graph: { layout: { 'a.md': { x: 1, y: 1 }, 'b.md': { x: 2, y: 2 } } },
    })

    expect(next.graph?.layout).toEqual({
      'a.md': { x: 1, y: 1 },
      'b.md': { x: 2, y: 2 },
    })
    // The cast back to a generic record is the only way to assert on the
    // unknown sibling key without widening the type globally.
    expect((next.graph as unknown as Record<string, unknown>).zoom).toBe(2)
    // Top-level keys outside `graph` survive.
    expect(next.name).toBe('v')
    expect(next.version).toBe('1.0')
  })

  it('FS-2.2-08: top-level keys outside the patch are preserved', async () => {
    await initVault(asRootHandle(root), 'v')
    // Seed a theme so we can confirm it survives a `graph` patch.
    await updateVaultConfig(asRootHandle(root), { theme: 'dark' })

    const next = await updateVaultConfig(asRootHandle(root), {
      graph: { layout: { 'a.md': { x: 1, y: 1 } } },
    })

    expect(next.theme).toBe('dark')
    expect(next.graph?.layout).toEqual({ 'a.md': { x: 1, y: 1 } })
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
