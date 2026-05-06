import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useLinkIndex, findHeaderRename } from './useLinkIndex'
import type { LinkIndex } from '../types'
import { MockDir } from '../../../shared/testUtils/fsMock'

// Covers DOC-4.10-01 through 4.10-12. See test-cases/04-document.md §4.10.

async function seedFile(root: MockDir, path: string, content: string) {
  const parts = path.split('/')
  let cur = root
  for (const p of parts.slice(0, -1)) {
    cur = await cur.getDirectoryHandle(p, { create: true })
  }
  const fh = await cur.getFileHandle(parts[parts.length - 1], { create: true })
  fh.file.data = content
}

function asRoot(dir: MockDir): FileSystemDirectoryHandle {
  return dir as unknown as FileSystemDirectoryHandle
}

let root: MockDir

beforeEach(() => { root = new MockDir() })

describe('loadIndex', () => {
  it('DOC-4.10-01: reads .archdesigner/_links.json and returns parsed LinkIndex', async () => {
    const stored: LinkIndex = {
      updatedAt: '2026-01-01T00:00:00.000Z',
      documents: {
        'a.md': {
          outboundLinks: [{ targetPath: 'b.md', type: 'document' }],
          sectionLinks: [],
          headers: [],
        },
      },
      backlinks: {
        'b.md': { linkedFrom: [{ sourcePath: 'a.md' }] },
      },
    }
    await seedFile(root, '.archdesigner/_links.json', JSON.stringify(stored))

    const { result } = renderHook(() => useLinkIndex())
    let loaded: LinkIndex | null = null
    await act(async () => {
      loaded = await result.current.loadIndex(asRoot(root))
    })
    expect(loaded!.documents['a.md'].outboundLinks[0].targetPath).toBe('b.md')
    await waitFor(() => {
      expect(result.current.linkIndex.documents['a.md']).toBeDefined()
    })
  })

  it('DOC-4.10-02: missing file returns an empty index without throwing', async () => {
    const { result } = renderHook(() => useLinkIndex())
    let loaded: LinkIndex | null = null
    await act(async () => {
      loaded = await result.current.loadIndex(asRoot(root))
    })
    expect(loaded!.documents).toEqual({})
    expect(loaded!.backlinks).toEqual({})
  })

  it('DOC-4.10-03: malformed JSON returns an empty index', async () => {
    await seedFile(root, '.archdesigner/_links.json', '{not json')
    const { result } = renderHook(() => useLinkIndex())
    let loaded: LinkIndex | null = null
    await act(async () => {
      loaded = await result.current.loadIndex(asRoot(root))
    })
    expect(loaded!.documents).toEqual({})
  })

  it('returns empty index when JSON is valid but missing required shape', async () => {
    // Valid JSON, but no "documents"/"backlinks" keys → invalid shape → empty.
    await seedFile(root, '.archdesigner/_links.json', '{"unrelated":1}')
    const { result } = renderHook(() => useLinkIndex())
    let loaded: LinkIndex | null = null
    await act(async () => {
      loaded = await result.current.loadIndex(asRoot(root))
    })
    expect(loaded!.documents).toEqual({})
  })
})

describe('saveIndex (DOC-4.10-04)', () => {
  it('writes a timestamped JSON to .archdesigner/_links.json', async () => {
    const { result } = renderHook(() => useLinkIndex())
    const fresh: LinkIndex = {
      updatedAt: '', documents: { 'a.md': { outboundLinks: [], sectionLinks: [], headers: [] } }, backlinks: {},
    }
    await act(async () => {
      // saveIndex is called via loadIndex / updateDocumentLinks, but also exposed
      // indirectly — here we exercise it by routing through updateDocumentLinks
      // which wraps saveIndex.
      await result.current.updateDocumentLinks(asRoot(root), 'a.md', '', fresh)
    })
    const text = root.dirs.get('.archdesigner')!.files.get('_links.json')!.file.data
    const parsed = JSON.parse(text)
    expect(parsed.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(parsed.documents['a.md']).toBeDefined()
  })
})

describe('updateDocumentLinks (DOC-4.10-05/06/07)', () => {
  it('parses wiki-links from content into outboundLinks + sectionLinks', async () => {
    const { result } = renderHook(() => useLinkIndex())
    const markdown = 'See [[other]] and [[target#sec]] in [[diag.json]].'
    let index: LinkIndex | null = null
    await act(async () => {
      index = await result.current.updateDocumentLinks(
        asRoot(root), 'src/doc.md', markdown,
      )
    })
    const entry = index!.documents['src/doc.md']
    // Outbound: [[other]] → "src/other.md", [[diag.json]] → "src/diag.json"
    expect(entry.outboundLinks.map((l) => l.targetPath).sort()).toEqual([
      'src/diag.json',
      'src/other.md',
    ])
    // Section: [[target#sec]] → "src/target.md" + section "sec"
    expect(entry.sectionLinks).toEqual([
      { targetPath: 'src/target.md', section: 'sec' },
    ])
  })

  it('typeResolves to "diagram" for .json and "document" for everything else', async () => {
    const { result } = renderHook(() => useLinkIndex())
    let index: LinkIndex | null = null
    await act(async () => {
      index = await result.current.updateDocumentLinks(
        asRoot(root), 'a.md', '[[b.md]] [[c.json]] [[d]]',
      )
    })
    const types = Object.fromEntries(
      index!.documents['a.md'].outboundLinks.map((l) => [l.targetPath, l.type]),
    )
    expect(types['b.md']).toBe('document')
    expect(types['c.json']).toBe('diagram')
    expect(types['d.md']).toBe('document')
  })

  it('DOC-4.10-06: rebuilds backlinks from the new outbound/section data', async () => {
    const { result } = renderHook(() => useLinkIndex())
    let index: LinkIndex | null = null
    await act(async () => {
      index = await result.current.updateDocumentLinks(
        asRoot(root), 'a.md', 'go to [[b]] or [[c#sec]]',
      )
    })
    expect(index!.backlinks['b.md'].linkedFrom).toEqual([{ sourcePath: 'a.md' }])
    expect(index!.backlinks['c.md'].linkedFrom).toEqual([
      { sourcePath: 'a.md', section: 'sec' },
    ])
  })
})

describe('removeDocumentFromIndex (DOC-4.10-08)', () => {
  it('removes the doc entry and rebuilds backlinks so orphaned entries disappear', async () => {
    const { result } = renderHook(() => useLinkIndex())
    const seeded: LinkIndex = {
      updatedAt: '',
      documents: {
        'a.md': {
          outboundLinks: [{ targetPath: 'b.md', type: 'document' }],
          sectionLinks: [],
          headers: [],
        },
        'b.md': { outboundLinks: [], sectionLinks: [], headers: [] },
      },
      backlinks: {},
    }
    let index: LinkIndex | null = null
    await act(async () => {
      index = await result.current.removeDocumentFromIndex(asRoot(root), 'a.md', seeded)
    })
    expect(index!.documents['a.md']).toBeUndefined()
    // b.md should no longer have a backlink from a.md.
    expect(index!.backlinks['b.md']).toBeUndefined()
  })
})

describe('renameDocumentInIndex (DOC-4.10-09)', () => {
  it('moves the doc entry and updates all references (outbound + section)', async () => {
    const { result } = renderHook(() => useLinkIndex())
    const seeded: LinkIndex = {
      updatedAt: '',
      documents: {
        'old.md': { outboundLinks: [], sectionLinks: [], headers: [] },
        'c.md': {
          outboundLinks: [{ targetPath: 'old.md', type: 'document' }],
          sectionLinks: [{ targetPath: 'old.md', section: 's' }],
          headers: [],
        },
      },
      backlinks: {},
    }
    let index: LinkIndex | null = null
    await act(async () => {
      index = await result.current.renameDocumentInIndex(
        asRoot(root), 'old.md', 'new.md', seeded,
      )
    })
    expect(index!.documents['new.md']).toBeDefined()
    expect(index!.documents['old.md']).toBeUndefined()
    expect(index!.documents['c.md'].outboundLinks[0].targetPath).toBe('new.md')
    expect(index!.documents['c.md'].sectionLinks[0].targetPath).toBe('new.md')
    expect(index!.backlinks['new.md'].linkedFrom.map((l) => l.sourcePath))
      .toEqual(expect.arrayContaining(['c.md']))
  })
})

describe('rename → save → reload round-trip (LINK-5.4-04)', () => {
  it('LINK-5.4-04: index on disk reflects rename after renameDocumentInIndex', async () => {
    // Instance A: populate then rename.
    const { result: a } = renderHook(() => useLinkIndex())
    await act(async () => {
      await a.current.updateDocumentLinks(asRoot(root), 'ref.md', '[[target]]')
    })
    await act(async () => {
      await a.current.renameDocumentInIndex(asRoot(root), 'target.md', 'target2.md')
    })

    // Instance B: fresh load from disk — simulates app reload.
    const { result: b } = renderHook(() => useLinkIndex())
    let loaded: LinkIndex | null = null
    await act(async () => { loaded = await b.current.loadIndex(asRoot(root)) })

    expect(loaded!.backlinks['target2.md']).toBeDefined()
    expect(loaded!.backlinks['target.md']).toBeUndefined()
    expect(loaded!.documents['ref.md'].outboundLinks[0].targetPath).toBe('target2.md')
  })
})

describe('getBacklinksFor (DOC-4.10-10)', () => {
  it('returns the list of sources for the given target path', async () => {
    const { result } = renderHook(() => useLinkIndex())
    await act(async () => {
      await result.current.updateDocumentLinks(
        asRoot(root), 'src1.md', '[[target]]',
      )
    })
    await act(async () => {
      await result.current.updateDocumentLinks(
        asRoot(root), 'src2.md', '[[target]]',
      )
    })
    await waitFor(() => {
      const backs = result.current.getBacklinksFor('target.md')
      expect(backs.map((b) => b.sourcePath).sort()).toEqual(['src1.md', 'src2.md'])
    })
  })

  it('returns empty array when no backlinks exist', () => {
    const { result } = renderHook(() => useLinkIndex())
    expect(result.current.getBacklinksFor('anything.md')).toEqual([])
  })
})

describe('fullRebuild (DOC-4.10-11/12)', () => {
  it('populates the index from every doc in the vault', async () => {
    await seedFile(root, 'a.md', '[[b]]')
    await seedFile(root, 'b.md', '[[a]]')
    const { result } = renderHook(() => useLinkIndex())
    let index: LinkIndex | null = null
    await act(async () => {
      index = await result.current.fullRebuild(asRoot(root), ['a.md', 'b.md'])
    })
    expect(index!.documents['a.md'].outboundLinks[0].targetPath).toBe('b.md')
    expect(index!.documents['b.md'].outboundLinks[0].targetPath).toBe('a.md')
    expect(index!.backlinks['a.md'].linkedFrom[0].sourcePath).toBe('b.md')
    expect(index!.backlinks['b.md'].linkedFrom[0].sourcePath).toBe('a.md')
  })

  it('DOC-4.10-12: running fullRebuild twice yields identical document/backlink content', async () => {
    await seedFile(root, 'a.md', '[[b]]')
    await seedFile(root, 'b.md', '')
    const { result } = renderHook(() => useLinkIndex())

    let first: LinkIndex | null = null, second: LinkIndex | null = null
    await act(async () => {
      first = await result.current.fullRebuild(asRoot(root), ['a.md', 'b.md'])
    })
    await act(async () => {
      second = await result.current.fullRebuild(asRoot(root), ['a.md', 'b.md'])
    })
    expect(second!.documents).toEqual(first!.documents)
    expect(second!.backlinks).toEqual(first!.backlinks)
    // Only updatedAt may differ.
  })

  it('skips unreadable files silently', async () => {
    await seedFile(root, 'ok.md', '[[x]]')
    const { result } = renderHook(() => useLinkIndex())
    let index: LinkIndex | null = null
    await act(async () => {
      index = await result.current.fullRebuild(asRoot(root), ['ok.md', 'missing.md'])
    })
    expect(index!.documents['ok.md']).toBeDefined()
    expect(index!.documents['missing.md']).toBeUndefined()
  })
})

describe('fullRebuild — .alphatex tabs (TAB-011)', () => {
  it('TAB-11.6-04: indexes outbound wiki-links from a tab\'s // references: line', async () => {
    // Use absolute wiki-link paths (/…) so resolveWikiLinkPath anchors at vault root
    // regardless of the tab's directory (songs/). See resolveWikiLinkPath — leading /
    // strips the slash and resolves from vault root.
    await seedFile(root, 'songs/wonderwall.alphatex',
      `\\title "Wonderwall"\n` +
      `// references: [[/notes/song-history.md]] [[/diagrams/chord-tree.json]]\n` +
      `. r.4 |`,
    );
    await seedFile(root, 'notes/song-history.md', '# History');
    await seedFile(root, 'diagrams/chord-tree.json', '{"title":"chords","layers":[],"nodes":[],"connections":[]}');

    const { result } = renderHook(() => useLinkIndex());
    const index = await act(async () =>
      result.current.fullRebuild(asRoot(root), [
        'songs/wonderwall.alphatex',
        'notes/song-history.md',
        'diagrams/chord-tree.json',
      ]),
    );

    expect(index.documents['songs/wonderwall.alphatex'].outboundLinks).toEqual([
      { targetPath: 'notes/song-history.md', type: 'document' },
      { targetPath: 'diagrams/chord-tree.json', type: 'diagram' },
    ]);
  });

  it('TAB-11.6-05: ignores // lines that aren\'t // references: in a tab', async () => {
    await seedFile(root, 'a.alphatex',
      `\\title "X"\n` +
      `// some other comment [[ignored.md]]\n` +
      `// references: [[real.md]]\n`,
    );

    const { result } = renderHook(() => useLinkIndex());
    const index = await act(async () =>
      result.current.fullRebuild(asRoot(root), ['a.alphatex']),
    );

    expect(index.documents['a.alphatex'].outboundLinks).toEqual([
      { targetPath: 'real.md', type: 'document' },
    ]);
  });

  it('TAB-11.6-06: backlinks from .md → .alphatex resolve via the wiki-link parser', async () => {
    await seedFile(root, 'songs/wonderwall.alphatex',
      `\\title "Wonderwall"\n. r.4 |`,
    );
    await seedFile(root, 'notes/about.md',
      // Use absolute path (/songs/…) so the link resolves to vault root, not
      // relative to notes/ (which would give notes/songs/wonderwall.alphatex).
      'See [[/songs/wonderwall.alphatex]] for the tab.',
    );

    const { result } = renderHook(() => useLinkIndex());
    const index = await act(async () =>
      result.current.fullRebuild(asRoot(root), [
        'songs/wonderwall.alphatex',
        'notes/about.md',
      ]),
    );

    expect(index.documents['notes/about.md'].outboundLinks).toEqual([
      { targetPath: 'songs/wonderwall.alphatex', type: 'tab' },
    ]);
  });
});

describe('findHeaderRename', () => {
  it('treats one-removed + one-added at same level as rename', () => {
    const r = findHeaderRename(
      [{ id: 'old', text: 'Old', level: 2 }],
      [{ id: 'new', text: 'New', level: 2 }],
    )
    expect(r.renames).toEqual([{ from: 'old', to: 'new' }])
    expect(r.deletions).toEqual([])
  })

  it('treats one-removed + one-added with same text different level as rename', () => {
    // NOTE: Plan-as-written used id 'x' for both sides, but identical ids produce
    // an empty diff so the "same text, different level" branch is never reached.
    // We use distinct ids here so the implementation actually exercises the
    // `removed[0].text === added[0].text` branch in findHeaderRename.
    const r = findHeaderRename(
      [{ id: 'x', text: 'X', level: 2 }],
      [{ id: 'y', text: 'X', level: 3 }],
    )
    expect(r.renames).toEqual([{ from: 'x', to: 'y' }])
  })

  it('treats multi-removed multi-added as deletions only', () => {
    const r = findHeaderRename(
      [{ id: 'a', text: 'A', level: 1 }, { id: 'b', text: 'B', level: 1 }],
      [{ id: 'c', text: 'C', level: 1 }, { id: 'd', text: 'D', level: 1 }],
    )
    expect(r.renames).toEqual([])
    expect(r.deletions).toEqual(['a', 'b'])
  })

  it('addition only is no-op', () => {
    const r = findHeaderRename(
      [{ id: 'a', text: 'A', level: 1 }],
      [{ id: 'a', text: 'A', level: 1 }, { id: 'b', text: 'B', level: 1 }],
    )
    expect(r).toEqual({ renames: [], deletions: [] })
  })
})

describe('useLinkIndex.headers', () => {
  it('populates headers from doc content', async () => {
    await seedFile(root, 'a.md', '# A\n## B Section')
    const { result } = renderHook(() => useLinkIndex())
    let index: LinkIndex | null = null
    await act(async () => {
      index = await result.current.fullRebuild(asRoot(root), ['a.md'])
    })
    expect(index!.documents['a.md'].headers).toEqual([
      { id: 'a', text: 'A', level: 1 },
      { id: 'b-section', text: 'B Section', level: 2 },
    ])
  })
})

describe('header auto-refactor (Task 8)', () => {
  it('auto-updates the in-memory index entry on header rename', async () => {
    const { result } = renderHook(() => useLinkIndex())
    const seeded: LinkIndex = {
      updatedAt: '',
      documents: {
        'doc-a.md': {
          outboundLinks: [],
          sectionLinks: [{ targetPath: 'doc-b.md', section: 'old-section' }],
          headers: [],
        },
        'doc-b.md': {
          outboundLinks: [],
          sectionLinks: [],
          headers: [{ id: 'old-section', text: 'Old Section', level: 2 }],
        },
      },
      backlinks: {},
    }
    let index: LinkIndex | null = null
    await act(async () => {
      index = await result.current.updateDocumentLinks(
        asRoot(root), 'doc-b.md', '## New Section\n', seeded,
      )
    })
    expect(index!.documents['doc-a.md'].sectionLinks).toEqual([
      { targetPath: 'doc-b.md', section: 'new-section' },
    ])
    // Heading entry on the saved doc reflects the new id.
    expect(index!.documents['doc-b.md'].headers).toEqual([
      { id: 'new-section', text: 'New Section', level: 2 },
    ])
    // No banner — this is a rename, not a deletion.
    expect(result.current.brokenAnchorState).toBeNull()
  })

  it("auto-rewrites consuming docs' source markdown on header rename", async () => {
    // Seed both files on disk so updateDocumentLinks can read & rewrite.
    await seedFile(root, 'doc-a.md', 'see [[doc-b.md#old-section]]')
    await seedFile(root, 'doc-b.md', '## Old Section\n\nbody')
    const { result } = renderHook(() => useLinkIndex())
    const seeded: LinkIndex = {
      updatedAt: '',
      documents: {
        'doc-a.md': {
          outboundLinks: [],
          sectionLinks: [{ targetPath: 'doc-b.md', section: 'old-section' }],
          headers: [],
        },
        'doc-b.md': {
          outboundLinks: [],
          sectionLinks: [],
          headers: [{ id: 'old-section', text: 'Old Section', level: 2 }],
        },
      },
      backlinks: {},
    }
    let index: LinkIndex | null = null
    await act(async () => {
      index = await result.current.updateDocumentLinks(
        asRoot(root), 'doc-b.md', '## New Section\n\nbody', seeded,
      )
    })
    // In-memory index reflects the rename.
    expect(index!.documents['doc-a.md'].sectionLinks).toEqual([
      { targetPath: 'doc-b.md', section: 'new-section' },
    ])
    // Source markdown on disk has been rewritten.
    const onDisk = root.files.get('doc-a.md')!.file.data
    expect(onDisk).toBe('see [[doc-b.md#new-section]]')
  })

  it('preserves alias text when rewriting wiki-link anchors on rename', async () => {
    await seedFile(root, 'doc-a.md', 'see [[doc-b.md#old-section | the original]]')
    await seedFile(root, 'doc-b.md', '## Old Section\n\nbody')
    const { result } = renderHook(() => useLinkIndex())
    const seeded: LinkIndex = {
      updatedAt: '',
      documents: {
        'doc-a.md': {
          outboundLinks: [],
          sectionLinks: [{ targetPath: 'doc-b.md', section: 'old-section' }],
          headers: [],
        },
        'doc-b.md': {
          outboundLinks: [],
          sectionLinks: [],
          headers: [{ id: 'old-section', text: 'Old Section', level: 2 }],
        },
      },
      backlinks: {},
    }
    await act(async () => {
      await result.current.updateDocumentLinks(
        asRoot(root), 'doc-b.md', '## New Section\n\nbody', seeded,
      )
    })
    const onDisk = root.files.get('doc-a.md')!.file.data
    expect(onDisk).toBe('see [[doc-b.md#new-section | the original]]')
  })

  it('surfaces broken-anchor banner state when a heading is deleted', async () => {
    const { result } = renderHook(() => useLinkIndex())
    const seeded: LinkIndex = {
      updatedAt: '',
      documents: {
        'doc-a.md': {
          outboundLinks: [],
          sectionLinks: [{ targetPath: 'doc-b.md', section: 'deleted-section' }],
          headers: [],
        },
        'doc-b.md': {
          outboundLinks: [],
          sectionLinks: [],
          headers: [
            { id: 'deleted-section', text: 'Deleted Section', level: 2 },
            { id: 'kept-1', text: 'Kept 1', level: 2 },
            { id: 'kept-2', text: 'Kept 2', level: 2 },
          ],
        },
      },
      backlinks: {},
    }
    // Edit doc-b.md: drop 'Deleted Section', keep the others. Multi-removed +
    // zero-added falls through to the deletions branch in findHeaderRename.
    await act(async () => {
      await result.current.updateDocumentLinks(
        asRoot(root), 'doc-b.md', '## Kept 1\n\n## Kept 2\n', seeded,
      )
    })
    await waitFor(() => {
      expect(result.current.brokenAnchorState).toEqual({
        docPath: 'doc-b.md',
        deletedIds: ['deleted-section'],
        affectedRefs: [{ sourcePath: 'doc-a.md', anchor: 'deleted-section' }],
      })
    })
  })

  it('brokenAnchorState is cleared when clearBrokenAnchorState is called', async () => {
    const { result } = renderHook(() => useLinkIndex())
    const seeded: LinkIndex = {
      updatedAt: '',
      documents: {
        'doc-a.md': {
          outboundLinks: [],
          sectionLinks: [{ targetPath: 'doc-b.md', section: 'gone' }],
          headers: [],
        },
        'doc-b.md': {
          outboundLinks: [],
          sectionLinks: [],
          headers: [
            { id: 'gone', text: 'Gone', level: 2 },
            { id: 'kept-1', text: 'Kept 1', level: 2 },
            { id: 'kept-2', text: 'Kept 2', level: 2 },
          ],
        },
      },
      backlinks: {},
    }
    await act(async () => {
      await result.current.updateDocumentLinks(
        asRoot(root), 'doc-b.md', '## Kept 1\n\n## Kept 2\n', seeded,
      )
    })
    await waitFor(() => {
      expect(result.current.brokenAnchorState).not.toBeNull()
    })
    act(() => {
      result.current.clearBrokenAnchorState()
    })
    await waitFor(() => {
      expect(result.current.brokenAnchorState).toBeNull()
    })
  })
})
