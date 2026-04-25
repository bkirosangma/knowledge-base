import { test, expect, type Page } from '@playwright/test'
import { installMockFS } from './fixtures/fsMock'
import {
  seedEmpty,
  seedWithNode,
  seedWithConnectionInFlow,
  seedWithTwoConnections,
} from './helpers/diagramSeeds'

// Covers DIAG-3.14-01/02/04/05/08/09/10, DIAG-3.2-10, DIAG-3.5-01/10/11/12, DIAG-3.7-01

async function setupFs(page: Page, seed: Record<string, string>) {
  await page.addInitScript(installMockFS)
  await page.addInitScript(() => {
    try { indexedDB.deleteDatabase('knowledge-base') } catch { /* ignore */ }
    try { localStorage.clear() } catch { /* ignore */ }
  })
  await page.addInitScript((files) => {
    for (const filename of Object.keys(files)) {
      localStorage.setItem(`diagram-read-only:${filename}`, 'false')
      localStorage.setItem(`document-read-only:${filename}`, 'false')
    }
  }, seed)
  await page.goto('/')
  await page.locator('[data-testid="knowledge-base"]').waitFor()
  await page.evaluate((files) => {
    const m = (window as unknown as { __kbMockFS: { seed: (f: Record<string, string>) => void } }).__kbMockFS
    m.seed(files)
  }, seed)
}

async function openDiagram(page: Page) {
  await page.getByRole('button', { name: 'Open Folder' }).click()
  await page.getByText('diagram.json').first().click()
  await expect(page.locator('[data-testid="diagram-canvas"]')).toBeVisible({ timeout: 5000 })
}

test.describe('Diagram keyboard shortcuts', () => {
  test('DIAG-3.14-01: Escape deselects selected node', async ({ page }) => {
    await setupFs(page, seedWithNode())
    await openDiagram(page)
    await page.locator('[data-testid="node-n1"]').click()
    await expect(page.locator('[data-testid="node-n1"]')).toHaveClass(/ring-2/)
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-testid="node-n1"]')).not.toHaveClass(/ring-2/)
  })

  test('DIAG-3.14-02: Escape closes context menu', async ({ page }) => {
    await setupFs(page, seedWithNode())
    await openDiagram(page)
    await page.locator('[data-testid="diagram-canvas"]').click({ button: 'right', position: { x: 200, y: 200 } })
    await expect(page.getByRole('button', { name: /add element/i })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: /add element/i })).not.toBeVisible()
  })

  test('DIAG-3.14-04: Delete connection in a flow shows warning modal', async ({ page }) => {
    await setupFs(page, seedWithConnectionInFlow())
    await openDiagram(page)
    await page.locator('#c1').click({ force: true })
    await page.keyboard.press('Delete')
    await expect(page.getByText(/this will break/i)).toBeVisible()
  })

  test('DIAG-3.14-05: Ctrl+G creates a flow from selected connections', async ({ page }) => {
    await setupFs(page, seedWithTwoConnections())
    await openDiagram(page)
    await page.locator('#c1').click({ force: true })
    await page.locator('#c2').click({ force: true, modifiers: ['Control'] })
    await page.keyboard.press('Control+g')
    await expect(page.getByRole('button', { name: 'Flow 1' })).toBeVisible()
  })

  test('DIAG-3.14-08: Ctrl+Shift+R toggles read-only mode on/off', async ({ page }) => {
    await setupFs(page, seedWithNode())
    await openDiagram(page)
    await page.keyboard.press('Control+Shift+r')
    await expect(page.getByRole('button', { name: 'Exit Read Mode' })).toBeVisible()
    await page.keyboard.press('Control+Shift+r')
    await expect(page.getByRole('button', { name: 'Enter Read Mode' })).toBeVisible()
  })

  test('DIAG-3.14-09: Delete key does not delete selection when a properties input is focused', async ({ page }) => {
    await setupFs(page, seedWithNode())
    await openDiagram(page)
    await page.locator('[data-testid="node-n1"]').click()
    // Click the diagram title h1 to activate the title input
    await page.locator('h1').click()
    await page.keyboard.press('Delete')
    await expect(page.locator('[data-testid="node-n1"]')).toBeVisible()
  })

  test('DIAG-3.14-10: Delete key does not delete node while editing its label inline', async ({ page }) => {
    await setupFs(page, seedWithNode())
    await openDiagram(page)
    await page.locator('[data-testid="node-n1"]').dblclick()
    await expect(page.locator('input[maxlength="80"]')).toBeVisible()
    await page.keyboard.press('Delete')
    await expect(page.locator('[data-testid="node-n1"]')).toBeVisible()
  })
})

test.describe('Diagram canvas interactions', () => {
  test('DIAG-3.2-10: Clicking empty canvas area deselects current selection', async ({ page }) => {
    await setupFs(page, seedWithNode())
    await openDiagram(page)
    await page.locator('[data-testid="node-n1"]').click()
    await expect(page.locator('[data-testid="node-n1"]')).toHaveClass(/ring-2/)
    await page.locator('[data-testid="diagram-canvas"]').click({ position: { x: 600, y: 400 } })
    await expect(page.locator('[data-testid="node-n1"]')).not.toHaveClass(/ring-2/)
  })

  test('DIAG-3.5-01: Right-click empty canvas → Add Element creates a new node', async ({ page }) => {
    await setupFs(page, seedEmpty())
    await openDiagram(page)
    const before = await page.locator('[data-testid^="node-"]').count()
    await page.locator('[data-testid="diagram-canvas"]').click({ button: 'right', position: { x: 300, y: 300 } })
    await page.getByRole('button', { name: /add element/i }).click()
    await expect(page.locator('[data-testid^="node-"]')).toHaveCount(before + 1)
  })

  test('DIAG-3.7-01: Right-click canvas → Add Layer creates a new layer', async ({ page }) => {
    await setupFs(page, seedEmpty())
    await openDiagram(page)
    const before = await page.locator('[data-testid^="layer-"]').count()
    await page.locator('[data-testid="diagram-canvas"]').click({ button: 'right', position: { x: 300, y: 300 } })
    await page.getByRole('button', { name: /add layer/i }).click()
    await expect(page.locator('[data-testid^="layer-"]')).toHaveCount(before + 1)
  })

  test('DIAG-3.5-10: Double-click node enters inline label edit mode', async ({ page }) => {
    await setupFs(page, seedWithNode())
    await openDiagram(page)
    await page.locator('[data-testid="node-n1"]').dblclick()
    await expect(page.locator('input[maxlength="80"]')).toBeVisible()
  })

  test('DIAG-3.5-11: Pressing Enter commits the new label', async ({ page }) => {
    await setupFs(page, seedWithNode())
    await openDiagram(page)
    await page.locator('[data-testid="node-n1"]').dblclick()
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.type('New Label')
    await page.keyboard.press('Enter')
    await expect(page.locator('[data-testid="node-n1"]')).toContainText('New Label')
  })

  test('DIAG-3.5-12: Pressing Escape reverts to original label', async ({ page }) => {
    await setupFs(page, seedWithNode({ label: 'Original' }))
    await openDiagram(page)
    await page.locator('[data-testid="node-n1"]').dblclick()
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.type('Changed')
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-testid="node-n1"]')).toContainText('Original')
  })
})
