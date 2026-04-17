import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PaneHeader from './PaneHeader'

// Covers SHELL-1.6 pane-header breadcrumb + read-mode toggle.

describe('PaneHeader — breadcrumb', () => {
  it('splits filePath on "/" and renders every segment', () => {
    render(
      <PaneHeader filePath="docs/notes/intro.md" readOnly={false} onToggleReadOnly={() => {}} />,
    )
    expect(screen.getByText('docs')).toBeTruthy()
    expect(screen.getByText('notes')).toBeTruthy()
    expect(screen.getByText('intro.md')).toBeTruthy()
  })

  it('highlights only the last segment (the filename)', () => {
    render(
      <PaneHeader filePath="a/b/c.md" readOnly={false} onToggleReadOnly={() => {}} />,
    )
    // Last segment gets `text-slate-700 font-medium`.
    expect(screen.getByText('c.md').className).toContain('font-medium')
    expect(screen.getByText('a').className).not.toContain('font-medium')
    expect(screen.getByText('b').className).not.toContain('font-medium')
  })

  it('single-segment path renders without separators', () => {
    const { container } = render(
      <PaneHeader filePath="solo.md" readOnly={false} onToggleReadOnly={() => {}} />,
    )
    expect(screen.getByText('solo.md')).toBeTruthy()
    // No ChevronRight icons for single-segment.
    expect(container.querySelectorAll('svg.lucide-chevron-right').length).toBe(0)
  })
})

describe('PaneHeader — read-mode toggle', () => {
  it('button exposes aria-pressed matching the readOnly flag', () => {
    const { rerender } = render(
      <PaneHeader filePath="a.md" readOnly={false} onToggleReadOnly={() => {}} />,
    )
    const btn = screen.getByRole('button', { name: 'Enter Read Mode' })
    expect(btn.getAttribute('aria-pressed')).toBe('false')

    rerender(<PaneHeader filePath="a.md" readOnly onToggleReadOnly={() => {}} />)
    const btn2 = screen.getByRole('button', { name: 'Exit Read Mode' })
    expect(btn2.getAttribute('aria-pressed')).toBe('true')
  })

  it('button label reflects current state (Enter / Exit)', () => {
    const { rerender } = render(
      <PaneHeader filePath="a.md" readOnly={false} onToggleReadOnly={() => {}} />,
    )
    expect(screen.getByRole('button', { name: 'Enter Read Mode' })).toBeTruthy()

    rerender(<PaneHeader filePath="a.md" readOnly onToggleReadOnly={() => {}} />)
    expect(screen.getByRole('button', { name: 'Exit Read Mode' })).toBeTruthy()
  })

  it('clicking the toggle fires onToggleReadOnly', () => {
    const onToggleReadOnly = vi.fn()
    render(
      <PaneHeader filePath="a.md" readOnly={false} onToggleReadOnly={onToggleReadOnly} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Enter Read Mode' }))
    expect(onToggleReadOnly).toHaveBeenCalledTimes(1)
  })
})

describe('PaneHeader — children slot', () => {
  it('renders children after the toggle button', () => {
    render(
      <PaneHeader filePath="a.md" readOnly={false} onToggleReadOnly={() => {}}>
        <button data-testid="extra-action">Extra</button>
      </PaneHeader>,
    )
    expect(screen.getByTestId('extra-action')).toBeTruthy()
  })
})
