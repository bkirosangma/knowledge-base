import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PaneHeader from './PaneHeader'

// Covers SHELL-1.6 (pane-header breadcrumb + read-mode toggle) and
// SHELL-1.12 (PaneTitle folded into PaneHeader on 2026-04-26 — title input,
// dirty dot, Save / Discard now live inside the breadcrumb row).

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

  it('single-segment path hides the breadcrumb entirely (KB-013)', () => {
    const { container, queryByTestId } = render(
      <PaneHeader filePath="solo.md" readOnly={false} onToggleReadOnly={() => {}} />,
    )
    // Root-level files: no breadcrumb element renders at all.
    expect(queryByTestId('pane-breadcrumb')).toBeNull()
    expect(screen.queryByText('solo.md')).toBeNull()
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

// SHELL-1.12 — title row folded into the breadcrumb. Cases below replace the
// removed PaneTitle.test.tsx (SHELL-1.2-02..13).

describe('PaneHeader — title display mode', () => {
  it('SHELL-1.2-02: renders the title text when provided', () => {
    render(
      <PaneHeader filePath="a.md" readOnly={false} onToggleReadOnly={() => {}} title="My Diagram" onTitleChange={() => {}} />,
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('My Diagram')
  })

  it('omits the title section entirely when no title prop is passed', () => {
    render(<PaneHeader filePath="a.md" readOnly={false} onToggleReadOnly={() => {}} />)
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
  })

  it('clicking the heading switches to edit mode (input focused)', () => {
    render(<PaneHeader filePath="a.md" readOnly={false} onToggleReadOnly={() => {}} title="Draft" onTitleChange={() => {}} />)
    fireEvent.click(screen.getByRole('heading', { level: 1 }))
    const input = screen.getByTestId('pane-title-input') as HTMLInputElement
    expect(input.value).toBe('Draft')
    expect(input).toHaveProperty('autofocus')
  })
})

describe('PaneHeader — title edit mode', () => {
  function enterEdit(title = 'Original') {
    const onTitleChange = vi.fn()
    render(
      <PaneHeader filePath="a.md" readOnly={false} onToggleReadOnly={() => {}} title={title} onTitleChange={onTitleChange} />,
    )
    fireEvent.click(screen.getByRole('heading', { level: 1 }))
    return { onTitleChange, input: screen.getByTestId('pane-title-input') as HTMLInputElement }
  }

  it('typing updates the draft but does not commit', () => {
    const { input, onTitleChange } = enterEdit('Original')
    fireEvent.change(input, { target: { value: 'Edited' } })
    expect(input.value).toBe('Edited')
    expect(onTitleChange).not.toHaveBeenCalled()
  })

  it('SHELL-1.2-04: Enter blurs the input and commits the change', () => {
    const { input, onTitleChange } = enterEdit('Original')
    fireEvent.change(input, { target: { value: 'New' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onTitleChange).toHaveBeenCalledWith('New')
  })

  it('SHELL-1.2-06: trims whitespace around the committed title', () => {
    const { input, onTitleChange } = enterEdit('x')
    fireEvent.change(input, { target: { value: '  spaced  ' } })
    fireEvent.blur(input)
    expect(onTitleChange).toHaveBeenCalledWith('spaced')
  })

  it('SHELL-1.2-06 negative: blur without change does NOT call onTitleChange', () => {
    const { input, onTitleChange } = enterEdit('Same')
    fireEvent.blur(input)
    expect(onTitleChange).not.toHaveBeenCalled()
  })

  it('SHELL-1.2-06 negative: blur with empty (trimmed) value does NOT commit', () => {
    const { input, onTitleChange } = enterEdit('x')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.blur(input)
    expect(onTitleChange).not.toHaveBeenCalled()
  })

  it('SHELL-1.2-05: Escape cancels — draft reverts and edit mode exits', () => {
    const { input, onTitleChange } = enterEdit('Keep')
    fireEvent.change(input, { target: { value: 'Discarded' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Keep')
    expect(onTitleChange).not.toHaveBeenCalled()
  })

  it('blur exits edit mode regardless of commit', () => {
    enterEdit('x')
    const input = screen.getByTestId('pane-title-input')
    fireEvent.blur(input)
    expect(screen.queryByTestId('pane-title-input')).toBeNull()
  })

  it('re-entering edit mode seeds draft from the CURRENT title prop', () => {
    const { rerender } = render(
      <PaneHeader filePath="a.md" readOnly={false} onToggleReadOnly={() => {}} title="A" onTitleChange={() => {}} />,
    )
    rerender(
      <PaneHeader filePath="a.md" readOnly={false} onToggleReadOnly={() => {}} title="B" onTitleChange={() => {}} />,
    )
    fireEvent.click(screen.getByRole('heading', { level: 1 }))
    expect((screen.getByTestId('pane-title-input') as HTMLInputElement).value).toBe('B')
  })
})

describe('PaneHeader — read-only title (document pane)', () => {
  it('clicking the heading does NOT switch to edit mode when onTitleChange is omitted', () => {
    render(
      <PaneHeader filePath="a.md" readOnly={false} onToggleReadOnly={() => {}} title="Readonly Doc" />,
    )
    fireEvent.click(screen.getByRole('heading', { level: 1 }))
    expect(screen.queryByTestId('pane-title-input')).toBeNull()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Readonly Doc')
  })
})

describe('PaneHeader — dirty dot + Save / Discard', () => {
  it('SHELL-1.2-09 negative: dirty dot is not rendered when clean', () => {
    render(
      <PaneHeader filePath="a.md" readOnly={false} onToggleReadOnly={() => {}} title="x" isDirty={false} onSave={() => {}} onDiscard={() => {}} />,
    )
    expect(screen.queryByTestId('pane-title-dirty-dot')).toBeNull()
  })

  it('SHELL-1.2-09: dirty dot is rendered when dirty and actions exist', () => {
    render(
      <PaneHeader filePath="a.md" readOnly={false} onToggleReadOnly={() => {}} title="x" isDirty onSave={() => {}} onDiscard={() => {}} />,
    )
    expect(screen.getByTestId('pane-title-dirty-dot')).toBeTruthy()
  })

  it('SHELL-1.2-27 (KB-032): title text prepends "•" when dirty + has Save/Discard', () => {
    render(
      <PaneHeader filePath="a.md" readOnly={false} onToggleReadOnly={() => {}} title="MyDoc" isDirty onSave={() => {}} onDiscard={() => {}} />,
    )
    expect(screen.getByTestId('pane-title').textContent).toBe('• MyDoc')
  })

  it('SHELL-1.2-27 (KB-032) negative: title text omits "•" when clean', () => {
    render(
      <PaneHeader filePath="a.md" readOnly={false} onToggleReadOnly={() => {}} title="MyDoc" isDirty={false} onSave={() => {}} onDiscard={() => {}} />,
    )
    expect(screen.getByTestId('pane-title').textContent).toBe('MyDoc')
  })

  it('SHELL-1.2-27 (KB-032) negative: title text omits "•" when actions are absent', () => {
    render(
      <PaneHeader filePath="a.md" readOnly={false} onToggleReadOnly={() => {}} title="MyDoc" isDirty />,
    )
    expect(screen.getByTestId('pane-title').textContent).toBe('MyDoc')
  })

  it('SHELL-1.2-28 (KB-032): dirty dot exposes aria-label="Modified" for screen readers', () => {
    render(
      <PaneHeader filePath="a.md" readOnly={false} onToggleReadOnly={() => {}} title="x" isDirty onSave={() => {}} onDiscard={() => {}} />,
    )
    const dot = screen.getByTestId('pane-title-dirty-dot')
    expect(dot.getAttribute('aria-label')).toBe('Modified')
  })

  it('dirty dot is suppressed when save/discard actions are absent', () => {
    render(
      <PaneHeader filePath="a.md" readOnly={false} onToggleReadOnly={() => {}} title="x" isDirty />,
    )
    expect(screen.queryByTestId('pane-title-dirty-dot')).toBeNull()
  })

  it('SHELL-1.2-11/13: Save and Discard are disabled when clean', () => {
    render(
      <PaneHeader filePath="a.md" readOnly={false} onToggleReadOnly={() => {}} title="x" hasActiveFile isDirty={false} onSave={() => {}} onDiscard={() => {}} />,
    )
    expect((screen.getByRole("button", { name: /^save/i }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByLabelText('Discard changes') as HTMLButtonElement).disabled).toBe(true)
  })

  it('SHELL-1.2-12: Save and Discard become enabled when dirty and has active file', () => {
    render(
      <PaneHeader filePath="a.md" readOnly={false} onToggleReadOnly={() => {}} title="x" hasActiveFile isDirty onSave={() => {}} onDiscard={() => {}} />,
    )
    expect((screen.getByRole("button", { name: /^save/i }) as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByLabelText('Discard changes') as HTMLButtonElement).disabled).toBe(false)
  })

  it('stays disabled when hasActiveFile is false, even if dirty', () => {
    render(
      <PaneHeader filePath="a.md" readOnly={false} onToggleReadOnly={() => {}} title="x" isDirty hasActiveFile={false} onSave={() => {}} onDiscard={() => {}} />,
    )
    expect((screen.getByRole("button", { name: /^save/i }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByLabelText('Discard changes') as HTMLButtonElement).disabled).toBe(true)
  })

  it('clicking Save triggers onSave', () => {
    const onSave = vi.fn()
    render(
      <PaneHeader filePath="a.md" readOnly={false} onToggleReadOnly={() => {}} title="x" hasActiveFile isDirty onSave={onSave} onDiscard={() => {}} />,
    )
    fireEvent.click(screen.getByRole("button", { name: /^save/i }))
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('clicking Discard triggers onDiscard', () => {
    const onDiscard = vi.fn()
    render(
      <PaneHeader filePath="a.md" readOnly={false} onToggleReadOnly={() => {}} title="x" hasActiveFile isDirty onSave={() => {}} onDiscard={onDiscard} />,
    )
    fireEvent.click(screen.getByLabelText('Discard changes'))
    expect(onDiscard).toHaveBeenCalledTimes(1)
  })

  it('omitting onSave / onDiscard hides those buttons entirely', () => {
    render(<PaneHeader filePath="a.md" readOnly={false} onToggleReadOnly={() => {}} title="x" isDirty />)
    expect(screen.queryByTitle(/Save/)).toBeNull()
    expect(screen.queryByTitle('Discard changes')).toBeNull()
  })
})

describe('PaneHeader — hideTitleControls (Focus Mode)', () => {
  it('hides the title input + Save/Discard when hideTitleControls is true', () => {
    render(
      <PaneHeader
        filePath="a.md"
        readOnly={false}
        onToggleReadOnly={() => {}}
        title="x"
        hasActiveFile
        isDirty
        onSave={() => {}}
        onDiscard={() => {}}
        hideTitleControls
      />,
    )
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
    expect(screen.queryByTitle(/Save/)).toBeNull()
    expect(screen.queryByTitle('Discard changes')).toBeNull()
  })
})
