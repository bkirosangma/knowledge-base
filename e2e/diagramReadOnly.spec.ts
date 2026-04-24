import { test, expect, type Page } from '@playwright/test'
import { installMockFS } from './fixtures/fsMock'
import { seedWithNode } from './helpers/diagramSeeds'

// Covers DIAG-3.17-02/03/06/07/08/09, DIAG-3.16-12

async function setupFs(page: Page, seed: Record<string, string>) {
  await page.addInitScript(installMockFS)
  await page.addInitScript(() => {
    try { indexedDB.deleteDatabase('knowledge-base') } catch { /* ignore */ }
    try { localStorage.clear() } catch { /* ignore */ }
  })
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

async function enterReadOnly(page: Page) {
  await page.keyboard.press('Control+Shift+r')
  await expect(page.getByRole('button', { name: 'Exit Read Mode' })).toBeVisible()
}

test.describe('Diagram read-only mode', () => {
  test('DIAG-3.17-02: Ctrl+Shift+R toggles read-only mode via keyboard', async ({ page }) => {
    await setupFs(page, seedWithNode())
    await openDiagram(page)
    await page.keyboard.press('Control+Shift+r')
    await expect(page.getByRole('button', { name: 'Exit Read Mode' })).toBeVisible()
    await page.keyboard.press('Control+Shift+r')
    await expect(page.getByRole('button', { name: 'Enter Read Mode' })).toBeVisible()
  })

  test('DIAG-3.17-03: Node cannot be dragged in read-only mode', async ({ page }) => {
    await setupFs(page, seedWithNode())
    await openDiagram(page)
    await enterReadOnly(page)
    const box = await page.locator('[data-testid="node-n1"]').boundingBox()
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await page.mouse.down()
    await page.mouse.move(box!.x + 150, box!.y + 150, { steps: 10 })
    await page.mouse.up()
    const newBox = await page.locator('[data-testid="node-n1"]').boundingBox()
    expect(Math.abs(newBox!.x - box!.x)).toBeLessThan(10)
  })

  test('DIAG-3.17-06: Delete key does not delete node in read-only mode', async ({ page }) => {
    await setupFs(page, seedWithNode())
    await openDiagram(page)
    await page.locator('[data-testid="node-n1"]').click()
    await enterReadOnly(page)
    await page.keyboard.press('Delete')
    await expect(page.locator('[data-testid="node-n1"]')).toBeVisible()
  })

  test('DIAG-3.17-07: Right-click in read-only shows no context menu', async ({ page }) => {
    await setupFs(page, seedWithNode())
    await openDiagram(page)
    await enterReadOnly(page)
    await page.locator('[data-testid="diagram-canvas"]').click({ button: 'right', position: { x: 300, y: 300 } })
    // Context menu is fully suppressed in read-only — no add/delete buttons appear
    await expect(page.getByRole('button', { name: /add element/i })).not.toBeVisible()
    await expect(page.getByRole('button', { name: /delete/i })).not.toBeVisible()
  })

  test('DIAG-3.17-08: Properties panel has no editable rows in read-only mode', async ({ page }) => {
    await setupFs(page, seedWithNode())
    await openDiagram(page)
    await page.locator('[data-testid="node-n1"]').click()
    await enterReadOnly(page)
    // In read-only mode, EditableRow components are replaced by static Row —
    // no cursor-text interactive rows appear in the properties panel
    await expect(page.locator('[data-testid="properties-panel"] [class*="cursor-text"]')).toHaveCount(0)
  })

  test('DIAG-3.17-09: Clicking a node selects it even in read-only mode', async ({ page }) => {
    await setupFs(page, seedWithNode())
    await openDiagram(page)
    await enterReadOnly(page)
    await page.locator('[data-testid="node-n1"]').click()
    await expect(page.locator('[data-testid="node-n1"]')).toHaveClass(/ring-2/)
  })

  test('DIAG-3.16-12: Undo does not restore changes when in read-only mode', async ({ page }) => {
    await setupFs(page, seedWithNode({ label: 'Original' }))
    await openDiagram(page)
    // rename node via inline edit
    await page.locator('[data-testid="node-n1"]').dblclick()
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.type('Changed')
    await page.keyboard.press('Enter')
    await expect(page.locator('[data-testid="node-n1"]')).toContainText('Changed')
    // enter read-only, then attempt undo
    await enterReadOnly(page)
    await page.keyboard.press('Control+z')
    // undo is blocked — label stays 'Changed'
    await expect(page.locator('[data-testid="node-n1"]')).toContainText('Changed')
  })
})
