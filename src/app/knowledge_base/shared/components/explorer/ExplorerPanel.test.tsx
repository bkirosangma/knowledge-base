import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import ExplorerPanel from './ExplorerPanel'
import type { TreeNode } from '../../hooks/useFileExplorer'

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
    expect(screen.getByTitle('New Diagram')).toBeTruthy()
    expect(screen.getByTitle('New Folder')).toBeTruthy()
    expect(screen.getByTitle('Refresh')).toBeTruthy()
    expect(screen.getByTitle('More actions')).toBeTruthy()
  })

  it('clicking Refresh fires onRefresh', () => {
    const onRefresh = vi.fn()
    renderPanel({ onRefresh })
    fireEvent.click(screen.getByTitle('Refresh'))
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('Refresh icon gains the spinner animation class when isLoading', () => {
    const { container } = renderPanel({ isLoading: true })
    const refreshBtn = screen.getByTitle('Refresh')
    const svg = within(refreshBtn).getByText('', { selector: 'svg' }).parentElement
      // fallback: query by class
    const anim = container.querySelector('svg.animate-spin')
    expect(anim).not.toBeNull()
    expect(svg).toBeDefined()
  })

  it('clicking New Diagram calls onCreateFile with empty parent', () => {
    const onCreateFile = vi.fn(async () => null)
    renderPanel({ onCreateFile })
    fireEvent.click(screen.getByTitle('New Diagram'))
    expect(onCreateFile).toHaveBeenCalledWith('')
  })

  it('clicking New Folder calls onCreateFolder with empty parent', () => {
    const onCreateFolder = vi.fn(async () => null)
    renderPanel({ onCreateFolder })
    fireEvent.click(screen.getByTitle('New Folder'))
    expect(onCreateFolder).toHaveBeenCalledWith('')
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
    fireEvent.click(screen.getByText('docs'))
    expect(screen.getByText('inside.md')).toBeTruthy()
    fireEvent.click(screen.getByText('docs'))
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
