import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PaneTitle from './PaneTitle'

// Covers SHELL-1.6 area for inline-editable pane titles.

describe('PaneTitle — display mode', () => {
  it('renders the title text', () => {
    render(<PaneTitle title="My Diagram" />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('My Diagram')
  })

  it('clicking the heading switches to edit mode (input with autofocus)', () => {
    render(<PaneTitle title="Draft" />)
    fireEvent.click(screen.getByRole('heading', { level: 1 }))
    const input = screen.getByRole('textbox') as HTMLInputElement
    expect(input.value).toBe('Draft')
    // autoFocus prop is applied.
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

  it('Enter blurs the input and commits the change', () => {
    const { input, onTitleChange } = enterEdit('Original')
    fireEvent.change(input, { target: { value: 'New' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    // Enter triggers blur → onTitleChange fired with trimmed value.
    expect(onTitleChange).toHaveBeenCalledWith('New')
  })

  it('trims whitespace around the committed title', () => {
    const { input, onTitleChange } = enterEdit('x')
    fireEvent.change(input, { target: { value: '  spaced  ' } })
    fireEvent.blur(input)
    expect(onTitleChange).toHaveBeenCalledWith('spaced')
  })

  it('blur without change does NOT call onTitleChange', () => {
    const { input, onTitleChange } = enterEdit('Same')
    fireEvent.blur(input)
    expect(onTitleChange).not.toHaveBeenCalled()
  })

  it('blur with empty (trimmed) value does NOT commit', () => {
    const { input, onTitleChange } = enterEdit('x')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.blur(input)
    expect(onTitleChange).not.toHaveBeenCalled()
  })

  it('Escape cancels — draft reverts and edit mode exits', () => {
    const { input, onTitleChange } = enterEdit('Keep')
    fireEvent.change(input, { target: { value: 'Discarded' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    // Back to heading with the original title.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Keep')
    expect(onTitleChange).not.toHaveBeenCalled()
  })

  it('blur exits edit mode regardless of commit', () => {
    enterEdit('x')
    const input = screen.getByRole('textbox')
    fireEvent.blur(input)
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('works in uncontrolled mode (no onTitleChange)', () => {
    render(<PaneTitle title="Readonly" />)
    fireEvent.click(screen.getByRole('heading', { level: 1 }))
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Anything' } })
    fireEvent.blur(input)
    // No crash; heading back to Readonly (prop unchanged).
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Readonly')
  })

  it('re-entering edit mode seeds draft from the CURRENT title prop', () => {
    const { rerender } = render(<PaneTitle title="A" />)
    rerender(<PaneTitle title="B" />)
    fireEvent.click(screen.getByRole('heading', { level: 1 }))
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('B')
  })
})
