import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { emitCrossReferences, type CrossReference } from './graphifyBridge'

// Covers LINK-5.3-01..07 (graphify bridge contract).
// See test-cases/05-links-and-graph.md §5.3.

let warnSpy: ReturnType<typeof vi.spyOn>
let written: Map<string, string>

beforeEach(() => {
  written = new Map()
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  warnSpy.mockRestore()
})

/** A writeText stub that records the content of the last write. */
function makeWriteText(): (path: string, content: string) => Promise<void> {
  return async (path, content) => {
    written.set(path, content)
  }
}

function docToDiagramRef(source: string, target: string): CrossReference {
  return { source, target, type: 'references', sourceType: 'document', targetType: 'diagram' }
}
function diagramToDocRef(source: string, target: string): CrossReference {
  return { source, target, type: 'references', sourceType: 'diagram', targetType: 'document' }
}

/** Read the in-memory JSON (parsed). */
function readEdgesFile(): { version: number; references: CrossReference[] } | null {
  const text = written.get('.archdesigner/cross-references.json')
  if (!text) return null
  return JSON.parse(text)
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('emitCrossReferences — file output (LINK-5.3-01, 5.3-02)', () => {
  it('LINK-5.3-01: writes .archdesigner/cross-references.json', async () => {
    const refs = [docToDiagramRef('docs/overview.md', 'diagrams/flow.json')]
    await emitCrossReferences(makeWriteText(), refs)

    expect(written.has('.archdesigner/cross-references.json')).toBe(true)
  })

  it('LINK-5.3-02: file has { version, references: [{source, target, type, sourceType, targetType}] } shape', async () => {
    const refs = [
      docToDiagramRef('docs/a.md', 'diagrams/x.json'),
      docToDiagramRef('docs/b.md', 'diagrams/y.json'),
    ]
    await emitCrossReferences(makeWriteText(), refs)

    const parsed = readEdgesFile()
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
    const writeText = makeWriteText()
    await emitCrossReferences(writeText, [
      docToDiagramRef('docs/a.md', 'diagrams/x.json'),
    ])
    const first = readEdgesFile()
    expect(first!.references).toHaveLength(1)

    await emitCrossReferences(writeText, [
      docToDiagramRef('docs/b.md', 'diagrams/y.json'),
      docToDiagramRef('docs/c.md', 'diagrams/z.json'),
    ])
    const second = readEdgesFile()
    expect(second!.references).toHaveLength(2)
    expect(second!.references.map((r) => r.source)).toEqual(['docs/b.md', 'docs/c.md'])
    // First call's source should be gone — not appended.
    expect(second!.references.find((r) => r.source === 'docs/a.md')).toBeUndefined()
  })
})

describe('emitCrossReferences — error handling (LINK-5.3-04)', () => {
  it('LINK-5.3-04: write failure is swallowed and logged via console.warn', async () => {
    const failingWrite = async (_path: string, _content: string): Promise<void> => {
      throw new Error('permission denied')
    }

    await expect(
      emitCrossReferences(failingWrite, [docToDiagramRef('a.md', 'x.json')]),
    ).resolves.toBeUndefined()

    expect(warnSpy).toHaveBeenCalledWith('Failed to emit cross-references for graphify')
  })

  it('swallows write failure too', async () => {
    const failingWrite = async (): Promise<void> => {
      throw new Error('disk full')
    }

    await expect(
      emitCrossReferences(failingWrite, [docToDiagramRef('a.md', 'x.json')]),
    ).resolves.toBeUndefined()
    expect(warnSpy).toHaveBeenCalled()
  })
})

describe('emitCrossReferences — empty references (LINK-5.3-05)', () => {
  it('LINK-5.3-05: empty outbound still writes a valid file with empty references array', async () => {
    await emitCrossReferences(makeWriteText(), [])
    const parsed = readEdgesFile()
    expect(parsed).not.toBeNull()
    expect(parsed!.version).toBe(1)
    expect(parsed!.references).toEqual([])
  })
})

describe('emitCrossReferences — edge directionality (LINK-5.3-06, 5.3-07)', () => {
  it('LINK-5.3-06: diagram → document edges recorded with sourceType=diagram, targetType=document', async () => {
    await emitCrossReferences(makeWriteText(), [
      diagramToDocRef('diagrams/auth-flow.json', 'docs/auth-overview.md'),
    ])
    const parsed = readEdgesFile()
    const edge = parsed!.references[0]
    expect(edge.sourceType).toBe('diagram')
    expect(edge.targetType).toBe('document')
    expect(edge.source).toBe('diagrams/auth-flow.json')
    expect(edge.target).toBe('docs/auth-overview.md')
  })

  it('LINK-5.3-07: document → diagram edges recorded with sourceType=document, targetType=diagram', async () => {
    await emitCrossReferences(makeWriteText(), [
      docToDiagramRef('docs/overview.md', 'diagrams/schema.json'),
    ])
    const parsed = readEdgesFile()
    const edge = parsed!.references[0]
    expect(edge.sourceType).toBe('document')
    expect(edge.targetType).toBe('diagram')
    expect(edge.source).toBe('docs/overview.md')
    expect(edge.target).toBe('diagrams/schema.json')
  })

  it('mixed edges in one call — both directions preserved', async () => {
    await emitCrossReferences(makeWriteText(), [
      docToDiagramRef('docs/a.md', 'diagrams/x.json'),
      diagramToDocRef('diagrams/y.json', 'docs/b.md'),
      { source: 'docs/c.md', target: 'docs/d.md', type: 'references', sourceType: 'document', targetType: 'document' },
    ])
    const parsed = readEdgesFile()
    expect(parsed!.references).toHaveLength(3)
    expect(parsed!.references[0].sourceType).toBe('document')
    expect(parsed!.references[1].sourceType).toBe('diagram')
    expect(parsed!.references[2].targetType).toBe('document')
  })
})

describe('emitCrossReferences — write is called', () => {
  it('calls writeText with the correct path', async () => {
    const calls: [string, string][] = []
    const captureWrite = async (path: string, content: string): Promise<void> => {
      calls.push([path, content])
    }
    await emitCrossReferences(captureWrite, [])
    expect(calls).toHaveLength(1)
    expect(calls[0][0]).toBe('.archdesigner/cross-references.json')
  })

  it('reuses an existing call without error', async () => {
    const writeText = makeWriteText()
    await emitCrossReferences(writeText, [docToDiagramRef('a.md', 'x.json')])
    const parsed = readEdgesFile()
    expect(parsed!.references).toHaveLength(1)
  })
})
