import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { FooterProvider, useFooterContext } from './FooterContext'
import type { ReactNode } from 'react'

function wrapper({ children }: { children: ReactNode }) {
  return <FooterProvider>{children}</FooterProvider>
}

describe('FooterContext', () => {
  it('throws when consumed outside a provider', () => {
    expect(() =>
      renderHook(() => useFooterContext()),
    ).toThrow(/useFooterContext must be used within FooterProvider/)
  })

  it('initial state: both leftInfo and rightInfo are null', () => {
    const { result } = renderHook(() => useFooterContext(), { wrapper })
    expect(result.current.leftInfo).toBeNull()
    expect(result.current.rightInfo).toBeNull()
  })

  it('setLeftInfo / setRightInfo round-trip DiagramFooterBridge payloads', () => {
    const { result } = renderHook(() => useFooterContext(), { wrapper })
    const info = {
      kind: 'diagram' as const,
      world: { w: 1000, h: 800 },
      patches: 3,
      zoom: 1.25,
    }
    act(() => { result.current.setLeftInfo(info) })
    expect(result.current.leftInfo).toEqual(info)
    expect(result.current.rightInfo).toBeNull()

    act(() => { result.current.setRightInfo(info) })
    expect(result.current.rightInfo).toEqual(info)
  })

  it('setLeftInfo(null) clears the slot', () => {
    const { result } = renderHook(() => useFooterContext(), { wrapper })
    const info = {
      kind: 'diagram' as const,
      world: { w: 10, h: 10 }, patches: 0, zoom: 1,
    }
    act(() => { result.current.setLeftInfo(info) })
    act(() => { result.current.setLeftInfo(null) })
    expect(result.current.leftInfo).toBeNull()
  })

  it('function identities stay stable across state changes (useCallback)', () => {
    const { result } = renderHook(() => useFooterContext(), { wrapper })
    const setLeft = result.current.setLeftInfo
    const setRight = result.current.setRightInfo
    act(() => { result.current.setLeftInfo({
      kind: 'diagram', world: { w: 1, h: 1 }, patches: 0, zoom: 1,
    }) })
    expect(result.current.setLeftInfo).toBe(setLeft)
    expect(result.current.setRightInfo).toBe(setRight)
  })
})
