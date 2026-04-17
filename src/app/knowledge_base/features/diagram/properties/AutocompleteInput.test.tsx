import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AutocompleteInput } from './AutocompleteInput'

// Covers DIAG-3.13-08 (type classifier input) behaviour. Reusable across
// properties panels for autocomplete-backed string fields.

describe('AutocompleteInput — display mode', () => {
  it('renders label and current value', () => {
    render(
      <AutocompleteInput
        label="Type"
        value="service"
        suggestions={['service', 'database']}
        onCommit={() => true}
      />,
    )
    expect(screen.getByText('Type')).toBeTruthy()
    expect(screen.getByText('service')).toBeTruthy()
  })

  it('shows "None" placeholder when value is empty', () => {
    render(
      <AutocompleteInput
        label="Type"
        value=""
        suggestions={[]}
        onCommit={() => true}
      />,
    )
    expect(screen.getByText('None')).toBeTruthy()
  })

  it('clear button appears only when value is non-empty AND onClear is given', () => {
    const { rerender } = render(
      <AutocompleteInput
        label="Type"
        value=""
        suggestions={[]}
        onCommit={() => true}
        onClear={() => {}}
      />,
    )
    // Empty value → no clear button (it's only rendered when `value` is truthy).
    expect(document.querySelector('button')).toBeNull()

    rerender(
      <AutocompleteInput
        label="Type"
        value="x"
        suggestions={[]}
        onCommit={() => true}
        onClear={() => {}}
      />,
    )
    expect(document.querySelector('button')).not.toBeNull()
  })

  it('clear button click calls onClear (without opening edit mode)', () => {
    const onClear = vi.fn()
    render(
      <AutocompleteInput
        label="Type"
        value="service"
        suggestions={[]}
        onCommit={() => true}
        onClear={onClear}
      />,
    )
    fireEvent.click(document.querySelector('button')!)
    expect(onClear).toHaveBeenCalledTimes(1)
    // Should not enter edit mode.
    expect(document.querySelector('input')).toBeNull()
  })

  it('double-click enters edit mode with the current value as draft', () => {
    render(
      <AutocompleteInput
        label="Type"
        value="service"
        suggestions={['service', 'database']}
        onCommit={() => true}
      />,
    )
    fireEvent.doubleClick(screen.getByText('service'))
    const input = document.querySelector('input') as HTMLInputElement
    expect(input).toBeDefined()
    expect(input.value).toBe('service')
  })
})

describe('AutocompleteInput — edit mode', () => {
  function enterEdit({
    value = 'service',
    suggestions = ['service', 'database', 'queue', 'cache'],
    onCommit = vi.fn(() => true),
  }: {
    value?: string
    suggestions?: string[]
    onCommit?: (v: string) => boolean
  } = {}) {
    render(
      <AutocompleteInput
        label="Type"
        value={value}
        suggestions={suggestions}
        onCommit={onCommit}
      />,
    )
    fireEvent.doubleClick(screen.getByText(value || 'None'))
    return {
      input: document.querySelector('input') as HTMLInputElement,
      onCommit,
    }
  }

  it('Enter commits the draft via onCommit', () => {
    const { input, onCommit } = enterEdit({ value: 'service' })
    fireEvent.change(input, { target: { value: 'database' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onCommit).toHaveBeenCalledWith('database')
  })

  it('Escape cancels — draft reverts and edit mode exits', () => {
    const onCommit = vi.fn()
    const { input } = enterEdit({ value: 'keep', onCommit })
    fireEvent.change(input, { target: { value: 'dropme' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onCommit).not.toHaveBeenCalled()
    // Back to display mode with original value.
    expect(screen.getByText('keep')).toBeTruthy()
  })

  it('commit rejection (onCommit returns false) keeps edit mode and shows error border', () => {
    const onCommit = vi.fn(() => false)
    const { input } = enterEdit({ value: '', onCommit })
    fireEvent.change(input, { target: { value: 'invalid' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onCommit).toHaveBeenCalledWith('invalid')
    // Still editing; input exists.
    expect(document.querySelector('input')).not.toBeNull()
    // Error class.
    const edited = document.querySelector('input') as HTMLInputElement
    expect(edited.className).toContain('border-red-400')
  })

  it('typing populates a filtered suggestion list (case-insensitive, excludes exact match)', () => {
    // "rv" is a specific substring only present in "service" and "SERVLET".
    const { input } = enterEdit({
      value: '',
      suggestions: ['service', 'database', 'SERVLET', 'queue'],
    })
    fireEvent.change(input, { target: { value: 'rv' } })
    expect(screen.getByText('service')).toBeTruthy()
    expect(screen.getByText('SERVLET')).toBeTruthy()
    expect(screen.queryByText('database')).toBeNull()
    expect(screen.queryByText('queue')).toBeNull()
  })

  it('exact match filter excludes the current draft from suggestions', () => {
    const { input } = enterEdit({
      value: '',
      suggestions: ['service', 'sql'],
    })
    fireEvent.change(input, { target: { value: 'sql' } })
    // Draft matches "sql" exactly → suggestion shouldn't re-list it.
    expect(screen.queryByText('sql')).toBeNull()
  })

  it('clicking a suggestion commits that value', () => {
    const onCommit = vi.fn(() => true)
    const { input } = enterEdit({
      value: '',
      suggestions: ['service', 'database'],
      onCommit,
    })
    fireEvent.change(input, { target: { value: 's' } })
    fireEvent.mouseDown(screen.getByText('service'))
    expect(onCommit).toHaveBeenCalledWith('service')
  })

  it('re-syncs draft when external value changes while not editing', () => {
    const { rerender } = render(
      <AutocompleteInput
        label="Type"
        value="old"
        suggestions={[]}
        onCommit={() => true}
      />,
    )
    rerender(
      <AutocompleteInput
        label="Type"
        value="new"
        suggestions={[]}
        onCommit={() => true}
      />,
    )
    expect(screen.getByText('new')).toBeTruthy()
  })
})
