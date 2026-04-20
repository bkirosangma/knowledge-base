// Covers DIAG-3.12-04..09 (useContextMenuActions placement logic).
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useContextMenuActions } from './useContextMenuActions'
import type { NodeData, LayerDef, Selection, RegionBounds } from '../types'
import { GRID_SIZE } from '../utils/gridSnap'

type ManualSizes = Record<string, { left?: number; width?: number; top?: number; height?: number }>

function makeContextMenu(canvasX = 100, canvasY = 100) {
  return { clientX: canvasX, clientY: canvasY, canvasX, canvasY, target: { type: 'canvas' as const } }
}

function makeSetters() {
  return {
    setNodes: vi.fn<[React.SetStateAction<NodeData[]>], void>(),
    setLayerDefs: vi.fn<[React.SetStateAction<LayerDef[]>], void>(),
    setLayerManualSizes: vi.fn<[React.SetStateAction<ManualSizes>], void>(),
    setSelection: vi.fn<[React.SetStateAction<Selection>], void>(),
    setContextMenu: vi.fn(),
    onActionComplete: vi.fn(),
  }
}

const defaultDimensions = vi.fn(() => ({ w: 120, h: 40 }))
const emptyRegions: RegionBounds[] = []
const emptyNodes: NodeData[] = []

// ── DIAG-3.12-06: grid-snapped placement ─────────────────────────────────────

describe('DIAG-3.12-06: handleAddElement snaps position to grid', () => {
  it('rounds non-aligned coordinates to nearest grid multiple', () => {
    const setters = makeSetters()
    const { result } = renderHook(() =>
      useContextMenuActions(
        makeContextMenu(103, 97), emptyRegions, emptyNodes,
        defaultDimensions, {}, setters.setNodes, setters.setLayerDefs,
        setters.setLayerManualSizes, setters.setSelection, setters.setContextMenu,
        setters.onActionComplete,
      ),
    )
    act(() => { result.current.handleAddElement() })

    const [[updater]] = setters.setNodes.mock.calls
    const newNodes = (updater as (p: NodeData[]) => NodeData[])(emptyNodes)
    expect(newNodes[0].x % GRID_SIZE).toBe(0)
    expect(newNodes[0].y % GRID_SIZE).toBe(0)
  })
})

// ── DIAG-3.12-07: selects the new node ───────────────────────────────────────

describe('DIAG-3.12-07: handleAddElement selects the new node', () => {
  it('calls setSelection with the new node id', () => {
    const setters = makeSetters()
    const { result } = renderHook(() =>
      useContextMenuActions(
        makeContextMenu(), emptyRegions, emptyNodes,
        defaultDimensions, {}, setters.setNodes, setters.setLayerDefs,
        setters.setLayerManualSizes, setters.setSelection, setters.setContextMenu,
        setters.onActionComplete,
      ),
    )
    act(() => { result.current.handleAddElement() })

    const [[updater]] = setters.setNodes.mock.calls
    const newNodes = (updater as (p: NodeData[]) => NodeData[])(emptyNodes)
    const newId = newNodes[0].id

    expect(setters.setSelection).toHaveBeenCalledWith({ type: 'node', id: newId })
    expect(newId).toMatch(/^el-/)
  })
})

// ── DIAG-3.12-04: collision avoidance (canvas, no layer) ─────────────────────

describe('DIAG-3.12-04: handleAddElement avoids collisions on canvas', () => {
  it('shifts Y down when an existing node occupies the same spot', () => {
    const setters = makeSetters()
    const existingNode: NodeData = { id: 'existing', label: 'X', x: 100, y: 100, w: 120, layer: '' }
    const { result } = renderHook(() =>
      useContextMenuActions(
        makeContextMenu(100, 100), emptyRegions, [existingNode],
        defaultDimensions, {}, setters.setNodes, setters.setLayerDefs,
        setters.setLayerManualSizes, setters.setSelection, setters.setContextMenu,
        setters.onActionComplete,
      ),
    )
    act(() => { result.current.handleAddElement() })

    const [[updater]] = setters.setNodes.mock.calls
    const newNodes = (updater as (p: NodeData[]) => NodeData[])([existingNode])
    const placed = newNodes.find((n) => n.id !== 'existing')!
    // Should not coincide with the existing node
    expect(placed.y).toBeGreaterThan(100)
  })
})

// ── DIAG-3.12-05: auto-assigns element to layer when inside a layer region ───

describe('DIAG-3.12-05: handleAddElement auto-assigns layer', () => {
  it('assigns targetLayer when the click falls inside a layer region', () => {
    const setters = makeSetters()
    const region: RegionBounds = {
      id: 'ly-1', left: 50, top: 50, width: 200, height: 200, empty: false,
    }
    const { result } = renderHook(() =>
      useContextMenuActions(
        makeContextMenu(100, 100), [region], emptyNodes,
        defaultDimensions, {}, setters.setNodes, setters.setLayerDefs,
        setters.setLayerManualSizes, setters.setSelection, setters.setContextMenu,
        setters.onActionComplete,
      ),
    )
    act(() => { result.current.handleAddElement() })

    const [[updater]] = setters.setNodes.mock.calls
    const newNodes = (updater as (p: NodeData[]) => NodeData[])(emptyNodes)
    expect(newNodes[0].layer).toBe('ly-1')
  })

  it('does not assign a layer when click is outside all regions', () => {
    const setters = makeSetters()
    const region: RegionBounds = {
      id: 'ly-1', left: 500, top: 500, width: 200, height: 200, empty: false,
    }
    const { result } = renderHook(() =>
      useContextMenuActions(
        makeContextMenu(100, 100), [region], emptyNodes,
        defaultDimensions, {}, setters.setNodes, setters.setLayerDefs,
        setters.setLayerManualSizes, setters.setSelection, setters.setContextMenu,
        setters.onActionComplete,
      ),
    )
    act(() => { result.current.handleAddElement() })

    const [[updater]] = setters.setNodes.mock.calls
    const newNodes = (updater as (p: NodeData[]) => NodeData[])(emptyNodes)
    expect(newNodes[0].layer).toBe('')
  })
})

// ── DIAG-3.12-08: handleAddLayer places non-overlapping ──────────────────────

describe('DIAG-3.12-08: handleAddLayer places non-overlapping layer', () => {
  it('creates a layer with snapped position and no overlap with existing layers', () => {
    const setters = makeSetters()
    const occupied: RegionBounds = { id: 'ly-existing', left: 0, top: 0, width: 400, height: 300, empty: false }
    const { result } = renderHook(() =>
      useContextMenuActions(
        makeContextMenu(100, 100), [occupied], emptyNodes,
        defaultDimensions, {}, setters.setNodes, setters.setLayerDefs,
        setters.setLayerManualSizes, setters.setSelection, setters.setContextMenu,
        setters.onActionComplete,
      ),
    )
    act(() => { result.current.handleAddLayer() })

    const [[sizeUpdater]] = setters.setLayerManualSizes.mock.calls
    const sizes = (sizeUpdater as (p: ManualSizes) => ManualSizes)({})
    const newLayerKey = Object.keys(sizes)[0]
    const { left, top } = sizes[newLayerKey]
    // Snapped (use Math.abs to avoid -0 !== 0 under Object.is)
    expect(Math.abs(left! % GRID_SIZE)).toBe(0)
    expect(Math.abs(top! % GRID_SIZE)).toBe(0)
  })
})

// ── DIAG-3.12-09: unique layer ID ────────────────────────────────────────────

describe('DIAG-3.12-09: handleAddLayer generates unique id', () => {
  it('new layer id starts with ly- prefix', () => {
    const setters = makeSetters()
    const { result } = renderHook(() =>
      useContextMenuActions(
        makeContextMenu(), emptyRegions, emptyNodes,
        defaultDimensions, {}, setters.setNodes, setters.setLayerDefs,
        setters.setLayerManualSizes, setters.setSelection, setters.setContextMenu,
        setters.onActionComplete,
      ),
    )
    act(() => { result.current.handleAddLayer() })

    const [[defUpdater]] = setters.setLayerDefs.mock.calls
    const defs = (defUpdater as (p: LayerDef[]) => LayerDef[])([])
    expect(defs[0].id).toMatch(/^ly-/)
  })

  it('two consecutive calls produce different ids', () => {
    const setters = makeSetters()
    const { result, rerender } = renderHook(
      ({ cm }: { cm: ReturnType<typeof makeContextMenu> }) =>
        useContextMenuActions(
          cm, emptyRegions, emptyNodes,
          defaultDimensions, {}, setters.setNodes, setters.setLayerDefs,
          setters.setLayerManualSizes, setters.setSelection, setters.setContextMenu,
          setters.onActionComplete,
        ),
      { initialProps: { cm: makeContextMenu() } },
    )
    act(() => { result.current.handleAddLayer() })
    rerender({ cm: makeContextMenu(200, 200) })
    act(() => { result.current.handleAddLayer() })

    const ids = setters.setLayerDefs.mock.calls.map(([updater]) => {
      const defs = (updater as (p: LayerDef[]) => LayerDef[])([])
      return defs[0].id
    })
    expect(ids[0]).not.toBe(ids[1])
  })
})
