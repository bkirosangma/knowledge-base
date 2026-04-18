import { describe, it, expect, beforeEach } from 'vitest'
import {
  readTextFile,
  writeTextFile,
  getSubdirectoryHandle,
} from './useFileExplorer'
import { MockDir, MockFile, MockFileHandle } from '../testUtils/fsMock'

// Covers HOOK-6.5-06 (resolveParentHandle — tested via writeTextFile/getSubdirectoryHandle)
// plus the exported FS-access helpers. Bulk of useFileExplorer (IDB + showDirectoryPicker
// + scanTree) is an integration surface; covered by Playwright in Bucket 20.

function asRoot(dir: MockDir): FileSystemDirectoryHandle {
  return dir as unknown as FileSystemDirectoryHandle
}

let root: MockDir

beforeEach(() => { root = new MockDir() })

describe('readTextFile', () => {
  it('returns the text contents of a file handle', async () => {
    const fh = new MockFileHandle('a.md', new MockFile('hello world'))
    const text = await readTextFile(fh as unknown as FileSystemFileHandle)
    expect(text).toBe('hello world')
  })

  it('handles empty files', async () => {
    const fh = new MockFileHandle('empty.md', new MockFile(''))
    expect(await readTextFile(fh as unknown as FileSystemFileHandle)).toBe('')
  })
})

describe('writeTextFile', () => {
  it('creates the file at the root when path has no slashes', async () => {
    const fh = await writeTextFile(asRoot(root), 'top.md', 'content-at-root')
    expect(root.files.get('top.md')!.file.data).toBe('content-at-root')
    expect(fh).toBeDefined()
  })

  it('HOOK-6.5-06: creates intermediate directories for nested paths', async () => {
    await writeTextFile(asRoot(root), 'a/b/c/deep.md', 'nested')
    const a = root.dirs.get('a')!
    const b = a.dirs.get('b')!
    const c = b.dirs.get('c')!
    expect(c.files.get('deep.md')!.file.data).toBe('nested')
  })

  it('overwrites existing file content', async () => {
    await writeTextFile(asRoot(root), 'x.md', 'first')
    await writeTextFile(asRoot(root), 'x.md', 'second')
    expect(root.files.get('x.md')!.file.data).toBe('second')
  })
})

describe('getSubdirectoryHandle', () => {
  it('returns the root handle when path is empty', async () => {
    const result = await getSubdirectoryHandle(asRoot(root), '')
    expect(result).toBe(asRoot(root))
  })

  it('walks the path when create=false and the dir exists', async () => {
    await root.getDirectoryHandle('a', { create: true })
      .then((a) => a.getDirectoryHandle('b', { create: true }))
    const result = await getSubdirectoryHandle(asRoot(root), 'a/b')
    expect((result as unknown as MockDir).name).toBe('b')
  })

  it('throws when create=false and the dir is missing', async () => {
    await expect(getSubdirectoryHandle(asRoot(root), 'missing'))
      .rejects.toThrow()
  })

  it('creates missing directories when create=true', async () => {
    const result = await getSubdirectoryHandle(asRoot(root), 'new/nested/dir', true)
    expect((result as unknown as MockDir).name).toBe('dir')
    expect(root.dirs.get('new')!.dirs.get('nested')!.dirs.get('dir')).toBeDefined()
  })

  it('filters empty segments from the path', async () => {
    // `getSubdirectoryHandle` uses `.split("/").filter(Boolean)` so leading/trailing
    // slashes and `//` collapse away.
    const result = await getSubdirectoryHandle(asRoot(root), '/a/b/', true)
    expect((result as unknown as MockDir).name).toBe('b')
  })
})
