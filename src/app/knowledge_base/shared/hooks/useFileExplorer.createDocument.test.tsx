import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { useFileExplorer } from './useFileExplorer'
import { ShellErrorProvider } from '../../shell/ShellErrorContext'
import { MockDir, MockFile, MockFileHandle } from '../testUtils/fsMock'

// Covers HOOK-6.5-07: createDocument generates a unique .md filename, writes an
// empty file, rescans the tree, and returns the path; returns null when no handle.

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

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  localStorage.clear()
})

afterEach(() => {
  delete (window as unknown as Record<string, unknown>)['showDirectoryPicker']
})

describe('HOOK-6.5-07: createDocument', () => {
  it('returns null when no directory handle is open', async () => {
    const { result } = renderHook(() => useFileExplorer(), { wrapper })
    let got: string | null = 'sentinel'
    await act(async () => { got = await result.current.createDocument('') })
    expect(got).toBeNull()
  })

  it('creates untitled.md at root and returns the path', async () => {
    const root = new MockDir('vault')
    stubPicker(asRoot(root))
    const { result } = renderHook(() => useFileExplorer(), { wrapper })
    await act(async () => { await result.current.openFolder() })

    let path: string | null = null
    await act(async () => { path = await result.current.createDocument('') })

    expect(path).toBe('untitled.md')
    expect(root.files.has('untitled.md')).toBe(true)
    expect(root.files.get('untitled.md')!.file.data).toBe('')
  })

  it('generates untitled-2.md when untitled.md already exists', async () => {
    const root = new MockDir('vault')
    root.files.set('untitled.md', new MockFileHandle('untitled.md', new MockFile('existing')))
    stubPicker(asRoot(root))
    const { result } = renderHook(() => useFileExplorer(), { wrapper })
    await act(async () => { await result.current.openFolder() })

    let path: string | null = null
    await act(async () => { path = await result.current.createDocument('') })

    expect(path).toBe('untitled-1.md')
    expect(root.files.has('untitled-1.md')).toBe(true)
  })

  it('creates the file inside a subdirectory when parentPath is provided', async () => {
    const root = new MockDir('vault')
    root.dirs.set('notes', new MockDir('notes'))
    stubPicker(asRoot(root))
    const { result } = renderHook(() => useFileExplorer(), { wrapper })
    await act(async () => { await result.current.openFolder() })

    let path: string | null = null
    await act(async () => { path = await result.current.createDocument('notes') })

    expect(path).toBe('notes/untitled.md')
    expect(root.dirs.get('notes')!.files.has('untitled.md')).toBe(true)
  })
})
