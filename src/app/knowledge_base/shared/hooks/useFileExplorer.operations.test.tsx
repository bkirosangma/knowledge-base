// Covers FS-2.3-22/23 (createFile), FS-2.3-25..29 (renameFile),
// FS-2.3-30..34 (deleteFile), FS-2.3-35 (duplicateFile), FS-2.3-36/37 (moveItem).
//
// Migrated from FSA MockDir + showDirectoryPicker to StubRepositoryProvider
// + mock repos backed by MockDir (Task 27b).
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { useFileExplorer } from './useFileExplorer'
import { ShellErrorProvider } from '../../shell/ShellErrorContext'
import { StubRepositoryProvider } from '../../shell/RepositoryContext'
import type { Repositories } from '../../shell/RepositoryContext'
import { MockDir, MockFile, MockFileHandle } from '../testUtils/fsMock'
import { scanTree } from '../utils/fileTree'
import { writeTextFile } from './fileExplorerHelpers'
import * as tauriBridgeModule from '../../infrastructure/tauriBridge'
import type { DiagramData } from '../utils/types'

function asRoot(dir: MockDir): FileSystemDirectoryHandle {
  return dir as unknown as FileSystemDirectoryHandle
}

/** Build a Repositories bag whose FS operations are backed by MockDir. */
function mockReposFor(root: MockDir): Repositories {
  return {
    attachment: null,
    attachmentLinks: null,
    linkIndex: null,
    svgRefs: null,
    tabRefs: null,
    vaultConfig: null,
    vaultIndex: {
      scan: () => scanTree(asRoot(root), ''),
      rename: async (from: string, to: string) => {
        // Simple rename: only handles flat file moves for these tests
        const fromParts = from.split('/')
        const toParts = to.split('/')
        const fromName = fromParts.pop()!
        const toName = toParts.pop()!
        const fromParent = resolveDir(root, fromParts)
        const toParent = resolveDir(root, toParts)
        if (!fromParent || !toParent) throw new Error(`rename: path not found: ${from} → ${to}`)
        if (fromParent.files.has(fromName)) {
          const fh = fromParent.files.get(fromName)!
          toParent.files.set(toName, new MockFileHandle(toName, fh.file))
          fromParent.files.delete(fromName)
        } else if (fromParent.dirs.has(fromName)) {
          const dir = fromParent.dirs.get(fromName)!
          toParent.dirs.set(toName, dir)
          fromParent.dirs.delete(fromName)
        } else {
          throw new Error(`rename: not found: ${from}`)
        }
      },
      delete: async (path: string) => {
        const parts = path.split('/')
        const name = parts.pop()!
        const parent = resolveDir(root, parts)
        if (!parent) throw new Error(`delete: parent not found: ${path}`)
        parent.files.delete(name)
        parent.dirs.delete(name)
      },
      exists: async (path: string) => {
        const parts = path.split('/')
        const name = parts.pop()!
        const parent = resolveDir(root, parts)
        if (!parent) return false
        return parent.files.has(name) || parent.dirs.has(name)
      },
      createFolder: async (path: string) => {
        const parts = path.split('/')
        let cur = root
        for (const seg of parts) {
          if (!cur.dirs.has(seg)) cur.dirs.set(seg, new MockDir(seg))
          cur = cur.dirs.get(seg)!
        }
      },
    },
    diagram: {
      read: async (p: string) => {
        const fh = resolveFH(root, p)
        if (!fh) throw new Error(`diagram.read: not found: ${p}`)
        return JSON.parse(fh.file.data) as DiagramData
      },
      write: async (p: string, data: DiagramData) => {
        await writeTextFile(asRoot(root), p, JSON.stringify(data, null, 2))
      },
    },
    document: {
      read: async (p: string) => {
        const fh = resolveFH(root, p)
        if (!fh) throw new Error(`document.read: not found: ${p}`)
        return fh.file.data
      },
      write: async (p: string, content: string) => {
        await writeTextFile(asRoot(root), p, content)
      },
    },
    svg: {
      read: async (p: string) => {
        const fh = resolveFH(root, p)
        if (!fh) throw new Error(`svg.read: not found: ${p}`)
        return fh.file.data
      },
      write: async (p: string, content: string) => {
        await writeTextFile(asRoot(root), p, content)
      },
    },
    tab: {
      read: async (p: string) => {
        const fh = resolveFH(root, p)
        if (!fh) throw new Error(`tab.read: not found: ${p}`)
        return fh.file.data
      },
      write: async (p: string, content: string) => {
        await writeTextFile(asRoot(root), p, content)
      },
    },
  } as unknown as Repositories
}

/** Resolve a directory by path segments from root. Returns undefined if missing. */
function resolveDir(root: MockDir, parts: string[]): MockDir | undefined {
  let cur: MockDir = root
  for (const seg of parts) {
    if (!seg) continue
    if (!cur.dirs.has(seg)) return undefined
    cur = cur.dirs.get(seg)!
  }
  return cur
}

/** Resolve a file handle by path. */
function resolveFH(root: MockDir, path: string): MockFileHandle | undefined {
  const parts = path.split('/')
  const name = parts.pop()!
  const dir = resolveDir(root, parts)
  return dir?.files.get(name)
}

const MOCK_VAULT = '/mock/vault'

/** Stub tauriBridge.pick to return MOCK_VAULT. */
function stubPick() {
  vi.spyOn(tauriBridgeModule.tauriBridge, 'pick').mockResolvedValue(MOCK_VAULT)
  vi.spyOn(tauriBridgeModule.tauriBridge, 'setRoot').mockResolvedValue(undefined)
}

const EMPTY_REPOS: Repositories = {
  attachment: null, attachmentLinks: null, diagram: null, document: null,
  linkIndex: null, svg: null, svgRefs: null, tab: null, tabRefs: null,
  vaultConfig: null, vaultIndex: null,
}

function makeWrapper(root: MockDir) {
  const repos = mockReposFor(root)
  return function wrapper({ children }: { children: ReactNode }) {
    return createElement(
      StubRepositoryProvider,
      { value: repos, children: createElement(ShellErrorProvider, null, children) },
    )
  }
}

function makeEmptyWrapper() {
  return function wrapper({ children }: { children: ReactNode }) {
    return createElement(
      StubRepositoryProvider,
      { value: EMPTY_REPOS, children: createElement(ShellErrorProvider, null, children) },
    )
  }
}

async function setupWithRoot(root: MockDir) {
  stubPick()
  const wrapper = makeWrapper(root)
  const { result } = renderHook(() => useFileExplorer(), { wrapper })
  await act(async () => { await result.current.openFolder() })
  // rescan triggered by openFolder vaultPath effect — give it a tick
  await act(async () => {})
  return result
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ── createFile (FS-2.3-22/23) ────────────────────────────────────────────────

describe('FS-2.3-22: createFile default name', () => {
  it('returns null when no vault is open', async () => {
    const { result } = renderHook(() => useFileExplorer(), { wrapper: makeEmptyWrapper() })
    let got: unknown = 'sentinel'
    await act(async () => { got = await result.current.createFile('') })
    expect(got).toBeNull()
  })

  it('creates untitled.json at root and returns { path, data }', async () => {
    const root = new MockDir('vault')
    const result = await setupWithRoot(root)

    let out: { path: string } | null = null
    await act(async () => { out = await result.current.createFile('') })

    expect(out!.path).toBe('untitled.json')
    expect(root.files.has('untitled.json')).toBe(true)
  })

  it('creates inside a subdirectory when parentPath is given', async () => {
    const root = new MockDir('vault')
    root.dirs.set('diagrams', new MockDir('diagrams'))
    const result = await setupWithRoot(root)

    let out: { path: string } | null = null
    await act(async () => { out = await result.current.createFile('diagrams') })

    expect(out!.path).toBe('diagrams/untitled.json')
    expect(root.dirs.get('diagrams')!.files.has('untitled.json')).toBe(true)
  })
})

describe('FS-2.3-23: createFile unique-name fallback', () => {
  it('generates untitled-1.json when untitled.json exists', async () => {
    const root = new MockDir('vault')
    root.files.set('untitled.json', new MockFileHandle('untitled.json', new MockFile('{"title":"x","layers":[],"nodes":[],"connections":[]}')))
    const result = await setupWithRoot(root)

    let out: { path: string } | null = null
    await act(async () => { out = await result.current.createFile('') })

    expect(out!.path).toBe('untitled-1.json')
  })
})

// ── renameFile (FS-2.3-25..29) ───────────────────────────────────────────────

describe('FS-2.3-25..29: renameFile', () => {
  it('FS-2.3-25: creates a new file with the given name', async () => {
    const root = new MockDir('vault')
    root.files.set('old.json', new MockFileHandle('old.json', new MockFile('content')))
    const result = await setupWithRoot(root)

    await act(async () => { await result.current.renameFile('old.json', 'new.json') })

    expect(root.files.has('new.json')).toBe(true)
  })

  it('FS-2.3-26: removes the original file after rename', async () => {
    const root = new MockDir('vault')
    root.files.set('old.json', new MockFileHandle('old.json', new MockFile('content')))
    const result = await setupWithRoot(root)

    await act(async () => { await result.current.renameFile('old.json', 'new.json') })

    expect(root.files.has('old.json')).toBe(false)
  })

  it('FS-2.3-27: returns the new path', async () => {
    const root = new MockDir('vault')
    root.files.set('orig.json', new MockFileHandle('orig.json', new MockFile('c')))
    const result = await setupWithRoot(root)

    let newPath: string | null = null
    await act(async () => { newPath = await result.current.renameFile('orig.json', 'renamed.json') })

    expect(newPath).toBe('renamed.json')
  })

  it('FS-2.3-28: returns old path unchanged when name is identical', async () => {
    const root = new MockDir('vault')
    root.files.set('same.json', new MockFileHandle('same.json', new MockFile('c')))
    const result = await setupWithRoot(root)

    let returned: string | null = null
    await act(async () => { returned = await result.current.renameFile('same.json', 'same.json') })

    expect(returned).toBe('same.json')
  })

  it('FS-2.3-29: renames the history sidecar alongside the file', async () => {
    const root = new MockDir('vault')
    root.files.set('diagram.json', new MockFileHandle('diagram.json', new MockFile('c')))
    root.files.set('.diagram.json.history.json', new MockFileHandle('.diagram.json.history.json', new MockFile('{"entries":[]}')))
    const result = await setupWithRoot(root)

    await act(async () => { await result.current.renameFile('diagram.json', 'renamed.json') })

    expect(root.files.has('.renamed.json.history.json')).toBe(true)
    expect(root.files.has('.diagram.json.history.json')).toBe(false)
  })
})

// ── deleteFile (FS-2.3-30..34) ───────────────────────────────────────────────

describe('FS-2.3-30..34: deleteFile', () => {
  it('FS-2.3-30: returns false when no vault is open', async () => {
    const { result } = renderHook(() => useFileExplorer(), { wrapper: makeEmptyWrapper() })
    let got: boolean = true
    await act(async () => { got = await result.current.deleteFile('some.json') })
    expect(got).toBe(false)
  })

  it('FS-2.3-31: removes the file from the filesystem', async () => {
    const root = new MockDir('vault')
    root.files.set('bye.json', new MockFileHandle('bye.json', new MockFile('c')))
    const result = await setupWithRoot(root)

    let ok: boolean = false
    await act(async () => { ok = await result.current.deleteFile('bye.json') })

    expect(ok).toBe(true)
    expect(root.files.has('bye.json')).toBe(false)
  })

  it('FS-2.3-32: clears activeFile when the deleted file was active', async () => {
    const root = new MockDir('vault')
    root.files.set('active.json', new MockFileHandle('active.json', new MockFile('c')))
    const result = await setupWithRoot(root)
    await act(async () => { result.current.setActiveFile('active.json') })

    await act(async () => { await result.current.deleteFile('active.json') })

    expect(result.current.activeFile).toBeNull()
  })

  it('FS-2.3-33: activeFile is unchanged when a different file is deleted', async () => {
    const root = new MockDir('vault')
    root.files.set('keep.json', new MockFileHandle('keep.json', new MockFile('c')))
    root.files.set('del.json', new MockFileHandle('del.json', new MockFile('c')))
    const result = await setupWithRoot(root)
    await act(async () => { result.current.setActiveFile('keep.json') })

    await act(async () => { await result.current.deleteFile('del.json') })

    expect(result.current.activeFile).toBe('keep.json')
  })

  it('FS-2.3-34: deletes a nested file via path resolution', async () => {
    const root = new MockDir('vault')
    const sub = new MockDir('sub')
    sub.files.set('nested.json', new MockFileHandle('nested.json', new MockFile('c')))
    root.dirs.set('sub', sub)
    const result = await setupWithRoot(root)

    let ok: boolean = false
    await act(async () => { ok = await result.current.deleteFile('sub/nested.json') })

    expect(ok).toBe(true)
    expect(sub.files.has('nested.json')).toBe(false)
  })
})

// ── duplicateFile (FS-2.3-35) ────────────────────────────────────────────────

describe('FS-2.3-35: duplicateFile', () => {
  it('creates a copy with a -copy suffix', async () => {
    const content = JSON.stringify({ title: 'T', layers: [], nodes: [], connections: [] })
    const root = new MockDir('vault')
    root.files.set('arch.json', new MockFileHandle('arch.json', new MockFile(content)))
    const result = await setupWithRoot(root)

    let out: { path: string } | null = null
    await act(async () => { out = await result.current.duplicateFile('arch.json') })

    expect(out!.path).toBe('arch-copy.json')
    expect(root.files.has('arch-copy.json')).toBe(true)
  })

  it('returns null when no vault is open', async () => {
    const { result } = renderHook(() => useFileExplorer(), { wrapper: makeEmptyWrapper() })
    let got: unknown = 'sentinel'
    await act(async () => { got = await result.current.duplicateFile('arch.json') })
    expect(got).toBeNull()
  })
})

// ── createSVG (FS-2.3-51..54) ───────────────────────────────────────────────

describe('FS-2.3-51: createSVG default name', () => {
  it('FS-2.3-51: returns null when no vault is open', async () => {
    const { result } = renderHook(() => useFileExplorer(), { wrapper: makeEmptyWrapper() })
    let got: unknown = 'sentinel'
    await act(async () => { got = await result.current.createSVG('') })
    expect(got).toBeNull()
  })

  it('FS-2.3-52: creates untitled.svg at root with minimal SVG content', async () => {
    const root = new MockDir('vault')
    const result = await setupWithRoot(root)

    let out: string | null = null
    await act(async () => { out = await result.current.createSVG('') })

    expect(out).toBe('untitled.svg')
    expect(root.files.has('untitled.svg')).toBe(true)
    const file = root.files.get('untitled.svg') as MockFileHandle
    const content = await file.getFile().then((f) => f.text())
    expect(content).toBe('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"></svg>')
  })

  it('FS-2.3-53: creates inside a subdirectory when parentPath is given', async () => {
    const root = new MockDir('vault')
    root.dirs.set('diagrams', new MockDir('diagrams'))
    const result = await setupWithRoot(root)

    let out: string | null = null
    await act(async () => { out = await result.current.createSVG('diagrams') })

    expect(out).toBe('diagrams/untitled.svg')
    expect(root.dirs.get('diagrams')!.files.has('untitled.svg')).toBe(true)
  })

  it('FS-2.3-54: generates untitled-1.svg when untitled.svg exists', async () => {
    const root = new MockDir('vault')
    root.files.set('untitled.svg', new MockFileHandle('untitled.svg', new MockFile('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"></svg>')))
    const result = await setupWithRoot(root)

    let out: string | null = null
    await act(async () => { out = await result.current.createSVG('') })

    expect(out).toBe('untitled-1.svg')
  })
})

// ── moveItem (FS-2.3-36/37) ──────────────────────────────────────────────────

describe('FS-2.3-36/37: moveItem', () => {
  it('FS-2.3-36: moves a file from root to a target folder', async () => {
    const content = JSON.stringify({ title: 'D', layers: [], nodes: [], connections: [] })
    const root = new MockDir('vault')
    root.files.set('arch.json', new MockFileHandle('arch.json', new MockFile(content)))
    root.dirs.set('archive', new MockDir('archive'))
    const result = await setupWithRoot(root)

    let newPath: string | null = null
    await act(async () => { newPath = await result.current.moveItem('arch.json', 'archive') })

    expect(newPath).toBe('archive/arch.json')
    expect(root.files.has('arch.json')).toBe(false)
    expect(root.dirs.get('archive')!.files.has('arch.json')).toBe(true)
  })

  it('FS-2.3-37: returns null when source equals target folder', async () => {
    const root = new MockDir('vault')
    root.files.set('x.json', new MockFileHandle('x.json', new MockFile('c')))
    const result = await setupWithRoot(root)

    let out: string | null = 'sentinel' as unknown as string
    await act(async () => { out = await result.current.moveItem('x.json', 'x.json') })

    expect(out).toBeNull()
  })
})
