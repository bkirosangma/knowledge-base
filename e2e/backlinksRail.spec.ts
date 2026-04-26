import { test, expect, type Page } from '@playwright/test'
import { installMockFS } from './fixtures/fsMock'

// Covers DOC-4.18-01..03 — Inline Backlinks rail.
//   The rail renders inside the document body (below the editor) and lists
//   each source document that links to the current file, with a 2-line
//   context snippet around the wiki-link occurrence. The rail hides itself
//   when there are zero backlinks. Clicking an entry opens the source file.

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

async function openFile(page: Page, filename: string) {
  await page.getByText(filename, { exact: true }).first().click()
  await expect(page.locator('.ProseMirror').first()).toBeVisible({ timeout: 5000 })
}

const SOURCE_DOC = '# Source Doc\n\nThis source references [[target]] for context.'
const TARGET_DOC = '# Target Heading\n\nA short target document.'

test.describe('Inline Backlinks rail', () => {
  test('DOC-4.18-01: document with backlinks shows BacklinksRail at bottom', async ({ page }) => {
    await setupFs(page, {
      'source.md': SOURCE_DOC,
      'target.md': TARGET_DOC,
    })
    await openFolder(page)

    // Open source first so updateDocumentLinks seeds target's backlink entry.
    await openFile(page, 'source.md')
    await page.waitForTimeout(1500)

    await openFile(page, 'target.md')

    const rail = page.getByTestId('backlinks-rail')
    await expect(rail).toBeVisible({ timeout: 8000 })
    await expect(rail).toContainText(/Backlinks · 1 reference/i)
    // Source filename listed.
    await expect(rail).toContainText('source.md')
    // 2-line context snippet contains words from around the [[target]] link.
    await expect(rail).toContainText(/source references/i)
  })

  test('DOC-4.18-02: BacklinksRail is hidden when 0 backlinks', async ({ page }) => {
    await setupFs(page, {
      'lonely.md': '# Lonely\n\nNo one references me.',
    })
    await openFolder(page)
    await openFile(page, 'lonely.md')
    await page.waitForTimeout(800)

    await expect(page.getByTestId('backlinks-rail')).toHaveCount(0)
  })

  test('DOC-4.18-03: clicking a backlink entry opens the source file', async ({ page }) => {
    await setupFs(page, {
      'source.md': SOURCE_DOC,
      'target.md': TARGET_DOC,
    })
    await openFolder(page)

    await openFile(page, 'source.md')
    await page.waitForTimeout(1500)
    await openFile(page, 'target.md')

    const rail = page.getByTestId('backlinks-rail')
    await expect(rail).toBeVisible({ timeout: 8000 })

    const entry = rail.getByTestId('backlinks-rail-entry').first()
    await expect(entry).toBeVisible()
    await entry.click()

    // The source document is now in the editor — its body text is rendered.
    await expect(page.locator('.ProseMirror').first()).toContainText(/This source references/i, { timeout: 5000 })
  })
})
