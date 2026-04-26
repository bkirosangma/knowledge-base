import { test, expect, type Page } from '@playwright/test'
import { installMockFS } from './fixtures/fsMock'
import { seedWithNode } from './helpers/diagramSeeds'

// Covers DIAG-3.19-01, DIAG-3.19-02, DIAG-3.19-03, DIAG-3.19-04

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

test.describe('Canvas Quick Inspector', () => {
  test('DIAG-3.19-01: Quick Inspector appears when a single node is selected', async ({ page }) => {
    await setupFs(page, seedWithNode())
    await openDiagram(page)

    // Inspector must not be visible before selection
    await expect(page.locator('[data-testid="quick-inspector"]')).not.toBeVisible()

    // Click the node to select it
    await page.locator('[data-testid="node-n1"]').click()

    // Inspector must now be visible
    await expect(page.locator('[data-testid="quick-inspector"]')).toBeVisible()

    // Deselect — inspector should disappear
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-testid="quick-inspector"]')).not.toBeVisible()
  })

  test('DIAG-3.19-02: Quick Inspector is hidden in read mode', async ({ page }) => {
    await setupFs(page, seedWithNode())
    await openDiagram(page)

    // Select the node — inspector appears
    await page.locator('[data-testid="node-n1"]').click()
    await expect(page.locator('[data-testid="quick-inspector"]')).toBeVisible()

    // Toggle read mode on
    await page.keyboard.press('Control+Shift+r')
    await expect(page.getByRole('button', { name: 'Exit Read Mode' })).toBeVisible()

    // Inspector must be hidden in read mode
    await expect(page.locator('[data-testid="quick-inspector"]')).not.toBeVisible()
  })

  test('DIAG-3.19-03: Clicking delete in Quick Inspector removes the node', async ({ page }) => {
    await setupFs(page, seedWithNode())
    await openDiagram(page)

    // Select node — inspector appears
    await page.locator('[data-testid="node-n1"]').click()
    await expect(page.locator('[data-testid="quick-inspector"]')).toBeVisible()

    // Count nodes before deletion
    await expect(page.locator('[data-testid="node-n1"]')).toBeVisible()

    // Click the delete button (title="Delete") inside the inspector
    await page.locator('[data-testid="quick-inspector"] button[title="Delete"]').click()

    // Node must be gone
    await expect(page.locator('[data-testid="node-n1"]')).not.toBeVisible()

    // Inspector must also be gone since nothing is selected
    await expect(page.locator('[data-testid="quick-inspector"]')).not.toBeVisible()
  })

  test('DIAG-3.19-04: Clicking a colour swatch changes the node colour', async ({ page }) => {
    await setupFs(page, seedWithNode())
    await openDiagram(page)

    // Select node
    await page.locator('[data-testid="node-n1"]').click()
    await expect(page.locator('[data-testid="quick-inspector"]')).toBeVisible()

    // Open the colour popover
    await page.locator('[data-testid="quick-inspector"] button[title="Change colour"]').click()

    // Wait for the swatch popover to appear — scope to the popover testid to avoid
    // conflicting with the Properties Panel's colour scheme swatches
    const popover = page.locator('[data-testid="quick-inspector-color-popover"]')
    await expect(popover).toBeVisible()

    const oceanSwatch = popover.locator('button[title="Ocean"]')
    await expect(oceanSwatch).toBeVisible()

    // Click the Ocean swatch — bg should update to Ocean fill #eff6ff
    await oceanSwatch.click()

    // Swatch popover should close
    await expect(popover).not.toBeVisible()

    // Verify the node background colour updated (Element renders bgColor as inline style)
    const nodeEl = page.locator('[data-testid="node-n1"]')
    await expect(nodeEl).toHaveCSS('background-color', 'rgb(239, 246, 255)') // #eff6ff
  })
})
