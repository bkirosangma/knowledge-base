import { describe, it, expect } from 'vitest'
import { scanTree, flattenTree, type TreeNode } from './fileTree'

// Covers FS-2.1-08/09/10/11 (tree scan output, history-sidecar filtering,
// nested traversal, metadata on tree entries).

// ── Minimal File System Access mock for tree-scan tests ───────────────────

class MockFile {
  constructor(public data: string = '', public lastModified: number = 0) {}
}
class MockFileHandle {
  kind = 'file' as const
  constructor(public name: string, public file: MockFile) {}
  async getFile() {
    return { text: async () => this.file.data, lastModified: this.file.lastModified }
  }
}
class MockDir {
  kind = 'directory' as const
  children = new Map<string, MockDir | MockFileHandle>()
  constructor(public name = 'root') {}
  async *values(): AsyncIterableIterator<MockDir | MockFileHandle> {
    for (const c of this.children.values()) yield c
  }
}

function seedFile(root: MockDir, path: string, mtime = 0) {
  const parts = path.split('/')
  let cur = root
  for (let i = 0; i < parts.length - 1; i++) {
    const seg = parts[i]
    let next = cur.children.get(seg)
    if (!next || (next as { kind: 'file' | 'directory' }).kind === 'file') {
      next = new MockDir(seg)
      cur.children.set(seg, next)
    }
    cur = next as MockDir
  }
  const fname = parts[parts.length - 1]
  cur.children.set(fname, new MockFileHandle(fname, new MockFile(`content of ${path}`, mtime)))
}

function asRoot(dir: MockDir): FileSystemDirectoryHandle {
  return dir as unknown as FileSystemDirectoryHandle
}

// ── scanTree ───────────────────────────────────────────────────────────────

describe('scanTree — flat root (FS-2.1-08)', () => {
  it('FS-2.1-08: returns sorted files and folders, only .md and .json', async () => {
    const root = new MockDir()
    seedFile(root, 'beta.md')
    seedFile(root, 'alpha.md')
    seedFile(root, 'flow.json')
    seedFile(root, 'ignored.txt')
    seedFile(root, 'image.png')

    const tree = await scanTree(asRoot(root), '')
    expect(tree.map((n) => n.name)).toEqual(['alpha.md', 'beta.md', 'flow.json'])
    expect(tree.every((n) => n.type === 'file')).toBe(true)
  })

  it('folders come before files, each group alphabetical', async () => {
    const root = new MockDir()
    seedFile(root, 'zeta/nested.md')
    seedFile(root, 'alpha/inside.md')
    seedFile(root, 'zz-last.md')
    seedFile(root, 'aa-first.md')

    const tree = await scanTree(asRoot(root), '')
    expect(tree.map((n) => ({ name: n.name, type: n.type }))).toEqual([
      { name: 'alpha', type: 'folder' },
      { name: 'zeta', type: 'folder' },
      { name: 'aa-first.md', type: 'file' },
      { name: 'zz-last.md', type: 'file' },
    ])
  })
})

describe('scanTree — sidecar filtering (FS-2.1-09)', () => {
  it('FS-2.1-09: excludes `.<name>.history.json` hidden sidecars', async () => {
    const root = new MockDir()
    seedFile(root, 'diagram.json')
    seedFile(root, '.diagram.history.json')
    seedFile(root, '.other.md.history.json')
    seedFile(root, 'doc.md')

    const tree = await scanTree(asRoot(root), '')
    const names = tree.map((n) => n.name)
    expect(names).toEqual(['diagram.json', 'doc.md'])
    expect(names).not.toContain('.diagram.history.json')
    expect(names).not.toContain('.other.md.history.json')
  })

  it('a user-visible .md that happens to contain "history" is NOT filtered', async () => {
    const root = new MockDir()
    seedFile(root, 'history.md')
    seedFile(root, 'my-history.json') // doesn't match the `.<name>.history.json` pattern

    const tree = await scanTree(asRoot(root), '')
    expect(tree.map((n) => n.name).sort()).toEqual(['history.md', 'my-history.json'])
  })
})

describe('scanTree — nested traversal (FS-2.1-10)', () => {
  it('FS-2.1-10: recurses into nested folders and builds relative paths', async () => {
    const root = new MockDir()
    seedFile(root, 'notes/sub/deep.md')
    seedFile(root, 'notes/top.md')
    seedFile(root, 'root.md')

    const tree = await scanTree(asRoot(root), '')
    // Flatten to collect paths for easy assertion.
    const paths: string[] = []
    function walk(nodes: TreeNode[]) {
      for (const n of nodes) {
        if (n.type === 'file') paths.push(n.path)
        else if (n.children) walk(n.children)
      }
    }
    walk(tree)
    expect(paths.sort()).toEqual([
      'notes/sub/deep.md',
      'notes/top.md',
      'root.md',
    ])
  })

  it('folder lastModified is the max of its children lastModified', async () => {
    const root = new MockDir()
    seedFile(root, 'notes/a.md', 100)
    seedFile(root, 'notes/b.md', 500)

    const tree = await scanTree(asRoot(root), '')
    const notesNode = tree.find((n) => n.name === 'notes')!
    expect(notesNode.lastModified).toBe(500)
  })

  it('empty folder produces a folder entry with undefined lastModified', async () => {
    const root = new MockDir()
    root.children.set('empty', new MockDir('empty'))
    seedFile(root, 'keep.md')

    const tree = await scanTree(asRoot(root), '')
    const empty = tree.find((n) => n.name === 'empty')!
    expect(empty.type).toBe('folder')
    expect(empty.lastModified).toBeUndefined()
    expect(empty.children).toEqual([])
  })
})

describe('scanTree — per-entry metadata (FS-2.1-11)', () => {
  it('FS-2.1-11: every file entry has name, path, type, fileType, handle, lastModified', async () => {
    const root = new MockDir()
    seedFile(root, 'diagram.json', 42)
    seedFile(root, 'doc.md', 100)

    const tree = await scanTree(asRoot(root), '')
    const diagram = tree.find((n) => n.name === 'diagram.json')!
    expect(diagram).toMatchObject({
      name: 'diagram.json',
      path: 'diagram.json',
      type: 'file',
      fileType: 'diagram',
      lastModified: 42,
    })
    expect(diagram.handle).toBeDefined()

    const doc = tree.find((n) => n.name === 'doc.md')!
    expect(doc.fileType).toBe('document')
  })

  it('folder entry carries dirHandle + children', async () => {
    const root = new MockDir()
    seedFile(root, 'notes/a.md')
    const tree = await scanTree(asRoot(root), '')
    const notes = tree.find((n) => n.name === 'notes')!
    expect(notes.type).toBe('folder')
    expect(notes.dirHandle).toBeDefined()
    expect(notes.children?.map((c) => c.name)).toEqual(['a.md'])
  })
})

describe('scanTree — system file/folder filtering (FS-2.1-12)', () => {
  it('FS-2.1-12: excludes dot-prefixed folders (.archdesigner, .claude)', async () => {
    const root = new MockDir()
    seedFile(root, '.archdesigner/config.json')
    seedFile(root, '.claude/settings.json')
    seedFile(root, 'visible.md')

    const tree = await scanTree(asRoot(root), '')
    expect(tree.map((n) => n.name)).toEqual(['visible.md'])
  })

  it('excludes the "memory" folder', async () => {
    const root = new MockDir()
    seedFile(root, 'memory/MEMORY.md')
    seedFile(root, 'notes.md')

    const tree = await scanTree(asRoot(root), '')
    expect(tree.map((n) => n.name)).toEqual(['notes.md'])
  })

  it('excludes CLAUDE.md, MEMORY.md, AGENTS.md by name', async () => {
    const root = new MockDir()
    seedFile(root, 'CLAUDE.md')
    seedFile(root, 'MEMORY.md')
    seedFile(root, 'AGENTS.md')
    seedFile(root, 'README.md')

    const tree = await scanTree(asRoot(root), '')
    expect(tree.map((n) => n.name)).toEqual(['README.md'])
  })

  it('visible folders with similar names are not filtered', async () => {
    const root = new MockDir()
    seedFile(root, 'memories/notes.md')
    seedFile(root, 'claude-notes/doc.md')

    const tree = await scanTree(asRoot(root), '')
    expect(tree.map((n) => n.name)).toEqual(['claude-notes', 'memories'])
  })
})

// ── flattenTree ────────────────────────────────────────────────────────────

describe('flattenTree', () => {
  it('maps every file path to its file handle', async () => {
    const root = new MockDir()
    seedFile(root, 'notes/a.md')
    seedFile(root, 'b.md')

    const tree = await scanTree(asRoot(root), '')
    const flat = flattenTree(tree)
    expect([...flat.keys()].sort()).toEqual(['b.md', 'notes', 'notes/a.md'])

    expect(flat.get('b.md')?.handle).toBeDefined()
    expect(flat.get('notes/a.md')?.handle).toBeDefined()
    expect(flat.get('notes')?.dirHandle).toBeDefined()
  })

  it('empty tree produces empty map', () => {
    expect(flattenTree([]).size).toBe(0)
  })
})
