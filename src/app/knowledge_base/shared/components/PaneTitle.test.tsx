import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PaneTitle from './PaneTitle'

// Covers SHELL-1.2-02..13 (title editing + dirty dot + Save/Discard buttons),
// relocated from the top-level Header into each pane's title row. Click-to-
// edit is gated on `onTitleChange`: document panes omit it to make the H1
// display-only (edits happen in the editor body).

describe('PaneTitle — display mode', () => {
  it('SHELL-1.2-02: renders the title text', () => {
    render(<PaneTitle title="My Diagram" onTitleChange={() => {}} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('My Diagram')
  })

  it('clicking the heading switches to edit mode (input focused)', () => {
    render(<PaneTitle title="Draft" onTitleChange={() => {}} />)
    fireEvent.click(screen.getByRole('heading', { level: 1 }))
    const input = screen.getByRole('textbox') as HTMLInputElement
    expect(input.value).toBe('Draft')
    expect(input).toHaveProperty('autofocus')
  })
})

describe('PaneTitle — edit mode', () => {
  function enterEdit(title = 'Original') {
    const onTitleChange = vi.fn()
    render(<PaneTitle title={title} onTitleChange={onTitleChange} />)
    fireEvent.click(screen.getByRole('heading', { level: 1 }))
    return { onTitleChange, input: screen.getByRole('textbox') as HTMLInputElement }
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
    const input = screen.getByRole('textbox')
    fireEvent.blur(input)
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('re-entering edit mode seeds draft from the CURRENT title prop', () => {
    const { rerender } = render(<PaneTitle title="A" onTitleChange={() => {}} />)
    rerender(<PaneTitle title="B" onTitleChange={() => {}} />)
    fireEvent.click(screen.getByRole('heading', { level: 1 }))
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('B')
  })
})

describe('PaneTitle — read-only mode (document pane)', () => {
  it('clicking the heading does NOT switch to edit mode when onTitleChange is omitted', () => {
    render(<PaneTitle title="Readonly Doc" />)
    fireEvent.click(screen.getByRole('heading', { level: 1 }))
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Readonly Doc')
  })
})

describe('PaneTitle — dirty dot + Save / Discard', () => {
  it('SHELL-1.2-09 negative: dirty dot is not rendered when clean', () => {
    const { container } = render(
      <PaneTitle title="x" isDirty={false} onSave={() => {}} onDiscard={() => {}} />,
    )
    expect(container.querySelector('[title="Unsaved changes"]')).toBeNull()
  })

  it('SHELL-1.2-09: dirty dot is rendered when dirty and actions exist', () => {
    const { container } = render(
      <PaneTitle title="x" isDirty onSave={() => {}} onDiscard={() => {}} />,
    )
    expect(container.querySelector('[title="Unsaved changes"]')).not.toBeNull()
  })

  it('dirty dot is suppressed when save/discard actions are absent', () => {
    const { container } = render(<PaneTitle title="x" isDirty />)
    expect(container.querySelector('[title="Unsaved changes"]')).toBeNull()
  })

  it('SHELL-1.2-11/13: Save and Discard are disabled when clean', () => {
    render(<PaneTitle title="x" hasActiveFile isDirty={false} onSave={() => {}} onDiscard={() => {}} />)
    expect((screen.getByTitle(/Save/) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTitle('Discard changes') as HTMLButtonElement).disabled).toBe(true)
  })

  it('SHELL-1.2-12: Save and Discard become enabled when dirty and has active file', () => {
    render(<PaneTitle title="x" hasActiveFile isDirty onSave={() => {}} onDiscard={() => {}} />)
    expect((screen.getByTitle(/Save/) as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByTitle('Discard changes') as HTMLButtonElement).disabled).toBe(false)
  })

  it('stays disabled when hasActiveFile is false, even if dirty', () => {
    render(<PaneTitle title="x" isDirty hasActiveFile={false} onSave={() => {}} onDiscard={() => {}} />)
    expect((screen.getByTitle(/Save/) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTitle('Discard changes') as HTMLButtonElement).disabled).toBe(true)
  })

  it('clicking Save triggers onSave', () => {
    const onSave = vi.fn()
    render(<PaneTitle title="x" hasActiveFile isDirty onSave={onSave} onDiscard={() => {}} />)
    fireEvent.click(screen.getByTitle(/Save/))
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('clicking Discard triggers onDiscard', () => {
    const onDiscard = vi.fn()
    render(<PaneTitle title="x" hasActiveFile isDirty onSave={() => {}} onDiscard={onDiscard} />)
    fireEvent.click(screen.getByTitle('Discard changes'))
    expect(onDiscard).toHaveBeenCalledTimes(1)
  })

  it('omitting onSave / onDiscard hides those buttons entirely', () => {
    render(<PaneTitle title="x" isDirty />)
    expect(screen.queryByTitle(/Save/)).toBeNull()
    expect(screen.queryByTitle('Discard changes')).toBeNull()
  })
})
