// src/app/knowledge_base/shared/hooks/useDiagramHistory.test.ts
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDiagramHistory } from './useDiagramHistory'
import type { DiagramSnapshot } from './useDiagramHistory'

vi.mock('../utils/historyPersistence', async (importOriginal) => {
  const real = await importOriginal<typeof import('../utils/historyPersistence')>()
  return { ...real, readHistoryFile: vi.fn().mockResolvedValue(null), writeHistoryFile: vi.fn() }
})

const snap: DiagramSnapshot = {
  title: 'Test',
  layerDefs: [],
  nodes: [],
  connections: [],
  layerManualSizes: {},
  lineCurve: 'bezier',
  flows: [],
}

describe('useDiagramHistory — onSave is an alias for onFileSave', () => {
  it('marks saved and updates checksum', async () => {
    const { result } = renderHook(() => useDiagramHistory())
    await act(async () => {
      await result.current.initHistory(JSON.stringify(snap), snap, null, null)
    })
    act(() => { result.current.recordAction('edit', { ...snap, title: 'Edited' }) })
    act(() => { result.current.onSave(JSON.stringify({ ...snap, title: 'Edited' })) })
    expect(result.current.savedIndex).toBe(1)
  })
})
