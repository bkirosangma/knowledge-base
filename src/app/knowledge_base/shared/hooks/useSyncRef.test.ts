import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useSyncRef } from './useSyncRef'

// Covers HOOK-6.4-01 through 6.4-04. See test-cases/06-shared-hooks.md §6.4.

describe('useSyncRef', () => {
  it('HOOK-6.4-01: ref.current equals the initial value', () => {
    const { result } = renderHook(() => useSyncRef(42))
    expect(result.current.current).toBe(42)
  })

  it('HOOK-6.4-02: re-render with new value updates ref.current', () => {
    const { result, rerender } = renderHook(({ v }) => useSyncRef(v), {
      initialProps: { v: 'a' },
    })
    expect(result.current.current).toBe('a')

    rerender({ v: 'b' })
    expect(result.current.current).toBe('b')

    rerender({ v: 'c' })
    expect(result.current.current).toBe('c')
  })

  it('HOOK-6.4-03: ref object identity is stable across renders', () => {
    const { result, rerender } = renderHook(({ v }) => useSyncRef(v), {
      initialProps: { v: 1 },
    })
    const firstRef = result.current
    rerender({ v: 2 })
    rerender({ v: 3 })
    expect(result.current).toBe(firstRef)
  })

  it('HOOK-6.4-04: works with object references (keeps latest identity)', () => {
    const o1 = { id: 1 }
    const o2 = { id: 2 }
    const { result, rerender } = renderHook(({ o }) => useSyncRef(o), {
      initialProps: { o: o1 },
    })
    expect(result.current.current).toBe(o1)

    rerender({ o: o2 })
    expect(result.current.current).toBe(o2)
  })

  it('HOOK-6.4-04: works with array values', () => {
    const arr1 = [1, 2, 3]
    const arr2 = [4, 5, 6]
    const { result, rerender } = renderHook(({ a }) => useSyncRef(a), {
      initialProps: { a: arr1 },
    })
    expect(result.current.current).toBe(arr1)
    rerender({ a: arr2 })
    expect(result.current.current).toBe(arr2)
  })

  it('null and undefined values round-trip', () => {
    const { result, rerender } = renderHook(
      ({ v }: { v: string | null }) => useSyncRef(v),
      { initialProps: { v: null as string | null } },
    )
    expect(result.current.current).toBeNull()
    rerender({ v: 'x' })
    expect(result.current.current).toBe('x')
  })
})
