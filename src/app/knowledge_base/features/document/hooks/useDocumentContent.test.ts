import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useRef } from 'react'
import { useDocumentContent } from './useDocumentContent'

// Covers DOC-4.11-01 through 4.11-06 (per-pane content + dirty + bridge + save).
// Uses an in-memory FileSystemDirectoryHandle mock (same pattern as vaultConfig.test.ts).

class MockFile {
  constructor(public data: string = '') {}
}
class MockFileHandle {
  constructor(public name: string, public file: MockFile) {}
  async createWritable() {
    return {
      write: async (d: string) => { this.file.data = d },
      close: async () => {},
    }
  }
  async getFile() {
    return { text: async () => this.file.data }
  }
}
class MockDir {
  dirs = new Map<string, MockDir>()
  files = new Map<string, MockFileHandle>()
  constructor(public name = 'root') {}

  async getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<MockDir> {
    if (this.dirs.has(name)) return this.dirs.get(name)!
    if (opts?.create) {
      const d = new MockDir(name)
      this.dirs.set(name, d)
      return d
    }
    const err = new Error(`NotFoundError: ${name}`)
    err.name = 'NotFoundError'
    throw err
  }

  async getFileHandle(name: string, opts?: { create?: boolean }): Promise<MockFileHandle> {
    if (this.files.has(name)) return this.files.get(name)!
    if (opts?.create) {
      const fh = new MockFileHandle(name, new MockFile())
      this.files.set(name, fh)
      return fh
    }
    const err = new Error(`NotFoundError: ${name}`)
    err.name = 'NotFoundError'
    throw err
  }
}

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

/** Render the hook with a ref pointing to the mock root. */
function renderDocContent(filePath: string | null) {
  return renderHook(({ p }) => {
    const ref = useRef<FileSystemDirectoryHandle | null>(root as unknown as FileSystemDirectoryHandle)
    return useDocumentContent(ref, p)
  }, { initialProps: { p: filePath } })
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
