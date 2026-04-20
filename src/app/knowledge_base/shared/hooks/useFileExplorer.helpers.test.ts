import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  readTextFile,
  writeTextFile,
  getSubdirectoryHandle,
} from './useFileExplorer'
import {
  isDiagramData,
  renameSidecar,
  propagateRename,
  propagateMoveLinks,
  type LinkPropagator,
} from './fileExplorerHelpers'
import { MockDir, MockFile, MockFileHandle } from '../testUtils/fsMock'
import type { TreeNode } from '../utils/fileTree'

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

describe('renameSidecar (HOOK-6.1-10)', () => {
  it('renames the sidecar from .old.history.json to .new.history.json', async () => {
    const dir = new MockDir()
    dir.files.set('.old.history.json', new MockFileHandle('.old.history.json', new MockFile('{"entries":[]}')))
    await renameSidecar(dir as unknown as FileSystemDirectoryHandle, 'old.json', 'new.json')
    expect(dir.files.has('.old.history.json')).toBe(false)
    expect(dir.files.get('.new.history.json')!.file.data).toBe('{"entries":[]}')
  })

  it('is a no-op when no sidecar exists (new file, no history yet)', async () => {
    const dir = new MockDir()
    await expect(
      renameSidecar(dir as unknown as FileSystemDirectoryHandle, 'foo.json', 'bar.json')
    ).resolves.toBeUndefined()
    expect(dir.files.size).toBe(0)
  })

  it('preserves sidecar content exactly', async () => {
    const histJson = JSON.stringify({ checksum: 'abc', currentIndex: 2, savedIndex: 1, entries: [1, 2, 3] })
    const dir = new MockDir()
    dir.files.set('.diagram.history.json', new MockFileHandle('.diagram.history.json', new MockFile(histJson)))
    await renameSidecar(dir as unknown as FileSystemDirectoryHandle, 'diagram.json', 'renamed.json')
    expect(dir.files.get('.renamed.history.json')!.file.data).toBe(histJson)
  })

  it('works for files without the .json extension in the name', async () => {
    const dir = new MockDir()
    dir.files.set('.foo.history.json', new MockFileHandle('.foo.history.json', new MockFile('data')))
    await renameSidecar(dir as unknown as FileSystemDirectoryHandle, 'foo', 'bar')
    expect(dir.files.has('.foo.history.json')).toBe(false)
    expect(dir.files.get('.bar.history.json')!.file.data).toBe('data')
  })
})

// ── propagateRename (HOOK-6.2-09) ─────────────────────────────────────────────

function makeLinkManager(overrides: Partial<LinkPropagator> = {}): LinkPropagator {
  return {
    renameDocumentInIndex: vi.fn().mockResolvedValue(undefined),
    getBacklinksFor: vi.fn().mockReturnValue([]),
    ...overrides,
  }
}

describe('propagateRename (HOOK-6.2-09)', () => {
  it('calls renameDocumentInIndex with old and new paths', async () => {
    const dir = new MockDir()
    const lm = makeLinkManager()
    await propagateRename(asRoot(dir), 'a.md', 'b.md', lm)
    expect(lm.renameDocumentInIndex).toHaveBeenCalledWith(asRoot(dir), 'a.md', 'b.md')
  })

  it('rewrites wiki-links in each backlink file', async () => {
    const dir = new MockDir()
    dir.files.set('ref.md', new MockFileHandle('ref.md', new MockFile('see [[a]] for details')))
    const lm = makeLinkManager({
      getBacklinksFor: vi.fn().mockReturnValue([{ sourcePath: 'ref.md' }]),
    })
    await propagateRename(asRoot(dir), 'a.md', 'b.md', lm)
    expect(dir.files.get('ref.md')!.file.data).toBe('see [[b]] for details')
  })

  it('skips backlink file if it cannot be read', async () => {
    const dir = new MockDir() // ref.md does not exist in the mock
    const lm = makeLinkManager({
      getBacklinksFor: vi.fn().mockReturnValue([{ sourcePath: 'missing.md' }]),
    })
    await expect(propagateRename(asRoot(dir), 'a.md', 'b.md', lm)).resolves.toBeUndefined()
  })

  it('does not write the backlink file when content is unchanged', async () => {
    const dir = new MockDir()
    dir.files.set('ref.md', new MockFileHandle('ref.md', new MockFile('no links here')))
    const spy = vi.spyOn(dir.files.get('ref.md')!, 'createWritable')
    const lm = makeLinkManager({
      getBacklinksFor: vi.fn().mockReturnValue([{ sourcePath: 'ref.md' }]),
    })
    await propagateRename(asRoot(dir), 'a.md', 'b.md', lm)
    expect(spy).not.toHaveBeenCalled()
  })

  it('throws when renameDocumentInIndex throws', async () => {
    const dir = new MockDir()
    const lm = makeLinkManager({
      renameDocumentInIndex: vi.fn().mockRejectedValue(new Error('disk full')),
    })
    await expect(propagateRename(asRoot(dir), 'a.md', 'b.md', lm)).rejects.toThrow('disk full')
  })

  it('handles nested backlink paths', async () => {
    const sub = new MockDir('sub')
    const dir = new MockDir()
    dir.dirs.set('sub', sub)
    sub.files.set('ref.md', new MockFileHandle('ref.md', new MockFile('[[a]] link')))
    const lm = makeLinkManager({
      getBacklinksFor: vi.fn().mockReturnValue([{ sourcePath: 'sub/ref.md' }]),
    })
    await propagateRename(asRoot(dir), 'a.md', 'b.md', lm)
    expect(sub.files.get('ref.md')!.file.data).toBe('[[b]] link')
  })

  it('LINK-5.1-11: cyclic reference — both files remain consistent after one is renamed', async () => {
    // a.md → [[b]], b.md → [[a]].  Rename a.md → a2.md.
    // Expected: b.md reference updated to [[a2]]; a.md content untouched.
    const dir = new MockDir()
    dir.files.set('a.md', new MockFileHandle('a.md', new MockFile('see [[b]] for context')))
    dir.files.set('b.md', new MockFileHandle('b.md', new MockFile('also [[a]] is relevant')))
    const lm = makeLinkManager({
      getBacklinksFor: vi.fn().mockReturnValue([{ sourcePath: 'b.md' }]),
    })
    await propagateRename(asRoot(dir), 'a.md', 'a2.md', lm)
    expect(dir.files.get('b.md')!.file.data).toBe('also [[a2]] is relevant')
    expect(dir.files.get('a.md')!.file.data).toBe('see [[b]] for context')
    expect(lm.renameDocumentInIndex).toHaveBeenCalledWith(asRoot(dir), 'a.md', 'a2.md')
  })
})

// ── propagateMoveLinks (HOOK-6.2-11) ──────────────────────────────────────────

function makeTree(filePaths: string[]): TreeNode[] {
  const root: TreeNode[] = []
  for (const p of filePaths) {
    const parts = p.split('/')
    let nodes = root
    for (let i = 0; i < parts.length - 1; i++) {
      let folder = nodes.find((n) => n.name === parts[i])
      if (!folder) {
        folder = { name: parts[i], path: parts.slice(0, i + 1).join('/'), type: 'folder', children: [] }
        nodes.push(folder)
      }
      nodes = folder.children!
    }
    nodes.push({ name: parts[parts.length - 1], path: p, type: 'file' })
  }
  return root
}

describe('propagateMoveLinks (HOOK-6.2-11)', () => {
  it('propagates rename for a single .md file move', async () => {
    const dir = new MockDir()
    dir.files.set('doc.md', new MockFileHandle('doc.md', new MockFile('hello')))
    const lm = makeLinkManager()
    const tree = makeTree(['doc.md'])
    await propagateMoveLinks(asRoot(dir), 'doc.md', 'archive', tree, lm)
    expect(lm.renameDocumentInIndex).toHaveBeenCalledWith(asRoot(dir), 'doc.md', 'archive/doc.md')
  })

  it('propagates rename for a single .json file move', async () => {
    const dir = new MockDir()
    const lm = makeLinkManager()
    const tree = makeTree(['arch.json'])
    await propagateMoveLinks(asRoot(dir), 'arch.json', 'diagrams', tree, lm)
    expect(lm.renameDocumentInIndex).toHaveBeenCalledWith(asRoot(dir), 'arch.json', 'diagrams/arch.json')
  })

  it('propagates rename for all files inside a moved folder', async () => {
    const dir = new MockDir()
    const lm = makeLinkManager()
    const tree = makeTree(['services/auth.md', 'services/db.json'])
    await propagateMoveLinks(asRoot(dir), 'services', 'archive', tree, lm)
    expect(lm.renameDocumentInIndex).toHaveBeenCalledWith(asRoot(dir), 'services/auth.md', 'archive/services/auth.md')
    expect(lm.renameDocumentInIndex).toHaveBeenCalledWith(asRoot(dir), 'services/db.json', 'archive/services/db.json')
  })

  it('is a no-op for an empty folder', async () => {
    const dir = new MockDir()
    const lm = makeLinkManager()
    const tree = makeTree([]) // folder exists but has no files
    await propagateMoveLinks(asRoot(dir), 'empty-folder', 'archive', tree, lm)
    expect(lm.renameDocumentInIndex).not.toHaveBeenCalled()
  })

  it('continues after a per-file index error', async () => {
    const dir = new MockDir()
    const lm = makeLinkManager({
      renameDocumentInIndex: vi.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue(undefined),
    })
    const tree = makeTree(['svc/a.md', 'svc/b.md'])
    await expect(propagateMoveLinks(asRoot(dir), 'svc', 'archive', tree, lm)).resolves.toBeUndefined()
    expect(lm.renameDocumentInIndex).toHaveBeenCalledTimes(2)
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
