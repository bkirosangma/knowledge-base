import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDocuments } from './useDocuments'
import type { TreeNode } from '../../../shared/hooks/useFileExplorer'

// Covers DOC-4.11-08 through 4.11-13 (attach/detach/getForEntity/hasDocuments/collectPaths).
// `createDocument` calls out to writeTextFile (disk write) — covered in the
// small-components bucket via a real FS mock.

describe('collectDocPaths / existingDocPaths', () => {
  const tree: TreeNode[] = [
    {
      name: 'folder', path: 'folder', type: 'folder',
      children: [
        { name: 'a.md', path: 'folder/a.md', type: 'file', fileType: 'document' },
        { name: 'b.json', path: 'folder/b.json', type: 'file', fileType: 'diagram' },
      ],
    },
    { name: 'c.md', path: 'c.md', type: 'file', fileType: 'document' },
    { name: 'other.txt', path: 'other.txt', type: 'file' }, // no fileType
  ]

  it('DOC-4.11-12: walks the tree and returns only document paths', () => {
    const { result } = renderHook(() => useDocuments())
    expect(result.current.collectDocPaths(tree)).toEqual([
      'folder/a.md', 'c.md',
    ])
  })

  it('DOC-4.11-13: existingDocPaths returns a Set of the same values', () => {
    const { result } = renderHook(() => useDocuments())
    const set = result.current.existingDocPaths(tree)
    expect(set).toBeInstanceOf(Set)
    expect(set.has('folder/a.md')).toBe(true)
    expect(set.has('c.md')).toBe(true)
    expect(set.has('folder/b.json')).toBe(false)
    expect(set.size).toBe(2)
  })

  it('handles empty tree', () => {
    const { result } = renderHook(() => useDocuments())
    expect(result.current.collectDocPaths([])).toEqual([])
    expect(result.current.existingDocPaths([]).size).toBe(0)
  })
})

describe('attachDocument / detachDocument', () => {
  it('DOC-4.11-08: adds a new DocumentMeta when the doc is not yet tracked', () => {
    const { result } = renderHook(() => useDocuments())
    act(() => {
      result.current.attachDocument('notes/a.md', 'node', 'n-1')
    })
    expect(result.current.documents).toHaveLength(1)
    expect(result.current.documents[0]).toMatchObject({
      filename: 'notes/a.md',
      title: 'a', // strips .md
      attachedTo: [{ type: 'node', id: 'n-1' }],
    })
    expect(result.current.documents[0].id).toMatch(/^doc-/)
  })

  it('appends a second attachment to an existing DocumentMeta', () => {
    const { result } = renderHook(() => useDocuments())
    act(() => {
      result.current.attachDocument('a.md', 'node', 'n-1')
      result.current.attachDocument('a.md', 'flow', 'f-1')
    })
    expect(result.current.documents).toHaveLength(1)
    expect(result.current.documents[0].attachedTo).toEqual([
      { type: 'node', id: 'n-1' },
      { type: 'flow', id: 'f-1' },
    ])
  })

  it('attachDocument is idempotent — same (type, id) pair does not duplicate', () => {
    const { result } = renderHook(() => useDocuments())
    act(() => {
      result.current.attachDocument('a.md', 'node', 'n-1')
      result.current.attachDocument('a.md', 'node', 'n-1')
    })
    expect(result.current.documents[0].attachedTo).toHaveLength(1)
  })

  it('DOC-4.11-09: detach removes one specific (type, id) attachment', () => {
    const { result } = renderHook(() => useDocuments())
    act(() => {
      result.current.attachDocument('a.md', 'node', 'n-1')
      result.current.attachDocument('a.md', 'flow', 'f-1')
    })
    act(() => {
      result.current.detachDocument('a.md', 'node', 'n-1')
    })
    expect(result.current.documents[0].attachedTo).toEqual([
      { type: 'flow', id: 'f-1' },
    ])
  })

  it('detaching the last attachment purges the DocumentMeta entry entirely', () => {
    const { result } = renderHook(() => useDocuments())
    act(() => {
      result.current.attachDocument('a.md', 'node', 'n-1')
    })
    act(() => {
      result.current.detachDocument('a.md', 'node', 'n-1')
    })
    expect(result.current.documents).toEqual([])
  })

  it('detach is a no-op for an unknown document or attachment', () => {
    const { result } = renderHook(() => useDocuments())
    act(() => {
      result.current.detachDocument('nope.md', 'node', 'n-1')
    })
    expect(result.current.documents).toEqual([])
  })
})

describe('getDocumentsForEntity / hasDocuments', () => {
  it('DOC-4.11-10: getDocumentsForEntity filters by (type, id)', () => {
    const { result } = renderHook(() => useDocuments())
    act(() => {
      result.current.attachDocument('a.md', 'node', 'n-1')
      result.current.attachDocument('b.md', 'node', 'n-1')
      result.current.attachDocument('c.md', 'flow', 'f-1')
    })
    const forNode = result.current.getDocumentsForEntity('node', 'n-1')
    expect(forNode.map((d) => d.filename).sort()).toEqual(['a.md', 'b.md'])

    const forOther = result.current.getDocumentsForEntity('node', 'other')
    expect(forOther).toEqual([])
  })

  it('DOC-4.11-11: hasDocuments is true when at least one doc is attached', () => {
    const { result } = renderHook(() => useDocuments())
    expect(result.current.hasDocuments('node', 'n-1')).toBe(false)
    act(() => {
      result.current.attachDocument('a.md', 'node', 'n-1')
    })
    expect(result.current.hasDocuments('node', 'n-1')).toBe(true)
    expect(result.current.hasDocuments('node', 'other')).toBe(false)
  })
})

describe('title derivation in attachDocument', () => {
  it('strips .md and uses the basename', () => {
    const { result } = renderHook(() => useDocuments())
    act(() => {
      result.current.attachDocument('deep/nested/file.md', 'node', 'n-1')
    })
    expect(result.current.documents[0].title).toBe('file')
  })

  it('falls back to the full path when basename is unavailable', () => {
    // Edge case: empty string. Implementation uses split("/").pop() which on
    // "" returns ""; the ?? fallback to docPath covers that.
    const { result } = renderHook(() => useDocuments())
    act(() => {
      result.current.attachDocument('x.md', 'node', 'id')
    })
    expect(result.current.documents[0].title).toBe('x')
  })
})
