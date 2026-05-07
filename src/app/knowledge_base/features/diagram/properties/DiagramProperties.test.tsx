import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { DiagramProperties } from './DiagramProperties'
import type { FlowDef, Connection, NodeData } from '../types'
import type { RegionBounds } from './shared'
import type { SourceLink } from '../../../shared/types/sources'
import type { AttachmentBuckets } from '../../document/types'

// Covers DIAG-3.10-12..16, DIAG-3.11-10.

const regions: RegionBounds[] = []
const connections: Connection[] = []
const flows: FlowDef[] = [
  { id: 'flow-1', name: 'Auth Flow', connectionIds: [] },
  { id: 'flow-2', name: 'Data Flow', connectionIds: [] },
]

function base(overrides: Partial<React.ComponentProps<typeof DiagramProperties>> = {}) {
  return {
    title: 'My Diagram',
    regions,
    nodes: [],
    connections,
    ...overrides,
  } as React.ComponentProps<typeof DiagramProperties>
}

// ── DIAG-3.10-12: Flow edit name ─────────────────────────────────────────────

describe('DIAG-3.10-12: flow properties — edit name', () => {
  it('double-clicking the Name row opens an input, Enter commits and calls onUpdateFlow', () => {
    const onUpdateFlow = vi.fn()
    render(<DiagramProperties {...base({ flows, activeFlowId: 'flow-1', onUpdateFlow })} />)
    // "Name" label is unique in FlowDetail; traverse to the cursor-text container
    const nameRow = screen.getByText('Name').closest('[class*="cursor-text"]')!
    fireEvent.doubleClick(nameRow)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Renamed Flow' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onUpdateFlow).toHaveBeenCalledWith('flow-1', { name: 'Renamed Flow' })
  })
})

// ── DIAG-3.10-13: Flow edit category ─────────────────────────────────────────

describe('DIAG-3.10-13: flow properties — edit category', () => {
  it('double-clicking the Category row opens an input, blur commits and calls onUpdateFlow', () => {
    const onUpdateFlow = vi.fn()
    const flowsWithCat: FlowDef[] = [{ id: 'flow-1', name: 'Auth Flow', category: 'Auth', connectionIds: [] }]
    render(<DiagramProperties {...base({ flows: flowsWithCat, activeFlowId: 'flow-1', onUpdateFlow })} />)
    const categoryLabel = screen.getByText('Category').closest('[class*="cursor-text"]')!
    fireEvent.doubleClick(categoryLabel)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Security' } })
    fireEvent.blur(input)
    expect(onUpdateFlow).toHaveBeenCalledWith('flow-1', { category: 'Security' })
  })
})

// ── DIAG-3.10-14: Flow delete ─────────────────────────────────────────────────

describe('DIAG-3.10-14: flow properties — delete flow', () => {
  it('clicking Delete Flow calls onDeleteFlow with the flow id', () => {
    const onDeleteFlow = vi.fn()
    render(<DiagramProperties {...base({ flows, activeFlowId: 'flow-1', onDeleteFlow })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete Flow' }))
    expect(onDeleteFlow).toHaveBeenCalledWith('flow-1')
  })
})

// ── DIAG-3.10-15/16: Flat vs grouped flow layout ─────────────────────────────

describe('DIAG-3.10-15: flat grouping — no categories', () => {
  it('renders flow names as direct list items (no group headers)', () => {
    const flatFlows: FlowDef[] = [
      { id: 'f1', name: 'Flow A', connectionIds: [] },
      { id: 'f2', name: 'Flow B', connectionIds: [] },
    ]
    render(<DiagramProperties {...base({ flows: flatFlows })} />)
    // Both flows visible as clickable buttons
    expect(screen.getByRole('button', { name: /Flow A/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Flow B/ })).toBeTruthy()
    // No FlowGroup category label in the DOM
    expect(screen.queryByText('UNCATEGORIZED')).toBeNull()
  })
})

describe('DIAG-3.10-16: grouped layout — categorised flows', () => {
  it('renders flows under their category group headers', () => {
    const groupedFlows: FlowDef[] = [
      { id: 'f1', name: 'Login', category: 'Auth', connectionIds: [] },
      { id: 'f2', name: 'Sync', category: 'Data', connectionIds: [] },
    ]
    render(<DiagramProperties {...base({ flows: groupedFlows })} />)
    // Category headers rendered as uppercase labels
    expect(screen.getByText('Auth')).toBeTruthy()
    expect(screen.getByText('Data')).toBeTruthy()
  })
})

// ── DIAG-3.13-31: title editable ──────────────────────────────────────────────

describe('DIAG-3.13-31: DiagramProperties — title editable', () => {
  it('double-clicking the Title row opens an input with the current title', () => {
    render(<DiagramProperties {...base()} />)
    const titleRow = screen.getByText('My Diagram').closest('[class*="cursor-text"]')!
    fireEvent.doubleClick(titleRow)
    const input = screen.getByRole('textbox')
    expect((input as HTMLInputElement).value).toBe('My Diagram')
  })

  it('Enter commits new title via onUpdateTitle', () => {
    const onUpdateTitle = vi.fn()
    render(<DiagramProperties {...base({ onUpdateTitle })} />)
    const titleRow = screen.getByText('My Diagram').closest('[class*="cursor-text"]')!
    fireEvent.doubleClick(titleRow)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'New Name' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onUpdateTitle).toHaveBeenCalledWith('New Name')
  })
})

// ── DIAG-3.13-32 / DIAG-3.13-26: curve algorithm dropdown ────────────────────

describe('DIAG-3.13-32: DiagramProperties — default line algorithm dropdown', () => {
  it('shows "Orthogonal" as the current value by default', () => {
    render(<DiagramProperties {...base()} />)
    // The DropdownRow button shows the selected label
    expect(screen.getByRole('button', { name: /Orthogonal/i })).toBeTruthy()
  })

  it('clicking the dropdown opens algorithm options', () => {
    render(<DiagramProperties {...base()} />)
    fireEvent.click(screen.getByRole('button', { name: /Orthogonal/i }))
    expect(screen.getByRole('button', { name: 'Bezier' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Straight' })).toBeTruthy()
  })

  it('clicking an option calls onUpdateLineCurve', () => {
    const onUpdateLineCurve = vi.fn()
    render(<DiagramProperties {...base({ onUpdateLineCurve })} />)
    fireEvent.click(screen.getByRole('button', { name: /Orthogonal/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Bezier' }))
    expect(onUpdateLineCurve).toHaveBeenCalledWith('bezier')
  })
})

// ── DIAG-3.13-33/34: layers and elements lists ────────────────────────────────

describe('DIAG-3.13-33: DiagramProperties — layers list', () => {
  it('shows the Layers expandable row with the count of regions', () => {
    const r: RegionBounds[] = [
      { id: 'L1', title: 'Frontend', bg: '#fff', border: '#ccc', left: 0, width: 100, top: 0, height: 100, empty: false },
      { id: 'L2', title: 'Backend', bg: '#fff', border: '#ccc', left: 0, width: 100, top: 200, height: 100, empty: false },
    ]
    render(<DiagramProperties {...base({ regions: r })} />)
    // The ExpandableListRow header shows "Layers" and the count
    expect(screen.getByText(/Layers/)).toBeTruthy()
  })
})

describe('DIAG-3.13-34: DiagramProperties — elements list', () => {
  it('shows the Elements expandable row with node labels accessible', () => {
    const testNodes: NodeData[] = [
      { id: 'n1', label: 'API', icon: (() => null) as unknown as NodeData['icon'], x: 0, y: 0, w: 100, layer: '' },
    ]
    render(<DiagramProperties {...base({ nodes: testNodes })} />)
    expect(screen.getByText(/Elements/)).toBeTruthy()
  })
})

// ── DIAG-3.11-10: flow toggle ─────────────────────────────────────────────────

describe('DiagramProperties — flow toggle (DIAG-3.11-10)', () => {
  it('clicking a flow row calls onSelectFlow with its id', () => {
    const onSelectFlow = vi.fn()
    render(<DiagramProperties {...base({ flows, onSelectFlow })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Auth Flow' }))
    expect(onSelectFlow).toHaveBeenCalledWith('flow-1')
    expect(onSelectFlow).toHaveBeenCalledTimes(1)
  })

  it('clicking the same row a second time calls onSelectFlow(null)', () => {
    const onSelectFlow = vi.fn()
    render(<DiagramProperties {...base({ flows, onSelectFlow })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Auth Flow' }))
    fireEvent.click(screen.getByRole('button', { name: 'Auth Flow' }))
    expect(onSelectFlow).toHaveBeenNthCalledWith(1, 'flow-1')
    expect(onSelectFlow).toHaveBeenNthCalledWith(2, null)
  })

  it('activeFlowId prop pre-expands the matching flow', () => {
    render(<DiagramProperties {...base({ flows, activeFlowId: 'flow-1' })} />)
    expect(screen.getByRole('button', { name: 'Delete Flow' })).toBeTruthy()
  })

  it('when activeFlowId prop changes to undefined the flow detail collapses', () => {
    const { rerender } = render(
      <DiagramProperties {...base({ flows, activeFlowId: 'flow-1' })} />,
    )
    expect(screen.getByRole('button', { name: 'Delete Flow' })).toBeTruthy()

    rerender(<DiagramProperties {...base({ flows, activeFlowId: undefined })} />)
    expect(screen.queryByRole('button', { name: 'Delete Flow' })).toBeNull()
  })
})

// ── Sources section ──────────────────────────────────────────────────────────

describe('DiagramProperties — Sources section', () => {
  it('renders an existing source row and commits a new URL via onUpdateDiagram', async () => {
    const user = userEvent.setup()
    const onUpdateDiagram = vi.fn()
    function Host() {
      const [sources, setSources] = useState<SourceLink[]>([
        { url: 'https://example.com', title: 'Example' },
      ])
      return (
        <DiagramProperties
          {...base({
            sources,
            onUpdateDiagram: (updates) => {
              onUpdateDiagram(updates)
              if (updates.sources !== undefined) setSources(updates.sources)
            },
          })}
        />
      )
    }
    render(<Host />)
    expect(screen.getByTestId('sources-row-0')).toBeInTheDocument()

    await user.click(screen.getByTestId('sources-add'))
    const urlInput = await screen.findByTestId('sources-url-input-1')
    await user.type(urlInput, 'https://docs.example.org')
    await user.tab()

    const lastCall = onUpdateDiagram.mock.calls.at(-1)
    expect(lastCall?.[0]).toEqual({
      sources: [
        { url: 'https://example.com', title: 'Example' },
        { url: 'https://docs.example.org', title: '' },
      ],
    })
  })
})

// ── DIAG-3.13-62: root-scope docs merge with wiki-link backlinks ──────────────

describe('DiagramProperties — root-scope docs merge wiki-link backlinks (DIAG-3.13-62)', () => {
  const emptyBuckets: AttachmentBuckets = { docs: [], diagrams: [], svgs: [], tabs: [] }

  function makeProps() {
    const attachmentsByType = vi.fn(({ type, id }: { type: string; id: string }) => {
      if (type === 'root' && id === 'diagram.json') {
        return {
          docs: [{ filename: 'a.md', title: 'A Doc' }],
          diagrams: [],
          svgs: [],
          tabs: [],
        } satisfies AttachmentBuckets
      }
      return emptyBuckets
    })
    return base({
      diagramFilename: 'diagram.json',
      attachmentsByType,
      backlinks: [
        { sourcePath: 'a.md' },   // file-level — same as attachment
        { sourcePath: 'b.md' },   // file-level — backlink only
      ],
      onOpenDocPicker: vi.fn(),
      onPreviewDocument: vi.fn(),
    })
  }

  it('produces exactly 2 merged rows (no duplicate for a.md)', () => {
    render(<DiagramProperties {...makeProps()} />)
    // FileLevelReferencesGroup renders <li> rows via ReferenceRow
    const rows = screen.getAllByRole('button', { name: /Open / })
    const labels = rows.map((b) => b.textContent?.trim())
    // a.md -> "A Doc" (title resolved), b.md -> "b.md" (filename fallback)
    expect(labels.filter((l) => l === 'A Doc').length).toBe(1)
    expect(labels.filter((l) => l === 'b.md').length).toBe(1)
  })

  it('a.md row carries attachment icon (attachment wins over wiki-link)', () => {
    render(<DiagramProperties {...makeProps()} />)
    const attachmentIcons = screen.getAllByTestId('reference-row-icon-attachment')
    const filenames = attachmentIcons.map((el) =>
      el.closest('li')?.querySelector('span')?.textContent?.trim(),
    )
    expect(filenames).toContain('A Doc')
  })

  it('b.md row carries wiki-link icon (backlink-only row)', () => {
    render(<DiagramProperties {...makeProps()} />)
    const wikiIcons = screen.getAllByTestId('reference-row-icon-wiki-link')
    const filenames = wikiIcons.map((el) =>
      el.closest('li')?.querySelector('span')?.textContent?.trim(),
    )
    expect(filenames).toContain('b.md')
  })

  it('shows file-references-attach button when not readOnly', () => {
    render(<DiagramProperties {...makeProps()} />)
    expect(screen.getByTestId('file-references-attach')).toBeTruthy()
  })

  it('section-anchored backlinks appear under Section References, not the merged list', () => {
    render(
      <DiagramProperties
        {...makeProps()}
        backlinks={[
          { sourcePath: 'a.md' },
          { sourcePath: 'c.md', section: 'intro' },
        ]}
      />,
    )
    // "Section References" heading rendered by DocumentsSection with title override
    expect(screen.getByText(/Section References/)).toBeTruthy()
    // c.md appears in that section (the #intro suffix is rendered by DocumentsSection)
    expect(screen.getByText(/c\.md/)).toBeTruthy()
  })

  it('DIAG-3.13-62: renders References section even when no docs attached and no backlinks', () => {
    // Empty buckets + empty backlinks: the References section must still render
    // so the Attach affordance is always reachable.
    const attachmentsByType = vi.fn(({ type, id }: { type: string; id: string }) => {
      if (type === 'root' && id === 'diagram.json') {
        return { docs: [], diagrams: [], svgs: [], tabs: [] } satisfies AttachmentBuckets
      }
      return emptyBuckets
    })
    render(
      <DiagramProperties
        {...base({
          diagramFilename: 'diagram.json',
          attachmentsByType,
          backlinks: [],
          onOpenDocPicker: vi.fn(),
          onPreviewDocument: vi.fn(),
        })}
      />,
    )
    // The "References" section title is present
    expect(screen.getByText(/^References/)).toBeTruthy()
    // FileLevelReferencesGroup renders the empty-state message
    expect(screen.getByText(/No references/)).toBeTruthy()
    // Attach button is still visible when readOnly is false and onOpenDocPicker is provided
    expect(screen.getByTestId('file-references-attach')).toBeTruthy()
  })
})
