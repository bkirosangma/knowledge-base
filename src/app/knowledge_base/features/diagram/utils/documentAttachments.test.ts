import { describe, it, expect } from 'vitest'
import type { DocumentMeta } from '../../document/types'
import { hasDocuments, getDocumentsForEntity } from './documentAttachments'

// Covers DIAG-3.18-06 (getDocumentsForEntity) and DIAG-3.18-07 (hasDocuments).

const doc = (
  id: string,
  attached?: DocumentMeta['attachedTo'],
): DocumentMeta => ({ id, filename: `${id}.md`, title: id, attachedTo: attached })

const fixtures: DocumentMeta[] = [
  doc('d1', [{ type: 'node', id: 'n1' }]),
  doc('d2', [{ type: 'node', id: 'n1' }, { type: 'connection', id: 'c1' }]),
  doc('d3', [{ type: 'connection', id: 'c1' }]),
  doc('d4', [{ type: 'flow', id: 'f1' }]),
  doc('d5'),                             // no attachments
  doc('d6', []),                         // explicit empty attachments
  doc('d7', [{ type: 'root', id: 'root' }]),
]

describe('hasDocuments (DIAG-3.18-07)', () => {
  it('returns true when at least one doc is attached to the entity', () => {
    expect(hasDocuments(fixtures, 'node', 'n1')).toBe(true)
    expect(hasDocuments(fixtures, 'connection', 'c1')).toBe(true)
    expect(hasDocuments(fixtures, 'flow', 'f1')).toBe(true)
    expect(hasDocuments(fixtures, 'root', 'root')).toBe(true)
  })

  it('returns false when no doc is attached', () => {
    expect(hasDocuments(fixtures, 'node', 'n-missing')).toBe(false)
    expect(hasDocuments(fixtures, 'connection', 'c-missing')).toBe(false)
    expect(hasDocuments(fixtures, 'unknown-type', 'n1')).toBe(false)
  })

  it('returns false on an empty documents array', () => {
    expect(hasDocuments([], 'node', 'n1')).toBe(false)
  })

  it('ignores docs with undefined or empty attachedTo', () => {
    const only = [doc('x'), doc('y', [])]
    expect(hasDocuments(only, 'node', 'n1')).toBe(false)
  })
})

describe('getDocumentsForEntity (DIAG-3.18-06)', () => {
  it('returns every doc attached to the entity, in order', () => {
    const result = getDocumentsForEntity(fixtures, 'node', 'n1')
    expect(result.map((d) => d.id)).toEqual(['d1', 'd2'])
  })

  it('returns a doc even when it attaches to multiple entities', () => {
    const result = getDocumentsForEntity(fixtures, 'connection', 'c1')
    expect(result.map((d) => d.id).sort()).toEqual(['d2', 'd3'])
  })

  it('returns empty array when nothing matches', () => {
    expect(getDocumentsForEntity(fixtures, 'node', 'n-missing')).toEqual([])
    expect(getDocumentsForEntity(fixtures, 'unknown-type', 'n1')).toEqual([])
  })

  it('returns empty array on an empty documents list', () => {
    expect(getDocumentsForEntity([], 'node', 'n1')).toEqual([])
  })

  it('type and id must both match — same id under a different type does not leak', () => {
    // d3 is attached to ('connection', 'c1'); asking for ('node', 'c1') must miss.
    expect(getDocumentsForEntity(fixtures, 'node', 'c1')).toEqual([])
  })
})
