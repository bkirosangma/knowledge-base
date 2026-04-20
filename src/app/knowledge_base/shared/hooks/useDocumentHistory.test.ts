// src/app/knowledge_base/shared/hooks/useDocumentHistory.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDocumentHistory } from './useDocumentHistory'

vi.mock('../utils/historyPersistence', async (importOriginal) => {
  const real = await importOriginal()
  return { ...real, readHistoryFile: vi.fn().mockResolvedValue(null), writeHistoryFile: vi.fn() }
})

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('useDocumentHistory — initHistory', () => {
  it('seeds a "File loaded" entry with the file content as snapshot', async () => {
    const { result } = renderHook(() => useDocumentHistory())
    await act(async () => {
      await result.current.initHistory('# Hello', null, null)
    })
    expect(result.current.entries).toHaveLength(1)
    expect(result.current.entries[0].description).toBe('File loaded')
    expect(result.current.entries[0].snapshot).toBe('# Hello')
  })
})

describe('useDocumentHistory — onContentChange debounce', () => {
  it('does not record immediately', async () => {
    const { result } = renderHook(() => useDocumentHistory())
    await act(async () => { await result.current.initHistory('v0', null, null) })
    act(() => { result.current.onContentChange('v1') })
    expect(result.current.entries).toHaveLength(1)
  })

  it('records a "Draft" entry after 5 s', async () => {
    const { result } = renderHook(() => useDocumentHistory())
    await act(async () => { await result.current.initHistory('v0', null, null) })
    act(() => { result.current.onContentChange('v1') })
    act(() => { vi.advanceTimersByTime(5000) })
    expect(result.current.entries).toHaveLength(2)
    expect(result.current.entries[1].description).toBe('Draft')
    expect(result.current.entries[1].snapshot).toBe('v1')
  })

  it('resets the debounce timer on subsequent calls', async () => {
    const { result } = renderHook(() => useDocumentHistory())
    await act(async () => { await result.current.initHistory('v0', null, null) })
    act(() => { result.current.onContentChange('v1') })
    act(() => { vi.advanceTimersByTime(3000) })
    act(() => { result.current.onContentChange('v2') })
    act(() => { vi.advanceTimersByTime(3000) })
    expect(result.current.entries).toHaveLength(1)
    act(() => { vi.advanceTimersByTime(2001) })
    expect(result.current.entries).toHaveLength(2)
    expect(result.current.entries[1].snapshot).toBe('v2')
  })
})

describe('useDocumentHistory — onBlockChange', () => {
  it('records a "Block changed" entry immediately', async () => {
    const { result } = renderHook(() => useDocumentHistory())
    await act(async () => { await result.current.initHistory('v0', null, null) })
    act(() => { result.current.onBlockChange('v1') })
    expect(result.current.entries).toHaveLength(2)
    expect(result.current.entries[1].description).toBe('Block changed')
    expect(result.current.entries[1].snapshot).toBe('v1')
  })

  it('cancels any pending debounce timer', async () => {
    const { result } = renderHook(() => useDocumentHistory())
    await act(async () => { await result.current.initHistory('v0', null, null) })
    act(() => { result.current.onContentChange('v1') })
    act(() => { result.current.onBlockChange('v2') })
    act(() => { vi.advanceTimersByTime(6000) })
    expect(result.current.entries).toHaveLength(2)
    expect(result.current.entries[1].description).toBe('Block changed')
  })
})

describe('useDocumentHistory — onFileSave', () => {
  it('records a "Saved" entry and marks savedIndex', async () => {
    const { result } = renderHook(() => useDocumentHistory())
    await act(async () => { await result.current.initHistory('v0', null, null) })
    act(() => { result.current.onContentChange('v1') })
    act(() => { result.current.onFileSave('v1') })
    expect(result.current.entries).toHaveLength(2)
    expect(result.current.entries[1].description).toBe('Saved')
    expect(result.current.savedIndex).toBe(1)
  })
})
