import { describe, it, expect } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { SYNTAX_PATTERNS, RawBlock, MarkdownReveal } from './markdownReveal'
import { WikiLink } from './wikiLink'
import {
  convertRichToRaw,
  restoreRawToRich,
  maybeSyncRawBlockType,
  findRawBlock,
  findConvertibleBlockAtCursor,
} from './markdownRevealTransactions'

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

// ── rawBlock conversion helpers (DOC-4.3-34 / 4.3-35 / 4.3-40) ─────────────
//
// The MarkdownReveal extension's `appendTransaction` is editor-bound (it
// closes over `this.editor`), but the heavy lifting lives in the pure
// helpers it invokes — `convertRichToRaw`, `restoreRawToRich`, and
// `maybeSyncRawBlockType`. They take `(state, schema, $head, ...)` slices
// and return / mutate transactions. We can mount a minimal Tiptap editor
// (StarterKit + RawBlock + MarkdownReveal) so the schema is real and the
// helpers run against a real document state, but assert their effects
// without driving the keymap or the live cursor — the latter doesn't
// propagate cleanly inside jsdom.

function buildEditor(html: string): Editor {
  // Minimal mount surface; not attached to the DOM. We never render,
  // we only need `editor.state` / `editor.schema` / `editor.commands.*`.
  // RawBlock's content expression includes `wikiLink`, so the WikiLink
  // node must also be loaded for the schema to compile.
  return new Editor({
    extensions: [StarterKit, RawBlock, WikiLink, MarkdownReveal],
    content: html,
  })
}

describe('convertRichToRaw (DOC-4.3-34)', () => {
  it('DOC-4.3-34: converting a paragraph block under cursor replaces it with a rawBlock', () => {
    const editor = buildEditor('<p>hello world</p>')
    const { state, schema } = editor
    const cur = findConvertibleBlockAtCursor(state.doc.resolve(1))
    expect(cur).not.toBeNull()
    expect(cur!.node.type.name).toBe('paragraph')

    const tr = state.tr
    convertRichToRaw(tr, cur!.node, cur!.pos, state, schema)
    const newDoc = tr.doc
    // After conversion the top-level child should be a rawBlock with the
    // paragraph's text content preserved (no `# `/`> ` prefix prepended for
    // a plain paragraph).
    expect(newDoc.firstChild!.type.name).toBe('rawBlock')
    expect(newDoc.firstChild!.textContent).toBe('hello world')
    expect(newDoc.firstChild!.attrs.originalType).toBe('paragraph')
    editor.destroy()
  })

  it('DOC-4.3-34: converting a heading prepends the `#`-prefix into the rawBlock content', () => {
    const editor = buildEditor('<h2>Section A</h2>')
    const { state, schema } = editor
    const cur = findConvertibleBlockAtCursor(state.doc.resolve(1))
    expect(cur!.node.type.name).toBe('heading')
    expect(cur!.node.attrs.level).toBe(2)

    const tr = state.tr
    convertRichToRaw(tr, cur!.node, cur!.pos, state, schema)
    const raw = tr.doc.firstChild!
    expect(raw.type.name).toBe('rawBlock')
    expect(raw.attrs.originalType).toBe('heading')
    expect(raw.attrs.originalLevel).toBe(2)
    // The H2 prefix `## ` is part of the rawBlock's text so the user
    // sees and can edit the syntax.
    expect(raw.textContent).toBe('## Section A')
    editor.destroy()
  })
})

describe('restoreRawToRich (DOC-4.3-35)', () => {
  it('DOC-4.3-35: a rawBlock holding `## Title` re-parses into an <h2> when the cursor exits', () => {
    // Build an editor whose first block is already a rawBlock; then run
    // restoreRawToRich to simulate the cursor leaving it.
    const editor = buildEditor(
      '<p data-raw-block originaltype="heading" originallevel="2">## Title</p>',
    )
    const { state, schema } = editor
    const raw = findRawBlock(state.doc)
    expect(raw).not.toBeNull()
    expect(raw!.node.type.name).toBe('rawBlock')

    const tr = state.tr
    restoreRawToRich(tr, raw!, schema)
    const newDoc = tr.doc
    expect(newDoc.firstChild!.type.name).toBe('heading')
    expect(newDoc.firstChild!.attrs.level).toBe(2)
    expect(newDoc.firstChild!.textContent).toBe('Title')
    editor.destroy()
  })

  it('DOC-4.3-35: an empty rawBlock collapses to an empty paragraph on restore', () => {
    const editor = buildEditor('<p data-raw-block originaltype="paragraph"></p>')
    const { state, schema } = editor
    const raw = findRawBlock(state.doc)
    expect(raw).not.toBeNull()

    const tr = state.tr
    restoreRawToRich(tr, raw!, schema)
    expect(tr.doc.firstChild!.type.name).toBe('paragraph')
    expect(tr.doc.firstChild!.content.size).toBe(0)
    editor.destroy()
  })
})

describe('maybeSyncRawBlockType — rawSwap meta flag (DOC-4.3-40)', () => {
  it('DOC-4.3-40: when the rawBlock content prefix mismatches its originalType, the returned tr carries the rawSwap meta', () => {
    // Build a rawBlock whose attrs start as paragraph but whose textual
    // prefix says `## Heading`. The helper must produce a sync tr to
    // reconcile the attrs to heading+level=2 — and that tr must carry
    // `rawSwap=true` so MarkdownEditor's `onUpdate` skips the
    // serialize / onChange debounce for this attrs-only adjustment.
    // Note: TiptapNode.create's `parseHTML` doesn't extract `originalType`
    // / `originalLevel` from HTML attributes, so the rawBlock parses with
    // attrs.originalType="paragraph" (default) regardless of the input HTML.
    // That mismatch with the `## ` prefix is exactly the case the helper
    // is built to detect.
    const editor = buildEditor(
      '<p data-raw-block class="md-raw-block">## Heading</p>',
    )
    const { state } = editor
    const raw = findRawBlock(state.doc)
    expect(raw).not.toBeNull()
    expect(raw!.node.attrs.originalType).toBe('paragraph')
    expect(raw!.node.textContent).toBe('## Heading')

    const syncTr = maybeSyncRawBlockType(raw!, state)
    expect(syncTr).not.toBeNull()
    expect(syncTr!.getMeta('rawSwap')).toBe(true)
    // Doesn't pollute history — attrs-only adjustment.
    expect(syncTr!.getMeta('addToHistory')).toBe(false)
    editor.destroy()
  })

  it('DOC-4.3-40: when the prefix already matches the originalType/level, the helper returns null (no rawSwap fired)', () => {
    // h2 rawBlock with text `## Title` — no mismatch, no sync needed.
    const editor = buildEditor(
      '<p data-raw-block originaltype="heading" originallevel="2">## Title</p>',
    )
    const { state } = editor
    const raw = findRawBlock(state.doc)
    expect(raw).not.toBeNull()
    const syncTr = maybeSyncRawBlockType(raw!, state)
    // null return means no rawSwap transaction is dispatched, so the
    // editor never has to suppress onUpdate for an attrs-only rewrite.
    expect(syncTr).toBeNull()
    editor.destroy()
  })
})
