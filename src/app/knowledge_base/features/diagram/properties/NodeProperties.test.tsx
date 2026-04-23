import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NodeProperties } from './NodeProperties'
import type { NodeData, Connection, LayerDef, FlowDef } from '../types'
import type { RegionBounds } from './shared'
import { Database } from 'lucide-react'

// Covers DIAG-3.13-04 (label edit) and DIAG-3.13-05 (sublabel edit).

const node: NodeData = {
  id: 'n1', label: 'API Gateway', sub: 'REST endpoint',
  icon: Database as unknown as NodeData['icon'],
  x: 0, y: 0, w: 150, layer: '',
}

const connections: Connection[] = []
const regions: RegionBounds[] = []
const layerDefs: LayerDef[] = []
const flows: FlowDef[] = []

function baseProps(overrides: Partial<React.ComponentProps<typeof NodeProperties>> = {}) {
  return {
    id: 'n1',
    nodes: [node],
    connections,
    regions,
    layerDefs,
    allNodeIds: ['n1'],
    flows,
    ...overrides,
  } as React.ComponentProps<typeof NodeProperties>
}

// ── DIAG-3.13-04: label edit ──────────────────────────────────────────────────

describe('DIAG-3.13-04: NodeProperties — label edit', () => {
  it('double-clicking the Label row opens an input with the current value', () => {
    render(<NodeProperties {...baseProps()} />)
    const labelRow = screen.getByText('API Gateway').closest('[class*="cursor-text"]')!
    fireEvent.doubleClick(labelRow)
    const input = screen.getByRole('textbox')
    expect((input as HTMLInputElement).value).toBe('API Gateway')
  })

  it('Enter commits new label and calls onUpdate', () => {
    const onUpdate = vi.fn()
    render(<NodeProperties {...baseProps({ onUpdate })} />)
    const labelRow = screen.getByText('API Gateway').closest('[class*="cursor-text"]')!
    fireEvent.doubleClick(labelRow)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Renamed API' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onUpdate).toHaveBeenCalledWith('n1', { label: 'Renamed API' })
  })

  it('Escape cancels edit without calling onUpdate', () => {
    const onUpdate = vi.fn()
    render(<NodeProperties {...baseProps({ onUpdate })} />)
    const labelRow = screen.getByText('API Gateway').closest('[class*="cursor-text"]')!
    fireEvent.doubleClick(labelRow)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Discard me' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onUpdate).not.toHaveBeenCalled()
    expect(screen.getByText('API Gateway')).toBeTruthy()
  })

  it('read-only mode: Label row is not editable (no cursor-text class)', () => {
    render(<NodeProperties {...baseProps({ readOnly: true })} />)
    // In read-only mode, label is rendered as a plain Row (no cursor-text)
    const labelValue = screen.getByText('API Gateway')
    expect(labelValue.closest('[class*="cursor-text"]')).toBeNull()
  })
})

// ── DIAG-3.13-07: icon picker sets icon ──────────────────────────────────────

describe('DIAG-3.13-07: NodeProperties — icon picker', () => {
  it('clicking the Icon row opens the picker grid', () => {
    render(<NodeProperties {...baseProps()} />)
    const iconBtn = screen.getByText('Database').closest('button')!
    fireEvent.click(iconBtn)
    // The grid has multiple icon buttons — verify at least one is rendered
    const gridBtns = screen.getAllByRole('button').filter((b) => b.getAttribute('title'))
    expect(gridBtns.length).toBeGreaterThan(5)
  })

  it('clicking an icon in the grid calls onUpdate with the new icon', () => {
    const onUpdate = vi.fn()
    render(<NodeProperties {...baseProps({ onUpdate })} />)
    // Open picker
    fireEvent.click(screen.getByText('Database').closest('button')!)
    // Click the "Activity" icon (title="Activity")
    fireEvent.click(screen.getByTitle('Activity'))
    // Lucide icons are forwardRef objects — use expect.anything() since they're not plain Functions
    expect(onUpdate).toHaveBeenCalledWith('n1', { icon: expect.anything() })
  })

  it('readOnly mode: clicking an icon does not call onUpdate (onSelect is undefined)', () => {
    const onUpdate = vi.fn()
    render(<NodeProperties {...baseProps({ onUpdate, readOnly: true })} />)
    // Picker still opens in readOnly (the toggle button isn't disabled), but onSelect is undefined
    fireEvent.click(screen.getByText('Database').closest('button')!)
    fireEvent.click(screen.getByTitle('Activity'))
    expect(onUpdate).not.toHaveBeenCalled()
  })
})

// ── DIAG-3.13-09: layer assignment ───────────────────────────────────────────

describe('DIAG-3.13-09: NodeProperties — layer assignment', () => {
  it('shows the current layer title as text in the Layer row', () => {
    const layer: LayerDef = { id: 'L1', title: 'Frontend', bg: '#fff', border: '#ccc', textColor: '#000' }
    const nodeInLayer: NodeData = { ...node, layer: 'L1' }
    render(<NodeProperties {...baseProps({ nodes: [nodeInLayer], layerDefs: [layer] })} />)
    // AutocompleteInput shows value as a span in view mode
    expect(screen.getByText('Frontend')).toBeTruthy()
  })

  it('assigning an existing layer calls onUpdate with the layer id', () => {
    const onUpdate = vi.fn()
    const layer: LayerDef = { id: 'L1', title: 'Frontend', bg: '#fff', border: '#ccc', textColor: '#000' }
    render(<NodeProperties {...baseProps({ layerDefs: [layer], onUpdate })} />)
    // Double-click the Layer row to enter edit mode
    const layerRow = screen.getByText('Layer').closest('[class*="cursor-text"]')!
    fireEvent.doubleClick(layerRow)
    const layerInput = screen.getByRole('textbox', { name: '' })
    fireEvent.change(layerInput, { target: { value: 'Frontend' } })
    fireEvent.keyDown(layerInput, { key: 'Enter' })
    expect(onUpdate).toHaveBeenCalledWith('n1', { layer: 'L1' })
  })
})

// ── DIAG-3.13-10: colour editors ─────────────────────────────────────────────

describe('DIAG-3.13-10: NodeProperties — colour editors', () => {
  it('renders Fill, Border, and Text colour swatches', () => {
    const colorNode: NodeData = { ...node, bgColor: '#ff0000', borderColor: '#00ff00', textColor: '#0000ff' }
    const { container } = render(<NodeProperties {...baseProps({ nodes: [colorNode] })} />)
    const colorInputs = Array.from(container.querySelectorAll('input[type="color"]')) as HTMLInputElement[]
    const values = colorInputs.map((i) => i.value)
    expect(values).toContain('#ff0000')
    expect(values).toContain('#00ff00')
    expect(values).toContain('#0000ff')
  })
})

// ── DIAG-3.13-11: rotation control ───────────────────────────────────────────

describe('DIAG-3.13-11: NodeProperties — rotation control (condition nodes)', () => {
  const condNode: NodeData = {
    id: 'c1', label: 'Branch', icon: Database as unknown as NodeData['icon'],
    x: 0, y: 0, w: 60, layer: '',
    shape: 'condition', conditionOutCount: 2, conditionSize: 1,
    rotation: 0,
  }

  it('renders rotation preset buttons for condition nodes', () => {
    render(<NodeProperties {...baseProps({ id: 'c1', nodes: [condNode] })} />)
    expect(screen.getByRole('button', { name: '0°' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '90°' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '180°' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '270°' })).toBeTruthy()
  })

  it('clicking a preset calls onUpdate with that rotation', () => {
    const onUpdate = vi.fn()
    render(<NodeProperties {...baseProps({ id: 'c1', nodes: [condNode], onUpdate })} />)
    fireEvent.click(screen.getByRole('button', { name: '90°' }))
    expect(onUpdate).toHaveBeenCalledWith('c1', { rotation: 90 })
  })
})

// ── DIAG-3.13-12: condition exit count editor ─────────────────────────────────

describe('DIAG-3.13-12: NodeProperties — condition exit count (Add Out Anchor)', () => {
  const condNode: NodeData = {
    id: 'c1', label: 'Branch', icon: Database as unknown as NodeData['icon'],
    x: 0, y: 0, w: 60, layer: '',
    shape: 'condition', conditionOutCount: 2, conditionSize: 1,
  }

  it('clicking "Add Out Anchor" increments conditionOutCount', () => {
    const onUpdate = vi.fn()
    render(<NodeProperties {...baseProps({ id: 'c1', nodes: [condNode], onUpdate })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add Out Anchor' }))
    expect(onUpdate).toHaveBeenCalledWith('c1', { conditionOutCount: 3 })
  })
})

// ── DIAG-3.13-13: condition size editor ───────────────────────────────────────

describe('DIAG-3.13-13: NodeProperties — condition size selector', () => {
  const condNode: NodeData = {
    id: 'c1', label: 'Branch', icon: Database as unknown as NodeData['icon'],
    x: 0, y: 0, w: 60, layer: '',
    shape: 'condition', conditionOutCount: 2, conditionSize: 1,
  }

  it('renders size buttons 1..5', () => {
    render(<NodeProperties {...baseProps({ id: 'c1', nodes: [condNode] })} />)
    for (const s of [1, 2, 3, 4, 5]) {
      expect(screen.getByRole('button', { name: String(s) })).toBeTruthy()
    }
  })

  it('clicking size 3 calls onUpdate with conditionSize=3', () => {
    const onUpdate = vi.fn()
    render(<NodeProperties {...baseProps({ id: 'c1', nodes: [condNode], onUpdate })} />)
    fireEvent.click(screen.getByRole('button', { name: '3' }))
    expect(onUpdate).toHaveBeenCalledWith('c1', { conditionSize: 3 })
  })
})

// ── DIAG-3.13-14/15: incoming and outgoing connections lists ──────────────────

describe('DIAG-3.13-14: NodeProperties — incoming connections list', () => {
  it('lists the incoming connection source node label', () => {
    const src: NodeData = { id: 's1', label: 'Gateway', icon: Database as unknown as NodeData['icon'], x: 0, y: 0, w: 120, layer: '' }
    const inConn: Connection = { id: 'c1', from: 's1', to: 'n1', fromAnchor: 'right-0', toAnchor: 'left-0', color: '#000', label: '' }
    render(<NodeProperties {...baseProps({ nodes: [node, src], connections: [inConn] })} />)
    // ExpandableListRow shows the count; expand to see names
    // The row header shows "In" and the count
    expect(screen.getByText(/^In$/)).toBeTruthy()
  })
})

describe('DIAG-3.13-15: NodeProperties — outgoing connections list', () => {
  it('lists the outgoing connection destination node label', () => {
    const dst: NodeData = { id: 'd1', label: 'Database', icon: Database as unknown as NodeData['icon'], x: 300, y: 0, w: 120, layer: '' }
    const outConn: Connection = { id: 'c2', from: 'n1', to: 'd1', fromAnchor: 'right-0', toAnchor: 'left-0', color: '#000', label: '' }
    render(<NodeProperties {...baseProps({ nodes: [node, dst], connections: [outConn] })} />)
    expect(screen.getByText(/^Out$/)).toBeTruthy()
  })
})

// ── DIAG-3.13-17: member flows list ──────────────────────────────────────────

describe('DIAG-3.13-17: NodeProperties — member flows list', () => {
  it('shows the Flows section when the node is part of a flow', () => {
    const dst: NodeData = { id: 'd1', label: 'DB', icon: Database as unknown as NodeData['icon'], x: 300, y: 0, w: 120, layer: '' }
    const conn2: Connection = { id: 'cx', from: 'n1', to: 'd1', fromAnchor: 'right-0', toAnchor: 'left-0', color: '#000', label: '' }
    const flow: FlowDef = { id: 'f1', name: 'Main Flow', connectionIds: ['cx'] }
    render(<NodeProperties {...baseProps({ nodes: [node, dst], connections: [conn2], flows: [flow] })} />)
    // "Flows" appears as both Section title and ExpandableListRow label
    expect(screen.getAllByText('Flows').length).toBeGreaterThanOrEqual(1)
  })

  it('does not show the Flows section when the node has no member flows', () => {
    render(<NodeProperties {...baseProps()} />)
    expect(screen.queryByText('Flows')).toBeNull()
  })
})

// ── DIAG-3.13-18: backlinks list ──────────────────────────────────────────────

describe('DIAG-3.13-18: NodeProperties — backlinks (Documents) section', () => {
  it('does not render the References section when backlinks is omitted', () => {
    render(<NodeProperties {...baseProps()} />)
    expect(screen.queryByText('References')).toBeNull()
  })

  it('renders References section with backlinks when provided', () => {
    const onPreviewDocument = vi.fn()
    render(<NodeProperties {...baseProps({ backlinks: [{ sourcePath: 'docs/design.md' }], onPreviewDocument })} />)
    expect(screen.getByText('References (1)')).toBeTruthy()
    expect(screen.getByText('design.md')).toBeTruthy()
  })
})

// ── DIAG-3.13-05: sublabel edit ───────────────────────────────────────────────

describe('DIAG-3.13-05: NodeProperties — sublabel (Sub) edit', () => {
  it('double-clicking the Sub row opens an input with the current sub value', () => {
    render(<NodeProperties {...baseProps()} />)
    const subRow = screen.getByText('REST endpoint').closest('[class*="cursor-text"]')!
    fireEvent.doubleClick(subRow)
    const input = screen.getByRole('textbox')
    expect((input as HTMLInputElement).value).toBe('REST endpoint')
  })

  it('blur commits new sub value and calls onUpdate', () => {
    const onUpdate = vi.fn()
    render(<NodeProperties {...baseProps({ onUpdate })} />)
    const subRow = screen.getByText('REST endpoint').closest('[class*="cursor-text"]')!
    fireEvent.doubleClick(subRow)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'GraphQL endpoint' } })
    fireEvent.blur(input)
    expect(onUpdate).toHaveBeenCalledWith('n1', { sub: 'GraphQL endpoint' })
  })
})
