import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { emitCrossReferences, type CrossReference } from './graphifyBridge'

// Covers LINK-5.3-01..07 (graphify bridge contract).
// See test-cases/05-links-and-graph.md §5.3.

// ── Minimal File System Access mock (same shape as useLinkIndex.test.ts) ───

class MockFile { constructor(public data: string = '') {} }
class MockFileHandle {
  constructor(public name: string, public file: MockFile) {}
  async createWritable() {
    return {
      write: async (d: string) => { this.file.data = d },
      close: async () => {},
    }
  }
  async getFile() { return { text: async () => this.file.data } }
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
    const err = new Error(`NotFoundError: ${name}`); err.name = 'NotFoundError'; throw err
  }
  async getFileHandle(name: string, opts?: { create?: boolean }): Promise<MockFileHandle> {
    if (this.files.has(name)) return this.files.get(name)!
    if (opts?.create) {
      const fh = new MockFileHandle(name, new MockFile())
      this.files.set(name, fh)
      return fh
    }
    const err = new Error(`NotFoundError: ${name}`); err.name = 'NotFoundError'; throw err
  }
}

function asRoot(dir: MockDir): FileSystemDirectoryHandle {
  return dir as unknown as FileSystemDirectoryHandle
}

let root: MockDir
let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  root = new MockDir()
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  warnSpy.mockRestore()
})

function docToDiagramRef(source: string, target: string): CrossReference {
  return { source, target, type: 'references', sourceType: 'document', targetType: 'diagram' }
}
function diagramToDocRef(source: string, target: string): CrossReference {
  return { source, target, type: 'references', sourceType: 'diagram', targetType: 'document' }
}

/** Read the on-disk JSON (parsed). */
async function readEdgesFile(dir: MockDir): Promise<{ version: number; references: CrossReference[] } | null> {
  const archDir = dir.dirs.get('.archdesigner')
  if (!archDir) return null
  const fh = archDir.files.get('cross-references.json')
  if (!fh) return null
  return JSON.parse(fh.file.data)
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('emitCrossReferences — file output (LINK-5.3-01, 5.3-02)', () => {
  it('LINK-5.3-01: writes .archdesigner/cross-references.json', async () => {
    const refs = [docToDiagramRef('docs/overview.md', 'diagrams/flow.json')]
    await emitCrossReferences(asRoot(root), refs)

    expect(root.dirs.has('.archdesigner')).toBe(true)
    const archDir = root.dirs.get('.archdesigner')!
    expect(archDir.files.has('cross-references.json')).toBe(true)
  })

  it('LINK-5.3-02: file has { version, references: [{source, target, type, sourceType, targetType}] } shape', async () => {
    const refs = [
      docToDiagramRef('docs/a.md', 'diagrams/x.json'),
      docToDiagramRef('docs/b.md', 'diagrams/y.json'),
    ]
    await emitCrossReferences(asRoot(root), refs)

    const parsed = await readEdgesFile(root)
    expect(parsed).not.toBeNull()
    expect(parsed!.version).toBe(1)
    expect(Array.isArray(parsed!.references)).toBe(true)
    expect(parsed!.references).toHaveLength(2)
    expect(parsed!.references[0]).toMatchObject({
      source: 'docs/a.md',
      target: 'diagrams/x.json',
      type: 'references',
      sourceType: 'document',
      targetType: 'diagram',
    })
  })
})

describe('emitCrossReferences — overwrite semantics (LINK-5.3-03)', () => {
  it('LINK-5.3-03: second call replaces the previous content entirely', async () => {
    await emitCrossReferences(asRoot(root), [
      docToDiagramRef('docs/a.md', 'diagrams/x.json'),
    ])
    const first = await readEdgesFile(root)
    expect(first!.references).toHaveLength(1)

    await emitCrossReferences(asRoot(root), [
      docToDiagramRef('docs/b.md', 'diagrams/y.json'),
      docToDiagramRef('docs/c.md', 'diagrams/z.json'),
    ])
    const second = await readEdgesFile(root)
    expect(second!.references).toHaveLength(2)
    expect(second!.references.map((r) => r.source)).toEqual(['docs/b.md', 'docs/c.md'])
    // First call's source should be gone — not appended.
    expect(second!.references.find((r) => r.source === 'docs/a.md')).toBeUndefined()
  })
})

describe('emitCrossReferences — error handling (LINK-5.3-04)', () => {
  it('LINK-5.3-04: write failure is swallowed and logged via console.warn', async () => {
    // Make getDirectoryHandle throw — simulates FS error or permission denied.
    const breaker = {
      getDirectoryHandle: async () => { throw new Error('permission denied') },
    } as unknown as FileSystemDirectoryHandle

    await expect(
      emitCrossReferences(breaker, [docToDiagramRef('a.md', 'x.json')]),
    ).resolves.toBeUndefined()

    expect(warnSpy).toHaveBeenCalledWith('Failed to emit cross-references for graphify')
  })

  it('swallows createWritable failure too', async () => {
    const hostile = {
      getDirectoryHandle: async () => ({
        getFileHandle: async () => ({
          createWritable: async () => { throw new Error('disk full') },
        }),
      }),
    } as unknown as FileSystemDirectoryHandle

    await expect(
      emitCrossReferences(hostile, [docToDiagramRef('a.md', 'x.json')]),
    ).resolves.toBeUndefined()
    expect(warnSpy).toHaveBeenCalled()
  })
})

describe('emitCrossReferences — empty references (LINK-5.3-05)', () => {
  it('LINK-5.3-05: empty outbound still writes a valid file with empty references array', async () => {
    await emitCrossReferences(asRoot(root), [])
    const parsed = await readEdgesFile(root)
    expect(parsed).not.toBeNull()
    expect(parsed!.version).toBe(1)
    expect(parsed!.references).toEqual([])
  })
})

describe('emitCrossReferences — edge directionality (LINK-5.3-06, 5.3-07)', () => {
  it('LINK-5.3-06: diagram → document edges recorded with sourceType=diagram, targetType=document', async () => {
    await emitCrossReferences(asRoot(root), [
      diagramToDocRef('diagrams/auth-flow.json', 'docs/auth-overview.md'),
    ])
    const parsed = await readEdgesFile(root)
    const edge = parsed!.references[0]
    expect(edge.sourceType).toBe('diagram')
    expect(edge.targetType).toBe('document')
    expect(edge.source).toBe('diagrams/auth-flow.json')
    expect(edge.target).toBe('docs/auth-overview.md')
  })

  it('LINK-5.3-07: document → diagram edges recorded with sourceType=document, targetType=diagram', async () => {
    await emitCrossReferences(asRoot(root), [
      docToDiagramRef('docs/overview.md', 'diagrams/schema.json'),
    ])
    const parsed = await readEdgesFile(root)
    const edge = parsed!.references[0]
    expect(edge.sourceType).toBe('document')
    expect(edge.targetType).toBe('diagram')
    expect(edge.source).toBe('docs/overview.md')
    expect(edge.target).toBe('diagrams/schema.json')
  })

  it('mixed edges in one call — both directions preserved', async () => {
    await emitCrossReferences(asRoot(root), [
      docToDiagramRef('docs/a.md', 'diagrams/x.json'),
      diagramToDocRef('diagrams/y.json', 'docs/b.md'),
      { source: 'docs/c.md', target: 'docs/d.md', type: 'references', sourceType: 'document', targetType: 'document' },
    ])
    const parsed = await readEdgesFile(root)
    expect(parsed!.references).toHaveLength(3)
    expect(parsed!.references[0].sourceType).toBe('document')
    expect(parsed!.references[1].sourceType).toBe('diagram')
    expect(parsed!.references[2].targetType).toBe('document')
  })
})

describe('emitCrossReferences — .archdesigner folder creation', () => {
  it('creates the .archdesigner directory if it does not exist', async () => {
    expect(root.dirs.has('.archdesigner')).toBe(false)
    await emitCrossReferences(asRoot(root), [])
    expect(root.dirs.has('.archdesigner')).toBe(true)
  })

  it('reuses an existing .archdesigner directory without error', async () => {
    // Pre-seed the directory.
    await root.getDirectoryHandle('.archdesigner', { create: true })
    await emitCrossReferences(asRoot(root), [docToDiagramRef('a.md', 'x.json')])
    const parsed = await readEdgesFile(root)
    expect(parsed!.references).toHaveLength(1)
  })
})
