// src/app/knowledge_base/shared/hooks/useHistoryFileSync.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useHistoryFileSync } from './useHistoryFileSync'
import * as persistence from '../utils/historyPersistence'
import type { HistoryEntry } from '../utils/historyPersistence'

vi.mock('../utils/historyPersistence', async (importOriginal) => {
  const real = await importOriginal<typeof persistence>()
  return {
    ...real,
    readHistoryFile: vi.fn(),
    writeHistoryFile: vi.fn(),
  }
})

const mockRead = persistence.readHistoryFile as ReturnType<typeof vi.fn>
const mockWrite = persistence.writeHistoryFile as ReturnType<typeof vi.fn>

function makeEntry(id: number, snapshot: string): HistoryEntry<string> {
  return { id, description: 'entry', timestamp: Date.now(), snapshot }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useHistoryFileSync — initHistory with no handle', () => {
  it('seeds a "File loaded" entry', async () => {
    const { result } = renderHook(() => useHistoryFileSync<string>())
    await act(async () => {
      await result.current.initHistory('hello world', 'hello world', null, null)
    })
    expect(result.current.entries).toHaveLength(1)
    expect(result.current.entries[0].description).toBe('File loaded')
    expect(result.current.entries[0].snapshot).toBe('hello world')
    expect(result.current.currentIndex).toBe(0)
    expect(result.current.savedIndex).toBe(0)
  })
})

describe('useHistoryFileSync — initHistory with matching checksum', () => {
  it('restores entries from disk', async () => {
    const fileContent = 'hello'
    const checksum = persistence.fnv1a(fileContent)
    const stored: HistoryEntry<string>[] = [
      makeEntry(0, 'v0'),
      makeEntry(1, 'v1'),
    ]
    mockRead.mockResolvedValue({ checksum, currentIndex: 1, savedIndex: 0, entries: stored })

    const fakeHandle = {} as FileSystemDirectoryHandle
    const { result } = renderHook(() => useHistoryFileSync<string>())
    await act(async () => {
      await result.current.initHistory(fileContent, fileContent, fakeHandle, 'notes.md')
    })
    expect(result.current.entries).toHaveLength(2)
    expect(result.current.currentIndex).toBe(1)
    expect(result.current.savedIndex).toBe(0)
  })
})

describe('useHistoryFileSync — initHistory with mismatched checksum', () => {
  it('discards stale history and seeds fresh entry', async () => {
    mockRead.mockResolvedValue({
      checksum: 'stale',
      currentIndex: 5,
      savedIndex: 3,
      entries: [makeEntry(0, 'old')],
    })
    const fakeHandle = {} as FileSystemDirectoryHandle
    const { result } = renderHook(() => useHistoryFileSync<string>())
    await act(async () => {
      await result.current.initHistory('new content', 'new content', fakeHandle, 'notes.md')
    })
    expect(result.current.entries).toHaveLength(1)
    expect(result.current.entries[0].description).toBe('File loaded')
  })
})

describe('useHistoryFileSync — onFileSave', () => {
  it('marks saved position and schedules a write', async () => {
    const { result } = renderHook(() => useHistoryFileSync<string>())
    const fakeHandle = {} as FileSystemDirectoryHandle
    await act(async () => {
      await result.current.initHistory('v0', 'v0', fakeHandle, 'notes.md')
    })
    act(() => { result.current.recordAction('edit', 'v1') })
    act(() => { result.current.onFileSave('v1') })
    expect(result.current.savedIndex).toBe(1)
    vi.advanceTimersByTime(1100)
    expect(mockWrite).toHaveBeenCalled()
  })
})

describe('useHistoryFileSync — clearHistory', () => {
  it('resets state and cancels pending writes', async () => {
    const { result } = renderHook(() => useHistoryFileSync<string>())
    const fakeHandle = {} as FileSystemDirectoryHandle
    await act(async () => {
      await result.current.initHistory('v0', 'v0', fakeHandle, 'notes.md')
    })
    act(() => { result.current.recordAction('edit', 'v1') })
    act(() => { result.current.clearHistory() })
    vi.advanceTimersByTime(2000)
    expect(mockWrite).not.toHaveBeenCalled()
    expect(result.current.entries).toHaveLength(0)
    expect(result.current.currentIndex).toBe(-1)
  })
})

describe('useHistoryFileSync — recordAction triggers debounced write', () => {
  it('does not write immediately after recordAction', async () => {
    const { result } = renderHook(() => useHistoryFileSync<string>())
    const fakeHandle = {} as FileSystemDirectoryHandle
    await act(async () => {
      await result.current.initHistory('v0', 'v0', fakeHandle, 'notes.md')
    })
    act(() => { result.current.recordAction('edit', 'v1') })
    expect(mockWrite).not.toHaveBeenCalled()
  })

  it('writes after 1000ms debounce following recordAction', async () => {
    const { result } = renderHook(() => useHistoryFileSync<string>())
    const fakeHandle = {} as FileSystemDirectoryHandle
    await act(async () => {
      await result.current.initHistory('v0', 'v0', fakeHandle, 'notes.md')
    })
    act(() => { result.current.recordAction('edit', 'v1') })
    act(() => { vi.advanceTimersByTime(1100) })
    expect(mockWrite).toHaveBeenCalledOnce()
  })

  it('does NOT write when no dirHandle is provided', async () => {
    const { result } = renderHook(() => useHistoryFileSync<string>())
    await act(async () => {
      await result.current.initHistory('v0', 'v0', null, null)
    })
    act(() => { result.current.recordAction('edit', 'v1') })
    act(() => { vi.advanceTimersByTime(2000) })
    expect(mockWrite).not.toHaveBeenCalled()
  })

  it('multiple rapid recordActions only trigger one write', async () => {
    const { result } = renderHook(() => useHistoryFileSync<string>())
    const fakeHandle = {} as FileSystemDirectoryHandle
    await act(async () => {
      await result.current.initHistory('v0', 'v0', fakeHandle, 'notes.md')
    })
    act(() => { result.current.recordAction('edit1', 'v1') })
    act(() => { vi.advanceTimersByTime(500) })
    act(() => { result.current.recordAction('edit2', 'v2') })
    act(() => { vi.advanceTimersByTime(500) })
    // timer not yet expired
    expect(mockWrite).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(600) })
    expect(mockWrite).toHaveBeenCalledOnce()
  })
})

describe('useHistoryFileSync — file switch re-initializes state', () => {
  it('re-init clears prior entries and loads fresh history', async () => {
    const { result } = renderHook(() => useHistoryFileSync<string>())
    const fakeHandle = {} as FileSystemDirectoryHandle
    // Init for file A
    await act(async () => {
      await result.current.initHistory('fileA', 'fileA', fakeHandle, 'a.md')
    })
    act(() => { result.current.recordAction('edit', 'fileA-v2') })
    expect(result.current.entries).toHaveLength(2)

    // Switch to file B (no disk history)
    mockRead.mockResolvedValueOnce(null)
    await act(async () => {
      await result.current.initHistory('fileB', 'fileB', fakeHandle, 'b.md')
    })
    expect(result.current.entries).toHaveLength(1)
    expect(result.current.entries[0].description).toBe('File loaded')
    expect(result.current.entries[0].snapshot).toBe('fileB')
    expect(result.current.currentIndex).toBe(0)
    expect(result.current.savedIndex).toBe(0)
  })
})
