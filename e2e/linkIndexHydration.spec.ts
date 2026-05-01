import { test, expect, type Page } from '@playwright/test'
import { installMockFS } from './fixtures/fsMock'

// LINK-5.4-05 — Vault open auto-rebuilds the link index.
//
// loadIndex() only restores the persisted snapshot, so any file absent from
// the snapshot (e.g. created externally and never opened in-app) contributes
// no outbound links — and therefore no backlink entries against its targets.
// The fix in knowledgeBase.tsx fires linkManager.fullRebuild once per vault
// open after the tree hydrates. This spec contrasts with DOC-4.18-01, which
// works around the bug by opening the source document first; here we assert
// the auto-rebuild path: target's backlinks include source even though
// source.md is never opened.

async function setupFs(page: Page, seed: Record<string, string>) {
  await page.addInitScript(installMockFS)
  await page.addInitScript(() => {
    try { indexedDB.deleteDatabase('knowledge-base') } catch { /* ignore */ }
    try { localStorage.clear() } catch { /* ignore */ }
  })
  await page.addInitScript((files) => {
    for (const filename of Object.keys(files)) {
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

test.describe('LINK-5.4-05: vault open auto-rebuilds the link index', () => {
  test('backlinks for never-opened source appear on target without manual refresh', async ({ page }) => {
    await setupFs(page, {
      'source.md': '# Source\n\nThis source references [[target]] for context.',
      'target.md': '# Target\n\nA short target document.',
    })
    await openFolder(page)

    // Deliberately do NOT open source.md (contrast with DOC-4.18-01).
    // The auto-rebuild on vault open is the only thing that can hydrate
    // target's backlinks before target is opened.
    await page.waitForTimeout(2000)

    await openFile(page, 'target.md')

    const rail = page.getByTestId('backlinks-rail')
    await expect(rail).toBeVisible({ timeout: 8000 })
    await expect(rail).toContainText(/Backlinks · 1 reference/i)
    await expect(rail).toContainText('source.md')
  })
})
