import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { useDirectoryHandle } from './useDirectoryHandle'
import * as idbHandles from '../utils/idbHandles'

// Covers HOOK-6.5-01 and HOOK-6.5-02. See test-cases/06-shared-hooks.md §6.5.

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  localStorage.clear()
})

afterEach(() => {
  delete (window as unknown as Record<string, unknown>)['showDirectoryPicker']
})

// ── Helpers ──────────────────────────────────────────────────────────────────

function stubPicker(handle: FileSystemDirectoryHandle) {
  Object.defineProperty(window, 'showDirectoryPicker', {
    value: vi.fn().mockResolvedValue(handle),
    configurable: true,
    writable: true,
  })
}

function stubPickerAbort() {
  Object.defineProperty(window, 'showDirectoryPicker', {
    value: vi.fn().mockRejectedValue(new DOMException('User aborted', 'AbortError')),
    configurable: true,
    writable: true,
  })
}

function fakeHandle(name = 'vault'): FileSystemDirectoryHandle {
  return {
    kind: 'directory',
    name,
    requestPermission: vi.fn().mockResolvedValue('granted'),
  } as unknown as FileSystemDirectoryHandle
}

// ── HOOK-6.5-01: isSupported() = false ───────────────────────────────────────

describe('HOOK-6.5-01: isSupported()=false — showDirectoryPicker absent', () => {
  it('supported is false in jsdom (showDirectoryPicker not in window)', () => {
    const { result } = renderHook(() => useDirectoryHandle())
    expect(result.current.supported).toBe(false)
  })

  it('acquirePickerHandle returns null without calling picker', async () => {
    const { result } = renderHook(() => useDirectoryHandle())
    let got: Awaited<ReturnType<typeof result.current.acquirePickerHandle>>
    await act(async () => { got = await result.current.acquirePickerHandle() })
    expect(got!).toBeNull()
    expect((window as unknown as Record<string, unknown>)['showDirectoryPicker']).toBeUndefined()
  })

  it('restoreSavedHandle returns null without touching IDB', async () => {
    const { result } = renderHook(() => useDirectoryHandle())
    let got: Awaited<ReturnType<typeof result.current.restoreSavedHandle>>
    await act(async () => { got = await result.current.restoreSavedHandle() })
    expect(got!).toBeNull()
  })
})

// ── HOOK-6.5-02: isSupported() = true ────────────────────────────────────────

describe('HOOK-6.5-02: isSupported()=true — showDirectoryPicker present', () => {
  it('supported is true when showDirectoryPicker exists on window', () => {
    stubPickerAbort()
    const { result } = renderHook(() => useDirectoryHandle())
    expect(result.current.supported).toBe(true)
  })

  it('acquirePickerHandle invokes the native picker', async () => {
    stubPickerAbort()
    const { result } = renderHook(() => useDirectoryHandle())
    await act(async () => { await result.current.acquirePickerHandle() })
    expect(window.showDirectoryPicker).toHaveBeenCalledOnce()
  })

  it('acquirePickerHandle returns null when user cancels (AbortError)', async () => {
    stubPickerAbort()
    const { result } = renderHook(() => useDirectoryHandle())
    let got: Awaited<ReturnType<typeof result.current.acquirePickerHandle>>
    await act(async () => { got = await result.current.acquirePickerHandle() })
    expect(got!).toBeNull()
  })

  it('acquirePickerHandle sets directoryName, rootHandle, and dirHandleRef on success', async () => {
    const handle = fakeHandle('my-vault')
    stubPicker(handle)
    const { result } = renderHook(() => useDirectoryHandle())
    await act(async () => { await result.current.acquirePickerHandle() })
    expect(result.current.directoryName).toBe('my-vault')
    expect(result.current.rootHandle).toBe(handle)
    expect(result.current.dirHandleRef.current).toBe(handle)
  })

  it('acquirePickerHandle returns the handle and a scopeId', async () => {
    const handle = fakeHandle('proj')
    stubPicker(handle)
    const { result } = renderHook(() => useDirectoryHandle())
    let got: Awaited<ReturnType<typeof result.current.acquirePickerHandle>>
    await act(async () => { got = await result.current.acquirePickerHandle() })
    expect(got!).not.toBeNull()
    expect(got!.handle).toBe(handle)
    expect(got!.scopeId).toMatch(/^[0-9a-f-]{8,}/)
  })

  it('restoreSavedHandle returns null when IDB is empty', async () => {
    stubPickerAbort()
    const { result } = renderHook(() => useDirectoryHandle())
    let got: Awaited<ReturnType<typeof result.current.restoreSavedHandle>>
    await act(async () => { got = await result.current.restoreSavedHandle() })
    expect(got!).toBeNull()
  })

  it('restoreSavedHandle restores a persisted handle after permission is granted', async () => {
    // IDB structured-clone strips methods, so mock loadDirHandle to return a
    // full handle stub with requestPermission intact.
    const handle = fakeHandle('restored-vault')
    vi.spyOn(idbHandles, 'loadDirHandle').mockResolvedValueOnce({ handle, scopeId: 'scope99' })
    stubPickerAbort() // makes isSupported() true without calling the picker

    const { result } = renderHook(() => useDirectoryHandle())
    let got: Awaited<ReturnType<typeof result.current.restoreSavedHandle>>
    await act(async () => { got = await result.current.restoreSavedHandle() })

    expect(got!).not.toBeNull()
    expect(got!.handle).toBe(handle)
    expect(got!.scopeId).toBe('scope99')
    expect(result.current.directoryName).toBe('restored-vault')
    expect(result.current.rootHandle).toBe(handle)

    vi.restoreAllMocks()
  })

  it('clearSavedHandle wipes IDB, directoryName, rootHandle, and dirHandleRef', async () => {
    const handle = fakeHandle('to-clear')
    stubPicker(handle)
    const { result } = renderHook(() => useDirectoryHandle())
    await act(async () => { await result.current.acquirePickerHandle() })
    expect(result.current.rootHandle).not.toBeNull()

    await act(async () => { await result.current.clearSavedHandle() })
    expect(result.current.rootHandle).toBeNull()
    expect(result.current.directoryName).toBeNull()
    expect(result.current.dirHandleRef.current).toBeNull()
  })
})
