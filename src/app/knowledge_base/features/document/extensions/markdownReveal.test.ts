import { describe, it, expect } from 'vitest'
import { SYNTAX_PATTERNS } from './markdownReveal'

// Covers DOC-4.3-28..33 at the regex level. The full decoration pipeline
// (rawBlock → decorations in a live Tiptap editor) is integration-level and
// is exercised only when the editor mounts; we can't drive that without a
// Tiptap harness, so this test pins the RegExp contract.

/** Given the markdown syntax patterns, find which tags match a given string. */
function matchTags(input: string): string[] {
  const tags: string[] = []
  for (const { re, tags: ts } of SYNTAX_PATTERNS) {
    re.lastIndex = 0
    if (re.test(input)) tags.push(...ts)
  }
  return tags
}

describe('SYNTAX_PATTERNS — delimiter recognition', () => {
  it('DOC-4.3-28: **bold** matches the strong pattern', () => {
    expect(matchTags('**hello**')).toContain('strong')
  })

  it('DOC-4.3-29: *italic* matches the em pattern', () => {
    expect(matchTags('*hello*')).toContain('em')
  })

  it('DOC-4.3-30: ~~strike~~ matches the s pattern', () => {
    expect(matchTags('~~hello~~')).toContain('s')
  })

  it('DOC-4.3-31: `code` matches the code pattern', () => {
    expect(matchTags('`hello`')).toContain('code')
  })

  it('DOC-4.3-32: ***bold+italic*** matches both strong and em', () => {
    const tags = matchTags('***hello***')
    expect(tags).toContain('strong')
    expect(tags).toContain('em')
  })

  it('DOC-4.3-33: single * inside **bold** is NOT matched as italic on the outer string', () => {
    // The decoration pipeline uses skip-overlap logic to prevent single-*
    // matches from firing inside strong runs. At the regex level, the italic
    // pattern's lookahead/lookbehind excludes consecutive asterisks, so
    // `**hello**` should not produce an italic match on the outer delimiters.
    const italicRegex = SYNTAX_PATTERNS.find((p) => p.tags[0] === 'em')!.re
    italicRegex.lastIndex = 0
    const match = italicRegex.exec('**hello**')
    // Italic regex cannot match `**…**` as a single run because the look-
    // behind/ahead reject adjacent asterisks. If it matches at all, the body
    // must not span `**`.
    if (match) {
      expect(match[0]).not.toBe('**hello**')
    }
  })
})

describe('SYNTAX_PATTERNS — plain text is not decorated', () => {
  it('unmatched plain text produces no matches', () => {
    expect(matchTags('just some words')).toEqual([])
  })

  it('a lone asterisk (no pair) does not match italic', () => {
    expect(matchTags('5 * 3 = 15')).toEqual([])
  })

  it('a lone tilde does not match strike', () => {
    expect(matchTags('cmd~something')).toEqual([])
  })
})

describe('SYNTAX_PATTERNS — global flag resets on re-scan', () => {
  it('each pattern has the global flag so repeated scans match from start', () => {
    for (const { re } of SYNTAX_PATTERNS) {
      expect(re.global).toBe(true)
    }
  })

  it('bold pattern can match twice in one string (global scan)', () => {
    const re = SYNTAX_PATTERNS.find((p) => p.tags[0] === 'strong' && p.tags.length === 1)!.re
    re.lastIndex = 0
    const matches: string[] = []
    let m: RegExpExecArray | null
    while ((m = re.exec('**a** and **b**')) !== null) matches.push(m[1])
    expect(matches).toEqual(['a', 'b'])
  })
})
