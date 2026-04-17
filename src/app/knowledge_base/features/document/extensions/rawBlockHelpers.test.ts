import { describe, it, expect } from 'vitest'
import {
  parseHeadingPrefix,
  hasBlockquotePrefix,
  computeActiveRawFormatsAt,
  TAG_TO_FORMAT,
} from './rawBlockHelpers'

// Covers DOC-4.5-14/15/16 (active-raw-format / raw heading / raw blockquote
// detection). The editor-bound wrappers (`getActiveRawFormats`,
// `getRawHeadingLevel`, `isRawBlockquote` inside MarkdownEditor.tsx) thread
// through these pure helpers after locating the enclosing rawBlock; their
// contract is exactly what's under test here.

// ── parseHeadingPrefix (DOC-4.5-15) ─────────────────────────────────────────

describe('parseHeadingPrefix (DOC-4.5-15)', () => {
  it('recognises every valid heading level 1–6', () => {
    for (let i = 1; i <= 6; i++) {
      expect(parseHeadingPrefix('#'.repeat(i) + ' Title')).toBe(i)
    }
  })

  it('returns null for 7+ hashes (too many for a heading)', () => {
    expect(parseHeadingPrefix('####### Nope')).toBeNull()
  })

  it('returns null when the # is not followed by a space', () => {
    expect(parseHeadingPrefix('#NoSpace')).toBeNull()
    expect(parseHeadingPrefix('##Also no space')).toBeNull()
  })

  it('returns null on plain text / empty input', () => {
    expect(parseHeadingPrefix('')).toBeNull()
    expect(parseHeadingPrefix('just a paragraph')).toBeNull()
  })

  it('accepts tab (\\s) as the separator after the hashes', () => {
    expect(parseHeadingPrefix('##\tTabbed')).toBe(2)
  })
})

// ── hasBlockquotePrefix (DOC-4.5-16) ────────────────────────────────────────

describe('hasBlockquotePrefix (DOC-4.5-16)', () => {
  it('returns true for `> ` prefix', () => {
    expect(hasBlockquotePrefix('> a quote')).toBe(true)
    expect(hasBlockquotePrefix('> ')).toBe(true)
  })

  it('returns false for `>` without space', () => {
    expect(hasBlockquotePrefix('>no-space')).toBe(false)
  })

  it('returns false for text that only contains `> ` later', () => {
    expect(hasBlockquotePrefix('not a > quote')).toBe(false)
  })

  it('returns false on empty input', () => {
    expect(hasBlockquotePrefix('')).toBe(false)
  })
})

// ── TAG_TO_FORMAT map ──────────────────────────────────────────────────────

describe('TAG_TO_FORMAT', () => {
  it('maps the four supported markdown tags to toolbar format names', () => {
    expect(TAG_TO_FORMAT).toEqual({
      strong: 'bold',
      em: 'italic',
      s: 'strike',
      code: 'code',
    })
  })
})

// ── computeActiveRawFormatsAt (DOC-4.5-14) ──────────────────────────────────

describe('computeActiveRawFormatsAt (DOC-4.5-14)', () => {
  it('cursor inside **bold** reports bold active', () => {
    // "**hello**" — cursor at offset 4 sits between "he|llo".
    const formats = computeActiveRawFormatsAt('**hello**', 4)
    expect(formats.has('bold')).toBe(true)
  })

  it('cursor inside *italic* reports italic active (not bold)', () => {
    const formats = computeActiveRawFormatsAt('*hello*', 3)
    expect(formats.has('italic')).toBe(true)
    expect(formats.has('bold')).toBe(false)
  })

  it('cursor inside ~~strike~~ reports strike active', () => {
    const formats = computeActiveRawFormatsAt('~~oops~~', 4)
    expect(formats.has('strike')).toBe(true)
  })

  it('cursor inside `code` reports code active', () => {
    const formats = computeActiveRawFormatsAt('`x = 1`', 3)
    expect(formats.has('code')).toBe(true)
  })

  it('cursor inside ***bold+italic*** reports BOTH bold and italic', () => {
    const formats = computeActiveRawFormatsAt('***wow***', 4)
    expect(formats.has('bold')).toBe(true)
    expect(formats.has('italic')).toBe(true)
  })

  it('cursor in plain text reports no formats active', () => {
    const formats = computeActiveRawFormatsAt('no marks here', 5)
    expect(formats.size).toBe(0)
  })

  it('cursor OUTSIDE a bold run reports no bold', () => {
    // "**a** bc" — cursor at the "c" is outside the bold range.
    const formats = computeActiveRawFormatsAt('**a** bc', 7)
    expect(formats.has('bold')).toBe(false)
  })

  it('cursor at the delimiter boundary is treated as inside (inclusive)', () => {
    // Offset 0 is exactly at the opening `*` of `**a**`. The regex match
    // range spans 0-5, and cursor==0 is the lower bound so should match.
    const formats = computeActiveRawFormatsAt('**a**', 0)
    expect(formats.has('bold')).toBe(true)
  })

  it('nested **bold with *italic* inside** reports bold everywhere; italic only inside the inner run', () => {
    // Full string: "**A *B* C**"
    //               0123456789(10)
    // Outer bold covers 0..11; inner italic covers 4..7.
    const text = '**A *B* C**'
    // Cursor at offset 2 (inside "A ") — bold only.
    const outer = computeActiveRawFormatsAt(text, 2)
    expect(outer.has('bold')).toBe(true)
    expect(outer.has('italic')).toBe(false)
    // Cursor at offset 5 (on "B") — both bold AND italic.
    const inner = computeActiveRawFormatsAt(text, 5)
    expect(inner.has('bold')).toBe(true)
    expect(inner.has('italic')).toBe(true)
  })

  it('empty text at offset 0 produces empty set', () => {
    expect(computeActiveRawFormatsAt('', 0).size).toBe(0)
  })
})
