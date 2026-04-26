import { test, expect, type Page } from '@playwright/test'
import { installMockFS } from './fixtures/fsMock'

// Covers DOC-4.19-01..02 (UnlinkedMentions surface + convert).

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
  'Service.md': '# Service\n\nThe main service.',
  'doc-b.md': '# Doc B\n\nThis describes the Service architecture in depth.',
}

test.describe('Unlinked mentions', () => {
  test('DOC-4.19-01: Doc with unlinked basename surfaces it in the section', async ({ page }) => {
    await setupFs(page, SEED)
    await openFolder(page)

    // Open doc-b.md which contains "Service" without a wiki-link.
    await page.getByText('doc-b.md').first().click()
    await expect(page.locator('.ProseMirror').first()).toBeVisible({ timeout: 5000 })

    // Unlinked Mentions section appears in the properties sidebar.
    await expect(page.getByTestId('unlinked-mentions')).toBeVisible({ timeout: 5000 })
    // Row for "Service" is listed.
    const row = page.locator('[data-testid="unlinked-mention-row"][data-token="Service"]')
    await expect(row).toHaveCount(1)
  })

  test('DOC-4.19-02: Convert all wraps the text in [[...]] and marks dirty', async ({ page }) => {
    await setupFs(page, SEED)
    await openFolder(page)

    await page.getByText('doc-b.md').first().click()
    await expect(page.locator('.ProseMirror').first()).toBeVisible({ timeout: 5000 })

    const row = page.locator('[data-testid="unlinked-mention-row"][data-token="Service"]')
    await expect(row).toBeVisible({ timeout: 5000 })

    // Click the per-row convert button.
    await row.locator('[data-testid="unlinked-mention-convert"]').click()

    // The doc gets a wiki-link rendered as a pill (Service.md exists, so it's the resolved blue variant).
    await expect(page.locator('.wiki-link').filter({ hasText: 'Service' }).first()).toBeVisible({ timeout: 5000 })

    // Dirty dot appears on the pane header.
    await expect(page.getByTestId('pane-title-dirty-dot').first()).toBeVisible()

    // The section refreshes — the converted token is no longer flagged.
    await expect(
      page.locator('[data-testid="unlinked-mention-row"][data-token="Service"]'),
    ).toHaveCount(0)
  })
})
