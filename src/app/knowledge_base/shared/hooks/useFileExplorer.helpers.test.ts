import { describe, it, expect, beforeEach } from 'vitest'
import {
  readTextFile,
  writeTextFile,
  getSubdirectoryHandle,
} from './useFileExplorer'
import { isDiagramData } from './fileExplorerHelpers'
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

describe('isDiagramData (Phase 5b schema guard)', () => {
  const goodDiagram = { title: 'x', layers: [], nodes: [], connections: [] }

  it('accepts a minimal valid diagram', () => {
    expect(isDiagramData(goodDiagram)).toBe(true)
  })

  it('rejects non-objects', () => {
    expect(isDiagramData(null)).toBe(false)
    expect(isDiagramData('x')).toBe(false)
    expect(isDiagramData(42)).toBe(false)
    expect(isDiagramData(undefined)).toBe(false)
  })

  it('rejects missing or non-string title', () => {
    expect(isDiagramData({ ...goodDiagram, title: undefined })).toBe(false)
    expect(isDiagramData({ ...goodDiagram, title: 42 })).toBe(false)
  })

  it('rejects non-array layers / nodes / connections', () => {
    expect(isDiagramData({ ...goodDiagram, layers: {} })).toBe(false)
    expect(isDiagramData({ ...goodDiagram, nodes: null })).toBe(false)
    expect(isDiagramData({ ...goodDiagram, connections: 'x' })).toBe(false)
  })

  it('rejects unknown lineCurve values', () => {
    expect(isDiagramData({ ...goodDiagram, lineCurve: 'wavy' })).toBe(false)
    expect(isDiagramData({ ...goodDiagram, lineCurve: 'bezier' })).toBe(true)
  })

  it('rejects non-array optional flows / documents', () => {
    expect(isDiagramData({ ...goodDiagram, flows: {} })).toBe(false)
    expect(isDiagramData({ ...goodDiagram, documents: 'x' })).toBe(false)
  })

  it('rejects non-object layerManualSizes', () => {
    expect(isDiagramData({ ...goodDiagram, layerManualSizes: 'x' })).toBe(false)
    expect(isDiagramData({ ...goodDiagram, layerManualSizes: null })).toBe(false)
    expect(isDiagramData({ ...goodDiagram, layerManualSizes: {} })).toBe(true)
  })
})
