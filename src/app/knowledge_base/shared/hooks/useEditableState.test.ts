import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useEditableState } from './useEditableState'

// Covers HOOK-6.3-01 through 6.3-07. See test-cases/06-shared-hooks.md §6.3.

describe('useEditableState', () => {
  it('initial state: not editing, draft mirrors value, no error', () => {
    const { result } = renderHook(() => useEditableState('hello'))
    expect(result.current.editing).toBe(false)
    expect(result.current.draft).toBe('hello')
    expect(result.current.error).toBe(false)
  })

  it('HOOK-6.3-01: setEditing(true) enters edit mode; draft is the current value', () => {
    const { result } = renderHook(() => useEditableState('foo'))
    act(() => { result.current.setEditing(true) })
    expect(result.current.editing).toBe(true)
    expect(result.current.draft).toBe('foo')
  })

  it('HOOK-6.3-02: cancel() restores draft to value and clears editing/error', () => {
    const { result } = renderHook(() => useEditableState('original'))
    act(() => {
      result.current.setEditing(true)
      result.current.setDraft('modified')
      result.current.showError()
    })
    expect(result.current.draft).toBe('modified')
    expect(result.current.editing).toBe(true)
    expect(result.current.error).toBe(true)

    act(() => { result.current.cancel() })
    expect(result.current.draft).toBe('original')
    expect(result.current.editing).toBe(false)
    expect(result.current.error).toBe(false)
  })

  it('HOOK-6.3-03: showError() flips error true (does not exit edit mode)', () => {
    const { result } = renderHook(() => useEditableState('x'))
    act(() => {
      result.current.setEditing(true)
      result.current.showError()
    })
    expect(result.current.error).toBe(true)
    expect(result.current.editing).toBe(true)
  })

  it('clearError() flips error back to false without touching editing', () => {
    const { result } = renderHook(() => useEditableState('x'))
    act(() => {
      result.current.setEditing(true)
      result.current.showError()
    })
    act(() => { result.current.clearError() })
    expect(result.current.error).toBe(false)
    expect(result.current.editing).toBe(true)
  })

  it('HOOK-6.3-04: finishEditing() exits edit mode and clears error', () => {
    const { result } = renderHook(() => useEditableState('x'))
    act(() => {
      result.current.setEditing(true)
      result.current.showError()
    })
    act(() => { result.current.finishEditing() })
    expect(result.current.editing).toBe(false)
    expect(result.current.error).toBe(false)
  })

  it('HOOK-6.3-05: external value change syncs draft and resets editing/error', () => {
    const { result, rerender } = renderHook(({ v }) => useEditableState(v), {
      initialProps: { v: 'a' },
    })
    act(() => {
      result.current.setEditing(true)
      result.current.setDraft('user-typing')
      result.current.showError()
    })
    expect(result.current.draft).toBe('user-typing')
    expect(result.current.editing).toBe(true)
    expect(result.current.error).toBe(true)

    // External value change (e.g. prop update from parent).
    rerender({ v: 'b' })
    expect(result.current.draft).toBe('b')
    expect(result.current.editing).toBe(false)
    expect(result.current.error).toBe(false)
  })

  it('HOOK-6.3-06 (actual behaviour): external value change during editing RESETS the draft (not preserved)', () => {
    // The test-case description asks whether external value is "preserved" during
    // editing — the implementation runs a useEffect on [value] that overwrites
    // draft unconditionally. Document that: editing is lost on external updates.
    const { result, rerender } = renderHook(({ v }) => useEditableState(v), {
      initialProps: { v: 'a' },
    })
    act(() => {
      result.current.setEditing(true)
      result.current.setDraft('keep-me')
    })
    rerender({ v: 'new-prop' })
    // User's in-flight draft is overwritten by prop change.
    expect(result.current.draft).toBe('new-prop')
    expect(result.current.editing).toBe(false)
  })

  it('setDraft updates just the draft (not editing / error)', () => {
    const { result } = renderHook(() => useEditableState('x'))
    act(() => { result.current.setDraft('typing') })
    expect(result.current.draft).toBe('typing')
    expect(result.current.editing).toBe(false)
    expect(result.current.error).toBe(false)
  })

  it('HOOK-6.3-07: inputRef is exposed for caller-driven focus management', () => {
    const { result } = renderHook(() => useEditableState('x'))
    // The ref is an object with a .current slot (initially null).
    expect(result.current.inputRef).toBeDefined()
    expect(result.current.inputRef.current).toBeNull()
    // The hook calls inputRef.current?.focus() inside effects when editing flips
    // to true — we verify the ref exists; focus integration is covered in the
    // component-level tests that actually attach the ref to a DOM element.
  })

  it('function identities (cancel/showError/clearError/finishEditing) stable across renders with same value', () => {
    const { result, rerender } = renderHook(({ v }) => useEditableState(v), {
      initialProps: { v: 'fixed' },
    })
    const { cancel, showError, clearError, finishEditing } = result.current
    rerender({ v: 'fixed' })
    expect(result.current.cancel).toBe(cancel)
    expect(result.current.showError).toBe(showError)
    expect(result.current.clearError).toBe(clearError)
    expect(result.current.finishEditing).toBe(finishEditing)
  })
})
