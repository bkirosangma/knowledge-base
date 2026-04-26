import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useViewport, MOBILE_BREAKPOINT_PX } from './useViewport'

// Covers SHELL-1.14-05..08. See test-cases/01-app-shell.md §1.14.

interface FakeMQL {
  matches: boolean
  media: string
  listeners: Set<(e: MediaQueryListEvent) => void>
  addEventListener: (type: 'change', l: (e: MediaQueryListEvent) => void) => void
  removeEventListener: (type: 'change', l: (e: MediaQueryListEvent) => void) => void
  fire: (matches: boolean) => void
}

let fake: FakeMQL

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

describe('useViewport', () => {
  let originalMatchMedia: typeof window.matchMedia | undefined

  beforeEach(() => {
    fake = makeFake(false, `(max-width: ${MOBILE_BREAKPOINT_PX}px)`)
    // jsdom doesn't ship matchMedia — install a stub on window directly.
    originalMatchMedia = (window as Window & { matchMedia?: typeof window.matchMedia }).matchMedia
    ;(window as unknown as { matchMedia: (q: string) => MediaQueryList }).matchMedia =
      (q: string) => { fake.media = q; return fake as unknown as MediaQueryList }
  })

  afterEach(() => {
    if (originalMatchMedia) {
      window.matchMedia = originalMatchMedia
    } else {
      delete (window as unknown as { matchMedia?: unknown }).matchMedia
    }
    vi.restoreAllMocks()
  })

  it('SHELL-1.14-05: SSR-safe — initial state is { isMobile: false }', () => {
    const { result } = renderHook(() => useViewport())
    // After mount the effect reads matchMedia (which we mocked to false).
    expect(result.current.isMobile).toBe(false)
  })

  it('SHELL-1.14-06: reads matchMedia(max-width: 900px) on mount', () => {
    fake = makeFake(true, `(max-width: ${MOBILE_BREAKPOINT_PX}px)`)
    ;(window as unknown as { matchMedia: (q: string) => MediaQueryList }).matchMedia =
      (q: string) => { fake.media = q; return fake as unknown as MediaQueryList }
    const { result } = renderHook(() => useViewport())
    expect(result.current.isMobile).toBe(true)
    expect(fake.media).toBe(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`)
  })

  it('SHELL-1.14-07: listener flips isMobile when media query changes', () => {
    const { result } = renderHook(() => useViewport())
    expect(result.current.isMobile).toBe(false)
    act(() => { fake.fire(true) })
    expect(result.current.isMobile).toBe(true)
    act(() => { fake.fire(false) })
    expect(result.current.isMobile).toBe(false)
  })

  it('SHELL-1.14-08: cleanup removes listener on unmount', () => {
    const { unmount } = renderHook(() => useViewport())
    expect(fake.listeners.size).toBe(1)
    unmount()
    expect(fake.listeners.size).toBe(0)
  })
})
