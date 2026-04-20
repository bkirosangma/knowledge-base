import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useDocumentKeyboardShortcuts } from './useDocumentKeyboardShortcuts'

function fireKey(key: string, metaKey = true, shiftKey = false) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, metaKey, ctrlKey: false, shiftKey, bubbles: true }))
}

function fireKeyCtrl(key: string, shiftKey = false) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, metaKey: false, ctrlKey: true, shiftKey, bubbles: true }))
}

describe('useDocumentKeyboardShortcuts', () => {
  let onUndo: ReturnType<typeof vi.fn>
  let onRedo: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onUndo = vi.fn()
    onRedo = vi.fn()
  })

  it('calls onUndo on Cmd+Z', () => {
    renderHook(() => useDocumentKeyboardShortcuts({ onUndo, onRedo, readOnly: false }))
    fireKey('z')
    expect(onUndo).toHaveBeenCalledTimes(1)
    expect(onRedo).not.toHaveBeenCalled()
  })

  it('calls onRedo on Cmd+Shift+Z', () => {
    renderHook(() => useDocumentKeyboardShortcuts({ onUndo, onRedo, readOnly: false }))
    fireKey('z', true, true)
    expect(onRedo).toHaveBeenCalledTimes(1)
    expect(onUndo).not.toHaveBeenCalled()
  })

  it('calls onUndo on Ctrl+Z (non-Mac)', () => {
    renderHook(() => useDocumentKeyboardShortcuts({ onUndo, onRedo, readOnly: false }))
    fireKeyCtrl('z')
    expect(onUndo).toHaveBeenCalledTimes(1)
  })

  it('does nothing when readOnly is true', () => {
    renderHook(() => useDocumentKeyboardShortcuts({ onUndo, onRedo, readOnly: true }))
    fireKey('z')
    fireKey('z', true, true)
    expect(onUndo).not.toHaveBeenCalled()
    expect(onRedo).not.toHaveBeenCalled()
  })
})
