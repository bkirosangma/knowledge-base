import { describe, it, expect } from 'vitest'
import {
  parseWikiLinks,
  resolveWikiLinkPath,
  updateWikiLinkPaths,
} from './wikiLinkParser'

// Covers DOC-4.8-01 through DOC-4.8-12. See test-cases/04-document.md §4.8.

describe('parseWikiLinks', () => {
  it('DOC-4.8-01: finds [[a]], [[a#s]], [[a|b]], [[a#s|b]] forms', () => {
    const md =
      '[[plain]] and [[withsec#sec]] and [[withdisp|Display]] and [[full#sec|Full]]'
    const results = parseWikiLinks(md)
    expect(results).toHaveLength(4)

    expect(results[0]).toEqual({
      raw: '[[plain]]',
      path: 'plain',
      section: undefined,
      displayText: undefined,
    })
    expect(results[1]).toEqual({
      raw: '[[withsec#sec]]',
      path: 'withsec',
      section: 'sec',
      displayText: undefined,
    })
    expect(results[2]).toEqual({
      raw: '[[withdisp|Display]]',
      path: 'withdisp',
      section: undefined,
      displayText: 'Display',
    })
    expect(results[3]).toEqual({
      raw: '[[full#sec|Full]]',
      path: 'full',
      section: 'sec',
      displayText: 'Full',
    })
  })

  it('DOC-4.8-02: each match has raw, path, optional section, optional displayText', () => {
    const [m] = parseWikiLinks('[[foo#bar|Baz]]')
    expect(m).toHaveProperty('raw', '[[foo#bar|Baz]]')
    expect(m).toHaveProperty('path', 'foo')
    expect(m).toHaveProperty('section', 'bar')
    expect(m).toHaveProperty('displayText', 'Baz')
  })

  it('DOC-4.8-03: does NOT skip wiki-links inside code fences (current behavior)', () => {
    const md = '```\n[[inside-fence]]\n```'
    const results = parseWikiLinks(md)
    expect(results).toHaveLength(1)
    expect(results[0].path).toBe('inside-fence')
  })

  it('returns empty array when input has no wiki-links', () => {
    expect(parseWikiLinks('')).toEqual([])
    expect(parseWikiLinks('plain text with [brackets] and no links')).toEqual([])
  })

  it('parses multiple links in one string', () => {
    const results = parseWikiLinks('first [[a]] middle [[b]] end')
    expect(results.map((r) => r.path)).toEqual(['a', 'b'])
  })

  it('trims whitespace inside [[  ...  ]]', () => {
    const [m] = parseWikiLinks('[[ foo ]]')
    expect(m.path).toBe('foo')
  })

  it('treats empty section (#) as undefined', () => {
    const [m] = parseWikiLinks('[[foo#]]')
    expect(m.section).toBeUndefined()
  })

  it('treats empty display (|) as undefined', () => {
    const [m] = parseWikiLinks('[[foo|]]')
    expect(m.displayText).toBeUndefined()
  })
})

describe('resolveWikiLinkPath', () => {
  it('DOC-4.8-04: relative path joined to currentDocDir, .md appended', () => {
    expect(resolveWikiLinkPath('foo', 'a/b')).toBe('a/b/foo.md')
  })

  it('DOC-4.8-05: leading / treated as vault-root absolute; leading slash stripped', () => {
    expect(resolveWikiLinkPath('/foo', 'a/b')).toBe('foo.md')
  })

  it('DOC-4.8-06: normalises .. segments', () => {
    expect(resolveWikiLinkPath('../x', 'a/b')).toBe('a/x.md')
  })

  it('DOC-4.8-07: normalises . segments', () => {
    expect(resolveWikiLinkPath('./x', 'a/b')).toBe('a/b/x.md')
  })

  it('DOC-4.8-08: appends .md when no extension present', () => {
    expect(resolveWikiLinkPath('notes', '')).toBe('notes.md')
  })

  it('DOC-4.8-09: preserves .json extension', () => {
    expect(resolveWikiLinkPath('diag.json', '')).toBe('diag.json')
  })

  it('preserves .md extension (no double-append)', () => {
    expect(resolveWikiLinkPath('note.md', '')).toBe('note.md')
  })

  it('dot in directory name does not block .md append on extensionless filename', () => {
    // filename "config" has no extension; dot in parent dir name should not confuse suffix logic
    expect(resolveWikiLinkPath('config', '.archdesigner')).toBe(
      '.archdesigner/config.md',
    )
  })

  it('empty currentDocDir leaves relative path at root', () => {
    expect(resolveWikiLinkPath('foo', '')).toBe('foo.md')
  })

  it('DOC-4.8-13: .. beyond root is clamped (dropped, not emitted as a literal segment)', () => {
    // Extra `..` past the vault root are discarded so the resolver never
    // produces a path that escapes the vault. See Phase 5a (2026-04-19).
    expect(resolveWikiLinkPath('../../foo', 'a')).toBe('foo.md')
    expect(resolveWikiLinkPath('../../../foo', '')).toBe('foo.md')
  })

  it('strips double slashes from absolute paths', () => {
    expect(resolveWikiLinkPath('//foo', '')).toBe('foo.md')
  })
})

describe('updateWikiLinkPaths', () => {
  it('DOC-4.8-10: bulk rename — plain, with section, with display, and with both', () => {
    // plain
    expect(updateWikiLinkPaths('[[foo]]', 'foo.md', 'bar.md')).toBe('[[bar]]')
    // with section
    expect(updateWikiLinkPaths('[[foo#s]]', 'foo.md', 'bar.md')).toBe('[[bar#s]]')
    // with display (note: formatter pads | with spaces in output)
    expect(updateWikiLinkPaths('[[foo|Label]]', 'foo.md', 'bar.md')).toBe(
      '[[bar | Label]]',
    )
    // with both section and display
    expect(updateWikiLinkPaths('[[foo#s|Label]]', 'foo.md', 'bar.md')).toBe(
      '[[bar#s | Label]]',
    )
  })

  it('DOC-4.8-11: strips .md for matching — link and/or oldPath may carry .md', () => {
    // link carries .md
    expect(updateWikiLinkPaths('[[foo.md]]', 'foo.md', 'bar.md')).toBe('[[bar]]')
    // oldPath without .md, link without .md
    expect(updateWikiLinkPaths('[[foo]]', 'foo', 'bar')).toBe('[[bar]]')
    // oldPath without .md, link with .md
    expect(updateWikiLinkPaths('[[foo.md]]', 'foo', 'bar')).toBe('[[bar]]')
  })

  it('DOC-4.8-12: does not change unrelated or prefix-matching links', () => {
    // prefix match
    expect(updateWikiLinkPaths('[[fooey]]', 'foo.md', 'bar.md')).toBe('[[fooey]]')
    // unrelated
    expect(updateWikiLinkPaths('[[other]]', 'foo.md', 'bar.md')).toBe('[[other]]')
  })

  it('preserves leading / for vault-absolute wiki-links', () => {
    expect(updateWikiLinkPaths('[[/foo]]', 'foo.md', 'bar.md')).toBe('[[/bar]]')
  })

  it('rewrites all matches in one pass without touching unrelated text', () => {
    const md = 'a [[foo]] b [[foo#s]] c [[unrelated]] d [[foo|Label]]'
    expect(updateWikiLinkPaths(md, 'foo.md', 'bar.md')).toBe(
      'a [[bar]] b [[bar#s]] c [[unrelated]] d [[bar | Label]]',
    )
  })

  it('returns input unchanged when no matches', () => {
    const md = 'only [[other]] here, nothing matches'
    expect(updateWikiLinkPaths(md, 'foo.md', 'bar.md')).toBe(md)
  })
})
