import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { ShellErrorProvider, useShellErrors } from './ShellErrorContext'
import { FileSystemError } from '../domain/errors'

// Covers SHELL-1.4-01..04 (typed error surface — Phase 5c, 2026-04-19).

const wrapper = ({ children }: { children: ReactNode }) => (
  <ShellErrorProvider>{children}</ShellErrorProvider>
)

let errSpy: ReturnType<typeof vi.spyOn>
beforeEach(() => { errSpy = vi.spyOn(console, 'error').mockImplementation(() => {}) })
afterEach(() => { errSpy.mockRestore() })

describe('ShellErrorProvider / useShellErrors', () => {
  it('SHELL-1.4-01: starts with no current error', () => {
    const { result } = renderHook(() => useShellErrors(), { wrapper })
    expect(result.current.current).toBeNull()
  })

  it('SHELL-1.4-02: reportError classifies a raw Error and publishes it', () => {
    const { result } = renderHook(() => useShellErrors(), { wrapper })
    act(() => {
      result.current.reportError(
        Object.assign(new Error('denied'), { name: 'NotAllowedError' }),
        'saving diagram',
      )
    })
    expect(result.current.current?.kind).toBe('permission')
    expect(result.current.current?.message).toBe('denied')
    expect(result.current.current?.context).toBe('saving diagram')
  })

  it('SHELL-1.4-02: reportError preserves a FileSystemError unchanged', () => {
    const err = new FileSystemError('quota-exceeded', 'full')
    const { result } = renderHook(() => useShellErrors(), { wrapper })
    act(() => { result.current.reportError(err, 'draft write') })
    expect(result.current.current?.kind).toBe('quota-exceeded')
    expect(result.current.current?.message).toBe('full')
  })

  it('SHELL-1.4-03: a second reportError replaces the first (no queue)', () => {
    const { result } = renderHook(() => useShellErrors(), { wrapper })
    act(() => {
      result.current.reportError(new FileSystemError('permission', 'a'))
    })
    act(() => {
      result.current.reportError(new FileSystemError('malformed', 'b'))
    })
    expect(result.current.current?.kind).toBe('malformed')
    expect(result.current.current?.message).toBe('b')
  })

  it('SHELL-1.4-04: dismiss clears the current error', () => {
    const { result } = renderHook(() => useShellErrors(), { wrapper })
    act(() => { result.current.reportError(new FileSystemError('unknown', 'x')) })
    expect(result.current.current).not.toBeNull()
    act(() => { result.current.dismiss() })
    expect(result.current.current).toBeNull()
  })

  it('throws if useShellErrors is called without a provider', () => {
    const errFn = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useShellErrors())).toThrow(
      /useShellErrors must be used within a ShellErrorProvider/,
    )
    errFn.mockRestore()
  })
})
