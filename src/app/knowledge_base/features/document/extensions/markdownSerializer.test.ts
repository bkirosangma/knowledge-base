import { describe, it, expect } from 'vitest'
import { htmlToMarkdown, markdownToHtml } from './markdownSerializer'

// Covers DOC-4.4-01 through DOC-4.4-22. See test-cases/04-document.md §4.4.
// Runs in jsdom (vitest.config.ts environment=jsdom) so htmlToMarkdown's
// `document.createElement` is available.

describe('htmlToMarkdown — block elements', () => {
  it('DOC-4.4-01: H1–H6 render as #-prefixed markdown', () => {
    expect(htmlToMarkdown('<h1>A</h1>')).toBe('# A')
    expect(htmlToMarkdown('<h2>A</h2>')).toBe('## A')
    expect(htmlToMarkdown('<h3>A</h3>')).toBe('### A')
    expect(htmlToMarkdown('<h4>A</h4>')).toBe('#### A')
    expect(htmlToMarkdown('<h5>A</h5>')).toBe('##### A')
    expect(htmlToMarkdown('<h6>A</h6>')).toBe('###### A')
  })

  it('DOC-4.4-02: bold / italic / strike / inline-code marks', () => {
    expect(htmlToMarkdown('<p><strong>bold</strong></p>')).toBe('**bold**')
    expect(htmlToMarkdown('<p><b>bold</b></p>')).toBe('**bold**')
    expect(htmlToMarkdown('<p><em>italic</em></p>')).toBe('*italic*')
    expect(htmlToMarkdown('<p><i>italic</i></p>')).toBe('*italic*')
    expect(htmlToMarkdown('<p><s>strike</s></p>')).toBe('~~strike~~')
    expect(htmlToMarkdown('<p><del>strike</del></p>')).toBe('~~strike~~')
    expect(htmlToMarkdown('<p><code>inline</code></p>')).toBe('`inline`')
  })

  it('DOC-4.4-03: bullet list (<ul><li>) → "- "', () => {
    expect(htmlToMarkdown('<ul><li>a</li><li>b</li></ul>')).toBe('- a\n- b')
  })

  it('DOC-4.4-04: ordered list (<ol><li>) preserves 1. 2. …', () => {
    expect(htmlToMarkdown('<ol><li>a</li><li>b</li><li>c</li></ol>')).toBe(
      '1. a\n2. b\n3. c',
    )
  })

  it('DOC-4.4-05: task list items', () => {
    // Checkbox inside li triggers task-list branch
    expect(
      htmlToMarkdown('<ul><li><input type="checkbox">a</li></ul>'),
    ).toBe('- [ ] a')
    expect(
      htmlToMarkdown('<ul><li><input type="checkbox" checked>a</li></ul>'),
    ).toBe('- [x] a')
  })

  it('DOC-4.4-06: blockquote prefixes each line with "> "', () => {
    // <br> lets us force multiple lines inside a single <blockquote> without
    // relying on how the HTML parser treats literal "\n" in text.
    expect(htmlToMarkdown('<blockquote>a<br>b</blockquote>')).toBe('> a\n> b')
  })

  it('DOC-4.4-07: code block with language hint', () => {
    expect(
      htmlToMarkdown(
        '<pre><code class="language-ts">const x = 1;</code></pre>',
      ),
    ).toBe('```ts\nconst x = 1;\n```')
  })

  it('DOC-4.4-07b: code block without language', () => {
    expect(htmlToMarkdown('<pre><code>plain</code></pre>')).toBe(
      '```\nplain\n```',
    )
  })

  it('DOC-4.4-16: horizontal rule', () => {
    expect(htmlToMarkdown('<hr>')).toBe('---')
  })
})

describe('htmlToMarkdown — tables', () => {
  it('DOC-4.4-08: GFM pipe table with header separator', () => {
    const html =
      '<table><tr><th>h1</th><th>h2</th></tr><tr><td>a</td><td>b</td></tr></table>'
    expect(htmlToMarkdown(html)).toBe(
      '| h1 | h2 |\n| --- | --- |\n| a | b |',
    )
  })

  it('DOC-4.4-09: literal "|" in a cell is backslash-escaped', () => {
    const html =
      '<table><tr><th>h</th></tr><tr><td>a|b</td></tr></table>'
    expect(htmlToMarkdown(html)).toBe('| h |\n| --- |\n| a\\|b |')
  })

  it('cell with multiple block children joins with <br>', () => {
    const html =
      '<table><tr><th>h</th></tr><tr><td><p>a</p><p>b</p></td></tr></table>'
    expect(htmlToMarkdown(html)).toBe('| h |\n| --- |\n| a<br>b |')
  })

  it('cell with inline marks preserves them', () => {
    const html =
      '<table><tr><th>h</th></tr><tr><td><p><strong>bold</strong></p></td></tr></table>'
    expect(htmlToMarkdown(html)).toBe('| h |\n| --- |\n| **bold** |')
  })
})

describe('htmlToMarkdown — links and wiki-links', () => {
  it('DOC-4.4-10: link mark', () => {
    expect(
      htmlToMarkdown('<p><a href="https://example.com">text</a></p>'),
    ).toBe('[text](https://example.com)')
  })

  it('DOC-4.4-11: wiki-link compact (display matches default)', () => {
    expect(
      htmlToMarkdown('<p><span data-wiki-link="foo">foo</span></p>'),
    ).toBe('[[foo]]')
  })

  it('DOC-4.4-12: wiki-link with section (display matches path#section)', () => {
    expect(
      htmlToMarkdown(
        '<p><span data-wiki-link="foo" data-wiki-section="sec">foo#sec</span></p>',
      ),
    ).toBe('[[foo#sec]]')
  })

  it('DOC-4.4-13: wiki-link with display text', () => {
    expect(
      htmlToMarkdown('<p><span data-wiki-link="foo">Label</span></p>'),
    ).toBe('[[foo|Label]]')
  })

  it('DOC-4.4-14: wiki-link with section and display text', () => {
    expect(
      htmlToMarkdown(
        '<p><span data-wiki-link="foo" data-wiki-section="sec">Label</span></p>',
      ),
    ).toBe('[[foo#sec|Label]]')
  })

  it('image mark round-trips alt text and src', () => {
    expect(
      htmlToMarkdown('<p><img src="/a.png" alt="caption"></p>'),
    ).toBe('![caption](/a.png)')
  })
})

describe('htmlToMarkdown — raw-block marker', () => {
  it('DOC-4.4-15: data-raw-block emits children as-is (no double-prefix)', () => {
    // A paragraph with data-raw-block should NOT add an extra "# " when the
    // inner text already looks like markdown syntax. The block just flattens.
    expect(htmlToMarkdown('<p data-raw-block>**already bold**</p>')).toBe(
      '**already bold**',
    )
  })

  it('DOC-4.4-15b: raw-block skips the outer heading prefix', () => {
    // An h1 with data-raw-block should emit inner text verbatim (no double #).
    expect(htmlToMarkdown('<h1 data-raw-block># heading text</h1>')).toBe(
      '# heading text',
    )
  })
})

describe('markdownToHtml — parse', () => {
  it('DOC-4.4-17: wiki-link preprocessed to data-wiki-link span', () => {
    const html = markdownToHtml('[[foo#sec]]')
    expect(html).toContain('data-wiki-link="foo"')
    expect(html).toContain('data-wiki-section="sec"')
    expect(html).toContain('class="wiki-link"')
    // Display text is the bare path when no |display was given
    expect(html).toContain('>foo</span>')
  })

  it('wiki-link with explicit display text uses it in the span', () => {
    const html = markdownToHtml('[[foo|Label]]')
    expect(html).toContain('data-wiki-link="foo"')
    expect(html).toContain('>Label</span>')
  })

  it('DOC-4.4-18: blank lines between table rows are collapsed', () => {
    const md = '| h |\n| --- |\n\n| a |\n\n| b |'
    const html = markdownToHtml(md)
    expect(html).toContain('<table>')
    expect(html).toContain('<td>a</td>')
    expect(html).toContain('<td>b</td>')
  })

  it('DOC-4.4-19: task list markers become disabled checkbox inputs', () => {
    const html = markdownToHtml('- [ ] unchecked\n- [x] checked')
    // Unchecked comes out as `<input type="checkbox" disabled>`
    expect(html).toMatch(/<input type="checkbox" disabled>\s*unchecked/)
    // Checked comes out as `<input type="checkbox" checked disabled>`
    expect(html).toMatch(/<input type="checkbox" checked disabled>\s*checked/)
  })

  it('DOC-4.4-20: linkify autolinks bare URLs', () => {
    const html = markdownToHtml('visit https://example.com today')
    expect(html).toMatch(/<a href="https:\/\/example\.com"/)
  })

  it('DOC-4.4-21: HTML passthrough (html:true)', () => {
    const html = markdownToHtml('before <em>middle</em> after')
    expect(html).toContain('<em>middle</em>')
  })

  it('renders standard markdown blocks', () => {
    const html = markdownToHtml('# Title\n\nA **bold** word.')
    expect(html).toContain('<h1>Title</h1>')
    expect(html).toContain('<strong>bold</strong>')
  })
})

describe('round-trip (DOC-4.4-22)', () => {
  it('bold mark survives HTML → markdown → HTML', () => {
    const orig = '<p><strong>hello</strong> world</p>'
    const md = htmlToMarkdown(orig)
    const rt = markdownToHtml(md)
    expect(rt).toContain('<strong>hello</strong>')
    expect(rt).toContain('world')
  })

  it('heading + paragraph + list structural round-trip', () => {
    const orig =
      '<h1>Title</h1><p>intro</p><ul><li>a</li><li>b</li></ul>'
    const md = htmlToMarkdown(orig)
    const rt = markdownToHtml(md)
    expect(rt).toContain('<h1>Title</h1>')
    expect(rt).toMatch(/<p>intro<\/p>/)
    expect(rt).toContain('<li>a</li>')
    expect(rt).toContain('<li>b</li>')
  })

  it('table structural round-trip', () => {
    const orig =
      '<table><tr><th>h1</th><th>h2</th></tr><tr><td>a</td><td>b</td></tr></table>'
    const md = htmlToMarkdown(orig)
    const rt = markdownToHtml(md)
    expect(rt).toContain('<table>')
    expect(rt).toContain('<th>h1</th>')
    expect(rt).toContain('<td>a</td>')
    expect(rt).toContain('<td>b</td>')
  })

  it('wiki-link round-trip preserves path and section', () => {
    const orig =
      '<p><span data-wiki-link="foo" data-wiki-section="sec">foo#sec</span></p>'
    const md = htmlToMarkdown(orig)
    expect(md).toBe('[[foo#sec]]')
    const rt = markdownToHtml(md)
    expect(rt).toContain('data-wiki-link="foo"')
    expect(rt).toContain('data-wiki-section="sec"')
  })

  it('pipe in table cell survives round-trip', () => {
    const orig =
      '<table><tr><th>h</th></tr><tr><td>a|b</td></tr></table>'
    const md = htmlToMarkdown(orig)
    expect(md).toContain('a\\|b')
    const rt = markdownToHtml(md)
    // markdown-it converts \| back to | inside the cell
    expect(rt).toContain('<td>a|b</td>')
  })
})
