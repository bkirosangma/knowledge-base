// Covers DOC-4.11-22, 4.11-23, 4.11-24, 4.11-25.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { createElement, useRef, type ReactNode } from 'react'
import DocumentView from './DocumentView'
import { StubRepositoryProvider } from '../../shell/RepositoryContext'
import { StubShellErrorProvider } from '../../shell/ShellErrorContext'
import type { DocumentRepository } from '../../domain/repositories'

// ── Heavy sub-component mocks ────────────────────────────────────────────────

vi.mock('./components/MarkdownPane', () => ({
  default: ({ onDiscard, onSave, onChange, filePath }: {
    onDiscard?: (e: React.MouseEvent) => void
    onSave?: () => void
    onChange?: (md: string) => void
    filePath?: string | null
  }) => (
    <div data-testid="markdown-pane">
      <button data-testid="edit" onClick={() => onChange?.('# Modified')}>Edit</button>
      <button data-testid="save" onClick={onSave}>Save</button>
      <button data-testid="discard" onClick={(e) => onDiscard?.(e as unknown as React.MouseEvent)}>Discard</button>
      {filePath && <span data-testid="filepath">{filePath}</span>}
    </div>
  ),
}))

vi.mock('./properties/DocumentProperties', () => ({ default: () => null }))

// ── Controllable history mock ────────────────────────────────────────────────

const mockGoToSaved = vi.fn<() => string | null>(() => null)
const mockOnFileSave = vi.fn()

vi.mock('../../shared/hooks/useDocumentHistory', () => ({
  useDocumentHistory: () => ({
    goToSaved: mockGoToSaved,
    onFileSave: mockOnFileSave,
    onContentChange: vi.fn(),
    onBlockChange: vi.fn(),
    initHistory: vi.fn().mockResolvedValue(undefined),
    undo: vi.fn(() => null),
    redo: vi.fn(() => null),
    getLatestState: vi.fn(() => ({ entries: [], currentIndex: -1 })),
    recordAction: vi.fn(),
    getEntries: vi.fn(() => []),
  }),
}))

// ── Stub repo helpers ────────────────────────────────────────────────────────

function makeDocRepo(initial = '# Original'): DocumentRepository {
  let stored = initial
  return {
    read: vi.fn().mockResolvedValue(stored),
    write: vi.fn().mockImplementation(async (_path: string, content: string) => {
      stored = content
    }),
  }
}

const stubShellErrorValue = {
  current: null,
  reportError: vi.fn(),
  dismiss: vi.fn(),
}

function renderDocView(
  docRepo: DocumentRepository,
  extra?: { onDocBridge?: (b: unknown) => void },
) {
  const dirHandleRef = { current: null } as React.RefObject<FileSystemDirectoryHandle | null>
  const stubLinkManager = {
    linkIndex: { updatedAt: '', documents: {}, backlinks: {} },
    loadIndex: vi.fn(),
    updateDocumentLinks: vi.fn().mockResolvedValue(undefined),
    removeDocumentFromIndex: vi.fn().mockResolvedValue(undefined),
    renameDocumentInIndex: vi.fn().mockResolvedValue(undefined),
    getBacklinksFor: vi.fn(() => []),
    fullRebuild: vi.fn().mockResolvedValue(undefined),
  }

  return render(
    <StubShellErrorProvider value={stubShellErrorValue}>
      <StubRepositoryProvider
        value={{ document: docRepo, diagram: null, linkIndex: null, vaultConfig: null }}
      >
        <DocumentView
          focused
          filePath="test.md"
          dirHandleRef={dirHandleRef}
          linkManager={stubLinkManager as any}
          tree={[]}
          onNavigateLink={vi.fn()}
          onCreateDocument={vi.fn()}
          onDocBridge={extra?.onDocBridge as any}
        />
      </StubRepositoryProvider>
    </StubShellErrorProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

// ── Tests ────────────────────────────────────────────────────────────────────

describe('DocumentView — discard flow (DOC-4.11-22, 4.11-23, 4.11-24)', () => {
  async function makeDocumentDirty() {
    await waitFor(() => expect(screen.getByTestId('filepath')).toHaveTextContent('test.md'))
    await act(async () => { fireEvent.click(screen.getByTestId('edit')) })
    // updateContent('# Modified') flips dirty=true
  }

  it('DOC-4.11-22: executeDiscard applies history snapshot without disk read when history has a saved state', async () => {
    const docRepo = makeDocRepo()
    mockGoToSaved.mockReturnValue('# From History')

    renderDocView(docRepo)
    await makeDocumentDirty()

    // Skip the confirm popover so executeDiscard fires immediately.
    localStorage.setItem('knowledge-base-skip-discard-confirm', 'true')

    await act(async () => { fireEvent.click(screen.getByTestId('discard')) })

    // resetToContent was used (no disk read after initial load)
    await waitFor(() => {
      expect(mockGoToSaved).toHaveBeenCalled()
      // repo.read is called once on initial load; no additional call for discard
      expect((docRepo.read as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)
    })
  })

  it('DOC-4.11-22b: executeDiscard falls back to disk read when history has no saved state', async () => {
    const docRepo = makeDocRepo()
    mockGoToSaved.mockReturnValue(null)

    renderDocView(docRepo)
    await makeDocumentDirty()

    localStorage.setItem('knowledge-base-skip-discard-confirm', 'true')

    await act(async () => { fireEvent.click(screen.getByTestId('discard')) })

    await waitFor(() => {
      // repo.read called twice: once on load, once on discard
      expect((docRepo.read as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2)
    })
  })

  it('DOC-4.11-23: shows confirmation popover when dirty and skip flag not set', async () => {
    renderDocView(makeDocRepo())
    await makeDocumentDirty()

    await act(async () => { fireEvent.click(screen.getByTestId('discard')) })

    await waitFor(() => {
      expect(screen.getByText('Discard unsaved changes?')).toBeInTheDocument()
    })
  })

  it('DOC-4.11-24: skips confirmation popover when SKIP_DISCARD_CONFIRM_KEY is set', async () => {
    localStorage.setItem('knowledge-base-skip-discard-confirm', 'true')
    const docRepo = makeDocRepo()
    mockGoToSaved.mockReturnValue('# Saved snapshot')

    renderDocView(docRepo)
    await makeDocumentDirty()

    await act(async () => { fireEvent.click(screen.getByTestId('discard')) })

    // Confirm popover should NOT appear
    await waitFor(() => {
      expect(screen.queryByText('Discard unsaved changes?')).toBeNull()
    })
    // executeDiscard was called (history consumed)
    expect(mockGoToSaved).toHaveBeenCalled()
  })
})

describe('DocumentView — bridge save path (DOC-4.11-25)', () => {
  it('DOC-4.11-25: bridge.save calls history.onFileSave in addition to repo.write', async () => {
    const docRepo = makeDocRepo()
    let capturedBridge: { save: () => Promise<void> } | null = null

    renderDocView(docRepo, {
      onDocBridge: (b: unknown) => { capturedBridge = b as typeof capturedBridge },
    })

    await waitFor(() => expect(capturedBridge).not.toBeNull())

    await act(async () => { await capturedBridge!.save() })

    expect(mockOnFileSave).toHaveBeenCalled()
    expect(docRepo.write).toHaveBeenCalled()
  })
})
