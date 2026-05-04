import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useRef } from 'react'
import { useFileActions } from './useFileActions'
import { SKIP_DISCARD_CONFIRM_KEY } from '../constants'
import type { DocumentMeta } from '../utils/types'

// Mock createDiagramRepository so the migration rewrite does not touch real FSA.
const mockDiagramRepoWrite = vi.fn(async () => {})
vi.mock('../../infrastructure/diagramRepo', () => ({
  createDiagramRepository: () => ({ write: mockDiagramRepoWrite }),
}))

// Covers HOOK-6.2-01 through 6.2-08 + 6.2-10/11. Wiki-link propagation on
// rename/move (6.2-09/6.2-11) sits inside useFileExplorer itself and is
// covered at the integration level in Bucket 19.

/** Build a minimal DiagramData for loadDiagramFromData to accept. */
function diagramData(title = 'T') {
  return {
    title, layers: [], nodes: [], connections: [],
    layerManualSizes: {}, lineCurve: 'orthogonal', flows: [],
  }
}

type CallRecord = { name: string; args: unknown[] }

type ApplyDiagramFn = Parameters<typeof useFileActions>[2]
type ConfirmActionArg = Parameters<typeof useFileActions>[6]
type NullableDiagramResult = { path: string; data: ReturnType<typeof diagramData> } | null

interface SetupOpts {
  isDirty?: boolean
  activeFile?: string | null
  saveFileResult?: boolean
  confirmAction?: ConfirmActionArg
  selectFileResult?: {
    data: ReturnType<typeof diagramData>
    diskJson: string
    hasDraft: boolean
  } | null
}

function setup(opts: SetupOpts = {}) {
  const calls: CallRecord[] = []
  const track = (name: string) => (...args: unknown[]) => {
    calls.push({ name, args })
  }

  const defaultSelectResult = {
    data: diagramData('from-disk'),
    diskJson: JSON.stringify(diagramData('from-disk')),
    hasDraft: false,
  }
  // Explicit `selectFileResult: null` means "return null"; missing key means "use default".
  const selectFileReturn = 'selectFileResult' in opts
    ? opts.selectFileResult
    : defaultSelectResult

  const fileExplorer = {
    activeFile: opts.activeFile ?? null,
    dirHandleRef: { current: {} as FileSystemDirectoryHandle },
    selectFile: vi.fn(async (path: string) => {
      track('selectFile')(path)
      return selectFileReturn
    }),
    saveFile: vi.fn(async (...args: unknown[]) => {
      track('saveFile')(...args)
      return opts.saveFileResult ?? true
    }),
    createFile: vi.fn(async (parent: string): Promise<NullableDiagramResult> => {
      track('createFile')(parent)
      return { path: parent ? `${parent}/new.json` : 'new.json', data: diagramData('new') }
    }),
    createFolder: vi.fn(async (parent: string) => {
      track('createFolder')(parent)
      return parent ? `${parent}/new-folder` : 'new-folder'
    }),
    deleteFile: vi.fn(async (path: string) => { track('deleteFile')(path) }),
    deleteFolder: vi.fn(async (path: string) => { track('deleteFolder')(path) }),
    renameFile: vi.fn(async (o: string, n: string) => { track('renameFile')(o, n) }),
    renameFolder: vi.fn(async (o: string, n: string) => { track('renameFolder')(o, n) }),
    duplicateFile: vi.fn(async (path: string): Promise<NullableDiagramResult> => {
      track('duplicateFile')(path)
      return { path: `${path}-copy`, data: diagramData('dup') }
    }),
    moveItem: vi.fn(async (src: string, target: string) => { track('moveItem')(src, target) }),
    discardFile: vi.fn(async (path: string) => {
      track('discardFile')(path)
      return diagramData('disk-state')
    }),
  }

  const history = {
    initHistory: vi.fn(async () => { track('initHistory')() }),
    onSave: vi.fn(() => { track('onSave')() }),
    goToSaved: vi.fn(() => null as ReturnType<typeof diagramData> | null),
  }

  const applyDiagramToState = vi.fn<ApplyDiagramFn>((data, opts) => {
    calls.push({ name: 'applyDiagramToState', args: [data, opts] })
  })
  const setLoadSnapshot = vi.fn(track('setLoadSnapshot'))
  const setConfirmAction = vi.fn(track('setConfirmAction'))

  const hook = renderHook(() => {
    const isRestoringRef = useRef(false)
    const canvasRef = useRef<HTMLDivElement | null>(null)
    return useFileActions(
      fileExplorer as unknown as Parameters<typeof useFileActions>[0],
      history as unknown as Parameters<typeof useFileActions>[1],
      applyDiagramToState,
      isRestoringRef,
      opts.isDirty ?? false,
      setLoadSnapshot,
      opts.confirmAction ?? null,
      setConfirmAction,
      canvasRef,
      'title', [], [], [], {}, 'orthogonal', [],
    )
  })

  return {
    hook,
    fileExplorer,
    history,
    applyDiagramToState,
    setLoadSnapshot,
    setConfirmAction,
    calls,
  }
}

beforeEach(() => {
  localStorage.clear()
})

describe('handleLoadFile', () => {
  it('HOOK-6.2-01/03: selectFile → applyDiagramToState → initHistory, in order', async () => {
    const { hook, fileExplorer, history, applyDiagramToState, calls } = setup()
    await act(async () => {
      await hook.result.current.handleLoadFile('doc.json')
    })
    expect(fileExplorer.selectFile).toHaveBeenCalledWith('doc.json')
    expect(applyDiagramToState).toHaveBeenCalledTimes(1)
    expect(history.initHistory).toHaveBeenCalledTimes(1)

    // Order: selectFile → applyDiagramToState → initHistory
    const order = calls.map((c) => c.name)
    expect(order.indexOf('selectFile')).toBeLessThan(order.indexOf('applyDiagramToState'))
    expect(order.indexOf('applyDiagramToState')).toBeLessThan(order.indexOf('initHistory'))
  })

  it('HOOK-6.2-02: hasDraft=true routes disk JSON as snapshotSource', async () => {
    const diskData = diagramData('on-disk')
    const draftData = diagramData('draft')
    const { hook, applyDiagramToState } = setup({
      selectFileResult: {
        data: draftData,             // draft wins for the editor view
        diskJson: JSON.stringify(diskData),
        hasDraft: true,
      },
    })
    await act(async () => {
      await hook.result.current.handleLoadFile('doc.json')
    })
    const [diagramArg, opts] = applyDiagramToState.mock.calls[0]
    expect(diagramArg.title).toBe('draft')
    expect(opts?.setSnapshot).toBe(true)
    expect(opts?.snapshotSource?.title).toBe('on-disk')
  })

  it('returns early when selectFile returns null', async () => {
    const { hook, applyDiagramToState, history } = setup({ selectFileResult: null })
    await act(async () => {
      await hook.result.current.handleLoadFile('x.json')
    })
    expect(applyDiagramToState).not.toHaveBeenCalled()
    expect(history.initHistory).not.toHaveBeenCalled()
  })
})

describe('handleSave', () => {
  it('HOOK-6.2-04/06: writes to disk and notifies history on success', async () => {
    const { hook, fileExplorer, history, setLoadSnapshot } = setup({
      isDirty: true, activeFile: 'doc.json',
    })
    await act(async () => {
      await hook.result.current.handleSave()
    })
    expect(fileExplorer.saveFile).toHaveBeenCalled()
    expect(setLoadSnapshot).toHaveBeenCalled()
    expect(history.onSave).toHaveBeenCalled()
  })

  it('skips when not dirty', async () => {
    const { hook, fileExplorer, history } = setup({
      isDirty: false, activeFile: 'doc.json',
    })
    await act(async () => {
      await hook.result.current.handleSave()
    })
    expect(fileExplorer.saveFile).not.toHaveBeenCalled()
    expect(history.onSave).not.toHaveBeenCalled()
  })

  it('skips when no active file', async () => {
    const { hook, fileExplorer } = setup({ isDirty: true, activeFile: null })
    await act(async () => {
      await hook.result.current.handleSave()
    })
    expect(fileExplorer.saveFile).not.toHaveBeenCalled()
  })

  it('HOOK-6.2-12: saveFile returns false → no snapshot or history update (dirty stays)', async () => {
    const { hook, history, setLoadSnapshot } = setup({
      isDirty: true, activeFile: 'doc.json', saveFileResult: false,
    })
    await act(async () => {
      await hook.result.current.handleSave()
    })
    expect(setLoadSnapshot).not.toHaveBeenCalled()
    expect(history.onSave).not.toHaveBeenCalled()
  })
})

describe('handleCreateFile / handleCreateFolder', () => {
  it('handleCreateFile routes through createFile and applies the returned diagram', async () => {
    const { hook, fileExplorer, applyDiagramToState } = setup()
    let returned: string | null = null
    await act(async () => {
      returned = await hook.result.current.handleCreateFile('folder')
    })
    expect(fileExplorer.createFile).toHaveBeenCalledWith('folder')
    expect(applyDiagramToState).toHaveBeenCalled()
    expect(returned).toBe('folder/new.json')
  })

  it('handleCreateFile returns null when createFile returns null', async () => {
    const { hook, fileExplorer, applyDiagramToState } = setup()
    fileExplorer.createFile.mockResolvedValueOnce(null)
    let returned: string | null = 'placeholder'
    await act(async () => {
      returned = await hook.result.current.handleCreateFile('')
    })
    expect(returned).toBeNull()
    expect(applyDiagramToState).not.toHaveBeenCalled()
  })

  it('handleCreateFolder forwards to createFolder and returns its path', async () => {
    const { hook, fileExplorer } = setup()
    let returned: string | null = null
    await act(async () => {
      returned = await hook.result.current.handleCreateFolder('folder')
    })
    expect(fileExplorer.createFolder).toHaveBeenCalledWith('folder')
    expect(returned).toBe('folder/new-folder')
  })
})

describe('delete flow (HOOK-6.2-07/08)', () => {
  it('handleDeleteFile opens the confirmation popover with cursor coordinates', () => {
    const { hook, setConfirmAction, fileExplorer } = setup()
    act(() => {
      hook.result.current.handleDeleteFile('doc.json', {
        clientX: 123, clientY: 45,
      } as React.MouseEvent)
    })
    expect(setConfirmAction).toHaveBeenCalledWith({
      type: 'delete-file', path: 'doc.json', x: 123, y: 45,
    })
    // Does NOT delete yet — the popover has to be confirmed.
    expect(fileExplorer.deleteFile).not.toHaveBeenCalled()
  })

  it('HOOK-6.2-08: executeDeleteFile clears state when the deleted file was active', async () => {
    const { hook, fileExplorer } = setup({
      activeFile: 'active.json',
    })
    await act(async () => {
      await hook.result.current.handleConfirmAction()
    })
    // No confirmAction → no-op.
    expect(fileExplorer.deleteFile).not.toHaveBeenCalled()

    // Now with a matching confirmAction.
    const withConfirm = setup({
      activeFile: 'active.json',
      confirmAction: { type: 'delete-file', path: 'active.json', x: 0, y: 0 },
    })
    await act(async () => {
      await withConfirm.hook.result.current.handleConfirmAction()
    })
    expect(withConfirm.fileExplorer.deleteFile).toHaveBeenCalledWith('active.json')
    // Active file was deleted → state reset to loadDefaults().
    expect(withConfirm.applyDiagramToState).toHaveBeenCalled()
  })

  it('handleDeleteFolder opens the delete-folder confirmation popover', () => {
    const { hook, setConfirmAction } = setup()
    act(() => {
      hook.result.current.handleDeleteFolder('folder', {
        clientX: 10, clientY: 20,
      } as React.MouseEvent)
    })
    expect(setConfirmAction).toHaveBeenCalledWith({
      type: 'delete-folder', path: 'folder', x: 10, y: 20,
    })
  })

  it('handleConfirmAction dispatches delete-folder', async () => {
    const { hook, fileExplorer } = setup({
      confirmAction: { type: 'delete-folder', path: 'old-folder', x: 0, y: 0 },
    })
    await act(async () => {
      await hook.result.current.handleConfirmAction()
    })
    expect(fileExplorer.deleteFolder).toHaveBeenCalledWith('old-folder')
  })
})

describe('rename / duplicate / move (HOOK-6.2-09/10/11)', () => {
  it('handleRenameFile forwards to fileExplorer.renameFile', async () => {
    const { hook, fileExplorer } = setup()
    await act(async () => {
      await hook.result.current.handleRenameFile('old.md', 'new.md')
    })
    expect(fileExplorer.renameFile).toHaveBeenCalledWith('old.md', 'new.md')
  })

  it('handleRenameFolder forwards to fileExplorer.renameFolder', async () => {
    const { hook, fileExplorer } = setup()
    await act(async () => {
      await hook.result.current.handleRenameFolder('a', 'b')
    })
    expect(fileExplorer.renameFolder).toHaveBeenCalledWith('a', 'b')
  })

  it('HOOK-6.2-10: handleDuplicateFile applies the duplicate\'s data', async () => {
    const { hook, fileExplorer, applyDiagramToState } = setup()
    await act(async () => {
      await hook.result.current.handleDuplicateFile('doc.json')
    })
    expect(fileExplorer.duplicateFile).toHaveBeenCalledWith('doc.json')
    expect(applyDiagramToState).toHaveBeenCalled()
  })

  it('handleDuplicateFile is a no-op when duplicate returns null', async () => {
    const { hook, fileExplorer, applyDiagramToState } = setup()
    fileExplorer.duplicateFile.mockResolvedValueOnce(null)
    await act(async () => {
      await hook.result.current.handleDuplicateFile('doc.json')
    })
    expect(applyDiagramToState).not.toHaveBeenCalled()
  })

  it('HOOK-6.2-11: handleMoveItem forwards (src, target)', async () => {
    const { hook, fileExplorer } = setup()
    await act(async () => {
      await hook.result.current.handleMoveItem('docs/a.md', 'archive')
    })
    expect(fileExplorer.moveItem).toHaveBeenCalledWith('docs/a.md', 'archive')
  })
})

describe('discard flow', () => {
  it('opens the discard popover when isDirty and no skip flag', () => {
    const { hook, setConfirmAction } = setup({ isDirty: true, activeFile: 'doc.json' })
    act(() => {
      hook.result.current.handleDiscard({ clientX: 1, clientY: 2 } as React.MouseEvent)
    })
    expect(setConfirmAction).toHaveBeenCalledWith({
      type: 'discard', x: 1, y: 2,
    })
  })

  it('skips popover when localStorage SKIP_DISCARD_CONFIRM_KEY is "true"', async () => {
    localStorage.setItem(SKIP_DISCARD_CONFIRM_KEY, 'true')
    const { hook, setConfirmAction, fileExplorer } = setup({
      isDirty: true, activeFile: 'doc.json',
    })
    await act(async () => {
      hook.result.current.handleDiscard({ clientX: 1, clientY: 2 } as React.MouseEvent)
    })
    expect(setConfirmAction).not.toHaveBeenCalled()
    expect(fileExplorer.discardFile).toHaveBeenCalledWith('doc.json')
  })

  it('handleDiscard is a no-op when not dirty', () => {
    const { hook, setConfirmAction } = setup({
      isDirty: false, activeFile: 'doc.json',
    })
    act(() => {
      hook.result.current.handleDiscard({ clientX: 1, clientY: 2 } as React.MouseEvent)
    })
    expect(setConfirmAction).not.toHaveBeenCalled()
  })

  it('handleConfirmAction with discard type calls discardFile', async () => {
    const { hook, fileExplorer } = setup({
      activeFile: 'doc.json',
      confirmAction: { type: 'discard', x: 0, y: 0 },
    })
    await act(async () => {
      await hook.result.current.handleConfirmAction()
    })
    expect(fileExplorer.discardFile).toHaveBeenCalled()
  })
})

describe('HOOK-6.2-13: lazy migration of legacy data.documents on load', () => {
  beforeEach(() => {
    mockDiagramRepoWrite.mockClear()
  })

  it('calls onMigrateLegacyDocuments and rewrites diagram with documents:[] when data.documents is non-empty', async () => {
    const legacyDocs: DocumentMeta[] = [
      { id: 'doc-1', filename: 'n.md', title: 'N', attachedTo: [{ type: 'node', id: 'n1' }] },
    ]
    const dataWithLegacyDocs = {
      ...diagramData('legacy'),
      documents: legacyDocs,
    }
    const onMigrateLegacyDocuments = vi.fn(async () => {})

    const hook = renderHook(() => {
      const isRestoringRef = useRef(false)
      const canvasRef = useRef<HTMLDivElement | null>(null)
      return useFileActions(
        {
          activeFile: null,
          dirHandleRef: { current: {} as FileSystemDirectoryHandle },
          selectFile: vi.fn(async (_path: string) => ({
            data: dataWithLegacyDocs,
            diskJson: JSON.stringify(dataWithLegacyDocs),
            hasDraft: false,
          })),
          saveFile: vi.fn(async () => true),
          createFile: vi.fn(async () => null),
          createFolder: vi.fn(async () => null),
          deleteFile: vi.fn(async () => {}),
          deleteFolder: vi.fn(async () => {}),
          renameFile: vi.fn(async () => {}),
          renameFolder: vi.fn(async () => {}),
          duplicateFile: vi.fn(async () => null),
          moveItem: vi.fn(async () => {}),
          discardFile: vi.fn(async () => null),
        } as unknown as Parameters<typeof useFileActions>[0],
        {
          initHistory: vi.fn(async () => {}),
          onSave: vi.fn(),
          goToSaved: vi.fn(() => null),
        } as unknown as Parameters<typeof useFileActions>[1],
        vi.fn() as unknown as Parameters<typeof useFileActions>[2],
        isRestoringRef,
        false,
        vi.fn(),
        null,
        vi.fn(),
        canvasRef,
        'title', [], [], [], {}, 'orthogonal', [],
        undefined,   // documents
        undefined,   // onLoadDocuments
        onMigrateLegacyDocuments,
      )
    })

    await act(async () => {
      await hook.result.current.handleLoadFile('legacy.json')
    })

    // Callback must be called once with the file path and the legacy docs array.
    expect(onMigrateLegacyDocuments).toHaveBeenCalledOnce()
    expect(onMigrateLegacyDocuments).toHaveBeenCalledWith('legacy.json', legacyDocs)

    // The diagram rewrite must have happened with documents: [].
    expect(mockDiagramRepoWrite).toHaveBeenCalledOnce()
    const [writtenPath, writtenData] = mockDiagramRepoWrite.mock.calls[0] as unknown as [string, typeof dataWithLegacyDocs]
    expect(writtenPath).toBe('legacy.json')
    expect(writtenData.documents).toEqual([])
  })

  it('skips migration when hasDraft=true to avoid committing draft state to disk', async () => {
    const legacyDocs: DocumentMeta[] = [
      { id: 'doc-1', filename: 'n.md', title: 'N', attachedTo: [{ type: 'node', id: 'n1' }] },
    ]
    const dataWithLegacyDocs = {
      ...diagramData('legacy-draft'),
      documents: legacyDocs,
    }
    const onMigrateLegacyDocuments = vi.fn(async () => {})

    const hook = renderHook(() => {
      const isRestoringRef = useRef(false)
      const canvasRef = useRef<HTMLDivElement | null>(null)
      return useFileActions(
        {
          activeFile: null,
          dirHandleRef: { current: {} as FileSystemDirectoryHandle },
          selectFile: vi.fn(async (_path: string) => ({
            data: dataWithLegacyDocs,
            diskJson: JSON.stringify(diagramData('on-disk')),
            hasDraft: true,  // <— draft present
          })),
          saveFile: vi.fn(async () => true),
          createFile: vi.fn(async () => null),
          createFolder: vi.fn(async () => null),
          deleteFile: vi.fn(async () => {}),
          deleteFolder: vi.fn(async () => {}),
          renameFile: vi.fn(async () => {}),
          renameFolder: vi.fn(async () => {}),
          duplicateFile: vi.fn(async () => null),
          moveItem: vi.fn(async () => {}),
          discardFile: vi.fn(async () => null),
        } as unknown as Parameters<typeof useFileActions>[0],
        {
          initHistory: vi.fn(async () => {}),
          onSave: vi.fn(),
          goToSaved: vi.fn(() => null),
        } as unknown as Parameters<typeof useFileActions>[1],
        vi.fn() as unknown as Parameters<typeof useFileActions>[2],
        isRestoringRef,
        false,
        vi.fn(),
        null,
        vi.fn(),
        canvasRef,
        'title', [], [], [], {}, 'orthogonal', [],
        undefined,   // documents
        undefined,   // onLoadDocuments
        onMigrateLegacyDocuments,
      )
    })

    await act(async () => {
      await hook.result.current.handleLoadFile('legacy-draft.json')
    })

    // Migration must NOT run when hasDraft=true; rewrite must NOT happen.
    expect(onMigrateLegacyDocuments).not.toHaveBeenCalled()
    expect(mockDiagramRepoWrite).not.toHaveBeenCalled()
  })

  it('skips migration when data.documents is absent (idempotent)', async () => {
    const onMigrateLegacyDocuments = vi.fn(async () => {})

    const hook = renderHook(() => {
      const isRestoringRef = useRef(false)
      const canvasRef = useRef<HTMLDivElement | null>(null)
      return useFileActions(
        {
          activeFile: null,
          dirHandleRef: { current: {} as FileSystemDirectoryHandle },
          selectFile: vi.fn(async (_path: string) => ({
            data: diagramData('migrated'),
            diskJson: JSON.stringify(diagramData('migrated')),
            hasDraft: false,
          })),
          saveFile: vi.fn(async () => true),
          createFile: vi.fn(async () => null),
          createFolder: vi.fn(async () => null),
          deleteFile: vi.fn(async () => {}),
          deleteFolder: vi.fn(async () => {}),
          renameFile: vi.fn(async () => {}),
          renameFolder: vi.fn(async () => {}),
          duplicateFile: vi.fn(async () => null),
          moveItem: vi.fn(async () => {}),
          discardFile: vi.fn(async () => null),
        } as unknown as Parameters<typeof useFileActions>[0],
        {
          initHistory: vi.fn(async () => {}),
          onSave: vi.fn(),
          goToSaved: vi.fn(() => null),
        } as unknown as Parameters<typeof useFileActions>[1],
        vi.fn() as unknown as Parameters<typeof useFileActions>[2],
        isRestoringRef,
        false,
        vi.fn(),
        null,
        vi.fn(),
        canvasRef,
        'title', [], [], [], {}, 'orthogonal', [],
        undefined,   // documents
        undefined,   // onLoadDocuments
        onMigrateLegacyDocuments,
      )
    })

    await act(async () => {
      await hook.result.current.handleLoadFile('migrated.json')
    })

    expect(onMigrateLegacyDocuments).not.toHaveBeenCalled()
    expect(mockDiagramRepoWrite).not.toHaveBeenCalled()
  })
})
