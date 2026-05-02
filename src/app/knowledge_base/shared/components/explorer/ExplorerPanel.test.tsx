import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import ExplorerPanel from './ExplorerPanel'
import type { TreeNode } from '../../hooks/useFileExplorer'
import { MOBILE_BREAKPOINT_PX } from '../../hooks/useViewport'

// Covers FS-2.3-01 through 2.3-20 (collapse, tree render, filter, file-click).
// FS-2.3-21..37 (create/rename/delete/duplicate/move/drag) bottom out in
// `useFileExplorer` + `useFileActions` — covered in Buckets 10 and 19.

type P = React.ComponentProps<typeof ExplorerPanel>

function renderPanel(overrides: Partial<P> = {}) {
  const defaults: P = {
    collapsed: false,
    onToggleCollapse: vi.fn(),
    directoryName: 'my-vault',
    tree: [],
    leftPaneFile: null,
    rightPaneFile: null,
    dirtyFiles: new Set<string>(),
    onOpenFolder: vi.fn(),
    onSelectFile: vi.fn(),
    onCreateFile: vi.fn(async () => null),
    onCreateDocument: vi.fn(async () => null),
    onCreateSVG: vi.fn(async () => null),
    onCreateFolder: vi.fn(async () => null),
    onDeleteFile: vi.fn(),
    onDeleteFolder: vi.fn(),
    onRenameFile: vi.fn(),
    onRenameFolder: vi.fn(),
    onDuplicateFile: vi.fn(),
    onMoveItem: vi.fn(),
    isLoading: false,
    onRefresh: vi.fn(),
    sortField: 'name',
    sortDirection: 'asc',
    sortGrouping: 'folders-first',
    onSortChange: vi.fn(),
  }
  const props = { ...defaults, ...overrides }
  const utils = render(<ExplorerPanel {...props} />)
  return { ...utils, props }
}

function file(name: string, path: string, fileType: 'diagram' | 'document'): TreeNode {
  return { name, path, type: 'file', fileType }
}
function folder(name: string, path: string, children: TreeNode[] = []): TreeNode {
  return { name, path, type: 'folder', children }
}

describe('ExplorerPanel — collapsed state', () => {
  it('FS-2.3-01: collapsed renders a narrow strip with a toggle and no content', () => {
    renderPanel({ collapsed: true })
    // "No folder open" text must not appear.
    expect(screen.queryByText('No folder open')).toBeNull()
    // The collapse toggle is still present (there is exactly one button).
    const toggle = screen.getByRole('button')
    expect(toggle).toBeTruthy()
  })

  it('clicking the collapse toggle calls onToggleCollapse', () => {
    const onToggleCollapse = vi.fn()
    renderPanel({ collapsed: true, onToggleCollapse })
    fireEvent.click(screen.getByRole('button'))
    expect(onToggleCollapse).toHaveBeenCalledTimes(1)
  })
})

describe('ExplorerPanel — expanded, no directory', () => {
  it('renders "No folder open" + Open Folder button', () => {
    renderPanel({ directoryName: null })
    expect(screen.getByText('No folder open')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open Folder' })).toBeTruthy()
  })

  it('clicking Open Folder fires onOpenFolder', () => {
    const onOpenFolder = vi.fn()
    renderPanel({ directoryName: null, onOpenFolder })
    fireEvent.click(screen.getByRole('button', { name: 'Open Folder' }))
    expect(onOpenFolder).toHaveBeenCalledTimes(1)
  })
})

describe('ExplorerPanel — directory header bar', () => {
  it('renders the directory name and action buttons', () => {
    renderPanel({ directoryName: 'sample-vault' })
    expect(screen.getByText('sample-vault')).toBeTruthy()
    expect(screen.getByLabelText('New Diagram')).toBeTruthy()
    expect(screen.getByLabelText('New Folder')).toBeTruthy()
    expect(screen.getByLabelText('Refresh explorer')).toBeTruthy()
    expect(screen.getByLabelText('More actions')).toBeTruthy()
  })

  it('clicking Refresh fires onRefresh', () => {
    const onRefresh = vi.fn()
    renderPanel({ onRefresh })
    fireEvent.click(screen.getByLabelText('Refresh explorer'))
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('Refresh icon gains the spinner animation class when isLoading', () => {
    const { container } = renderPanel({ isLoading: true })
    const refreshBtn = screen.getByLabelText('Refresh explorer')
    const svg = within(refreshBtn).getByText('', { selector: 'svg' }).parentElement
      // fallback: query by class
    const anim = container.querySelector('svg.animate-spin')
    expect(anim).not.toBeNull()
    expect(svg).toBeDefined()
  })

  it('clicking New Diagram calls onCreateFile with empty parent', () => {
    const onCreateFile = vi.fn(async () => null)
    renderPanel({ onCreateFile })
    fireEvent.click(screen.getByLabelText('New Diagram'))
    expect(onCreateFile).toHaveBeenCalledWith('')
  })

  it('clicking New Folder calls onCreateFolder with empty parent', () => {
    const onCreateFolder = vi.fn(async () => null)
    renderPanel({ onCreateFolder })
    fireEvent.click(screen.getByLabelText('New Folder'))
    expect(onCreateFolder).toHaveBeenCalledWith('')
  })

  it('FS-2.3-44: clicking New Document calls onCreateDocument with empty parent', () => {
    const onCreateDocument = vi.fn(async () => null)
    renderPanel({ onCreateDocument })
    fireEvent.click(screen.getByLabelText('New Document'))
    expect(onCreateDocument).toHaveBeenCalledWith('')
  })
})

describe('ExplorerPanel — tree rendering', () => {
  it('renders file names (diagram + document)', () => {
    const tree = [
      file('arch.json', 'arch.json', 'diagram'),
      file('notes.md', 'notes.md', 'document'),
    ]
    renderPanel({ tree })
    expect(screen.getByText('arch.json')).toBeTruthy()
    expect(screen.getByText('notes.md')).toBeTruthy()
  })

  it('FS-2.3-06: diagram row uses blue icon tint, document row uses emerald', () => {
    const tree = [
      file('arch.json', 'arch.json', 'diagram'),
      file('notes.md', 'notes.md', 'document'),
    ]
    const { container } = renderPanel({ tree })
    // Diagram icon has .text-blue-500 class; document icon has .text-emerald-500.
    expect(container.querySelector('svg.text-blue-500')).not.toBeNull()
    expect(container.querySelector('svg.text-emerald-500')).not.toBeNull()
  })

  it('empty tree shows "Empty folder" placeholder', () => {
    renderPanel({ tree: [] })
    expect(screen.getByText('Empty folder')).toBeTruthy()
  })

  it('loading state shows "Scanning..."', () => {
    renderPanel({ isLoading: true })
    expect(screen.getByText('Scanning...')).toBeTruthy()
  })

  it('FS-2.3-07: left-pane file is highlighted with blue text class', () => {
    const tree = [file('a.json', 'a.json', 'diagram')]
    const { container } = renderPanel({ tree, leftPaneFile: 'a.json' })
    const row = container.querySelector('.bg-blue-50')
    expect(row).not.toBeNull()
    expect(row!.textContent).toContain('a.json')
  })

  it('FS-2.3-07: right-pane file is highlighted with green text class', () => {
    const tree = [file('a.json', 'a.json', 'diagram')]
    const { container } = renderPanel({ tree, rightPaneFile: 'a.json' })
    expect(container.querySelector('.bg-green-50')).not.toBeNull()
  })

  it('FS-2.3-07: file open in both panes gets the gradient class', () => {
    const tree = [file('a.json', 'a.json', 'diagram')]
    const { container } = renderPanel({
      tree, leftPaneFile: 'a.json', rightPaneFile: 'a.json',
    })
    expect(container.querySelector('.bg-gradient-to-r')).not.toBeNull()
  })

  it('FS-2.3-08: dirty file row gets font-semibold', () => {
    const tree = [file('d.json', 'd.json', 'diagram')]
    const { container } = renderPanel({ tree, dirtyFiles: new Set(['d.json']) })
    const dirtyRow = Array.from(container.querySelectorAll('div')).find(
      (el) => el.className.includes('font-semibold') && el.textContent?.includes('d.json'),
    )
    expect(dirtyRow).toBeDefined()
  })
})

describe('ExplorerPanel — folder expand/collapse', () => {
  it('FS-2.3-04: clicking a folder toggles its children visibility', () => {
    const tree = [
      folder('docs', 'docs', [file('inside.md', 'docs/inside.md', 'document')]),
    ]
    renderPanel({ tree })
    // Initially children hidden.
    expect(screen.queryByText('inside.md')).toBeNull()
    // Use getAllByText: after click, the header breadcrumb also shows 'docs'.
    fireEvent.click(screen.getAllByText('docs')[0])
    expect(screen.getByText('inside.md')).toBeTruthy()
    fireEvent.click(screen.getAllByText('docs').at(-1)!)
    expect(screen.queryByText('inside.md')).toBeNull()
  })

  it('auto-expands ancestors when leftPaneFile is nested', () => {
    const tree = [
      folder('a', 'a', [
        folder('b', 'a/b', [file('c.md', 'a/b/c.md', 'document')]),
      ]),
    ]
    renderPanel({ tree, leftPaneFile: 'a/b/c.md' })
    // Both ancestors auto-expanded → c.md visible without any clicks.
    expect(screen.getByText('c.md')).toBeTruthy()
  })
})

describe('ExplorerPanel — file click', () => {
  it('clicking a .json file calls onSelectFile with the path', () => {
    const onSelectFile = vi.fn()
    const tree = [file('a.json', 'a.json', 'diagram')]
    renderPanel({ tree, onSelectFile })
    fireEvent.click(screen.getByText('a.json'))
    expect(onSelectFile).toHaveBeenCalledWith('a.json')
  })

  it('clicking a .md file prefers onSelectDocument when provided', () => {
    const onSelectFile = vi.fn()
    const onSelectDocument = vi.fn()
    const tree = [file('a.md', 'a.md', 'document')]
    renderPanel({ tree, onSelectFile, onSelectDocument })
    fireEvent.click(screen.getByText('a.md'))
    expect(onSelectDocument).toHaveBeenCalledWith('a.md')
    expect(onSelectFile).not.toHaveBeenCalled()
  })

  it('.md file falls back to onSelectFile when onSelectDocument is absent', () => {
    const onSelectFile = vi.fn()
    const tree = [file('a.md', 'a.md', 'document')]
    renderPanel({ tree, onSelectFile })
    fireEvent.click(screen.getByText('a.md'))
    expect(onSelectFile).toHaveBeenCalledWith('a.md')
  })
})

describe('ExplorerPanel — filter pills (FS-2.3-17/18/19)', () => {
  const mixedTree = [
    file('a.json', 'a.json', 'diagram'),
    file('b.md', 'b.md', 'document'),
  ]

  it('pills not rendered when onFilterChange is absent', () => {
    renderPanel({ tree: mixedTree })
    expect(screen.queryByRole('button', { name: 'Diagrams' })).toBeNull()
  })

  it('pills render when onFilterChange is provided', () => {
    renderPanel({
      tree: mixedTree,
      onFilterChange: vi.fn(),
      explorerFilter: 'all',
    })
    expect(screen.getByRole('button', { name: 'All' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Diagrams' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Documents' })).toBeTruthy()
  })

  it('clicking a pill fires onFilterChange with the matching filter', () => {
    const onFilterChange = vi.fn()
    renderPanel({
      tree: mixedTree, onFilterChange, explorerFilter: 'all',
    })
    fireEvent.click(screen.getByRole('button', { name: 'Diagrams' }))
    expect(onFilterChange).toHaveBeenCalledWith('diagrams')
  })

  it('FS-2.3-17: filter="all" shows both diagrams and documents', () => {
    renderPanel({
      tree: mixedTree, onFilterChange: vi.fn(), explorerFilter: 'all',
    })
    expect(screen.getByText('a.json')).toBeTruthy()
    expect(screen.getByText('b.md')).toBeTruthy()
  })

  it('FS-2.3-18: filter="diagrams" hides .md files', () => {
    renderPanel({
      tree: mixedTree, onFilterChange: vi.fn(), explorerFilter: 'diagrams',
    })
    expect(screen.getByText('a.json')).toBeTruthy()
    expect(screen.queryByText('b.md')).toBeNull()
  })

  it('FS-2.3-19: filter="documents" hides .json files', () => {
    renderPanel({
      tree: mixedTree, onFilterChange: vi.fn(), explorerFilter: 'documents',
    })
    expect(screen.queryByText('a.json')).toBeNull()
    expect(screen.getByText('b.md')).toBeTruthy()
  })

  it('FS-2.3-18: "diagrams" filter also hides folders that contain no diagrams', () => {
    const tree = [
      folder('only-docs', 'only-docs', [
        file('d.md', 'only-docs/d.md', 'document'),
      ]),
      file('top.json', 'top.json', 'diagram'),
    ]
    renderPanel({
      tree, onFilterChange: vi.fn(), explorerFilter: 'diagrams',
    })
    expect(screen.getByText('top.json')).toBeTruthy()
    // Folder with no .json descendants must be hidden.
    expect(screen.queryByText('only-docs')).toBeNull()
  })

  it('active pill has the blue-100 background class', () => {
    const { container } = renderPanel({
      tree: mixedTree, onFilterChange: vi.fn(), explorerFilter: 'diagrams',
    })
    const active = container.querySelector('button.bg-blue-100')
    expect(active?.textContent).toBe('Diagrams')
  })
})

describe('ExplorerPanel — sort variants (FS-2.3-09..15)', () => {
  const unsorted: TreeNode[] = [
    file('z.json', 'z.json', 'diagram'),
    folder('alpha', 'alpha', []),
    file('a.json', 'a.json', 'diagram'),
  ]

  function visibleNames(container: HTMLElement): string[] {
    // Skip the directory header span (has "text-xs font-semibold" classes).
    return Array.from(container.querySelectorAll('span.truncate.flex-1'))
      .filter((el) => !el.className.includes('font-semibold'))
      .map((el) => el.textContent ?? '')
      .filter(Boolean)
  }

  it('FS-2.3-09: sort by name ascending with folders-first grouping', () => {
    const { container } = renderPanel({
      tree: unsorted,
      sortField: 'name', sortDirection: 'asc', sortGrouping: 'folders-first',
    })
    const names = visibleNames(container)
    expect(names).toEqual(['alpha', 'a.json', 'z.json'])
  })

  it('FS-2.3-10: sort by name descending reverses file + folder order', () => {
    const { container } = renderPanel({
      tree: unsorted,
      sortField: 'name', sortDirection: 'desc', sortGrouping: 'folders-first',
    })
    const names = visibleNames(container)
    expect(names).toEqual(['alpha', 'z.json', 'a.json'])
  })

  it('FS-2.3-14: files-first places files above folders', () => {
    const { container } = renderPanel({
      tree: unsorted,
      sortField: 'name', sortDirection: 'asc', sortGrouping: 'files-first',
    })
    const names = visibleNames(container)
    expect(names).toEqual(['a.json', 'z.json', 'alpha'])
  })

  it('FS-2.3-15: mixed grouping interleaves files & folders by name', () => {
    const { container } = renderPanel({
      tree: unsorted,
      sortField: 'name', sortDirection: 'asc', sortGrouping: 'mixed',
    })
    const names = visibleNames(container)
    expect(names).toEqual(['a.json', 'alpha', 'z.json'])
  })

  it('FS-2.3-11: sort by modified descending uses lastModified timestamps', () => {
    const tree: TreeNode[] = [
      { ...file('old.json', 'old.json', 'diagram'), lastModified: 100 },
      { ...file('new.json', 'new.json', 'diagram'), lastModified: 200 },
    ]
    const { container } = renderPanel({
      tree, sortField: 'modified', sortDirection: 'desc', sortGrouping: 'mixed',
    })
    const names = visibleNames(container)
    expect(names[0]).toBe('new.json')
    expect(names[1]).toBe('old.json')
  })
})

describe('ExplorerPanel — SVG creation (FS-2.3-55)', () => {
  it('FS-2.3-55: calls onCreateSVG when "SVG" is clicked in the New submenu', async () => {
    const onCreateSVG = vi.fn().mockResolvedValue('untitled.svg');
    renderPanel({
      tree: [{ name: 'notes', path: 'notes', type: 'folder', children: [] }],
      onCreateSVG,
    });
    const folderRow = screen.getByText('notes');
    fireEvent.contextMenu(folderRow);
    const newButton = screen.getByText('New');
    fireEvent.mouseEnter(newButton.closest('div')!);
    const svgButton = await screen.findByText('SVG');
    fireEvent.click(svgButton);
    expect(onCreateSVG).toHaveBeenCalledWith('notes');
  });
})

describe('ExplorerPanel — folder selection (FS-2.3-46..48)', () => {
  it('FS-2.3-46: clicking a folder selects it with blue highlight', () => {
    const tree = [folder('alpha', 'alpha', [])]
    const { container } = renderPanel({ tree })
    fireEvent.click(screen.getAllByText('alpha')[0])
    // Phase 3 PR 1: active text colour migrated from `text-blue-700` to the
    // tokenised `text-accent`; the `bg-blue-50` background is re-bound for
    // dark mode via globals.css so the selector remains stable.
    const selectedRow = container.querySelector('.bg-blue-50.text-accent')
    expect(selectedRow).not.toBeNull()
    expect(selectedRow!.textContent).toContain('alpha')
  })

  it('FS-2.3-47: header create buttons target the selected folder', () => {
    const onCreateFile = vi.fn(async () => null)
    const tree = [folder('alpha', 'alpha', [])]
    renderPanel({ tree, onCreateFile })
    fireEvent.click(screen.getAllByText('alpha')[0])
    fireEvent.click(screen.getByLabelText('New Diagram in alpha'))
    expect(onCreateFile).toHaveBeenCalledWith('alpha')
  })

  it('FS-2.3-48: header shows breadcrumb "vault / folder" when a folder is selected', () => {
    const tree = [folder('alpha', 'alpha', [])]
    const { container } = renderPanel({ tree, directoryName: 'my-vault' })
    fireEvent.click(screen.getAllByText('alpha')[0])
    const breadcrumb = container.querySelector('.text-mute.font-normal')
    expect(breadcrumb?.textContent).toContain('my-vault /')
  })
})

describe('ExplorerPanel — ARIA tree semantics & keyboard nav (KB-033)', () => {
  const sampleTree = () => [
    folder('docs', 'docs', [
      file('inside.md', 'docs/inside.md', 'document'),
      folder('nested', 'docs/nested', [
        file('deep.md', 'docs/nested/deep.md', 'document'),
      ]),
    ]),
    file('top.json', 'top.json', 'diagram'),
  ]

  it('FS-2.3-56: tree container has role="tree"', () => {
    renderPanel({ tree: sampleTree() })
    const tree = screen.getByRole('tree')
    expect(tree).toBeTruthy()
    expect(tree.getAttribute('data-testid')).toBe('explorer-tree')
  })

  it('FS-2.3-57: every row has role="treeitem" with aria-level', () => {
    renderPanel({ tree: sampleTree() })
    // Expand 'docs' to surface depth-2 rows.
    fireEvent.click(screen.getAllByText('docs')[0])
    const items = screen.getAllByRole('treeitem')
    // Every item carries an aria-level attribute.
    for (const item of items) {
      const lvl = item.getAttribute('aria-level')
      expect(lvl).toBeTruthy()
      expect(Number(lvl)).toBeGreaterThanOrEqual(1)
    }
    // Depth-1 rows: 'docs' folder + 'top.json' file.
    const lvl1 = items.filter((el) => el.getAttribute('aria-level') === '1')
    expect(lvl1.length).toBe(2)
    // Depth-2 rows: 'inside.md' file + 'nested' folder under 'docs'.
    const lvl2 = items.filter((el) => el.getAttribute('aria-level') === '2')
    expect(lvl2.length).toBe(2)
  })

  it('FS-2.3-58: folder rows expose aria-expanded; file rows do not', () => {
    renderPanel({ tree: sampleTree() })
    // First top-level row is the 'docs' folder (folders-first sort).
    const docsItem = screen.getAllByRole('treeitem')[0]
    expect(docsItem.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(screen.getAllByText('docs')[0])
    expect(docsItem.getAttribute('aria-expanded')).toBe('true')
    const fileItem = screen.getAllByRole('treeitem').find((el) => el.getAttribute('aria-level') === '1' && el.textContent?.includes('top.json'))!
    expect(fileItem.hasAttribute('aria-expanded')).toBe(false)
  })

  it('FS-2.3-59: active file row exposes aria-selected="true"', () => {
    renderPanel({ tree: sampleTree(), leftPaneFile: 'top.json' })
    const fileItem = screen.getAllByRole('treeitem').find((el) => el.textContent?.includes('top.json'))!
    expect(fileItem.getAttribute('aria-selected')).toBe('true')
  })

  it('FS-2.3-60: expanded folder children sit inside role="group"', () => {
    const { container } = renderPanel({ tree: sampleTree() })
    fireEvent.click(screen.getAllByText('docs')[0])
    const group = container.querySelector('[role="group"]')
    expect(group).toBeTruthy()
    expect(within(group as HTMLElement).getByText('inside.md')).toBeTruthy()
  })

  // Focus enters the tree via the container's tabIndex=0 single tab stop, which
  // forwards to the first visible row. Helper mirrors that flow for keyboard tests.
  function enterTree() {
    const tree = screen.getByRole('tree')
    fireEvent.focus(tree)
    return tree
  }

  // The active row is announced via aria-activedescendant on the tree container,
  // which points at the row's id. This helper resolves the active row element.
  function activeRow() {
    const tree = screen.getByRole('tree')
    const id = tree.getAttribute('aria-activedescendant')
    if (!id) return null
    return document.getElementById(id)
  }

  it('FS-2.3-61: ArrowDown moves focus to the next visible row', () => {
    renderPanel({ tree: sampleTree() })
    const tree = enterTree()
    fireEvent.keyDown(tree, { key: 'ArrowDown' })
    expect(activeRow()?.textContent).toContain('top.json')
  })

  it('FS-2.3-62: ArrowRight on a collapsed folder expands it', () => {
    renderPanel({ tree: sampleTree() })
    const tree = enterTree()
    expect(screen.queryByText('inside.md')).toBeNull()
    fireEvent.keyDown(tree, { key: 'ArrowRight' })
    expect(screen.getByText('inside.md')).toBeTruthy()
  })

  it('FS-2.3-62: ArrowRight on an already-expanded folder focuses its first child', () => {
    renderPanel({ tree: sampleTree() })
    const tree = enterTree()
    fireEvent.keyDown(tree, { key: 'ArrowRight' }) // expands docs
    fireEvent.keyDown(tree, { key: 'ArrowRight' }) // moves to first child (folders-first → 'nested')
    expect(activeRow()?.getAttribute('aria-level')).toBe('2')
  })

  it('FS-2.3-63: ArrowLeft on an expanded folder collapses it', () => {
    renderPanel({ tree: sampleTree() })
    const tree = enterTree()
    fireEvent.keyDown(tree, { key: 'ArrowRight' })
    expect(screen.getByText('inside.md')).toBeTruthy()
    fireEvent.keyDown(tree, { key: 'ArrowLeft' })
    expect(screen.queryByText('inside.md')).toBeNull()
  })

  it('FS-2.3-63: ArrowLeft on a child row moves focus to the parent folder', () => {
    renderPanel({ tree: sampleTree() })
    const tree = enterTree()
    fireEvent.keyDown(tree, { key: 'ArrowRight' }) // expand docs
    fireEvent.keyDown(tree, { key: 'ArrowDown' })  // active = inside.md
    fireEvent.keyDown(tree, { key: 'ArrowLeft' })  // up to docs
    expect(activeRow()?.getAttribute('aria-level')).toBe('1')
  })

  it('FS-2.3-64: tree container is the single tab stop; rows have no tabindex', () => {
    renderPanel({ tree: sampleTree() })
    const tree = screen.getByRole('tree')
    expect(tree.getAttribute('tabindex')).toBe('0')
    const items = screen.getAllByRole('treeitem')
    for (const item of items) {
      expect(item.hasAttribute('tabindex')).toBe(false)
    }
  })

  it('FS-2.3-64: focusing the tree sets aria-activedescendant to the first visible row', () => {
    renderPanel({ tree: sampleTree() })
    const tree = screen.getByRole('tree')
    expect(tree.getAttribute('aria-activedescendant')).toBeNull()
    fireEvent.focus(tree)
    const activeId = tree.getAttribute('aria-activedescendant')
    expect(activeId).toBeTruthy()
    expect(document.getElementById(activeId!)?.textContent).toContain('docs')
  })
})

describe('ExplorerPanel — mobile read-only scope (KB-040, FS-2.3-66/67)', () => {
  const MOBILE_Q = `(max-width: ${MOBILE_BREAKPOINT_PX}px)`
  let originalMatchMedia: typeof window.matchMedia | undefined

  beforeEach(() => {
    originalMatchMedia = window.matchMedia
  })

  afterEach(() => {
    if (originalMatchMedia) {
      window.matchMedia = originalMatchMedia
    } else {
      delete (window as unknown as { matchMedia?: unknown }).matchMedia
    }
  })

  function installMatchMedia(isMobile: boolean) {
    ;(window as unknown as { matchMedia: (q: string) => MediaQueryList }).matchMedia =
      (q: string) => ({
        matches: q === MOBILE_Q ? isMobile : false,
        media: q,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
        onchange: null,
      } as unknown as MediaQueryList)
  }

  it('FS-2.3-66: hides New Diagram / Document / Folder buttons when isMobile', () => {
    installMatchMedia(true)
    renderPanel({ directoryName: 'sample-vault' })
    expect(screen.queryByLabelText('New Diagram')).toBeNull()
    expect(screen.queryByLabelText('New Document')).toBeNull()
    expect(screen.queryByLabelText('New Folder')).toBeNull()
    // Browse-side affordances stay visible.
    expect(screen.getByLabelText('Refresh explorer')).toBeTruthy()
    expect(screen.getByLabelText('More actions')).toBeTruthy()
  })

  it('FS-2.3-66: keeps create buttons on desktop viewports', () => {
    installMatchMedia(false)
    renderPanel({ directoryName: 'sample-vault' })
    expect(screen.getByLabelText('New Diagram')).toBeTruthy()
    expect(screen.getByLabelText('New Document')).toBeTruthy()
    expect(screen.getByLabelText('New Folder')).toBeTruthy()
  })

  it('FS-2.3-67: hides "Open different folder" when isMobile', () => {
    installMatchMedia(true)
    renderPanel({ directoryName: 'sample-vault' })
    expect(screen.queryByLabelText('Open different folder')).toBeNull()
  })

  it('FS-2.3-67: keeps "Open different folder" on desktop viewports', () => {
    installMatchMedia(false)
    renderPanel({ directoryName: 'sample-vault' })
    expect(screen.getByLabelText('Open different folder')).toBeTruthy()
  })
})
