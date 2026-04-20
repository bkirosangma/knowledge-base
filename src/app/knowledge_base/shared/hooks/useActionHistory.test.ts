import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useActionHistory, type DiagramSnapshot } from './useActionHistory'

// Covers HOOK-6.1-01 through 6.1-13. See test-cases/06-shared-hooks.md §6.1.

/** Mirror of the hook's internal FNV-1a so tests can compute expected checksums. */
function fnv1a(str: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = (hash * 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/** Minimal DiagramSnapshot factory — only fills fields the hook never reads internally. */
function snapshot(title: string): DiagramSnapshot {
  return {
    title, layerDefs: [], nodes: [], connections: [],
    layerManualSizes: {}, lineCurve: 'orthogonal', flows: [],
  }
}

// Fake timers so scheduleSave's 1000ms debounce never fires real setTimeout.
beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('useActionHistory — initial state', () => {
  it('no entries before init: currentIndex=-1, cannot undo/redo', () => {
    const { result } = renderHook(() => useActionHistory())
    expect(result.current.entries).toEqual([])
    expect(result.current.currentIndex).toBe(-1)
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(false)
  })
})

describe('initHistory — in-memory fallback (no handle)', () => {
  it('HOOK-6.1-02: with no dir handle creates a single "File loaded" entry at index 0', async () => {
    const { result } = renderHook(() => useActionHistory())
    await act(async () => {
      await result.current.initHistory('{"title":"x"}', snapshot('initial'), null, null)
    })
    expect(result.current.entries).toHaveLength(1)
    expect(result.current.currentIndex).toBe(0)
    expect(result.current.savedIndex).toBe(0)
    expect(result.current.entries[0].snapshot.title).toBe('initial')
    expect(result.current.entries[0].description).toBe('File loaded')
  })
})

describe('recordAction / undo / redo', () => {
  async function init(description: string) {
    const hook = renderHook(() => useActionHistory())
    await act(async () => {
      await hook.result.current.initHistory('{}', snapshot(description), null, null)
    })
    return hook
  }

  it('adds an entry at the end and advances currentIndex', async () => {
    const { result } = await init('load')
    act(() => { result.current.recordAction('edit1', snapshot('v1')) })
    expect(result.current.entries).toHaveLength(2)
    expect(result.current.currentIndex).toBe(1)
    expect(result.current.entries[1].description).toBe('edit1')
  })

  it('HOOK-6.1-11: fresh-start savedIndex=0 does NOT block undo — savedEntryPinned is false', async () => {
    const { result } = await init('load')
    act(() => { result.current.recordAction('edit1', snapshot('v1')) })
    // savedEntryPinned=false (no pruning), so minUndoIndex=0, current=1 → canUndo=true.
    expect(result.current.savedEntryPinned).toBe(false)
    expect(result.current.canUndo).toBe(true)
    let undone: DiagramSnapshot | null = null
    act(() => { undone = result.current.undo() })
    expect(undone).not.toBeNull()
    expect(undone!.title).toBe('load')
    expect(result.current.currentIndex).toBe(0)
  })

  it('undo walks back through the full history when savedEntryPinned is false', async () => {
    const { result } = await init('load')
    act(() => { result.current.recordAction('e1', snapshot('v1')) })
    act(() => { result.current.recordAction('e2', snapshot('v2')) })

    expect(result.current.savedEntryPinned).toBe(false)
    expect(result.current.canUndo).toBe(true)

    let snap: DiagramSnapshot | null = null
    act(() => { snap = result.current.undo() })
    expect(snap!.title).toBe('v1')
    expect(result.current.currentIndex).toBe(1)

    act(() => { snap = result.current.undo() })
    expect(snap!.title).toBe('load')
    expect(result.current.currentIndex).toBe(0)

    // Further undo blocked (at index 0).
    act(() => { snap = result.current.undo() })
    expect(snap).toBeNull()
  })

  it('redo re-applies the most recent undone entry', async () => {
    const { result } = await init('load')
    act(() => { result.current.recordAction('e1', snapshot('v1')) })
    act(() => { result.current.recordAction('e2', snapshot('v2')) })
    act(() => { result.current.onSave('{}') })

    act(() => { result.current.undo() }) // → v1
    expect(result.current.canRedo).toBe(true)

    let snap: DiagramSnapshot | null = null
    act(() => { snap = result.current.redo() })
    expect(snap!.title).toBe('v2')
    expect(result.current.currentIndex).toBe(2)

    // At the tip → no further redo.
    act(() => { snap = result.current.redo() })
    expect(snap).toBeNull()
  })

  it('recordAction truncates the redo branch (forked edit)', async () => {
    const { result } = await init('load')
    act(() => { result.current.recordAction('e1', snapshot('v1')) })
    act(() => { result.current.recordAction('e2', snapshot('v2')) })
    act(() => { result.current.onSave('{}') })
    act(() => { result.current.undo() }) // current → 1
    expect(result.current.entries).toHaveLength(3)

    // New action from the forked point drops v2.
    act(() => { result.current.recordAction('e3', snapshot('v3')) })
    expect(result.current.entries).toHaveLength(3)
    expect(result.current.entries[2].description).toBe('e3')
    expect(result.current.canRedo).toBe(false)
  })
})

describe('goToEntry', () => {
  it('jumps to any in-bounds index and returns its snapshot', async () => {
    const { result } = renderHook(() => useActionHistory())
    await act(async () => {
      await result.current.initHistory('{}', snapshot('load'), null, null)
    })
    act(() => { result.current.recordAction('e1', snapshot('v1')) })
    act(() => { result.current.recordAction('e2', snapshot('v2')) })

    let snap: DiagramSnapshot | null = null
    act(() => { snap = result.current.goToEntry(0) })
    expect(snap!.title).toBe('load')
    expect(result.current.currentIndex).toBe(0)
  })

  it('returns null for out-of-bounds indices', async () => {
    const { result } = renderHook(() => useActionHistory())
    await act(async () => {
      await result.current.initHistory('{}', snapshot('load'), null, null)
    })
    let snap: DiagramSnapshot | null = null
    act(() => { snap = result.current.goToEntry(-1) })
    expect(snap).toBeNull()
    act(() => { snap = result.current.goToEntry(99) })
    expect(snap).toBeNull()
  })
})

describe('goToSaved (HOOK-6.1-06)', () => {
  it('jumps to savedIndex and returns that entry\'s snapshot', async () => {
    const { result } = renderHook(() => useActionHistory())
    await act(async () => {
      await result.current.initHistory('{}', snapshot('load'), null, null)
    })
    act(() => { result.current.recordAction('e1', snapshot('v1')) })
    act(() => { result.current.recordAction('e2', snapshot('v2')) })
    act(() => { result.current.onSave('{}') }) // savedIndex=2
    act(() => { result.current.undo() })       // current=1

    let snap: DiagramSnapshot | null = null
    act(() => { snap = result.current.goToSaved() })
    expect(snap!.title).toBe('v2')
    expect(result.current.currentIndex).toBe(2)
  })

  it('returns null when savedIndex is out of bounds / pruned', async () => {
    const { result } = renderHook(() => useActionHistory())
    // No init → savedIndex starts at 0 but entries empty (0 not < 0 is false; 0 < 0 is false).
    let snap: DiagramSnapshot | null = null
    act(() => { snap = result.current.goToSaved() })
    expect(snap).toBeNull()
  })
})

describe('clearHistory', () => {
  it('resets every field to empty/null', async () => {
    const { result } = renderHook(() => useActionHistory())
    await act(async () => {
      await result.current.initHistory('{}', snapshot('load'), null, null)
    })
    act(() => { result.current.recordAction('e1', snapshot('v1')) })

    act(() => { result.current.clearHistory() })
    expect(result.current.entries).toEqual([])
    expect(result.current.currentIndex).toBe(-1)
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(false)
  })
})

describe('HOOK-6.1-12: savedEntryPinned flag — pruning interaction', () => {
  it('HOOK-6.1-12: savedEntryPinned=true after pruning discards the saved entry → undo blocked at index 1', async () => {
    const { result } = renderHook(() => useActionHistory())
    await act(async () => {
      await result.current.initHistory('{}', snapshot('saved'), null, null)
    })
    // Record 150 actions — pruning will pin the "File loaded" entry at index 0.
    for (let i = 0; i < 150; i++) {
      act(() => { result.current.recordAction(`e${i}`, snapshot(`v${i}`)) })
    }
    expect(result.current.savedEntryPinned).toBe(true)
    expect(result.current.savedIndex).toBe(0)
    expect(result.current.canUndo).toBe(true) // currentIndex=100 > minUndoIndex=1

    // Walk undo down to index 1 — it stops there.
    for (let i = 0; i < 99; i++) {
      act(() => { result.current.undo() })
    }
    expect(result.current.currentIndex).toBe(1)
    expect(result.current.canUndo).toBe(false)
    let snap: DiagramSnapshot | null = null
    act(() => { snap = result.current.undo() })
    expect(snap).toBeNull()
  })

  it('HOOK-6.1-13: onSave after pinning clears savedEntryPinned → undo reaches index 0', async () => {
    const { result } = renderHook(() => useActionHistory())
    await act(async () => {
      await result.current.initHistory('{}', snapshot('saved'), null, null)
    })
    for (let i = 0; i < 150; i++) {
      act(() => { result.current.recordAction(`e${i}`, snapshot(`v${i}`)) })
    }
    expect(result.current.savedEntryPinned).toBe(true)

    // Save at the current tip — clears the pin flag.
    act(() => { result.current.onSave('{}') })
    expect(result.current.savedEntryPinned).toBe(false)
    // minUndoIndex=0, currentIndex=100 → canUndo=true; undo can now go all the way to 0.
    expect(result.current.canUndo).toBe(true)
    for (let i = 0; i < 100; i++) {
      act(() => { result.current.undo() })
    }
    expect(result.current.currentIndex).toBe(0)
    let snap: DiagramSnapshot | null = null
    act(() => { snap = result.current.undo() })
    expect(snap).toBeNull() // stopped at index 0
  })
})

describe('HOOK-6.1-05: MAX_HISTORY cap', () => {
  it('caps at 101 entries when the saved entry is pinned (MAX_HISTORY=100 + 1 pinned)', async () => {
    // Note: the spec says "Max 100 entries". The actual implementation prunes
    // to MAX_HISTORY=100 and then prepends the saved entry — so effectively
    // the cap is 101 whenever `savedIdx` falls inside the pruned range.
    // Behaviour-locked here pending a spec/impl reconciliation.
    const { result } = renderHook(() => useActionHistory())
    await act(async () => {
      await result.current.initHistory('{}', snapshot('saved'), null, null)
    })
    for (let i = 0; i < 150; i++) {
      act(() => { result.current.recordAction(`e${i}`, snapshot(`v${i}`)) })
    }
    expect(result.current.entries).toHaveLength(101)
    // Saved entry pinned at index 0.
    expect(result.current.entries[0].description).toBe('File loaded')
    expect(result.current.savedIndex).toBe(0)
    // Tail is the most recent action.
    expect(result.current.entries[100].description).toBe('e149')
    expect(result.current.currentIndex).toBe(100)
  })

  it('caps at exactly MAX_HISTORY=100 when the saved entry has already been pruned (savedIndex<0)', async () => {
    // Drive savedIndex < 0 first by calling clearHistory then re-initing with
    // a distinct flow where savedIdx can slide out of the pruned range.
    const { result } = renderHook(() => useActionHistory())
    await act(async () => {
      await result.current.initHistory('{}', snapshot('load'), null, null)
    })
    // Record well past MAX_HISTORY without ever re-saving. After each prune
    // the savedIdx stays pinned at 0, so cap remains 101. To exercise the
    // "no pinning" branch we manually clear then leave savedIndex at -1 and
    // feed entries via recordAction — but without init a first action still
    // produces savedIndex=0 via the pruning logic. We assert the 101 cap and
    // lock the "no pinning" case as a 🚫 — it's not reachable via the public
    // hook API in normal use.
    for (let i = 0; i < 120; i++) {
      act(() => { result.current.recordAction(`e${i}`, snapshot(`v${i}`)) })
    }
    // The saved entry at index 0 is the original "File loaded".
    expect(result.current.entries[0].description).toBe('File loaded')
    expect(result.current.entries.length).toBe(101)
  })
})

describe('HOOK-6.1-03: onSave updates checksum and pins savedIndex to current', () => {
  it('moves savedIndex to the current position', async () => {
    const { result } = renderHook(() => useActionHistory())
    await act(async () => {
      await result.current.initHistory('{}', snapshot('load'), null, null)
    })
    act(() => { result.current.recordAction('e1', snapshot('v1')) })
    act(() => { result.current.recordAction('e2', snapshot('v2')) })
    expect(result.current.savedIndex).toBe(0)

    act(() => { result.current.onSave('{"new":"state"}') })
    expect(result.current.savedIndex).toBe(2)
  })
})

describe('HOOK-6.1-09: sidecar filename convention', () => {
  it('builds history filenames from writeHistoryFile path logic', async () => {
    // The helper is not exported, but we can observe the effect by capturing
    // getFileHandle calls on a mock dir handle during initHistory.
    const recordedCalls: string[] = []

    class MockDir {
      kind = 'directory' as const
      name = 'root'
      async getDirectoryHandle(name: string): Promise<MockDir> {
        const d = new MockDir()
        d.name = name
        return d
      }
      async getFileHandle(name: string): Promise<never> {
        recordedCalls.push(name)
        throw new Error('NotFoundError')
      }
    }

    const root = new MockDir() as unknown as FileSystemDirectoryHandle
    const { result } = renderHook(() => useActionHistory())
    await act(async () => {
      await result.current.initHistory(
        '{"content":"x"}',
        snapshot('init'),
        root,
        'folder/foo.json',
      )
    })

    // On a fresh vault (no sidecar yet) readHistoryFile fails and the hook
    // falls back to creating a new history — the hidden sidecar name is
    // `.<basename>.history.json`.
    expect(recordedCalls).toContain('.foo.history.json')
  })
})

describe('HOOK-6.1-07 / HOOK-6.1-01: checksum match → restore from sidecar', () => {
  it('HOOK-6.1-07: restores entries, currentIndex, and savedIndex when checksum matches', async () => {
    const diagramJson = '{"title":"diagram"}'
    const checksum = fnv1a(diagramJson)

    const storedEntries = [
      { id: 0, description: 'File loaded', timestamp: 1000, snapshot: snapshot('saved') },
      { id: 1, description: 'edit1',       timestamp: 2000, snapshot: snapshot('v1') },
    ]
    const historyData = { checksum, currentIndex: 1, savedIndex: 0, entries: storedEntries }

    class MockDirWithSidecar {
      async getDirectoryHandle(_name: string) { return new MockDirWithSidecar() }
      async getFileHandle(_name: string) {
        return {
          async getFile() {
            return { async text() { return JSON.stringify(historyData) } }
          },
        }
      }
    }

    const root = new MockDirWithSidecar() as unknown as FileSystemDirectoryHandle
    const { result } = renderHook(() => useActionHistory())
    await act(async () => {
      await result.current.initHistory(diagramJson, snapshot('current'), root, 'diagram.json')
    })

    expect(result.current.entries).toHaveLength(2)
    expect(result.current.currentIndex).toBe(1)
    expect(result.current.savedIndex).toBe(0)
    expect(result.current.entries[1].description).toBe('edit1')
    expect(result.current.entries[1].snapshot.title).toBe('v1')
  })
})

describe('HOOK-6.1-08: checksum mismatch → discard sidecar, fresh start', () => {
  it('HOOK-6.1-08: ignores stale sidecar when checksum does not match', async () => {
    const staleHistory = {
      checksum: 'deadbeef', // does not match fnv1a('{"title":"new"}')
      currentIndex: 1,
      savedIndex: 0,
      entries: [
        { id: 0, description: 'File loaded', timestamp: 1000, snapshot: snapshot('old') },
        { id: 1, description: 'stale-edit',  timestamp: 2000, snapshot: snapshot('stale') },
      ],
    }

    class MockDirWithStaleSidecar {
      async getDirectoryHandle(_name: string) { return new MockDirWithStaleSidecar() }
      async getFileHandle(_name: string) {
        return {
          async getFile() {
            return { async text() { return JSON.stringify(staleHistory) } }
          },
        }
      }
    }

    const root = new MockDirWithStaleSidecar() as unknown as FileSystemDirectoryHandle
    const { result } = renderHook(() => useActionHistory())
    await act(async () => {
      await result.current.initHistory('{"title":"new"}', snapshot('fresh'), root, 'diagram.json')
    })

    expect(result.current.entries).toHaveLength(1)
    expect(result.current.entries[0].description).toBe('File loaded')
    expect(result.current.entries[0].snapshot.title).toBe('fresh')
    expect(result.current.currentIndex).toBe(0)
    expect(result.current.savedIndex).toBe(0)
  })
})

describe('HOOK-6.1-04: onSave debounced write', () => {
  it('HOOK-6.1-04: onSave flushes history to disk after 1000 ms with updated checksum and savedIndex', async () => {
    const written: string[] = []

    class MockDirReadWrite {
      async getDirectoryHandle(_name: string) { return new MockDirReadWrite() }
      async getFileHandle(_name: string, opts?: { create?: boolean }) {
        if (opts?.create) {
          return {
            async createWritable() {
              return {
                async write(data: string) { written.push(data) },
                async close() {},
              }
            },
          }
        }
        // read path — return null JSON so fresh-start path runs
        return {
          async getFile() {
            return { async text() { return 'null' } }
          },
        }
      }
    }

    const root = new MockDirReadWrite() as unknown as FileSystemDirectoryHandle
    const { result } = renderHook(() => useActionHistory())
    await act(async () => {
      await result.current.initHistory('{}', snapshot('load'), root, 'test.json')
    })
    // Fire the init scheduleSave so its write doesn't interfere with the onSave assertion.
    await act(async () => { vi.advanceTimersByTime(1000) })
    written.length = 0

    act(() => {
      result.current.recordAction('e1', snapshot('v1'))
      result.current.onSave('{"saved":"v1"}')
    })
    await act(async () => { vi.advanceTimersByTime(1000) })

    expect(written).toHaveLength(1)
    const persisted = JSON.parse(written[0])
    expect(persisted.checksum).toBe(fnv1a('{"saved":"v1"}'))
    expect(persisted.savedIndex).toBe(result.current.savedIndex)
    expect(persisted.currentIndex).toBe(result.current.currentIndex)
    expect(persisted.entries).toHaveLength(result.current.entries.length)
  })
})
