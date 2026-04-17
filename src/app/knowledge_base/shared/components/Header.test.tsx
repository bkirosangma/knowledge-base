import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import Header from './Header'

// Covers SHELL-1.2-02 through 1.2-13, plus 1.2-18/19 (split toggle).
// 1.2-01 (Back link) is a Next.js Link interaction — deferred to Playwright.
// 1.2-14..17 confirm-popover integration is covered in [ConfirmPopover + useFileActions]; 1.2-20/21 keyboard shortcuts live in the shell integration bucket.

interface SetupOverrides {
  title?: string
  isDirty?: boolean
  hasActiveFile?: boolean
  isSplit?: boolean
  onToggleSplit?: () => void
  onSave?: () => void
  onDiscard?: (e: React.MouseEvent) => void
  onTitleCommit?: (v: string) => void
}

/** Controlled wrapper that keeps `title` and `titleInputValue` in sync
    so the input value changes as the user types. */
function ControlledHeader(props: SetupOverrides) {
  const [title, setTitle] = useState(props.title ?? 'Original')
  const [input, setInput] = useState(props.title ?? 'Original')
  const [width, setWidth] = useState<number | string>(200)
  return (
    <Header
      title={title}
      titleInputValue={input}
      setTitleInputValue={setInput}
      titleWidth={width}
      setTitleWidth={setWidth}
      onTitleCommit={(v) => {
        setTitle(v)
        props.onTitleCommit?.(v)
      }}
      isDirty={props.isDirty ?? false}
      hasActiveFile={props.hasActiveFile ?? true}
      onDiscard={props.onDiscard ?? (() => {})}
      onSave={props.onSave ?? (() => {})}
      isSplit={props.isSplit}
      onToggleSplit={props.onToggleSplit}
    />
  )
}

describe('Header — title editing', () => {
  it('SHELL-1.2-02: title input shows the current title on render', () => {
    render(<ControlledHeader title="My File" />)
    const input = screen.getByTitle('Click to edit title') as HTMLInputElement
    expect(input.value).toBe('My File')
  })

  it('SHELL-1.2-04/06: blur commits a changed, trimmed title', () => {
    const onTitleCommit = vi.fn()
    render(<ControlledHeader title="A" onTitleCommit={onTitleCommit} />)
    const input = screen.getByTitle('Click to edit title') as HTMLInputElement
    fireEvent.change(input, { target: { value: '  B  ' } })
    fireEvent.blur(input)
    expect(onTitleCommit).toHaveBeenCalledWith('B')
  })

  it('SHELL-1.2-04: Enter blurs the input (and commits)', () => {
    const onTitleCommit = vi.fn()
    render(<ControlledHeader title="A" onTitleCommit={onTitleCommit} />)
    const input = screen.getByTitle('Click to edit title') as HTMLInputElement
    input.focus() // blur() requires a focused element to dispatch a blur event
    fireEvent.change(input, { target: { value: 'New' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onTitleCommit).toHaveBeenCalledWith('New')
  })

  it('SHELL-1.2-06 negative: blur with unchanged value does NOT commit', () => {
    const onTitleCommit = vi.fn()
    render(<ControlledHeader title="Keep" onTitleCommit={onTitleCommit} />)
    const input = screen.getByTitle('Click to edit title') as HTMLInputElement
    fireEvent.blur(input)
    expect(onTitleCommit).not.toHaveBeenCalled()
  })

  it('blur with whitespace-only value restores the original title and does not commit', () => {
    const onTitleCommit = vi.fn()
    render(<ControlledHeader title="Keep" onTitleCommit={onTitleCommit} />)
    const input = screen.getByTitle('Click to edit title') as HTMLInputElement
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.blur(input)
    expect(onTitleCommit).not.toHaveBeenCalled()
    expect(input.value).toBe('Keep')
  })

  it('SHELL-1.2-05: Escape reverts to the pre-focus title (not committed)', () => {
    const onTitleCommit = vi.fn()
    render(<ControlledHeader title="Origin" onTitleCommit={onTitleCommit} />)
    const input = screen.getByTitle('Click to edit title') as HTMLInputElement
    // Simulate focus first so the "titleBeforeEdit" ref captures the current title.
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Edited' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(input.value).toBe('Origin')
    expect(onTitleCommit).not.toHaveBeenCalled()
  })

  it('SHELL-1.2-07: input enforces 80-character cap via maxLength', () => {
    render(<ControlledHeader />)
    const input = screen.getByTitle('Click to edit title') as HTMLInputElement
    expect(input.maxLength).toBe(80)
  })
})

describe('Header — dirty / save / discard buttons', () => {
  it('SHELL-1.2-09: dirty indicator is NOT rendered when clean', () => {
    const { container } = render(<ControlledHeader isDirty={false} />)
    expect(container.querySelector('[title="Unsaved changes"]')).toBeNull()
  })

  it('SHELL-1.2-09: dirty indicator appears when isDirty', () => {
    const { container } = render(<ControlledHeader isDirty />)
    expect(container.querySelector('[title="Unsaved changes"]')).not.toBeNull()
  })

  it('SHELL-1.2-11/13: Save and Discard are disabled when clean', () => {
    render(<ControlledHeader isDirty={false} />)
    const save = screen.getByTitle(/Save/) as HTMLButtonElement
    const discard = screen.getByTitle('Discard changes') as HTMLButtonElement
    expect(save.disabled).toBe(true)
    expect(discard.disabled).toBe(true)
  })

  it('SHELL-1.2-12: Save and Discard become enabled when isDirty && hasActiveFile', () => {
    render(<ControlledHeader isDirty hasActiveFile />)
    const save = screen.getByTitle(/Save/) as HTMLButtonElement
    const discard = screen.getByTitle('Discard changes') as HTMLButtonElement
    expect(save.disabled).toBe(false)
    expect(discard.disabled).toBe(false)
  })

  it('buttons stay disabled when hasActiveFile is false, even if isDirty', () => {
    render(<ControlledHeader isDirty hasActiveFile={false} />)
    expect((screen.getByTitle(/Save/) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTitle('Discard changes') as HTMLButtonElement).disabled).toBe(true)
  })

  it('clicking Save triggers onSave', () => {
    const onSave = vi.fn()
    render(<ControlledHeader isDirty onSave={onSave} />)
    fireEvent.click(screen.getByTitle(/Save/))
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('clicking Discard triggers onDiscard', () => {
    const onDiscard = vi.fn()
    render(<ControlledHeader isDirty onDiscard={onDiscard} />)
    fireEvent.click(screen.getByTitle('Discard changes'))
    expect(onDiscard).toHaveBeenCalledTimes(1)
  })
})

describe('Header — split view toggle', () => {
  it('split toggle is not rendered when onToggleSplit is omitted', () => {
    render(<ControlledHeader />)
    expect(screen.queryByTitle(/Split view|Exit split view/)).toBeNull()
  })

  it('split toggle renders when onToggleSplit is provided (isSplit=false)', () => {
    render(<ControlledHeader onToggleSplit={() => {}} isSplit={false} />)
    expect(screen.getByTitle('Split view')).toBeTruthy()
  })

  it('title changes to "Exit split view" when isSplit=true', () => {
    render(<ControlledHeader onToggleSplit={() => {}} isSplit />)
    expect(screen.getByTitle('Exit split view')).toBeTruthy()
  })

  it('SHELL-1.2-18/19: clicking split toggle fires onToggleSplit', () => {
    const onToggleSplit = vi.fn()
    render(<ControlledHeader onToggleSplit={onToggleSplit} />)
    fireEvent.click(screen.getByTitle('Split view'))
    expect(onToggleSplit).toHaveBeenCalledTimes(1)
  })
})
