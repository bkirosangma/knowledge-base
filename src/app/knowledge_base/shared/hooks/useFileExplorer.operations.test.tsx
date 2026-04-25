// Covers FS-2.3-22/23 (createFile), FS-2.3-25..29 (renameFile),
// FS-2.3-30..34 (deleteFile), FS-2.3-35 (duplicateFile), FS-2.3-36/37 (moveItem).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { useFileExplorer } from './useFileExplorer'
import { ShellErrorProvider } from '../../shell/ShellErrorContext'
import { MockDir, MockFile, MockFileHandle } from '../testUtils/fsMock'

function asRoot(dir: MockDir): FileSystemDirectoryHandle {
  return dir as unknown as FileSystemDirectoryHandle
}

function wrapper({ children }: { children: ReactNode }) {
  return createElement(ShellErrorProvider, null, children)
}

function stubPicker(handle: FileSystemDirectoryHandle) {
  Object.defineProperty(window, 'showDirectoryPicker', {
    value: vi.fn().mockResolvedValue(handle),
    configurable: true,
    writable: true,
  })
}

async function setupWithRoot(root: MockDir) {
  stubPicker(asRoot(root))
  const { result } = renderHook(() => useFileExplorer(), { wrapper })
  await act(async () => { await result.current.openFolder() })
  return result
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  localStorage.clear()
})

afterEach(() => {
  delete (window as unknown as Record<string, unknown>)['showDirectoryPicker']
})

// ── createFile (FS-2.3-22/23) ────────────────────────────────────────────────

describe('FS-2.3-22: createFile default name', () => {
  it('returns null when no directory handle is open', async () => {
    const { result } = renderHook(() => useFileExplorer(), { wrapper })
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
  it('FS-2.3-30: returns false when no directory handle is open', async () => {
    const { result } = renderHook(() => useFileExplorer(), { wrapper })
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

  it('returns null when no handle is open', async () => {
    const { result } = renderHook(() => useFileExplorer(), { wrapper })
    let got: unknown = 'sentinel'
    await act(async () => { got = await result.current.duplicateFile('arch.json') })
    expect(got).toBeNull()
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
