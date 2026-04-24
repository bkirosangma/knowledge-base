import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import DiagramView from './DiagramView'
import { FooterProvider } from '../../shell/FooterContext'
import { ShellErrorProvider } from '../../shell/ShellErrorContext'

// Characterization-layer smoke tests for DiagramView. The component is too
// intertwined with Canvas + 20 hooks to exercise every interaction here;
// those live in e2e/diagramGoldenPath.spec.ts. These tests assert that:
//   1. The component mounts without throwing given minimal valid props.
//   2. The localStorage-backed "properties-collapsed" flag initialises from
//      localStorage on first render.
//   3. Swapping `activeFile` rerenders without crashing.
//   4. The component calls `onDiagramBridge` on mount (proves bridge wiring).

beforeEach(() => {
  localStorage.clear()
  cleanup()
})

function stubFileExplorer() {
  return {
    // Minimal surface DiagramView + useFileActions read on mount.
    tree: [],
    activeFile: null,
    isLoading: false,
    supported: false,
    directoryName: null,
    dirtyFiles: new Set<string>(),
    pendingFile: null,
    inputRef: { current: null },
    // dirHandleRef must be a ref shape, not a fn
    dirHandleRef: { current: null },
    // callbacks read by useFileActions and DiagramView
    markDirty: vi.fn(),
    selectFile: vi.fn(async () => null),
    saveFile: vi.fn(async () => false),
    createFile: vi.fn(async () => null),
    createFolder: vi.fn(async () => null),
    deleteFile: vi.fn(async () => false),
    deleteFolder: vi.fn(async () => false),
    renameFile: vi.fn(async () => null),
    renameFolder: vi.fn(async () => null),
    duplicateFile: vi.fn(async () => null),
    moveItem: vi.fn(async () => {}),
    discardFile: vi.fn(async () => null),
    openFolder: vi.fn(async () => {}),
    clearPendingFile: vi.fn(),
    setActiveFile: vi.fn(),
    refresh: vi.fn(async () => {}),
    handleFallbackInput: vi.fn(),
  } as unknown as React.ComponentProps<typeof DiagramView>['fileExplorer']
}

function baseProps(
  overrides: Partial<React.ComponentProps<typeof DiagramView>> = {},
): React.ComponentProps<typeof DiagramView> {
  return {
    focused: true,
    side: 'left',
    activeFile: null,
    fileExplorer: stubFileExplorer(),
    onOpenDocument: vi.fn(),
    documents: [],
    onAttachDocument: vi.fn(),
    onDetachDocument: vi.fn(),
    onCreateDocument: vi.fn(async () => {}),
    onLoadDocuments: vi.fn(),
    backlinks: [],
    onDiagramBridge: vi.fn(),
    readDocument: vi.fn(async () => null),
    getDocumentReferences: vi.fn(() => ({ attachments: [], wikiBacklinks: [] })),
    deleteDocumentWithCleanup: vi.fn(async () => {}),
    onCreateAndAttach: vi.fn(async () => {}),
    ...overrides,
  }
}

function renderDV(props: React.ComponentProps<typeof DiagramView>) {
  return render(
    <ShellErrorProvider>
      <FooterProvider>
        <DiagramView {...props} />
      </FooterProvider>
    </ShellErrorProvider>,
  )
}

describe('DiagramView — smoke', () => {
  it('DIAG-3.13-41: renders without throwing given minimal props', () => {
    expect(() => renderDV(baseProps())).not.toThrow()
  })

  it('DIAG-3.13-01: mount does not clobber properties-collapsed in localStorage', () => {
    localStorage.setItem('properties-collapsed', 'true')
    const { container } = renderDV(baseProps())
    // Assert the pre-existing value survives a mount. This doesn't by itself
    // prove the useState initializer READ the value (nothing in this test
    // exercises the toggle path), but it pins the "mount doesn't reset the
    // key" guarantee that Phase 1 must preserve.
    expect(localStorage.getItem('properties-collapsed')).toBe('true')
    expect(container).toBeTruthy()
  })

  it('DIAG-3.13-43: rerenders without crashing when activeFile prop changes', () => {
    const props = baseProps({ activeFile: null })
    const { rerender } = renderDV(props)
    expect(() =>
      rerender(
        <ShellErrorProvider>
          <FooterProvider>
            <DiagramView {...baseProps({ activeFile: 'flow.json' })} />
          </FooterProvider>
        </ShellErrorProvider>,
      ),
    ).not.toThrow()
  })

  it('calls onDiagramBridge on mount to publish its bridge (DIAG-3.13-42)', async () => {
    const onDiagramBridge = vi.fn()
    renderDV(baseProps({ onDiagramBridge }))
    // Bridge is set inside a useEffect; waitFor flushes any pending effects.
    await waitFor(() => expect(onDiagramBridge).toHaveBeenCalled())
  })
})
