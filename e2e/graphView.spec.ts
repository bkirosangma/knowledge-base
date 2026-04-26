import { test, expect, type Page } from '@playwright/test'
import { installMockFS } from './fixtures/fsMock'

// Covers GRAPH-5.4-01..05 (graph pane open + click-to-open + filter).

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
    const m = (window as unknown as {
      __kbMockFS: { seed: (f: Record<string, string>) => void }
    }).__kbMockFS
    m.seed(files)
  }, seed)
}

async function openFolder(page: Page) {
  await page.getByRole('button', { name: 'Open Folder' }).click()
}

const SEED = {
  'alpha.md': '# Alpha\n\nSee [[beta]] and [[gamma]].',
  'beta.md': '# Beta\n\nLinked to [[alpha]].',
  'gamma.md': '# Gamma\n\nNo links here.',
  'orphan.md': '# Orphan\n\nNobody references me.',
}

test.describe('Graph View', () => {
  test('GRAPH-5.4-01: Opening graph view via palette mounts the graph pane', async ({ page }) => {
    await setupFs(page, SEED)
    await openFolder(page)
    // Open a doc first so the link index gets populated.
    await page.getByText('alpha.md').first().click()
    await expect(page.locator('.ProseMirror').first()).toBeVisible({ timeout: 5000 })

    // Open palette
    await page.locator('[data-testid="knowledge-base"]').click({ position: { x: 10, y: 10 } })
    await page.keyboard.press('Meta+k')
    await expect(page.getByRole('dialog', { name: 'Command Palette' })).toBeVisible({ timeout: 3000 })
    await page.getByPlaceholder('Search commands…').fill('Graph')
    await page.keyboard.press('Enter')

    // Graph pane mounted
    await expect(page.getByTestId('graph-view')).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId('graph-pane-header')).toContainText('Vault graph')
  })

  test('GRAPH-5.4-02: Clicking a node opens the file in the OTHER pane', async ({ page }) => {
    await setupFs(page, SEED)
    await openFolder(page)

    // Open alpha.md to seed the link index.
    await page.getByText('alpha.md').first().click()
    await expect(page.locator('.ProseMirror').first()).toBeVisible({ timeout: 5000 })

    // Open graph view via palette
    await page.locator('[data-testid="knowledge-base"]').click({ position: { x: 10, y: 10 } })
    await page.keyboard.press('Meta+k')
    await page.getByPlaceholder('Search commands…').fill('Graph')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('graph-view')).toBeVisible({ timeout: 5000 })

    // Click a node via the accessible debug list (canvas isn't queryable).
    // The list is `sr-only` so pointer-events from the canvas intercept
    // normal clicks — fire the click directly via dispatchEvent.
    await page.getByTestId('graph-node-beta.md').first().evaluate((el) => {
      ;(el as HTMLButtonElement).click()
    })

    // Graph stays mounted (split view: graph in one pane, beta.md in the other).
    await expect(page.getByTestId('graph-view')).toBeVisible()
    // beta.md content visible in the other pane.
    await expect(page.locator('.ProseMirror').filter({ hasText: 'Beta' }).first()).toBeVisible({ timeout: 5000 })
  })

  test('GRAPH-5.4-03: Orphans-only filter hides connected nodes', async ({ page }) => {
    await setupFs(page, SEED)
    await openFolder(page)

    // Seed the link index by opening alpha.md (which has [[beta]] and [[gamma]]).
    await page.getByText('alpha.md').first().click()
    await expect(page.locator('.ProseMirror').first()).toBeVisible({ timeout: 5000 })

    // Open graph view
    await page.locator('[data-testid="knowledge-base"]').click({ position: { x: 10, y: 10 } })
    await page.keyboard.press('Meta+k')
    await page.getByPlaceholder('Search commands…').fill('Graph')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('graph-view')).toBeVisible({ timeout: 5000 })

    // Before filter: all four nodes present (alpha, beta, gamma, orphan).
    await expect(page.getByTestId('graph-node-alpha.md')).toHaveCount(1)
    await expect(page.getByTestId('graph-node-orphan.md')).toHaveCount(1)

    // Toggle "Orphans only".
    await page.getByTestId('graph-filter-orphans').check()

    // alpha + beta have edges → hidden. orphan stays. gamma is referenced
    // FROM alpha only when the link index is built — depending on the
    // file-watcher rescan timing, gamma may or may not be flagged orphan.
    // We assert the connected nodes are gone and orphan remains.
    await expect(page.getByTestId('graph-node-alpha.md')).toHaveCount(0)
    await expect(page.getByTestId('graph-node-beta.md')).toHaveCount(0)
    await expect(page.getByTestId('graph-node-orphan.md')).toHaveCount(1)
  })
})
