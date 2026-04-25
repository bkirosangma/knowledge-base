import { describe, it, expect } from 'vitest'
import { fnv1a, historyFileName, resolveParentHandle, readHistoryFile, writeHistoryFile } from './historyPersistence'
import type { HistoryFile } from './historyPersistence'
import { MockDir, MockFile, MockFileHandle } from '../testUtils/fsMock'

describe('fnv1a', () => {
  it('returns an 8-char hex string', () => {
    expect(fnv1a('hello')).toMatch(/^[0-9a-f]{8}$/)
  })
  it('returns the same hash for the same input', () => {
    expect(fnv1a('abc')).toBe(fnv1a('abc'))
  })
  it('returns different hashes for different inputs', () => {
    expect(fnv1a('abc')).not.toBe(fnv1a('xyz'))
  })
})

describe('historyFileName', () => {
  it('includes .json extension in sidecar name', () => {
    expect(historyFileName('diagram.json')).toBe('.diagram.json.history.json')
  })
  it('includes .md extension in sidecar name', () => {
    expect(historyFileName('notes.md')).toBe('.notes.md.history.json')
  })
  it('preserves directory prefix', () => {
    expect(historyFileName('docs/notes.md')).toBe('docs/.notes.md.history.json')
  })
  it('handles nested paths', () => {
    expect(historyFileName('a/b/c.json')).toBe('a/b/.c.json.history.json')
  })
})

describe('HIST-5.3: resolveParentHandle', () => {
  it('HIST-5.3-01: traverses directory tree and returns parent handle', async () => {
    const root = new MockDir('root')
    const sub = new MockDir('sub')
    root.dirs.set('sub', sub)
    const result = await resolveParentHandle(
      root as unknown as FileSystemDirectoryHandle,
      'sub/notes.md',
    )
    expect(result).toBe(sub)
  })

  it('HIST-5.3-02: returns root handle when filePath has no directory', async () => {
    const root = new MockDir('root')
    const result = await resolveParentHandle(
      root as unknown as FileSystemDirectoryHandle,
      'notes.md',
    )
    expect(result).toBe(root)
  })
})

describe('HIST-5.4: readHistoryFile', () => {
  it('HIST-5.4-01: returns null when history file does not exist', async () => {
    const root = new MockDir('root')
    const result = await readHistoryFile(root as unknown as FileSystemDirectoryHandle, 'notes.md')
    expect(result).toBeNull()
  })

  it('HIST-5.4-02: parses and returns valid HistoryFile JSON', async () => {
    const root = new MockDir('root')
    const data: HistoryFile<string> = {
      checksum: 'abc123',
      currentIndex: 1,
      savedIndex: 0,
      entries: [
        { id: 0, description: 'File loaded', timestamp: 1000, snapshot: 'v0' },
        { id: 1, description: 'Draft', timestamp: 2000, snapshot: 'v1' },
      ],
    }
    const histFile = new MockFileHandle('.notes.md.history.json', new MockFile(JSON.stringify(data)))
    root.files.set('.notes.md.history.json', histFile)
    const result = await readHistoryFile<string>(root as unknown as FileSystemDirectoryHandle, 'notes.md')
    expect(result).toEqual(data)
  })

  it('HIST-5.4-03: returns null for malformed JSON', async () => {
    const root = new MockDir('root')
    const histFile = new MockFileHandle('.notes.md.history.json', new MockFile('not valid json{'))
    root.files.set('.notes.md.history.json', histFile)
    const result = await readHistoryFile(root as unknown as FileSystemDirectoryHandle, 'notes.md')
    expect(result).toBeNull()
  })

  it('HIST-5.4-04: falls back to legacy sidecar name for migration', async () => {
    const root = new MockDir('root')
    const data: HistoryFile<string> = {
      checksum: 'abc123',
      currentIndex: 0,
      savedIndex: 0,
      entries: [{ id: 0, description: 'File loaded', timestamp: 1000, snapshot: 'v0' }],
    }
    // Only the old-format sidecar exists
    const histFile = new MockFileHandle('.notes.history.json', new MockFile(JSON.stringify(data)))
    root.files.set('.notes.history.json', histFile)
    const result = await readHistoryFile<string>(root as unknown as FileSystemDirectoryHandle, 'notes.md')
    expect(result).toEqual(data)
  })
})

describe('HIST-5.5: writeHistoryFile', () => {
  it('HIST-5.5-01: creates and writes serialized HistoryFile JSON', async () => {
    const root = new MockDir('root')
    const data: HistoryFile<string> = {
      checksum: 'abc123',
      currentIndex: 0,
      savedIndex: 0,
      entries: [{ id: 0, description: 'File loaded', timestamp: 1000, snapshot: 'v0' }],
    }
    await writeHistoryFile(root as unknown as FileSystemDirectoryHandle, 'notes.md', data)
    const writtenHandle = root.files.get('.notes.md.history.json')
    expect(writtenHandle).toBeDefined()
    expect(JSON.parse(writtenHandle!.file.data)).toEqual(data)
  })

  it('HIST-5.5-02: silently ignores write errors', async () => {
    const root = new MockDir('root')
    // Nested path whose parent dir does not exist — getDirectoryHandle throws NotFoundError
    await expect(
      writeHistoryFile(root as unknown as FileSystemDirectoryHandle, 'missing/notes.md', {
        checksum: 'x',
        currentIndex: 0,
        savedIndex: 0,
        entries: [],
      })
    ).resolves.toBeUndefined()
  })
})
