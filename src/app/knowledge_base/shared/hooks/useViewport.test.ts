import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  useViewport,
  MOBILE_BREAKPOINT_PX,
  COMPACT_BREAKPOINT_PX,
} from './useViewport'

// Covers SHELL-1.14-05..08 (mobile breakpoint) and KB-013 compact breakpoint.

interface FakeMQL {
  matches: boolean
  media: string
  listeners: Set<(e: MediaQueryListEvent) => void>
  addEventListener: (type: 'change', l: (e: MediaQueryListEvent) => void) => void
  removeEventListener: (type: 'change', l: (e: MediaQueryListEvent) => void) => void
  fire: (matches: boolean) => void
}

function makeFake(matches: boolean, media: string): FakeMQL {
  const listeners = new Set<(e: MediaQueryListEvent) => void>()
  return {
    matches,
    media,
    listeners,
    addEventListener: (_type, l) => { listeners.add(l) },
    removeEventListener: (_type, l) => { listeners.delete(l) },
    fire(next: boolean) {
      this.matches = next
      const e = { matches: next, media } as unknown as MediaQueryListEvent
      listeners.forEach((l) => l(e))
    },
  }
}

// Per-query fake registry — useViewport now subscribes to two media
// queries, so a single shared fake is no longer enough.
const fakes = new Map<string, FakeMQL>()

function ensureFake(media: string, defaultMatches = false): FakeMQL {
  let f = fakes.get(media)
  if (!f) {
    f = makeFake(defaultMatches, media)
    fakes.set(media, f)
  }
  return f
}

const MOBILE_Q = `(max-width: ${MOBILE_BREAKPOINT_PX}px)`
const COMPACT_Q = `(max-width: ${COMPACT_BREAKPOINT_PX}px)`

describe('useViewport', () => {
  let originalMatchMedia: typeof window.matchMedia | undefined

  beforeEach(() => {
    fakes.clear()
    ensureFake(MOBILE_Q, false)
    ensureFake(COMPACT_Q, false)
    originalMatchMedia = (window as Window & { matchMedia?: typeof window.matchMedia }).matchMedia
    ;(window as unknown as { matchMedia: (q: string) => MediaQueryList }).matchMedia =
      (q: string) => ensureFake(q, false) as unknown as MediaQueryList
  })

  afterEach(() => {
    if (originalMatchMedia) {
      window.matchMedia = originalMatchMedia
    } else {
      delete (window as unknown as { matchMedia?: unknown }).matchMedia
    }
    vi.restoreAllMocks()
  })

  it('SHELL-1.14-05: SSR-safe — initial state is { isMobile: false, isCompact: false }', () => {
    const { result } = renderHook(() => useViewport())
    expect(result.current.isMobile).toBe(false)
    expect(result.current.isCompact).toBe(false)
  })

  it('SHELL-1.14-06: reads both breakpoints on mount', () => {
    fakes.clear()
    ensureFake(MOBILE_Q, true)
    ensureFake(COMPACT_Q, true)
    const { result } = renderHook(() => useViewport())
    expect(result.current.isMobile).toBe(true)
    expect(result.current.isCompact).toBe(true)
    // Both queries were registered.
    expect(fakes.has(MOBILE_Q)).toBe(true)
    expect(fakes.has(COMPACT_Q)).toBe(true)
  })

  it('SHELL-1.14-07: listener flips isMobile independently of isCompact', () => {
    const { result } = renderHook(() => useViewport())
    expect(result.current.isMobile).toBe(false)
    expect(result.current.isCompact).toBe(false)
    act(() => { fakes.get(MOBILE_Q)!.fire(true) })
    expect(result.current.isMobile).toBe(true)
    expect(result.current.isCompact).toBe(false)
    act(() => { fakes.get(MOBILE_Q)!.fire(false) })
    expect(result.current.isMobile).toBe(false)
  })

  it('KB-013: isCompact flips at the compact breakpoint independently', () => {
    const { result } = renderHook(() => useViewport())
    expect(result.current.isCompact).toBe(false)
    act(() => { fakes.get(COMPACT_Q)!.fire(true) })
    expect(result.current.isCompact).toBe(true)
    expect(result.current.isMobile).toBe(false)
  })

  it('SHELL-1.14-08: cleanup removes both listeners on unmount', () => {
    const { unmount } = renderHook(() => useViewport())
    expect(fakes.get(MOBILE_Q)!.listeners.size).toBe(1)
    expect(fakes.get(COMPACT_Q)!.listeners.size).toBe(1)
    unmount()
    expect(fakes.get(MOBILE_Q)!.listeners.size).toBe(0)
    expect(fakes.get(COMPACT_Q)!.listeners.size).toBe(0)
  })
})
