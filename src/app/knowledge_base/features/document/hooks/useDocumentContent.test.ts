import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { useDocumentContent } from './useDocumentContent'
import { MockDir } from '../../../shared/testUtils/fsMock'
import { RepositoryProvider, StubRepositoryProvider, type Repositories } from '../../../shell/RepositoryContext'
import { ShellErrorProvider, StubShellErrorProvider } from '../../../shell/ShellErrorContext'
import { FileSystemError } from '../../../domain/errors'

// Covers DOC-4.11-01 through 4.11-06 (per-pane content + dirty + bridge + save).
// The integration blocks render under a real `RepositoryProvider` wrapping
// a MockDir tree (end-to-end through the FSA impl). The seam block at the
// bottom swaps in `StubRepositoryProvider` with a pure mock repo so hook
// logic can be exercised without any FS mock — Phase 3e (2026-04-19) added
// the context + stub specifically to enable this.

/** Seed a file at a deep path in the mock FS. */
async function seedFile(root: MockDir, path: string, content: string) {
  const parts = path.split('/')
  let cur = root
  for (const p of parts.slice(0, -1)) {
    cur = await cur.getDirectoryHandle(p, { create: true })
  }
  const fh = await cur.getFileHandle(parts[parts.length - 1], { create: true })
  fh.file.data = content
}

let root: MockDir

beforeEach(() => { root = new MockDir() })

/** Render the hook under a RepositoryProvider bound to the mock root,
 *  nested inside ShellErrorProvider so `useShellErrors` is available. */
function renderDocContent(filePath: string | null) {
  const wrapper = ({ children }: { children: ReactNode }) => {
    const inner = createElement(RepositoryProvider, {
      rootHandle: root as unknown as FileSystemDirectoryHandle,
      children,
    })
    return createElement(ShellErrorProvider, { children: inner })
  }
  return renderHook(({ p }) => useDocumentContent(p), {
    initialProps: { p: filePath },
    wrapper,
  })
}

describe('useDocumentContent — initial state', () => {
  it('starts with empty content and dirty=false', () => {
    const { result } = renderDocContent(null)
    expect(result.current.content).toBe('')
    expect(result.current.dirty).toBe(false)
  })
})

describe('useDocumentContent — file loading', () => {
  it('DOC-4.11-01: loads the file content when filePath is set', async () => {
    await seedFile(root, 'notes/a.md', '# Hello')
    const { result } = renderDocContent('notes/a.md')
    await waitFor(() => expect(result.current.content).toBe('# Hello'))
    expect(result.current.dirty).toBe(false)
  })

  it('loads from nested folders', async () => {
    await seedFile(root, 'a/b/c/file.md', 'nested')
    const { result } = renderDocContent('a/b/c/file.md')
    await waitFor(() => expect(result.current.content).toBe('nested'))
  })

  it('sets empty content when file is missing (no throw)', async () => {
    const { result } = renderDocContent('missing.md')
    await waitFor(() => {
      // The async effect has had a chance to run and fail → stays at "".
      expect(result.current.content).toBe('')
      expect(result.current.dirty).toBe(false)
    })
  })

  it('clears content when filePath becomes null', async () => {
    await seedFile(root, 'a.md', 'content')
    const { result, rerender } = renderDocContent('a.md')
    await waitFor(() => expect(result.current.content).toBe('content'))

    rerender({ p: null })
    await waitFor(() => expect(result.current.content).toBe(''))
  })
})

describe('updateContent / save', () => {
  it('DOC-4.11-05: updateContent sets the content and flips dirty=true', async () => {
    await seedFile(root, 'a.md', 'original')
    const { result } = renderDocContent('a.md')
    await waitFor(() => expect(result.current.content).toBe('original'))

    act(() => { result.current.updateContent('edited') })
    expect(result.current.content).toBe('edited')
    expect(result.current.dirty).toBe(true)
  })

  it('DOC-4.11-03: save writes the latest content via the FS handle', async () => {
    await seedFile(root, 'a.md', 'original')
    const { result } = renderDocContent('a.md')
    await waitFor(() => expect(result.current.content).toBe('original'))

    act(() => { result.current.updateContent('new content') })
    await act(async () => { await result.current.save() })

    expect(root.files.get('a.md')!.file.data).toBe('new content')
  })

  it('DOC-4.11-04: save clears the dirty flag', async () => {
    await seedFile(root, 'a.md', 'orig')
    const { result } = renderDocContent('a.md')
    await waitFor(() => expect(result.current.content).toBe('orig'))

    act(() => { result.current.updateContent('x') })
    expect(result.current.dirty).toBe(true)

    await act(async () => { await result.current.save() })
    expect(result.current.dirty).toBe(false)
  })

  it('save is a no-op when filePath is null', async () => {
    const { result } = renderDocContent(null)
    // Should resolve without throwing even though there is no path.
    await act(async () => { await result.current.save() })
    expect(result.current.dirty).toBe(false)
  })
})

describe('DOC-4.11-02: auto-save previous file on path switch', () => {
  it('writes the previous file to disk when switching while dirty', async () => {
    await seedFile(root, 'a.md', 'a-orig')
    await seedFile(root, 'b.md', 'b-orig')

    const { result, rerender } = renderDocContent('a.md')
    await waitFor(() => expect(result.current.content).toBe('a-orig'))

    act(() => { result.current.updateContent('a-edited') })
    expect(result.current.dirty).toBe(true)

    rerender({ p: 'b.md' })
    await waitFor(() => expect(result.current.content).toBe('b-orig'))

    // The previous file should have been flushed to disk.
    expect(root.files.get('a.md')!.file.data).toBe('a-edited')
  })

  it('does NOT auto-save when prev file was clean', async () => {
    await seedFile(root, 'a.md', 'a-orig')
    await seedFile(root, 'b.md', 'b-orig')

    const { result, rerender } = renderDocContent('a.md')
    await waitFor(() => expect(result.current.content).toBe('a-orig'))

    rerender({ p: 'b.md' })
    await waitFor(() => expect(result.current.content).toBe('b-orig'))

    // a.md untouched.
    expect(root.files.get('a.md')!.file.data).toBe('a-orig')
  })
})

describe('DOC-4.11-06: bridge getters return latest values', () => {
  it('bridge.content / bridge.dirty / bridge.filePath reflect live state via refs', async () => {
    await seedFile(root, 'a.md', 'orig')
    const { result } = renderDocContent('a.md')
    await waitFor(() => expect(result.current.content).toBe('orig'))

    const { bridge } = result.current
    expect(bridge.content).toBe('orig')
    expect(bridge.dirty).toBe(false)
    expect(bridge.filePath).toBe('a.md')

    act(() => { result.current.updateContent('new') })
    // Bridge uses ref-backed getters — no re-render needed to see updated values.
    expect(bridge.content).toBe('new')
    expect(bridge.dirty).toBe(true)
  })

  it('bridge.save is invokable and mirrors the hook\'s save()', async () => {
    await seedFile(root, 'a.md', 'orig')
    const { result } = renderDocContent('a.md')
    await waitFor(() => expect(result.current.content).toBe('orig'))
    act(() => { result.current.updateContent('via-bridge') })

    await act(async () => { await result.current.bridge.save() })
    expect(root.files.get('a.md')!.file.data).toBe('via-bridge')
    expect(result.current.dirty).toBe(false)
  })
})

// Phase 3e test-seam demo — exercise hook logic without any FS mock.
// The StubRepositoryProvider accepts a Repositories bag built from pure
// spies; consumers never see a FileSystemDirectoryHandle. Future consumer
// tests that do not need FSA integration coverage should prefer this
// pattern over the MockDir plumbing.
describe('useDocumentContent — seam (StubRepositoryProvider)', () => {
  function renderWithStub(filePath: string | null, repo: Partial<Repositories['document']> | null) {
    const stub: Repositories = {
      diagram: null,
      document: repo as Repositories['document'],
      linkIndex: null,
      vaultConfig: null,
    }
    const wrapper = ({ children }: { children: ReactNode }) => {
      const inner = createElement(StubRepositoryProvider, { value: stub, children })
      return createElement(ShellErrorProvider, { children: inner })
    }
    return renderHook(({ p }) => useDocumentContent(p), {
      initialProps: { p: filePath },
      wrapper,
    })
  }

  it('DOC-4.11-01: hook reads via the provided stub repo with zero FS mock', async () => {
    const read = vi.fn(async () => '# stubbed')
    const { result } = renderWithStub('notes/a.md', { read, write: vi.fn(async () => {}) })
    await waitFor(() => expect(result.current.content).toBe('# stubbed'))
    expect(read).toHaveBeenCalledWith('notes/a.md')
  })

  it('DOC-4.11-04: save() routes through the stub repo\'s write', async () => {
    const write = vi.fn(async () => {})
    const { result } = renderWithStub('x.md', { read: vi.fn(async () => ''), write })
    await waitFor(() => expect(result.current.content).toBe(''))
    act(() => { result.current.updateContent('hello') })
    await act(async () => { await result.current.save() })
    expect(write).toHaveBeenCalledWith('x.md', 'hello')
  })

  it('null repo (pre-picker) results in empty content and a no-op save', async () => {
    const { result } = renderWithStub('a.md', null)
    await waitFor(() => expect(result.current.content).toBe(''))
    // Save is a no-op; nothing to assert other than no throw.
    await act(async () => { await result.current.save() })
    expect(result.current.dirty).toBe(false)
  })

  // Regression tests for the Phase 5c HIGH data-loss vectors from the audit.
  // Each of these assertions FAILS on main — they guard the specific bugs
  // Phase 5c fixes so a future regression surfaces in CI.

  it('DOC-4.11-07 (regression): load failure does NOT silently set empty content — prevents save-over', async () => {
    // Simulate a load that throws (e.g. permission revoked mid-session)
    const read = vi.fn(async () => { throw new FileSystemError('permission', 'denied') })
    const write = vi.fn(async () => {})
    const { result } = renderWithStub('locked.md', { read, write })
    // Wait for the async load effect to settle
    await waitFor(() => expect(result.current.loadError).not.toBeNull())
    expect(result.current.loadError?.kind).toBe('permission')
    // Pre-fix behaviour: content was reset to '' and user could type into
    // the empty buffer and save over the real file. Now: updateContent +
    // save are gated by loadError.
    act(() => { result.current.updateContent('user-typed-garbage') })
    await act(async () => { await result.current.save() })
    expect(write).not.toHaveBeenCalled()
  })

  it('DOC-4.11-08 (regression): save() is blocked while loadError is set', async () => {
    const read = vi.fn()
      .mockResolvedValueOnce('# real content')
      .mockImplementationOnce(async () => { throw new FileSystemError('permission', 'denied') })
    const write = vi.fn(async () => {})
    const { result, rerender } = renderWithStub('a.md', { read, write })
    await waitFor(() => expect(result.current.content).toBe('# real content'))
    // Switch to the failing path
    rerender({ p: 'b.md' })
    await waitFor(() => expect(result.current.loadError).not.toBeNull())
    // Even if caller manually invokes save, refuse.
    await act(async () => { await result.current.save() })
    expect(write).not.toHaveBeenCalled()
  })

  it('DOC-4.11-09 (regression): save-previous-on-switch failure is reported (not silent)', async () => {
    const reportError = vi.fn()
    const stub: Repositories = {
      diagram: null,
      document: {
        read: vi.fn().mockResolvedValue('orig'),
        write: vi.fn().mockRejectedValue(new FileSystemError('permission', 'denied')),
      },
      linkIndex: null,
      vaultConfig: null,
    }
    const wrapper = ({ children }: { children: ReactNode }) => {
      const innerProvider = createElement(StubRepositoryProvider, { value: stub, children })
      return createElement(StubShellErrorProvider, {
        value: { current: null, reportError, dismiss: () => {} },
        children: innerProvider,
      })
    }
    const { result, rerender } = renderHook(
      ({ p }) => useDocumentContent(p),
      { initialProps: { p: 'a.md' as string | null }, wrapper },
    )
    await waitFor(() => expect(result.current.content).toBe('orig'))
    act(() => { result.current.updateContent('dirty changes') })
    // Switch — the save-previous throws, which should reportError rather
    // than silently drop the user's edits without trace.
    rerender({ p: 'b.md' })
    await waitFor(() => {
      expect(reportError).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'permission' }),
        expect.stringContaining('Auto-saving a.md'),
      )
    })
  })
})
