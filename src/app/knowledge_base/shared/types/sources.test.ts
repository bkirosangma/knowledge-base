import { describe, it, expect } from 'vitest'
import { isValidSourceUrl, sourceDisplayLabel, type SourceLink } from './sources'

describe('isValidSourceUrl', () => {
  it('accepts https URLs', () => {
    expect(isValidSourceUrl('https://datatracker.ietf.org/doc/html/rfc6749')).toBe(true)
  })

  it('accepts http URLs', () => {
    expect(isValidSourceUrl('http://example.com')).toBe(true)
  })

  it('rejects javascript: scheme', () => {
    expect(isValidSourceUrl('javascript:alert(1)')).toBe(false)
  })

  it('rejects data: scheme', () => {
    expect(isValidSourceUrl('data:text/html,<x>')).toBe(false)
  })

  it('rejects file: scheme', () => {
    expect(isValidSourceUrl('file:///etc/passwd')).toBe(false)
  })

  it('rejects malformed URLs', () => {
    expect(isValidSourceUrl('not-a-url')).toBe(false)
  })

  it('rejects empty string', () => {
    expect(isValidSourceUrl('')).toBe(false)
  })
})

describe('sourceDisplayLabel', () => {
  it('returns title when present and non-empty', () => {
    const source: SourceLink = { url: 'https://x.com', title: 'X' }
    expect(sourceDisplayLabel(source)).toBe('X')
  })

  it('falls back to host when title is missing', () => {
    const source: SourceLink = { url: 'https://datatracker.ietf.org/foo' }
    expect(sourceDisplayLabel(source)).toBe('datatracker.ietf.org')
  })

  it('falls back to host when title is empty string', () => {
    const source: SourceLink = { url: 'https://example.com', title: '' }
    expect(sourceDisplayLabel(source)).toBe('example.com')
  })

  it('treats whitespace-only title as blank', () => {
    const source: SourceLink = { url: 'https://example.com', title: '   ' }
    expect(sourceDisplayLabel(source)).toBe('example.com')
  })

  it('returns raw URL when URL parsing fails', () => {
    const source: SourceLink = { url: 'not-a-url' }
    expect(sourceDisplayLabel(source)).toBe('not-a-url')
  })
})
