import { test, expect, type Page } from '@playwright/test'
import { installMockFS } from './fixtures/fsMock'

// Characterization tests for DiagramView.tsx captured BEFORE Phase 1
// decomposition. Any regression in the golden path from Phase 1 will turn
// one of these tests red, and that's the whole point.
//
// Covers: DIAG-3.2-12 (open), DIAG-3.11-01 (selection), DIAG-3.5-06 (drag),
//         DIAG-3.14-03 (keyboard delete), DIAG-3.13-01 (properties toggle).
// SHELL-1.2-22 (autosave-on-switch) is NOT implemented — see note below.

async function setupFs(page: Page, seed: Record<string, string>) {
  await page.addInitScript(installMockFS)
  await page.addInitScript(() => {
    try { indexedDB.deleteDatabase('knowledge-base') } catch { /* ignore */ }
    try { localStorage.clear() } catch { /* ignore */ }
  })
  await page.goto('/')
  await page.locator('[data-testid="knowledge-base"]').waitFor()
  await page.evaluate((files) => {
    const m = (window as unknown as {
      __kbMockFS: { seed: (f: Record<string, string>) => void }
    }).__kbMockFS
    m.seed(files)
  }, seed)
}

async function openFolder(page: Page) {
  await page.getByRole('button', { name: 'Open Folder' }).click()
}

async function readMockFile(page: Page, path: string): Promise<string | undefined> {
  return page.evaluate((p) => {
    const m = (window as unknown as {
      __kbMockFS: { read: (p: string) => string | undefined }
    }).__kbMockFS
    return m.read(p)
  }, path)
}

/** A minimal two-node diagram used by the selection/drag tests. */
const TWO_NODE_DIAGRAM = {
  title: 'Test Flow',
  layers: [],
  nodes: [
    { id: 'n1', label: 'Alpha', icon: 'Box',   x: 120, y: 120, w: 180, layer: null, type: 'default' },
    { id: 'n2', label: 'Beta',  icon: 'Cloud', x: 420, y: 120, w: 180, layer: null, type: 'default' },
  ],
  connections: [],
  flows: [],
  documents: [],
  layerManualSizes: {},
  lineCurve: 'orthogonal',
}

test.describe('Diagram golden path', () => {
  test('DIAG-3.2-12: opening a .json renders the diagram canvas and both nodes', async ({ page }) => {
    await setupFs(page, {
      'flow.json': JSON.stringify(TWO_NODE_DIAGRAM),
    })
    await openFolder(page)
    await page.getByText('flow.json').first().click()

    await expect(page.locator('[data-testid="diagram-canvas"]')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('[data-testid="node-n1"]')).toBeVisible()
    await expect(page.locator('[data-testid="node-n2"]')).toBeVisible()
    await expect(page.locator('[data-node-label="Alpha"]')).toBeVisible()
  })

  test('DIAG-3.11-01: clicking a node selects it (shows blue ring)', async ({ page }) => {
    await setupFs(page, { 'flow.json': JSON.stringify(TWO_NODE_DIAGRAM) })
    await openFolder(page)
    await page.getByText('flow.json').first().click()
    await expect(page.locator('[data-testid="node-n1"]')).toBeVisible({ timeout: 5000 })

    await page.locator('[data-testid="node-n1"]').click()

    // Element.tsx applies `ring-2 ring-blue-400` to the selected node's root div.
    await expect(page.locator('[data-testid="node-n1"]')).toHaveClass(/ring-2/)
    // The other node is NOT selected.
    await expect(page.locator('[data-testid="node-n2"]')).not.toHaveClass(/ring-2/)
  })

  test('DIAG-3.5-06: dragging a node updates its position on save', async ({ page }) => {
    await setupFs(page, { 'flow.json': JSON.stringify(TWO_NODE_DIAGRAM) })
    await openFolder(page)
    await page.getByText('flow.json').first().click()
    await expect(page.locator('[data-testid="node-n1"]')).toBeVisible({ timeout: 5000 })

    const node = page.locator('[data-testid="node-n1"]')
    const box = await node.boundingBox()
    if (!box) throw new Error('node-n1 has no bounding box')

    // Dispatch mousedown directly on the element (React synthetic event via DOM dispatch),
    // then use page.mouse for the window-level mousemove/mouseup listeners.
    const startX = box.x + 20
    const startY = box.y + 20
    await node.dispatchEvent('mousedown', { bubbles: true, cancelable: true, clientX: startX, clientY: startY })
    await page.mouse.move(startX + 200, startY + 80, { steps: 10 })
    await page.mouse.up()

    // Save via the toolbar Save button (platform-agnostic vs Cmd+S).
    await page.getByRole('button', { name: /^save$/i }).click()

    // Read back the saved diagram. n1's position should differ from seeded values.
    const saved = await readMockFile(page, 'flow.json')
    if (!saved) throw new Error('flow.json missing after save')
    const diagram = JSON.parse(saved) as { nodes: Array<{ id: string; x: number; y: number }> }
    const n1 = diagram.nodes.find(n => n.id === 'n1')!
    expect(Math.abs(n1.x - 120)).toBeGreaterThan(20)
  })

  test('DIAG-3.14-03: selecting a node and pressing Delete removes it on save', async ({ page }) => {
    await setupFs(page, { 'flow.json': JSON.stringify(TWO_NODE_DIAGRAM) })
    await openFolder(page)
    await page.getByText('flow.json').first().click()
    await expect(page.locator('[data-testid="node-n2"]')).toBeVisible({ timeout: 5000 })

    await page.locator('[data-testid="node-n2"]').click()
    await page.keyboard.press('Delete')

    // n2 should be removed from the DOM.
    await expect(page.locator('[data-testid="node-n2"]')).toHaveCount(0)

    await page.getByRole('button', { name: /^save$/i }).click()
    const saved = await readMockFile(page, 'flow.json')
    const diagram = JSON.parse(saved!) as { nodes: Array<{ id: string }> }
    expect(diagram.nodes.map(n => n.id)).toEqual(['n1'])
  })

  test('DIAG-3.13-01: toggling the properties panel persists to localStorage', async ({ page }) => {
    await setupFs(page, { 'flow.json': JSON.stringify(TWO_NODE_DIAGRAM) })
    await openFolder(page)
    await page.getByText('flow.json').first().click()
    await expect(page.locator('[data-testid="diagram-canvas"]')).toBeVisible({ timeout: 5000 })

    // The properties panel collapse button has title="Collapse properties" when
    // expanded, or title="Expand properties" when collapsed. Both match /properties/i.
    const initial = await page.evaluate(() => localStorage.getItem('properties-collapsed'))

    const toggle = page.getByRole('button', { name: /properties/i }).first()
    await toggle.click()
    const afterOne = await page.evaluate(() => localStorage.getItem('properties-collapsed'))
    expect(afterOne).not.toBe(initial)

    await toggle.click()
    const afterTwo = await page.evaluate(() => localStorage.getItem('properties-collapsed'))
    expect(afterTwo).toBe(initial ?? 'false')
  })

  // SHELL-1.2-22: autosave-on-switch is NOT implemented.
  // handleLoadFile() in shared/hooks/useFileActions.ts loads the new file without
  // flushing the previous file's dirty state. This test is skipped to document
  // that the behaviour does not currently exist.
  test.skip('SHELL-1.2-22: switching files from an unsaved diagram flushes the previous one to disk', async ({ page }) => {
    await setupFs(page, {
      'one.json': JSON.stringify({ ...TWO_NODE_DIAGRAM, title: 'One' }),
      'two.json': JSON.stringify({ ...TWO_NODE_DIAGRAM, title: 'Two' }),
    })
    await openFolder(page)
    await page.getByText('one.json').first().click()
    await expect(page.locator('[data-testid="node-n1"]')).toBeVisible({ timeout: 5000 })

    // Drag n1 a bit (marks diagram dirty).
    const n1 = page.locator('[data-testid="node-n1"]')
    const box = await n1.boundingBox()
    if (!box) throw new Error('node-n1 has no bounding box')
    const sx = box.x + 20
    const sy = box.y + 20
    await n1.dispatchEvent('mousedown', { bubbles: true, cancelable: true, clientX: sx, clientY: sy })
    await page.mouse.move(sx + 250, sy + 50, { steps: 5 })
    await page.mouse.up()

    // Click the other file in the explorer. Autosave should write one.json.
    await page.getByText('two.json').first().click()
    await expect(page.locator('[data-testid="diagram-canvas"]')).toBeVisible()

    const saved = await readMockFile(page, 'one.json')
    const diagram = JSON.parse(saved!) as { nodes: Array<{ id: string; x: number }> }
    const persistedN1 = diagram.nodes.find(n => n.id === 'n1')!
    expect(Math.abs(persistedN1.x - 120)).toBeGreaterThan(20)
  })
})
