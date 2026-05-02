import { test, expect, type Page } from '@playwright/test'
import { installMockFS } from './fixtures/fsMock'

// Covers DOC-4.12-01 (readOnly hides toolbar),
//         DOC-4.12-04 (contenteditable=false in readOnly — existing),
//         DOC-4.3-01 variant (wiki-link pill colour for existing vs missing target).

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
  await page.getByText(filename).first().click()
  await expect(page.locator('.ProseMirror').first()).toBeVisible({ timeout: 5000 })
}

test.describe('Document read-only mode', () => {
  test('DOC-4.12-01: entering read-only mode hides the formatting toolbar', async ({ page }) => {
    await setupFs(page, { 'note.md': '# Hello\n\nSome content.' })
    await openFolder(page)
    await openFile(page, 'note.md')

    // Toolbar is visible in edit mode — verify Bold button exists
    await expect(page.getByLabel('Bold')).toBeVisible()

    // Click the lock button to enter read-only mode
    await page.getByRole('button', { name: 'Enter Read Mode' }).click()

    // Toolbar should be gone
    await expect(page.getByLabel('Bold')).not.toBeVisible()
  })

  test('DOC-4.12-04: read-only editor is not content-editable', async ({ page }) => {
    await setupFs(page, { 'note.md': '# Hello' })
    await openFolder(page)
    await openFile(page, 'note.md')

    // In edit mode, ProseMirror is contenteditable=true
    await expect(page.locator('.ProseMirror').first()).toHaveAttribute('contenteditable', 'true')

    // Enter read-only mode
    await page.getByRole('button', { name: 'Enter Read Mode' }).click()

    // Editor becomes non-editable
    await expect(page.locator('.ProseMirror').first()).toHaveAttribute('contenteditable', 'false')
  })

  test('DOC-4.12-01 (exit): exiting read-only mode restores toolbar', async ({ page }) => {
    await setupFs(page, { 'note.md': '# Hello' })
    await openFolder(page)
    await openFile(page, 'note.md')

    await page.getByRole('button', { name: 'Enter Read Mode' }).click()
    await expect(page.getByLabel('Bold')).not.toBeVisible()

    // Exit read-only
    await page.getByRole('button', { name: 'Exit Read Mode' }).click()
    await expect(page.getByLabel('Bold')).toBeVisible()
  })
})

test.describe('Document wiki-link pills', () => {
  test('DOC-4.3-02: [[nonexistent]] renders as a red/unresolved pill', async ({ page }) => {
    await setupFs(page, {
      'index.md': 'See [[missing-page]] for more.',
    })
    await openFolder(page)
    await openFile(page, 'index.md')

    // Unresolved wiki-links get a different visual style from resolved ones.
    // The NodeView applies `text-red-600` or a `wiki-link-unresolved` class.
    const pill = page.locator('.ProseMirror .wiki-link').filter({ hasText: 'missing-page' }).first()
    await expect(pill).toBeVisible()
    // Unresolved links should NOT have the blue background of resolved links
    await expect(pill).not.toHaveClass(/bg-blue-100/)
  })

  test('DOC-4.3-03: resolved [[target.md]] shows document icon', async ({ page }) => {
    await setupFs(page, {
      'index.md': 'See [[target]] for more.',
      'target.md': '# Target',
    })
    await openFolder(page)
    await openFile(page, 'index.md')

    const pill = page.locator('.ProseMirror .wiki-link').filter({ hasText: 'target' }).first()
    await expect(pill).toBeVisible()
    await expect(pill).toHaveClass(/bg-blue-100/)
    // Doc icon renders an svg inside the pill — the NodeView adds it for .md targets
    await expect(pill.locator('svg').first()).toBeVisible()
  })
})
