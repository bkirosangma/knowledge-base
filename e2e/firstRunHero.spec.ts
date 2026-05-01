import { test, expect, type Page } from '@playwright/test'
import { installMockFS } from './fixtures/fsMock'

// KB-012 — first-run hero + sample-vault flow.
//
// Stop conditions:
// 1. Cleared localStorage → hero is the first thing the user sees.
// 2. Sample-vault flow ends with the user looking at populated content.
// 3. Hero never shows once any vault has been opened.

async function setupBlankApp(page: Page) {
  await page.addInitScript(installMockFS)
  await page.addInitScript(() => {
    try { indexedDB.deleteDatabase('knowledge-base') } catch { /* ignore */ }
    try { localStorage.clear() } catch { /* ignore */ }
  })
  await page.goto('/')
  await page.locator('[data-testid="knowledge-base"]').waitFor()
}

test.describe('First-run hero (KB-012)', () => {
  test('STOP-1: cleared localStorage shows the hero immediately', async ({ page }) => {
    await setupBlankApp(page)
    await expect(page.getByTestId('first-run-hero')).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId('first-run-open-folder')).toBeVisible()
    await expect(page.getByTestId('first-run-sample-vault')).toBeVisible()
    // Welcome copy is present.
    await expect(page.getByText(/Your knowledge base, in a folder you control/)).toBeVisible()
  })

  test('disclosure toggles "What\'s a vault?"', async ({ page }) => {
    await setupBlankApp(page)
    await expect(page.getByTestId('first-run-about-list')).toHaveCount(0)
    await page.getByTestId('first-run-about-toggle').click()
    await expect(page.getByTestId('first-run-about-list')).toBeVisible()
  })

  test('STOP-2: sample-vault flow ends with populated content', async ({ page }) => {
    await setupBlankApp(page)

    // Click "Try with sample vault". Seeding writes into the mock FS root
    // chosen by the picker; the file explorer then scans + populates.
    await page.getByTestId('first-run-sample-vault').click()

    // After seeding the sample vault, the explorer should show the
    // README and the architecture doc — those are the canonical
    // landing files in the sample. Use the explorer-container scope
    // so we don't accidentally match instructional copy in the hero.
    const explorer = page.locator('[data-testid="explorer-container"]')
    await expect(explorer.getByText('README.md')).toBeVisible({ timeout: 15000 })
    await expect(explorer.getByText('architecture.md')).toBeVisible()
    await expect(explorer.getByText('system-overview.json')).toBeVisible()

    // Hero is no longer rendered.
    await expect(page.getByTestId('first-run-hero')).toHaveCount(0)
  })

  test('STOP-3: hero is gone once any vault has been opened', async ({ page }) => {
    // Seed an existing vault so opening it yields populated content.
    await page.addInitScript(installMockFS)
    await page.addInitScript(() => {
      try { indexedDB.deleteDatabase('knowledge-base') } catch { /* ignore */ }
      try { localStorage.clear() } catch { /* ignore */ }
    })
    await page.addInitScript((files) => {
      const m = (window as unknown as {
        __kbMockFS?: { seed: (f: Record<string, string>) => void }
      }).__kbMockFS
      if (m) m.seed(files)
    }, { 'note.md': '# Hello' })
    await page.goto('/')
    await page.locator('[data-testid="knowledge-base"]').waitFor()

    // First load — hero is visible.
    await expect(page.getByTestId('first-run-hero')).toBeVisible()

    // Open the folder via the hero's primary CTA.
    await page.getByTestId('first-run-open-folder').click()

    // Seed via the mock so the picker resolves with our test files.
    await page.evaluate((files) => {
      const m = (window as unknown as {
        __kbMockFS: { seed: (f: Record<string, string>) => void }
      }).__kbMockFS
      m.seed(files)
    }, { 'note.md': '# Hello' })

    const explorer = page.locator('[data-testid="explorer-container"]')
    await expect(explorer.getByText('note.md')).toBeVisible({ timeout: 8000 })
    // Hero is gone.
    await expect(page.getByTestId('first-run-hero')).toHaveCount(0)
  })
})
