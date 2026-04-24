// src/app/knowledge_base/shared/hooks/useDiagramHistory.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDiagramHistory } from './useDiagramHistory'
import type { DiagramSnapshot } from './useDiagramHistory'
import * as persistence from '../utils/historyPersistence'

vi.mock('../utils/historyPersistence', async (importOriginal) => {
  const real = await importOriginal<typeof import('../utils/historyPersistence')>()
  return { ...real, readHistoryFile: vi.fn().mockResolvedValue(null), writeHistoryFile: vi.fn() }
})

const mockRead = persistence.readHistoryFile as ReturnType<typeof vi.fn>

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

const snap: DiagramSnapshot = {
  title: 'Test',
  layerDefs: [],
  nodes: [],
  connections: [],
  layerManualSizes: {},
  lineCurve: 'bezier',
  flows: [],
}

const snap2: DiagramSnapshot = { ...snap, title: 'Edited' }

describe('useDiagramHistory — initHistory', () => {
  it('seeds a "File loaded" entry with the diagram snapshot', async () => {
    const { result } = renderHook(() => useDiagramHistory())
    await act(async () => {
      await result.current.initHistory(JSON.stringify(snap), snap, null, null)
    })
    expect(result.current.entries).toHaveLength(1)
    expect(result.current.entries[0].description).toBe('File loaded')
    expect(result.current.entries[0].snapshot).toEqual(snap)
    expect(result.current.currentIndex).toBe(0)
    expect(result.current.savedIndex).toBe(0)
  })

  it('restores history from disk when checksum matches', async () => {
    const fileJson = JSON.stringify(snap)
    const checksum = persistence.fnv1a(fileJson)
    mockRead.mockResolvedValueOnce({
      checksum,
      currentIndex: 1,
      savedIndex: 0,
      entries: [
        { id: 0, description: 'File loaded', timestamp: 1000, snapshot: snap },
        { id: 1, description: 'edit', timestamp: 2000, snapshot: snap2 },
      ],
    })
    const fakeHandle = {} as FileSystemDirectoryHandle
    const { result } = renderHook(() => useDiagramHistory())
    await act(async () => {
      await result.current.initHistory(fileJson, snap, fakeHandle, 'diagram.json')
    })
    expect(result.current.entries).toHaveLength(2)
    expect(result.current.currentIndex).toBe(1)
    expect(result.current.savedIndex).toBe(0)
  })
})

describe('useDiagramHistory — recordAction', () => {
  it('appends an entry and advances currentIndex', async () => {
    const { result } = renderHook(() => useDiagramHistory())
    await act(async () => { await result.current.initHistory(JSON.stringify(snap), snap, null, null) })
    act(() => { result.current.recordAction('Node added', snap2) })
    expect(result.current.entries).toHaveLength(2)
    expect(result.current.entries[1].description).toBe('Node added')
    expect(result.current.entries[1].snapshot).toEqual(snap2)
    expect(result.current.currentIndex).toBe(1)
  })
})

describe('useDiagramHistory — canUndo / canRedo', () => {
  it('canUndo=false at first entry, canRedo=false at last entry', async () => {
    const { result } = renderHook(() => useDiagramHistory())
    await act(async () => { await result.current.initHistory(JSON.stringify(snap), snap, null, null) })
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(false)
  })

  it('canUndo=true and canRedo=false after recording an action', async () => {
    const { result } = renderHook(() => useDiagramHistory())
    await act(async () => { await result.current.initHistory(JSON.stringify(snap), snap, null, null) })
    act(() => { result.current.recordAction('edit', snap2) })
    expect(result.current.canUndo).toBe(true)
    expect(result.current.canRedo).toBe(false)
  })

  it('canUndo=false and canRedo=true after undoing to the first entry', async () => {
    const { result } = renderHook(() => useDiagramHistory())
    await act(async () => { await result.current.initHistory(JSON.stringify(snap), snap, null, null) })
    act(() => { result.current.recordAction('edit', snap2) })
    act(() => { result.current.undo() })
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(true)
  })
})

describe('useDiagramHistory — undo / redo', () => {
  it('undo() returns the previous snapshot', async () => {
    const { result } = renderHook(() => useDiagramHistory())
    await act(async () => { await result.current.initHistory(JSON.stringify(snap), snap, null, null) })
    act(() => { result.current.recordAction('edit', snap2) })
    let restored: DiagramSnapshot | null = null
    act(() => { restored = result.current.undo() })
    expect(restored).toEqual(snap)
    expect(result.current.currentIndex).toBe(0)
  })

  it('redo() returns the next snapshot', async () => {
    const { result } = renderHook(() => useDiagramHistory())
    await act(async () => { await result.current.initHistory(JSON.stringify(snap), snap, null, null) })
    act(() => { result.current.recordAction('edit', snap2) })
    act(() => { result.current.undo() })
    let redone: DiagramSnapshot | null = null
    act(() => { redone = result.current.redo() })
    expect(redone).toEqual(snap2)
    expect(result.current.currentIndex).toBe(1)
  })

  it('undo() returns null at the first entry', async () => {
    const { result } = renderHook(() => useDiagramHistory())
    await act(async () => { await result.current.initHistory(JSON.stringify(snap), snap, null, null) })
    let res: DiagramSnapshot | null = snap
    act(() => { res = result.current.undo() })
    expect(res).toBeNull()
  })
})

describe('useDiagramHistory — goToEntry', () => {
  it('navigates to a specific index and returns its snapshot', async () => {
    const { result } = renderHook(() => useDiagramHistory())
    await act(async () => { await result.current.initHistory(JSON.stringify(snap), snap, null, null) })
    act(() => { result.current.recordAction('e1', snap2) })
    act(() => { result.current.recordAction('e2', { ...snap, title: 'v3' }) })
    let target: DiagramSnapshot | null = null
    act(() => { target = result.current.goToEntry(1) })
    expect(target).toEqual(snap2)
    expect(result.current.currentIndex).toBe(1)
  })
})

describe('useDiagramHistory — onSave is an alias for onFileSave', () => {
  it('marks saved and updates checksum', async () => {
    const { result } = renderHook(() => useDiagramHistory())
    await act(async () => {
      await result.current.initHistory(JSON.stringify(snap), snap, null, null)
    })
    act(() => { result.current.recordAction('edit', snap2) })
    act(() => { result.current.onSave(JSON.stringify(snap2)) })
    expect(result.current.savedIndex).toBe(1)
  })
})

describe('useDiagramHistory — document attachments in snapshots', () => {
  const doc = { id: 'doc-1', filename: 'auth-flow.md', title: 'Auth Flow', attachedTo: [{ type: 'flow' as const, id: 'flow-auth' }] }

  it('DIAG-3.10-38: "Attach document to flow" entry stores documents in snapshot', async () => {
    const { result } = renderHook(() => useDiagramHistory())
    await act(async () => { await result.current.initHistory(JSON.stringify(snap), snap, null, null) })
    const snapWithDoc: DiagramSnapshot = { ...snap, documents: [doc] }
    act(() => { result.current.recordAction('Attach document to flow', snapWithDoc) })
    expect(result.current.entries[1].description).toBe('Attach document to flow')
    expect(result.current.entries[1].snapshot.documents).toEqual([doc])
  })

  it('DIAG-3.10-39: "Detach document from flow" entry stores empty documents in snapshot', async () => {
    const { result } = renderHook(() => useDiagramHistory())
    await act(async () => { await result.current.initHistory(JSON.stringify(snap), { ...snap, documents: [doc] }, null, null) })
    act(() => { result.current.recordAction('Detach document from flow', snap) })
    expect(result.current.entries[1].description).toBe('Detach document from flow')
    expect(result.current.entries[1].snapshot.documents).toBeUndefined()
  })

  it('DIAG-3.10-40: undo after attach returns snapshot without document', async () => {
    const { result } = renderHook(() => useDiagramHistory())
    await act(async () => { await result.current.initHistory(JSON.stringify(snap), snap, null, null) })
    act(() => { result.current.recordAction('Attach document to flow', { ...snap, documents: [doc] }) })
    let restored: DiagramSnapshot | null = null
    act(() => { restored = result.current.undo() })
    expect((restored as DiagramSnapshot | null)?.documents).toBeUndefined()
    expect(result.current.currentIndex).toBe(0)
  })

  it('DIAG-3.10-41: redo after undo-attach returns snapshot with document restored', async () => {
    const { result } = renderHook(() => useDiagramHistory())
    await act(async () => { await result.current.initHistory(JSON.stringify(snap), snap, null, null) })
    act(() => { result.current.recordAction('Attach document to flow', { ...snap, documents: [doc] }) })
    act(() => { result.current.undo() })
    let redone: DiagramSnapshot | null = null
    act(() => { redone = result.current.redo() })
    expect((redone as DiagramSnapshot | null)?.documents).toEqual([doc])
    expect(result.current.currentIndex).toBe(1)
  })

  it('DIAG-3.10-42: "Create and attach document to flow" entry stores documents in snapshot', async () => {
    const { result } = renderHook(() => useDiagramHistory())
    await act(async () => { await result.current.initHistory(JSON.stringify(snap), snap, null, null) })
    const snapWithDoc: DiagramSnapshot = { ...snap, documents: [doc] }
    act(() => { result.current.recordAction('Create and attach document to flow', snapWithDoc) })
    expect(result.current.entries[1].description).toBe('Create and attach document to flow')
    expect(result.current.entries[1].snapshot.documents).toEqual([doc])
  })
})
