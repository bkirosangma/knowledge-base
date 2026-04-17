import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ConfirmPopover from './ConfirmPopover'

// Covers FS-2.4-01 through FS-2.4-08 area (confirm popover + don't-ask flag).

describe('ConfirmPopover', () => {
  it('renders the message and both action buttons', () => {
    render(
      <ConfirmPopover
        message="Delete this file?"
        onConfirm={() => {}}
        onCancel={() => {}}
        position={{ x: 50, y: 50 }}
      />,
    )
    expect(screen.getByText('Delete this file?')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeTruthy()
  })

  it('uses custom confirm label when provided', () => {
    render(
      <ConfirmPopover
        message="?"
        onConfirm={() => {}}
        onCancel={() => {}}
        position={{ x: 0, y: 0 }}
        confirmLabel="Delete"
      />,
    )
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy()
  })

  it('confirm button background reflects confirmColor prop', () => {
    const { rerender } = render(
      <ConfirmPopover
        message="?"
        onConfirm={() => {}}
        onCancel={() => {}}
        position={{ x: 0, y: 0 }}
        confirmColor="red"
      />,
    )
    expect(screen.getByRole('button', { name: 'Confirm' }).className).toContain('bg-red-600')

    rerender(
      <ConfirmPopover
        message="?"
        onConfirm={() => {}}
        onCancel={() => {}}
        position={{ x: 0, y: 0 }}
        confirmColor="blue"
      />,
    )
    expect(screen.getByRole('button', { name: 'Confirm' }).className).toContain('bg-blue-600')
  })

  it('clicking Cancel calls onCancel', () => {
    const onCancel = vi.fn()
    render(
      <ConfirmPopover
        message="?"
        onConfirm={() => {}}
        onCancel={onCancel}
        position={{ x: 0, y: 0 }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('clicking Confirm calls onConfirm', () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmPopover
        message="?"
        onConfirm={onConfirm}
        onCancel={() => {}}
        position={{ x: 0, y: 0 }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('Escape key triggers onCancel', () => {
    const onCancel = vi.fn()
    render(
      <ConfirmPopover
        message="?"
        onConfirm={() => {}}
        onCancel={onCancel}
        position={{ x: 0, y: 0 }}
      />,
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('non-Escape keys do not close', () => {
    const onCancel = vi.fn()
    render(
      <ConfirmPopover
        message="?"
        onConfirm={() => {}}
        onCancel={onCancel}
        position={{ x: 0, y: 0 }}
      />,
    )
    fireEvent.keyDown(window, { key: 'Enter' })
    fireEvent.keyDown(window, { key: 'a' })
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('outside mousedown triggers onCancel', () => {
    const onCancel = vi.fn()
    render(
      <ConfirmPopover
        message="?"
        onConfirm={() => {}}
        onCancel={onCancel}
        position={{ x: 0, y: 0 }}
      />,
    )
    // A mousedown on document.body is outside the popover.
    fireEvent.mouseDown(document.body)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('mousedown inside the popover does NOT close', () => {
    const onCancel = vi.fn()
    render(
      <ConfirmPopover
        message="hello"
        onConfirm={() => {}}
        onCancel={onCancel}
        position={{ x: 0, y: 0 }}
      />,
    )
    fireEvent.mouseDown(screen.getByText('hello'))
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('showDontAsk=false hides the checkbox', () => {
    render(
      <ConfirmPopover
        message="?"
        onConfirm={() => {}}
        onCancel={() => {}}
        position={{ x: 0, y: 0 }}
      />,
    )
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('showDontAsk=true renders the checkbox and reports changes via onDontAskChange', () => {
    const onDontAskChange = vi.fn()
    render(
      <ConfirmPopover
        message="?"
        onConfirm={() => {}}
        onCancel={() => {}}
        position={{ x: 0, y: 0 }}
        showDontAsk
        onDontAskChange={onDontAskChange}
      />,
    )
    const cb = screen.getByRole('checkbox') as HTMLInputElement
    expect(cb.checked).toBe(false)
    fireEvent.click(cb)
    expect(cb.checked).toBe(true)
    expect(onDontAskChange).toHaveBeenCalledWith(true)
  })

  it('position prop is reflected in the root element style', () => {
    const { container } = render(
      <ConfirmPopover
        message="?"
        onConfirm={() => {}}
        onCancel={() => {}}
        position={{ x: 100, y: 200 }}
      />,
    )
    const root = container.firstChild as HTMLDivElement
    // Initial render uses the raw position (the useLayoutEffect-style clamp
    // runs with getBoundingClientRect → which is 0 in jsdom, so no clamping).
    expect(root.style.left).toBe('100px')
    expect(root.style.top).toBe('200px')
  })
})
