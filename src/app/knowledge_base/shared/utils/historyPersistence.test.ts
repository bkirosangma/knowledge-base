import { describe, it, expect } from 'vitest'
import { fnv1a, historyFileName } from './historyPersistence'

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
  it('strips .json extension', () => {
    expect(historyFileName('diagram.json')).toBe('.diagram.history.json')
  })
  it('strips .md extension', () => {
    expect(historyFileName('notes.md')).toBe('.notes.history.json')
  })
  it('preserves directory prefix', () => {
    expect(historyFileName('docs/notes.md')).toBe('docs/.notes.history.json')
  })
  it('handles nested paths', () => {
    expect(historyFileName('a/b/c.json')).toBe('a/b/.c.history.json')
  })
})
