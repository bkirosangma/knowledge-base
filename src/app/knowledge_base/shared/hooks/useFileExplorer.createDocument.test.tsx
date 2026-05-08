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

// Covers HOOK-6.5-07: createDocument generates a unique .md filename, writes an
// empty file, rescans the tree, and returns the path; returns null when no handle.
//
// Migrated from FSA MockDir + showDirectoryPicker to StubRepositoryProvider
// + mock repos backed by MockDir (Task 27b).

function asRoot(dir: MockDir): FileSystemDirectoryHandle {
  return dir as unknown as FileSystemDirectoryHandle
}

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
        const fromParts = from.split('/')
        const toParts = to.split('/')
        const fromName = fromParts.pop()!
        const toName = toParts.pop()!
        const fromParent = resolveDir(root, fromParts)
        const toParent = resolveDir(root, toParts)
        if (!fromParent || !toParent) throw new Error(`rename: not found`)
        const fh = fromParent.files.get(fromName)
        if (fh) {
          toParent.files.set(toName, new MockFileHandle(toName, fh.file))
          fromParent.files.delete(fromName)
        }
      },
      delete: async (path: string) => {
        const parts = path.split('/')
        const name = parts.pop()!
        const parent = resolveDir(root, parts)
        parent?.files.delete(name)
        parent?.dirs.delete(name)
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
        if (!fh) throw new Error(`not found: ${p}`)
        return JSON.parse(fh.file.data) as DiagramData
      },
      write: async (p: string, data: DiagramData) => {
        await writeTextFile(asRoot(root), p, JSON.stringify(data, null, 2))
      },
    },
    document: {
      read: async (p: string) => {
        const fh = resolveFH(root, p)
        if (!fh) throw new Error(`not found: ${p}`)
        return fh.file.data
      },
      write: async (p: string, content: string) => {
        await writeTextFile(asRoot(root), p, content)
      },
    },
    svg: {
      read: async (p: string) => {
        const fh = resolveFH(root, p)
        if (!fh) throw new Error(`not found: ${p}`)
        return fh.file.data
      },
      write: async (p: string, content: string) => {
        await writeTextFile(asRoot(root), p, content)
      },
    },
    tab: {
      read: async (p: string) => {
        const fh = resolveFH(root, p)
        if (!fh) throw new Error(`not found: ${p}`)
        return fh.file.data
      },
      write: async (p: string, content: string) => {
        await writeTextFile(asRoot(root), p, content)
      },
    },
  } as unknown as Repositories
}

function resolveDir(root: MockDir, parts: string[]): MockDir | undefined {
  let cur: MockDir = root
  for (const seg of parts) {
    if (!seg) continue
    if (!cur.dirs.has(seg)) return undefined
    cur = cur.dirs.get(seg)!
  }
  return cur
}

function resolveFH(root: MockDir, path: string): MockFileHandle | undefined {
  const parts = path.split('/')
  const name = parts.pop()!
  const dir = resolveDir(root, parts)
  return dir?.files.get(name)
}

const MOCK_VAULT = '/mock/vault'

function makeWrapper(root: MockDir) {
  const repos = mockReposFor(root)
  return function wrapper({ children }: { children: ReactNode }) {
    return createElement(
      StubRepositoryProvider,
      { value: repos, children: createElement(ShellErrorProvider, null, children) },
    )
  }
}

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(tauriBridgeModule.tauriBridge, 'pick').mockResolvedValue(MOCK_VAULT)
  vi.spyOn(tauriBridgeModule.tauriBridge, 'setRoot').mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('HOOK-6.5-07: createDocument', () => {
  it('returns null when no vault is open', async () => {
    const EMPTY_REPOS: Repositories = {
      attachment: null, attachmentLinks: null, diagram: null, document: null,
      linkIndex: null, svg: null, svgRefs: null, tab: null, tabRefs: null,
      vaultConfig: null, vaultIndex: null,
    }
    function emptyWrapper({ children }: { children: ReactNode }) {
      return createElement(
        StubRepositoryProvider,
        { value: EMPTY_REPOS, children: createElement(ShellErrorProvider, null, children) },
      )
    }
    const { result } = renderHook(() => useFileExplorer(), { wrapper: emptyWrapper })
    let got: string | null = 'sentinel'
    await act(async () => { got = await result.current.createDocument('') })
    expect(got).toBeNull()
  })

  it('creates untitled.md at root and returns the path', async () => {
    const root = new MockDir('vault')
    const wrapper = makeWrapper(root)
    const { result } = renderHook(() => useFileExplorer(), { wrapper })
    await act(async () => { await result.current.openFolder() })
    await act(async () => {})

    let path: string | null = null
    await act(async () => { path = await result.current.createDocument('') })

    expect(path).toBe('untitled.md')
    expect(root.files.has('untitled.md')).toBe(true)
    expect(root.files.get('untitled.md')!.file.data).toBe('')
  })

  it('generates untitled-1.md when untitled.md already exists', async () => {
    const root = new MockDir('vault')
    root.files.set('untitled.md', new MockFileHandle('untitled.md', new MockFile('existing')))
    const wrapper = makeWrapper(root)
    const { result } = renderHook(() => useFileExplorer(), { wrapper })
    await act(async () => { await result.current.openFolder() })
    await act(async () => {})

    let path: string | null = null
    await act(async () => { path = await result.current.createDocument('') })

    expect(path).toBe('untitled-1.md')
    expect(root.files.has('untitled-1.md')).toBe(true)
  })

  it('creates the file inside a subdirectory when parentPath is provided', async () => {
    const root = new MockDir('vault')
    root.dirs.set('notes', new MockDir('notes'))
    const wrapper = makeWrapper(root)
    const { result } = renderHook(() => useFileExplorer(), { wrapper })
    await act(async () => { await result.current.openFolder() })
    await act(async () => {})

    let path: string | null = null
    await act(async () => { path = await result.current.createDocument('notes') })

    expect(path).toBe('notes/untitled.md')
    expect(root.dirs.get('notes')!.files.has('untitled.md')).toBe(true)
  })
})
