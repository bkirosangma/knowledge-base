import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useHistoryCore } from './useHistoryCore'
import type { HistoryEntry } from '../utils/historyPersistence'

function makeSnapshot(label: string) { return { label } as unknown as { label: string } }

type S = { label: string }

function makeEntry(id: number, description: string, snapshot: S): HistoryEntry<S> {
  return { id, description, timestamp: Date.now(), snapshot }
}

describe('useHistoryCore — initial state', () => {
  it('starts empty with index -1', () => {
    const { result } = renderHook(() => useHistoryCore<S>())
    expect(result.current.entries).toHaveLength(0)
    expect(result.current.currentIndex).toBe(-1)
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(false)
  })
})

describe('useHistoryCore — initEntries', () => {
  it('sets entries and currentIndex', () => {
    const { result } = renderHook(() => useHistoryCore<S>())
    const entries = [makeEntry(0, 'File loaded', makeSnapshot('v0'))]
    act(() => { result.current.initEntries(entries, 0, 0) })
    expect(result.current.entries).toHaveLength(1)
    expect(result.current.currentIndex).toBe(0)
    expect(result.current.savedIndex).toBe(0)
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(false)
  })
})

describe('useHistoryCore — recordAction', () => {
  it('appends entry and advances index', () => {
    const { result } = renderHook(() => useHistoryCore<S>())
    act(() => { result.current.initEntries([makeEntry(0, 'init', makeSnapshot('v0'))], 0, 0) })
    act(() => { result.current.recordAction('edit', makeSnapshot('v1')) })
    expect(result.current.entries).toHaveLength(2)
    expect(result.current.currentIndex).toBe(1)
    expect(result.current.canUndo).toBe(true)
    expect(result.current.canRedo).toBe(false)
  })

  it('truncates redo branch when recording after undo', () => {
    const { result } = renderHook(() => useHistoryCore<S>())
    act(() => { result.current.initEntries([makeEntry(0, 'init', makeSnapshot('v0'))], 0, 0) })
    act(() => { result.current.recordAction('A', makeSnapshot('vA')) })
    act(() => { result.current.undo() })
    act(() => { result.current.recordAction('B', makeSnapshot('vB')) })
    expect(result.current.entries).toHaveLength(2)
    expect(result.current.entries[1].description).toBe('B')
  })
})

describe('useHistoryCore — undo / redo', () => {
  it('undo returns previous snapshot', () => {
    const { result } = renderHook(() => useHistoryCore<S>())
    act(() => { result.current.initEntries([makeEntry(0, 'init', makeSnapshot('v0'))], 0, 0) })
    act(() => { result.current.recordAction('edit', makeSnapshot('v1')) })
    let snapshot: S | null = null
    act(() => { snapshot = result.current.undo() })
    expect(snapshot).toEqual(makeSnapshot('v0'))
    expect(result.current.currentIndex).toBe(0)
  })

  it('redo returns next snapshot', () => {
    const { result } = renderHook(() => useHistoryCore<S>())
    act(() => { result.current.initEntries([makeEntry(0, 'init', makeSnapshot('v0'))], 0, 0) })
    act(() => { result.current.recordAction('edit', makeSnapshot('v1')) })
    act(() => { result.current.undo() })
    let snapshot: S | null = null
    act(() => { snapshot = result.current.redo() })
    expect(snapshot).toEqual(makeSnapshot('v1'))
    expect(result.current.currentIndex).toBe(1)
  })

  it('undo returns null at beginning', () => {
    const { result } = renderHook(() => useHistoryCore<S>())
    act(() => { result.current.initEntries([makeEntry(0, 'init', makeSnapshot('v0'))], 0, 0) })
    let snapshot: S | null = makeSnapshot('x')
    act(() => { snapshot = result.current.undo() })
    expect(snapshot).toBeNull()
  })

  it('redo returns null at end', () => {
    const { result } = renderHook(() => useHistoryCore<S>())
    act(() => { result.current.initEntries([makeEntry(0, 'init', makeSnapshot('v0'))], 0, 0) })
    let snapshot: S | null = makeSnapshot('x')
    act(() => { snapshot = result.current.redo() })
    expect(snapshot).toBeNull()
  })
})

describe('useHistoryCore — goToEntry', () => {
  it('jumps to any index and returns that snapshot', () => {
    const { result } = renderHook(() => useHistoryCore<S>())
    act(() => { result.current.initEntries([makeEntry(0, 'init', makeSnapshot('v0'))], 0, 0) })
    act(() => { result.current.recordAction('A', makeSnapshot('vA')) })
    act(() => { result.current.recordAction('B', makeSnapshot('vB')) })
    let snapshot: S | null = null
    act(() => { snapshot = result.current.goToEntry(0) })
    expect(snapshot).toEqual(makeSnapshot('v0'))
    expect(result.current.currentIndex).toBe(0)
  })

  it('returns null for out-of-range index', () => {
    const { result } = renderHook(() => useHistoryCore<S>())
    act(() => { result.current.initEntries([makeEntry(0, 'init', makeSnapshot('v0'))], 0, 0) })
    let snapshot: S | null = makeSnapshot('x')
    act(() => { snapshot = result.current.goToEntry(99) })
    expect(snapshot).toBeNull()
  })
})

describe('useHistoryCore — goToSaved', () => {
  it('jumps to savedIndex and returns its snapshot', () => {
    const { result } = renderHook(() => useHistoryCore<S>())
    act(() => { result.current.initEntries([makeEntry(0, 'init', makeSnapshot('v0'))], 0, 0) })
    act(() => { result.current.recordAction('edit', makeSnapshot('v1')) })
    act(() => { result.current.markSaved() })
    act(() => { result.current.recordAction('unsaved', makeSnapshot('v2')) })
    let snapshot: S | null = null
    act(() => { snapshot = result.current.goToSaved() })
    expect(snapshot).toEqual(makeSnapshot('v1'))
    expect(result.current.currentIndex).toBe(1)
  })
})

describe('useHistoryCore — markSaved', () => {
  it('updates savedIndex to currentIndex', () => {
    const { result } = renderHook(() => useHistoryCore<S>())
    act(() => { result.current.initEntries([makeEntry(0, 'init', makeSnapshot('v0'))], 0, 0) })
    act(() => { result.current.recordAction('edit', makeSnapshot('v1')) })
    act(() => { result.current.markSaved() })
    expect(result.current.savedIndex).toBe(1)
  })
})

describe('useHistoryCore — clear', () => {
  it('resets everything to empty state', () => {
    const { result } = renderHook(() => useHistoryCore<S>())
    act(() => { result.current.initEntries([makeEntry(0, 'init', makeSnapshot('v0'))], 0, 0) })
    act(() => { result.current.recordAction('edit', makeSnapshot('v1')) })
    act(() => { result.current.clear() })
    expect(result.current.entries).toHaveLength(0)
    expect(result.current.currentIndex).toBe(-1)
    expect(result.current.savedIndex).toBe(-1)
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(false)
  })
})

describe('useHistoryCore — onStateChange callback', () => {
  it('fires after recordAction', () => {
    const onStateChange = vi.fn()
    const { result } = renderHook(() => useHistoryCore<S>({ onStateChange }))
    act(() => { result.current.initEntries([makeEntry(0, 'init', makeSnapshot('v0'))], 0, 0) })
    act(() => { result.current.recordAction('edit', makeSnapshot('v1')) })
    expect(onStateChange).toHaveBeenCalled()
  })

  it('fires after undo', () => {
    const onStateChange = vi.fn()
    const { result } = renderHook(() => useHistoryCore<S>({ onStateChange }))
    act(() => { result.current.initEntries([makeEntry(0, 'init', makeSnapshot('v0'))], 0, 0) })
    act(() => { result.current.recordAction('edit', makeSnapshot('v1')) })
    onStateChange.mockClear()
    act(() => { result.current.undo() })
    expect(onStateChange).toHaveBeenCalled()
  })
})

describe('useHistoryCore — MAX_HISTORY pruning', () => {
  it('caps entries at 100 and keeps the most recent', () => {
    const { result } = renderHook(() => useHistoryCore<S>())
    act(() => { result.current.initEntries([makeEntry(0, 'init', makeSnapshot('v0'))], 0, 0) })
    act(() => {
      for (let i = 1; i <= 105; i++) {
        result.current.recordAction(`action ${i}`, makeSnapshot(`v${i}`))
      }
    })
    expect(result.current.entries).toHaveLength(100)
    expect(result.current.entries[99].description).toBe('action 105')
  })

  it('pins the saved entry at index 0 when it would be pruned', () => {
    const { result } = renderHook(() => useHistoryCore<S>())
    act(() => { result.current.initEntries([makeEntry(0, 'init', makeSnapshot('v0'))], 0, 0) })
    act(() => {
      for (let i = 1; i <= 105; i++) {
        result.current.recordAction(`action ${i}`, makeSnapshot(`v${i}`))
      }
    })
    expect(result.current.savedIndex).toBe(0)
    expect(result.current.savedEntryPinned).toBe(true)
  })
})

describe('useHistoryCore — getLatestState', () => {
  it('returns current ref values synchronously', () => {
    const { result } = renderHook(() => useHistoryCore<S>())
    act(() => { result.current.initEntries([makeEntry(0, 'init', makeSnapshot('v0'))], 0, 0) })
    act(() => { result.current.recordAction('edit', makeSnapshot('v1')) })
    const state = result.current.getLatestState()
    expect(state.currentIndex).toBe(1)
    expect(state.savedIndex).toBe(0)
    expect(state.entries).toHaveLength(2)
  })
})
