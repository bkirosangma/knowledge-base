import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { useDocumentContent } from './useDocumentContent'
import { MockDir } from '../../../shared/testUtils/fsMock'
import { RepositoryProvider } from '../../../shell/RepositoryContext'
import { ShellErrorProvider } from '../../../shell/ShellErrorContext'
import {
  saveDocumentDraft,
  loadDocumentDraft,
  hasDraft,
} from '../../../shared/utils/persistence'

// KB-002: covers restore-on-mount / save-clears-draft / discard semantics
// for the per-document autosave introduced for DOC-4.11. Companion e2e at
// `e2e/documentDraftRestore.spec.ts` exercises the full reload flow.

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

beforeEach(() => {
  root = new MockDir()
  localStorage.clear()
})

afterEach(() => {
  localStorage.clear()
})

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

describe('useDocumentContent — KB-002 draft restore on mount', () => {
  it('restores the draft and surfaces the banner when draft.content differs from disk', async () => {
    await seedFile(root, 'notes/a.md', '# disk')
    saveDocumentDraft('notes/a.md', '# unsaved edits')

    const { result } = renderDocContent('notes/a.md')

    await waitFor(() => expect(result.current.content).toBe('# unsaved edits'))
    expect(result.current.dirty).toBe(true)
    expect(result.current.pendingDraft).not.toBeNull()
    expect(result.current.pendingDraft!.savedAt).toBeGreaterThan(0)
  })

  it('silently clears a stale draft (matches disk) and does not raise the banner', async () => {
    await seedFile(root, 'notes/a.md', 'identical')
    saveDocumentDraft('notes/a.md', 'identical')
    expect(hasDraft('notes/a.md')).toBe(true)

    const { result } = renderDocContent('notes/a.md')

    await waitFor(() => expect(result.current.content).toBe('identical'))
    expect(result.current.dirty).toBe(false)
    expect(result.current.pendingDraft).toBeNull()
    expect(hasDraft('notes/a.md')).toBe(false)
  })

  it('does nothing special when no draft exists', async () => {
    await seedFile(root, 'notes/a.md', 'fresh')

    const { result } = renderDocContent('notes/a.md')

    await waitFor(() => expect(result.current.content).toBe('fresh'))
    expect(result.current.dirty).toBe(false)
    expect(result.current.pendingDraft).toBeNull()
  })
})

describe('useDocumentContent — KB-002 save clears the draft', () => {
  it('save() clears the persisted draft and dismisses the banner', async () => {
    await seedFile(root, 'notes/a.md', '# disk')
    saveDocumentDraft('notes/a.md', '# unsaved')

    const { result } = renderDocContent('notes/a.md')
    await waitFor(() => expect(result.current.pendingDraft).not.toBeNull())

    await act(async () => { await result.current.save() })

    expect(hasDraft('notes/a.md')).toBe(false)
    expect(result.current.pendingDraft).toBeNull()
    expect(result.current.dirty).toBe(false)
  })
})

describe('useDocumentContent — KB-002 discard semantics', () => {
  it('discard() drops the draft, restores disk content, and dismisses the banner', async () => {
    await seedFile(root, 'notes/a.md', '# disk version')
    saveDocumentDraft('notes/a.md', '# draft version')

    const { result } = renderDocContent('notes/a.md')
    await waitFor(() => expect(result.current.content).toBe('# draft version'))
    expect(result.current.pendingDraft).not.toBeNull()

    await act(async () => { await result.current.discard() })

    expect(result.current.content).toBe('# disk version')
    expect(result.current.dirty).toBe(false)
    expect(result.current.pendingDraft).toBeNull()
    expect(hasDraft('notes/a.md')).toBe(false)
  })

  it('dismissDraftBanner() keeps the dirty content but hides the banner', async () => {
    await seedFile(root, 'notes/a.md', '# disk')
    saveDocumentDraft('notes/a.md', '# draft')

    const { result } = renderDocContent('notes/a.md')
    await waitFor(() => expect(result.current.pendingDraft).not.toBeNull())

    act(() => { result.current.dismissDraftBanner() })

    expect(result.current.pendingDraft).toBeNull()
    expect(result.current.content).toBe('# draft')
    expect(result.current.dirty).toBe(true)
  })
})

describe('useDocumentContent — KB-002 debounced autosave on edit', () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }) })
  afterEach(() => { vi.useRealTimers() })

  it('persists dirty content to localStorage 500ms after the last keystroke', async () => {
    await seedFile(root, 'notes/a.md', 'original')
    const { result } = renderDocContent('notes/a.md')
    await waitFor(() => expect(result.current.content).toBe('original'))

    act(() => { result.current.updateContent('typing...') })
    expect(loadDocumentDraft('notes/a.md')).toBeNull()

    await act(async () => { await vi.advanceTimersByTimeAsync(500) })

    const draft = loadDocumentDraft('notes/a.md')
    expect(draft?.content).toBe('typing...')
    expect(draft?.savedAt).toBeGreaterThan(0)
  })
})
