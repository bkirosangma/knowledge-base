import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  isDiagramData,
  readTextFile,
  writeTextFile,
  getSubdirectoryHandle,
  propagateRename,
  propagateMoveLinks,
  type LinkPropagator,
} from './fileExplorerHelpers'
import { MockDir, MockFile, MockFileHandle } from '../testUtils/fsMock'
import type { TreeNode } from '../utils/fileTree'
import type { DocumentRepository } from '../../domain/repositories'

/**
 * Build a `DocumentRepository` stub backed by a `MockDir`.
 * `read` walks the MockDir tree and returns the file text.
 * `write` walks the tree (creating dirs/files as needed) and sets file data.
 */
function makeDocumentRepo(dir: MockDir): DocumentRepository {
  async function readFile(path: string): Promise<string> {
    const parts = path.split('/')
    let node: MockDir = dir
    for (const part of parts.slice(0, -1)) {
      if (!node.dirs.has(part)) throw new Error(`NotFoundError: ${part}`)
      node = node.dirs.get(part)!
    }
    const name = parts[parts.length - 1]
    if (!node.files.has(name)) throw new Error(`NotFoundError: ${name}`)
    return node.files.get(name)!.file.data
  }

  async function writeFile(path: string, content: string): Promise<void> {
    const parts = path.split('/')
    let node: MockDir = dir
    for (const part of parts.slice(0, -1)) {
      if (!node.dirs.has(part)) {
        const sub = new MockDir(part)
        node.dirs.set(part, sub)
      }
      node = node.dirs.get(part)!
    }
    const name = parts[parts.length - 1]
    if (node.files.has(name)) {
      node.files.get(name)!.file.data = content
    } else {
      node.files.set(name, new MockFileHandle(name, new MockFile(content)))
    }
  }

  return { read: readFile, write: writeFile }
}

// Covers HOOK-6.5-06 (intermediate-directory creation — tested via writeTextFile/getSubdirectoryHandle)
// plus the exported FS-access helpers. Bulk of useFileExplorer (IDB + vault_pick
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
    await propagateRename(makeDocumentRepo(dir), 'a.md', 'b.md', lm)
    expect(lm.renameDocumentInIndex).toHaveBeenCalledWith('a.md', 'b.md')
  })

  it('rewrites wiki-links in each backlink file', async () => {
    const dir = new MockDir()
    dir.files.set('ref.md', new MockFileHandle('ref.md', new MockFile('see [[a]] for details')))
    const lm = makeLinkManager({
      getBacklinksFor: vi.fn().mockReturnValue([{ sourcePath: 'ref.md' }]),
    })
    await propagateRename(makeDocumentRepo(dir), 'a.md', 'b.md', lm)
    expect(dir.files.get('ref.md')!.file.data).toBe('see [[b]] for details')
  })

  it('skips backlink file if it cannot be read', async () => {
    const dir = new MockDir() // ref.md does not exist in the mock
    const lm = makeLinkManager({
      getBacklinksFor: vi.fn().mockReturnValue([{ sourcePath: 'missing.md' }]),
    })
    await expect(propagateRename(makeDocumentRepo(dir), 'a.md', 'b.md', lm)).resolves.toBeUndefined()
  })

  it('does not write the backlink file when content is unchanged', async () => {
    const dir = new MockDir()
    dir.files.set('ref.md', new MockFileHandle('ref.md', new MockFile('no links here')))
    const repo = makeDocumentRepo(dir)
    const writeSpy = vi.spyOn(repo, 'write')
    const lm = makeLinkManager({
      getBacklinksFor: vi.fn().mockReturnValue([{ sourcePath: 'ref.md' }]),
    })
    await propagateRename(repo, 'a.md', 'b.md', lm)
    expect(writeSpy).not.toHaveBeenCalled()
  })

  it('throws when renameDocumentInIndex throws', async () => {
    const dir = new MockDir()
    const lm = makeLinkManager({
      renameDocumentInIndex: vi.fn().mockRejectedValue(new Error('disk full')),
    })
    await expect(propagateRename(makeDocumentRepo(dir), 'a.md', 'b.md', lm)).rejects.toThrow('disk full')
  })

  it('handles nested backlink paths', async () => {
    const sub = new MockDir('sub')
    const dir = new MockDir()
    dir.dirs.set('sub', sub)
    sub.files.set('ref.md', new MockFileHandle('ref.md', new MockFile('[[a]] link')))
    const lm = makeLinkManager({
      getBacklinksFor: vi.fn().mockReturnValue([{ sourcePath: 'sub/ref.md' }]),
    })
    await propagateRename(makeDocumentRepo(dir), 'a.md', 'b.md', lm)
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
    await propagateRename(makeDocumentRepo(dir), 'a.md', 'a2.md', lm)
    expect(dir.files.get('b.md')!.file.data).toBe('also [[a2]] is relevant')
    expect(dir.files.get('a.md')!.file.data).toBe('see [[b]] for context')
    expect(lm.renameDocumentInIndex).toHaveBeenCalledWith('a.md', 'a2.md')
  })

  it('LINK-5.1-12: rename leaves no lost-reference window — index points to new path AND every backlink file contains the new path', async () => {
    // After a successful propagateRename, both effects must be observable
    // together: the link-index has been updated to the new path AND every
    // backlink file's wiki-link text has been rewritten on disk. The
    // production ordering is index-first (so `renameDocumentInIndex`
    // remaps the in-memory clone) followed by a `getBacklinksFor(oldPath)`
    // walk that reads the pre-rename React-state snapshot to rewrite
    // each source file. The practical user-facing invariant is the
    // post-completion state — asserted here against multiple backlinks.
    const dir = new MockDir()
    dir.files.set('ref-1.md', new MockFileHandle('ref-1.md', new MockFile('see [[a]] for details')))
    dir.files.set('ref-2.md', new MockFileHandle('ref-2.md', new MockFile('also [[a]] there')))
    const lm = makeLinkManager({
      getBacklinksFor: vi.fn().mockReturnValue([
        { sourcePath: 'ref-1.md' },
        { sourcePath: 'ref-2.md' },
      ]),
    })
    await propagateRename(makeDocumentRepo(dir), 'a.md', 'b.md', lm)
    expect(lm.renameDocumentInIndex).toHaveBeenCalledWith('a.md', 'b.md')
    expect(dir.files.get('ref-1.md')!.file.data).toBe('see [[b]] for details')
    expect(dir.files.get('ref-2.md')!.file.data).toBe('also [[b]] there')
    expect(dir.files.get('ref-1.md')!.file.data).not.toMatch(/\[\[a\]\]/)
    expect(dir.files.get('ref-2.md')!.file.data).not.toMatch(/\[\[a\]\]/)
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
    await propagateMoveLinks(makeDocumentRepo(dir), 'doc.md', 'archive', tree, lm)
    expect(lm.renameDocumentInIndex).toHaveBeenCalledWith('doc.md', 'archive/doc.md')
  })

  it('propagates rename for a single .json file move', async () => {
    const dir = new MockDir()
    const lm = makeLinkManager()
    const tree = makeTree(['arch.json'])
    await propagateMoveLinks(makeDocumentRepo(dir), 'arch.json', 'diagrams', tree, lm)
    expect(lm.renameDocumentInIndex).toHaveBeenCalledWith('arch.json', 'diagrams/arch.json')
  })

  it('propagates rename for all files inside a moved folder', async () => {
    const dir = new MockDir()
    const lm = makeLinkManager()
    const tree = makeTree(['services/auth.md', 'services/db.json'])
    await propagateMoveLinks(makeDocumentRepo(dir), 'services', 'archive', tree, lm)
    expect(lm.renameDocumentInIndex).toHaveBeenCalledWith('services/auth.md', 'archive/services/auth.md')
    expect(lm.renameDocumentInIndex).toHaveBeenCalledWith('services/db.json', 'archive/services/db.json')
  })

  it('is a no-op for an empty folder', async () => {
    const dir = new MockDir()
    const lm = makeLinkManager()
    const tree = makeTree([]) // folder exists but has no files
    await propagateMoveLinks(makeDocumentRepo(dir), 'empty-folder', 'archive', tree, lm)
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
    await expect(propagateMoveLinks(makeDocumentRepo(dir), 'svc', 'archive', tree, lm)).resolves.toBeUndefined()
    expect(lm.renameDocumentInIndex).toHaveBeenCalledTimes(2)
  })
})

describe('isDiagramData (schema guard)', () => {
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
