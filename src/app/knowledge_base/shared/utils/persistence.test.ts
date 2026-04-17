import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Database, Server } from 'lucide-react'
import {
  serializeNodes,
  saveDiagram,
  loadDiagram,
  loadDiagramFromData,
  clearDiagram,
  createEmptyDiagram,
  loadDefaults,
  saveDraft,
  loadDraft,
  clearDraft,
  hasDraft,
  listDrafts,
  savePaneLayout,
  loadPaneLayout,
  migrateViewport,
  clearViewport,
  cleanupOrphanedData,
} from './persistence'
import {
  setDirectoryScope,
  clearDirectoryScope,
} from './directoryScope'
import type { NodeData, LayerDef, Connection, FlowDef, DiagramData } from './types'

// Covers DIAG-3.19-01 through 3.19-14 and PERSIST-7.1-04 through 7.1-12.
// Vitest jsdom env provides localStorage.

const STORAGE_KEY = 'knowledge-base-data'
const DRAFT_PREFIX = 'knowledge-base-draft:'
const VIEWPORT_PREFIX = 'knowledge-base-viewport'
const PANE_LAYOUT_KEY = 'knowledge-base-pane-layout'

beforeEach(() => {
  localStorage.clear()
  clearDirectoryScope()
})

afterEach(() => {
  localStorage.clear()
  clearDirectoryScope()
})

/** Build a minimal NodeData with a real icon component. */
function node(overrides: Partial<NodeData> = {}): NodeData {
  return {
    id: 'n1', label: 'Node', icon: Database as unknown as NodeData['icon'],
    x: 0, y: 0, w: 150, layer: '',
    ...overrides,
  }
}

describe('serializeNodes (DIAG-3.19-01)', () => {
  it('converts icon component to its name string', () => {
    const result = serializeNodes([node({ icon: Server as unknown as NodeData['icon'] })])
    expect(result[0].icon).toBe('Server')
  })

  it('omits default shape ("rect") and keeps custom shapes', () => {
    const rectResult = serializeNodes([node({ shape: 'rect' })])
    expect(rectResult[0]).not.toHaveProperty('shape')

    const condResult = serializeNodes([node({ shape: 'condition' })])
    expect(condResult[0].shape).toBe('condition')
  })

  it('omits default conditionSize (1) and keeps non-default values', () => {
    const s1 = serializeNodes([node({ shape: 'condition', conditionSize: 1 })])
    expect(s1[0]).not.toHaveProperty('conditionSize')

    const s3 = serializeNodes([node({ shape: 'condition', conditionSize: 3 })])
    expect(s3[0].conditionSize).toBe(3)
  })

  it('omits falsy rotation (undefined or 0) but keeps truthy values', () => {
    expect(serializeNodes([node({ rotation: 0 })])[0]).not.toHaveProperty('rotation')
    expect(serializeNodes([node()])[0]).not.toHaveProperty('rotation')
    expect(serializeNodes([node({ rotation: 45 })])[0].rotation).toBe(45)
  })

  it('preserves color fields only when set', () => {
    const withColors = serializeNodes([node({
      borderColor: '#ff0000', bgColor: '#00ff00', textColor: '#0000ff',
    })])[0]
    expect(withColors.borderColor).toBe('#ff0000')
    expect(withColors.bgColor).toBe('#00ff00')
    expect(withColors.textColor).toBe('#0000ff')

    const plain = serializeNodes([node()])[0]
    expect(plain).not.toHaveProperty('borderColor')
    expect(plain).not.toHaveProperty('bgColor')
    expect(plain).not.toHaveProperty('textColor')
  })

  it('preserves required positional fields', () => {
    const r = serializeNodes([node({ x: 100, y: 200, w: 210, layer: 'L1' })])[0]
    expect(r).toMatchObject({ x: 100, y: 200, w: 210, layer: 'L1' })
  })
})

describe('loadDiagramFromData deserialisation', () => {
  it('DIAG-3.19-02: icon name resolves to component on load', () => {
    const raw: DiagramData = {
      title: 'T', layers: [], connections: [], flows: [],
      nodes: [{
        id: 'n1', label: 'l', icon: 'Server', x: 0, y: 0, w: 150, layer: '',
      }],
    }
    const result = loadDiagramFromData(raw)
    expect(result.nodes[0].icon).toBe(Server)
  })

  it('DIAG-3.19-03: unknown icon name falls back to Database (no crash)', () => {
    const raw: DiagramData = {
      title: 'T', layers: [], connections: [], flows: [],
      nodes: [{
        id: 'n1', label: 'l', icon: 'DoesNotExist',
        x: 0, y: 0, w: 150, layer: '',
      }],
    }
    const result = loadDiagramFromData(raw)
    expect(result.nodes[0].icon).toBe(Database)
  })

  it('DIAG-3.19-04: legacy Tailwind colour class → extracted hex on load', () => {
    const raw: DiagramData = {
      title: 'T',
      layers: [{
        id: 'L1', title: 'L1',
        bg: 'bg-[#aabbcc]', border: 'border-[#112233]',
      }],
      nodes: [], connections: [], flows: [],
    }
    const result = loadDiagramFromData(raw)
    expect(result.layers[0].bg).toBe('#aabbcc')
    expect(result.layers[0].border).toBe('#112233')
  })

  it('defaults lineCurve to "orthogonal" when missing', () => {
    const raw: DiagramData = {
      title: 'T', layers: [], nodes: [], connections: [], flows: [],
    }
    expect(loadDiagramFromData(raw).lineCurve).toBe('orthogonal')
  })

  it('defaults title to "Untitled" and flows/layerManualSizes to empty', () => {
    const raw = { layers: [], nodes: [], connections: [] } as unknown as DiagramData
    const result = loadDiagramFromData(raw)
    expect(result.title).toBe('Untitled')
    expect(result.flows).toEqual([])
    expect(result.layerManualSizes).toEqual({})
  })
})

describe('saveDiagram / loadDiagram round-trip', () => {
  const layers: LayerDef[] = [
    { id: 'L1', title: 'Presentation', bg: '#eff3f9', border: '#d0d5dd' },
  ]
  const nodes: NodeData[] = [
    node({ id: 'n1', label: 'DB', icon: Database as unknown as NodeData['icon'], layer: 'L1', x: 100, y: 50 }),
  ]
  const connections: Connection[] = [{
    id: 'c1', from: 'n1', to: 'n1',
    fromAnchor: 'right-1', toAnchor: 'left-1',
    color: '#000', label: '',
    waypoints: [{ x: 50, y: 50 }],
  }]
  const flows: FlowDef[] = [{ id: 'f1', name: 'flow', connectionIds: ['c1'] }]
  const manualSizes = { L1: { left: 10, top: 20, width: 400, height: 200 } }

  it('DIAG-3.19-05/06/07: persists and restores layers, connections, flows, manual sizes', () => {
    saveDiagram('my-diagram', layers, nodes, connections, manualSizes, 'bezier', flows)

    const loaded = loadDiagram()
    expect(loaded.title).toBe('my-diagram')
    expect(loaded.layers).toEqual(layers)
    expect(loaded.connections).toEqual(connections)
    expect(loaded.flows).toEqual(flows)
    expect(loaded.layerManualSizes).toEqual(manualSizes)
    expect(loaded.lineCurve).toBe('bezier')
  })

  it('DIAG-3.19-06: connection waypoints survive round-trip', () => {
    saveDiagram('t', layers, nodes, connections, {}, 'orthogonal', flows)
    const loaded = loadDiagram()
    expect(loaded.connections[0].waypoints).toEqual([{ x: 50, y: 50 }])
  })

  it('loadDiagram returns defaults when nothing is stored', () => {
    expect(loadDiagram()).toEqual(loadDefaults())
  })

  it('loadDiagram returns defaults when stored JSON is corrupted', () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json')
    expect(loadDiagram()).toEqual(loadDefaults())
  })

  it('clearDiagram removes the stored entry', () => {
    saveDiagram('t', [], [], [], {}, 'orthogonal', [])
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()
    clearDiagram()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('PERSIST-7.1-01/03: saveDiagram writes to scoped key when a scope is set', () => {
    setDirectoryScope('vault-a')
    saveDiagram('t', [], [], [], {}, 'orthogonal', [])
    // Scoped key format: "knowledge-base-data[vault-a]"
    expect(localStorage.getItem(`${STORAGE_KEY}[vault-a]`)).not.toBeNull()
    // Unscoped key is untouched.
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('PERSIST-7.1-03: scope switch isolates diagrams (no cross-read)', () => {
    setDirectoryScope('A')
    saveDiagram('diagram-A', [], [], [], {}, 'orthogonal', [])

    setDirectoryScope('B')
    // In scope B there is no saved diagram yet → defaults.
    expect(loadDiagram().title).toBe('Untitled')

    // Switch back and verify A's data is intact.
    setDirectoryScope('A')
    expect(loadDiagram().title).toBe('diagram-A')
  })
})

describe('draft helpers (DIAG-3.19-10 through 3.19-14)', () => {
  it('DIAG-3.19-10: saveDraft writes a per-file entry to localStorage', () => {
    saveDraft('file1.json', 'T', [], [], [], {}, 'orthogonal', [])
    expect(localStorage.getItem(`${DRAFT_PREFIX}file1.json`)).not.toBeNull()
  })

  it('DIAG-3.19-11: loadDraft reads back the saved entry', () => {
    saveDraft('file1.json', 'draft-title', [], [], [], {}, 'orthogonal', [])
    const draft = loadDraft('file1.json')
    expect(draft).not.toBeNull()
    expect(draft!.title).toBe('draft-title')
  })

  it('DIAG-3.19-11: loadDraft returns null when missing', () => {
    expect(loadDraft('no-such-file.json')).toBeNull()
  })

  it('loadDraft returns null on corrupted JSON', () => {
    localStorage.setItem(`${DRAFT_PREFIX}broken.json`, '{oops')
    expect(loadDraft('broken.json')).toBeNull()
  })

  it('hasDraft reports presence/absence', () => {
    expect(hasDraft('x.json')).toBe(false)
    saveDraft('x.json', 'T', [], [], [], {}, 'orthogonal', [])
    expect(hasDraft('x.json')).toBe(true)
  })

  it('DIAG-3.19-14: clearDraft removes only the specified file\'s draft', () => {
    saveDraft('a.json', 'T', [], [], [], {}, 'orthogonal', [])
    saveDraft('b.json', 'T', [], [], [], {}, 'orthogonal', [])
    clearDraft('a.json')
    expect(hasDraft('a.json')).toBe(false)
    expect(hasDraft('b.json')).toBe(true)
  })

  it('DIAG-3.19-13: listDrafts returns exactly the file names for the current scope', () => {
    saveDraft('a.json', 'T', [], [], [], {}, 'orthogonal', [])
    saveDraft('b.json', 'T', [], [], [], {}, 'orthogonal', [])
    const names = listDrafts()
    expect(names.has('a.json')).toBe(true)
    expect(names.has('b.json')).toBe(true)
    expect(names.size).toBe(2)
  })

  it('PERSIST-7.1-11: drafts from a different scope are invisible after scope switch', () => {
    setDirectoryScope('A')
    saveDraft('a-only.json', 'T', [], [], [], {}, 'orthogonal', [])

    setDirectoryScope('B')
    expect(listDrafts().size).toBe(0)
    expect(hasDraft('a-only.json')).toBe(false)

    setDirectoryScope('A')
    expect(listDrafts().has('a-only.json')).toBe(true)
  })
})

describe('pane layout (PERSIST-7.1-08)', () => {
  it('savePaneLayout / loadPaneLayout round-trip', () => {
    const left = { filePath: 'a.md', fileType: 'document' as const }
    const right = { filePath: 'b.json', fileType: 'diagram' as const }
    savePaneLayout(left, right, 'right')
    const loaded = loadPaneLayout()
    expect(loaded).toEqual({
      leftPane: left, rightPane: right,
      focusedSide: 'right', lastClosedPane: null,
    })
  })

  it('loadPaneLayout returns null when nothing is saved', () => {
    expect(loadPaneLayout()).toBeNull()
  })

  it('loadPaneLayout returns null when JSON is corrupted', () => {
    localStorage.setItem(PANE_LAYOUT_KEY, '{not-json')
    expect(loadPaneLayout()).toBeNull()
  })

  it('preserves lastClosedPane when provided', () => {
    const last = { filePath: 'c.md', fileType: 'document' as const }
    savePaneLayout(null, null, 'left', last)
    expect(loadPaneLayout()?.lastClosedPane).toEqual(last)
  })
})

describe('viewport helpers', () => {
  it('migrateViewport moves the entry from old filename to new', () => {
    localStorage.setItem(`${VIEWPORT_PREFIX}:old.json`, '{"zoom":1.5}')
    migrateViewport('old.json', 'new.json')
    expect(localStorage.getItem(`${VIEWPORT_PREFIX}:old.json`)).toBeNull()
    expect(localStorage.getItem(`${VIEWPORT_PREFIX}:new.json`)).toBe('{"zoom":1.5}')
  })

  it('migrateViewport is a no-op when old entry does not exist', () => {
    migrateViewport('missing.json', 'new.json')
    expect(localStorage.getItem(`${VIEWPORT_PREFIX}:new.json`)).toBeNull()
  })

  it('clearViewport removes a specific entry', () => {
    localStorage.setItem(`${VIEWPORT_PREFIX}:x.json`, '{}')
    clearViewport('x.json')
    expect(localStorage.getItem(`${VIEWPORT_PREFIX}:x.json`)).toBeNull()
  })
})

describe('cleanupOrphanedData (PERSIST-7.4-07 equivalent)', () => {
  it('removes drafts and viewports for files not in the existing set', () => {
    saveDraft('still.json', 'T', [], [], [], {}, 'orthogonal', [])
    saveDraft('deleted.json', 'T', [], [], [], {}, 'orthogonal', [])
    localStorage.setItem(`${VIEWPORT_PREFIX}:still.json`, '{}')
    localStorage.setItem(`${VIEWPORT_PREFIX}:deleted.json`, '{}')

    cleanupOrphanedData(new Set(['still.json']))

    expect(hasDraft('still.json')).toBe(true)
    expect(hasDraft('deleted.json')).toBe(false)
    expect(localStorage.getItem(`${VIEWPORT_PREFIX}:still.json`)).not.toBeNull()
    expect(localStorage.getItem(`${VIEWPORT_PREFIX}:deleted.json`)).toBeNull()
  })

  it('leaves non-draft, non-viewport keys untouched', () => {
    localStorage.setItem('unrelated-key', 'should-survive')
    cleanupOrphanedData(new Set())
    expect(localStorage.getItem('unrelated-key')).toBe('should-survive')
  })
})

describe('PERSIST-7.1-14: graceful fallback when localStorage.setItem throws', () => {
  it('saveDiagram does not throw when storage is full', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => saveDiagram('t', [], [], [], {}, 'orthogonal', [])).not.toThrow()
    spy.mockRestore()
  })

  it('saveDraft does not throw when storage is full', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => saveDraft('x.json', 't', [], [], [], {}, 'orthogonal', [])).not.toThrow()
    spy.mockRestore()
  })
})

describe('createEmptyDiagram / loadDefaults', () => {
  it('createEmptyDiagram returns an empty diagram with the given title', () => {
    const empty = createEmptyDiagram('Blank')
    expect(empty).toEqual({
      title: 'Blank',
      layers: [], nodes: [], connections: [],
      layerManualSizes: {}, lineCurve: 'orthogonal', flows: [],
    })
  })

  it('loadDefaults returns an identical default shape (title="Untitled")', () => {
    expect(loadDefaults().title).toBe('Untitled')
  })
})
