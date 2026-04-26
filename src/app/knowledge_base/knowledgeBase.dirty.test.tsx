import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useState, useCallback, useMemo } from 'react'
import { updateDirtySet } from './knowledgeBase'

// SHELL-1.12-08 — Per-pane dirty publishers prevent split-view race.
//
// Bug: When the same .md was open in BOTH panes and only the LEFT pane was
// dirty, the right pane's mount effect (`onDirtyChange(filePath, false)`)
// cleared the path from a single shared `Set<string>` keyed only by path.
// The header dirty-stack badge then read 0 — wrong.
//
// Fix: split shell-level state into per-pane Sets so each pane is its own
// publisher. The Header takes the union of both (deduped).

describe('updateDirtySet — referential identity for no-ops', () => {
  it('returns the same Set when adding a path that already exists', () => {
    const prev = new Set(['notes/draft.md'])
    const next = updateDirtySet(prev, 'notes/draft.md', true)
    expect(next).toBe(prev)
  })

  it('returns the same Set when removing a path that is not present', () => {
    const prev = new Set<string>()
    const next = updateDirtySet(prev, 'notes/draft.md', false)
    expect(next).toBe(prev)
  })

  it('returns a new Set with the path added when previously absent', () => {
    const prev = new Set<string>()
    const next = updateDirtySet(prev, 'notes/draft.md', true)
    expect(next).not.toBe(prev)
    expect(next.has('notes/draft.md')).toBe(true)
    expect(prev.has('notes/draft.md')).toBe(false)
  })

  it('returns a new Set with the path removed when previously present', () => {
    const prev = new Set(['notes/draft.md'])
    const next = updateDirtySet(prev, 'notes/draft.md', false)
    expect(next).not.toBe(prev)
    expect(next.has('notes/draft.md')).toBe(false)
    expect(prev.has('notes/draft.md')).toBe(true)
  })
})

/**
 * Mirror of the shell's per-pane dirty plumbing (knowledgeBase.tsx). Kept
 * inline so the unit test exercises the same publish/cleanup contract that
 * `DocumentView`'s effect drives in production — without spinning up the
 * full shell (which needs File System Access mocks, panes, etc.).
 */
function useDirtyShell() {
  const [leftDocDirty, setLeftDocDirty] = useState<Set<string>>(() => new Set())
  const [rightDocDirty, setRightDocDirty] = useState<Set<string>>(() => new Set())
  const handleLeftDocDirty = useCallback((filePath: string, dirty: boolean) => {
    setLeftDocDirty((prev) => updateDirtySet(prev, filePath, dirty))
  }, [])
  const handleRightDocDirty = useCallback((filePath: string, dirty: boolean) => {
    setRightDocDirty((prev) => updateDirtySet(prev, filePath, dirty))
  }, [])
  const headerDirtyFiles = useMemo(() => {
    const out = new Set<string>()
    for (const p of leftDocDirty) out.add(p)
    for (const p of rightDocDirty) out.add(p)
    return out
  }, [leftDocDirty, rightDocDirty])
  return { handleLeftDocDirty, handleRightDocDirty, headerDirtyFiles }
}

describe('SHELL-1.12-08: per-pane dirty publishers prevent split-view race', () => {
  it('right pane mount with the same file does not clear the left pane\'s dirty flag', () => {
    const { result } = renderHook(() => useDirtyShell())

    // Left pane: file opens dirty (user already edited it).
    act(() => {
      result.current.handleLeftDocDirty('notes/draft.md', true)
    })
    expect(result.current.headerDirtyFiles.has('notes/draft.md')).toBe(true)

    // Right pane: same file mounts CLEAN — DocumentView's effect publishes
    // (path, false). Under the old single-Set design this cleared the path;
    // with per-pane Sets it must not.
    act(() => {
      result.current.handleRightDocDirty('notes/draft.md', false)
    })
    expect(result.current.headerDirtyFiles.has('notes/draft.md')).toBe(true)
    expect(result.current.headerDirtyFiles.size).toBe(1)
  })

  it('right pane unmount with the same file does not clear the left pane\'s dirty flag', () => {
    const { result } = renderHook(() => useDirtyShell())

    // Both panes mount the same file; only left edits.
    act(() => {
      result.current.handleLeftDocDirty('notes/draft.md', true)
      result.current.handleRightDocDirty('notes/draft.md', false)
    })
    expect(result.current.headerDirtyFiles.has('notes/draft.md')).toBe(true)

    // Right pane unmounts → cleanup fires (path, false). Must not affect left.
    act(() => {
      result.current.handleRightDocDirty('notes/draft.md', false)
    })
    expect(result.current.headerDirtyFiles.has('notes/draft.md')).toBe(true)
  })

  it('header union dedupes when the same dirty file is published by both panes', () => {
    const { result } = renderHook(() => useDirtyShell())
    act(() => {
      result.current.handleLeftDocDirty('notes/draft.md', true)
      result.current.handleRightDocDirty('notes/draft.md', true)
    })
    expect(result.current.headerDirtyFiles.size).toBe(1)
    expect(result.current.headerDirtyFiles.has('notes/draft.md')).toBe(true)
  })

  it('header union counts distinct paths from each pane', () => {
    const { result } = renderHook(() => useDirtyShell())
    act(() => {
      result.current.handleLeftDocDirty('notes/a.md', true)
      result.current.handleRightDocDirty('notes/b.md', true)
    })
    expect(result.current.headerDirtyFiles.size).toBe(2)
    expect(result.current.headerDirtyFiles.has('notes/a.md')).toBe(true)
    expect(result.current.headerDirtyFiles.has('notes/b.md')).toBe(true)
  })

  it('clearing left publisher only removes the left-owned path from the union', () => {
    const { result } = renderHook(() => useDirtyShell())
    act(() => {
      result.current.handleLeftDocDirty('notes/a.md', true)
      result.current.handleRightDocDirty('notes/b.md', true)
    })
    act(() => {
      result.current.handleLeftDocDirty('notes/a.md', false)
    })
    expect(result.current.headerDirtyFiles.has('notes/a.md')).toBe(false)
    expect(result.current.headerDirtyFiles.has('notes/b.md')).toBe(true)
    expect(result.current.headerDirtyFiles.size).toBe(1)
  })
})
