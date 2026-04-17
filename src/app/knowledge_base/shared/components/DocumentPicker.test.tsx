import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import DocumentPicker from './DocumentPicker'

// Covers FS-2.5 (document-picker attach/create flow).

describe('DocumentPicker — listing', () => {
  it('shows all unattached documents on mount', () => {
    render(
      <DocumentPicker
        allDocPaths={['a.md', 'b.md', 'docs/c.md']}
        attachedPaths={[]}
        onAttach={() => {}}
        onCreate={() => {}}
        onClose={() => {}}
      />,
    )
    expect(screen.getByText('a.md')).toBeTruthy()
    expect(screen.getByText('b.md')).toBeTruthy()
    expect(screen.getByText('docs/c.md')).toBeTruthy()
  })

  it('hides documents already attached to the entity', () => {
    render(
      <DocumentPicker
        allDocPaths={['a.md', 'b.md']}
        attachedPaths={['a.md']}
        onAttach={() => {}}
        onCreate={() => {}}
        onClose={() => {}}
      />,
    )
    expect(screen.queryByText('a.md')).toBeNull()
    expect(screen.getByText('b.md')).toBeTruthy()
  })

  it('shows empty-state text when no unattached documents match', () => {
    render(
      <DocumentPicker
        allDocPaths={['a.md']}
        attachedPaths={['a.md']}
        onAttach={() => {}}
        onCreate={() => {}}
        onClose={() => {}}
      />,
    )
    expect(screen.getByText('No documents found')).toBeTruthy()
  })
})

describe('DocumentPicker — search', () => {
  it('filters by case-insensitive substring match on the path', () => {
    render(
      <DocumentPicker
        allDocPaths={['apple.md', 'banana.md', 'Application.md']}
        attachedPaths={[]}
        onAttach={() => {}}
        onCreate={() => {}}
        onClose={() => {}}
      />,
    )
    const search = screen.getByPlaceholderText('Search documents...') as HTMLInputElement
    fireEvent.change(search, { target: { value: 'app' } })
    expect(screen.getByText('apple.md')).toBeTruthy()
    expect(screen.getByText('Application.md')).toBeTruthy()
    expect(screen.queryByText('banana.md')).toBeNull()
  })

  it('empty search shows the full unattached list', () => {
    render(
      <DocumentPicker
        allDocPaths={['a.md', 'b.md']}
        attachedPaths={[]}
        onAttach={() => {}}
        onCreate={() => {}}
        onClose={() => {}}
      />,
    )
    const search = screen.getByPlaceholderText('Search documents...')
    fireEvent.change(search, { target: { value: 'nope' } })
    expect(screen.queryByText('a.md')).toBeNull()
    fireEvent.change(search, { target: { value: '' } })
    expect(screen.getByText('a.md')).toBeTruthy()
    expect(screen.getByText('b.md')).toBeTruthy()
  })
})

describe('DocumentPicker — attach flow', () => {
  it('clicking a document triggers onAttach(path) and onClose', () => {
    const onAttach = vi.fn()
    const onClose = vi.fn()
    render(
      <DocumentPicker
        allDocPaths={['pick.md']}
        attachedPaths={[]}
        onAttach={onAttach}
        onCreate={() => {}}
        onClose={onClose}
      />,
    )
    fireEvent.click(screen.getByText('pick.md'))
    expect(onAttach).toHaveBeenCalledWith('pick.md')
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('DocumentPicker — create flow', () => {
  it('create-new toggles to an input with a Create button', () => {
    render(
      <DocumentPicker
        allDocPaths={[]}
        attachedPaths={[]}
        onAttach={() => {}}
        onCreate={() => {}}
        onClose={() => {}}
      />,
    )
    // Initially: "Create new document" toggle button.
    expect(screen.getByText('Create new document')).toBeTruthy()
    fireEvent.click(screen.getByText('Create new document'))
    expect(screen.getByPlaceholderText('docs/new-document.md')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Create' })).toBeTruthy()
  })

  it('Enter in the create input calls onCreate(path) + onClose', () => {
    const onCreate = vi.fn()
    const onClose = vi.fn()
    render(
      <DocumentPicker
        allDocPaths={[]}
        attachedPaths={[]}
        onAttach={() => {}}
        onCreate={onCreate}
        onClose={onClose}
      />,
    )
    fireEvent.click(screen.getByText('Create new document'))
    const input = screen.getByPlaceholderText('docs/new-document.md') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'notes/new' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    // Auto-appends .md when missing.
    expect(onCreate).toHaveBeenCalledWith('notes/new.md')
    expect(onClose).toHaveBeenCalled()
  })

  it('already-.md name is passed through unchanged', () => {
    const onCreate = vi.fn()
    render(
      <DocumentPicker
        allDocPaths={[]}
        attachedPaths={[]}
        onAttach={() => {}}
        onCreate={onCreate}
        onClose={() => {}}
      />,
    )
    fireEvent.click(screen.getByText('Create new document'))
    const input = screen.getByPlaceholderText('docs/new-document.md')
    fireEvent.change(input, { target: { value: 'docs/x.md' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(onCreate).toHaveBeenCalledWith('docs/x.md')
  })

  it('Escape in the create input reverts to the toggle button', () => {
    render(
      <DocumentPicker
        allDocPaths={[]}
        attachedPaths={[]}
        onAttach={() => {}}
        onCreate={() => {}}
        onClose={() => {}}
      />,
    )
    fireEvent.click(screen.getByText('Create new document'))
    const input = screen.getByPlaceholderText('docs/new-document.md')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByPlaceholderText('docs/new-document.md')).toBeNull()
    expect(screen.getByText('Create new document')).toBeTruthy()
  })

  it('empty / whitespace create name does not call onCreate', () => {
    const onCreate = vi.fn()
    const onClose = vi.fn()
    render(
      <DocumentPicker
        allDocPaths={[]}
        attachedPaths={[]}
        onAttach={() => {}}
        onCreate={onCreate}
        onClose={onClose}
      />,
    )
    fileCreateFlow()

    const input = screen.getByPlaceholderText('docs/new-document.md')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(onCreate).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })
})

function fileCreateFlow() {
  // Small helper used by "empty create name" test to enter create-mode.
  fireEvent.click(screen.getByText('Create new document'))
}

describe('DocumentPicker — close triggers', () => {
  it('X button calls onClose', () => {
    const onClose = vi.fn()
    const { container } = render(
      <DocumentPicker
        allDocPaths={[]}
        attachedPaths={[]}
        onAttach={() => {}}
        onCreate={() => {}}
        onClose={onClose}
      />,
    )
    // First button is the X close — find by svg icon class `lucide-x`.
    const xBtn = container.querySelector('button svg.lucide-x')?.closest('button')
    expect(xBtn).toBeTruthy()
    fireEvent.click(xBtn!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('clicking the backdrop calls onClose', () => {
    const onClose = vi.fn()
    const { container } = render(
      <DocumentPicker
        allDocPaths={[]}
        attachedPaths={[]}
        onAttach={() => {}}
        onCreate={() => {}}
        onClose={onClose}
      />,
    )
    // The root element is the backdrop with `fixed inset-0`.
    fireEvent.click(container.firstChild as HTMLElement)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('clicking inside the modal body does NOT call onClose (stopPropagation)', () => {
    const onClose = vi.fn()
    render(
      <DocumentPicker
        allDocPaths={[]}
        attachedPaths={[]}
        onAttach={() => {}}
        onCreate={() => {}}
        onClose={onClose}
      />,
    )
    fireEvent.click(screen.getByText('Attach Document'))
    expect(onClose).not.toHaveBeenCalled()
  })
})
