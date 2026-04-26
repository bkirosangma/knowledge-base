import { test, expect, type Page } from '@playwright/test'
import { installMockFS } from './fixtures/fsMock'

// Covers the LINK-5.1 / 5.2 / 5.4 / 5.5 / FS-2.1 integration cases that were
// marked 🚫 because they need a real File System Access dialog. We inject an
// in-browser mock via addInitScript so Chromium never has to surface the
// native picker — the "Open Folder" button then resolves immediately with a
// seeded in-memory vault.

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

async function openFolder(page: Page) {
  await page.getByRole('button', { name: 'Open Folder' }).click()
}

// Read a file back from the mock disk after the app has (maybe) written it.
async function readMockFile(page: Page, path: string): Promise<string | undefined> {
  return page.evaluate((p) => {
    const m = (window as unknown as { __kbMockFS: { read: (p: string) => string | undefined } }).__kbMockFS
    return m.read(p)
  }, path)
}

test.describe('Golden path — folder open + explorer tree', () => {
  test('FS-2.1-01 / 2.1-03 / 2.1-11: opening a seeded folder populates the explorer with file entries', async ({ page }) => {
    await setupFs(page, {
      'alpha.md': '# Alpha',
      'beta.md': '# Beta',
      'flow.json': JSON.stringify({ title: 'Flow', layers: [], nodes: [], connections: [] }),
    })
    await openFolder(page)

    await expect(page.getByText('alpha.md').first()).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('beta.md').first()).toBeVisible()
    await expect(page.getByText('flow.json').first()).toBeVisible()
  })

  test('DOC-4.1-01: clicking a .md opens the MarkdownPane with its content', async ({ page }) => {
    await setupFs(page, {
      'hello.md': '# Hello, world\n\nThis is a test note.',
    })
    await openFolder(page)
    await page.getByText('hello.md').first().click()

    // The editor renders the heading + body text within the ProseMirror surface.
    await expect(page.locator('.ProseMirror').first()).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Hello, world').first()).toBeVisible()
    await expect(page.getByText('This is a test note.').first()).toBeVisible()
  })

  test('opening a .json routes to the diagram view and the diagram title shows up in the PaneHeader', async ({ page }) => {
    await setupFs(page, {
      'arch.json': JSON.stringify({
        title: 'Architecture Overview',
        layers: [], nodes: [], connections: [],
      }),
    })
    await openFolder(page)
    await page.getByText('arch.json').first().click()

    // The diagram title lives inline in the `PaneHeader` breadcrumb row
    // (folded from the old `PaneTitle` strip in SHELL-1.12, 2026-04-26).
    // Click-to-edit `<h1>` next to the breadcrumb segments; pre-click the
    // heading is static text, not an input.
    await expect(
      page.getByRole('heading', { level: 1, name: 'Architecture Overview' }),
    ).toBeVisible({ timeout: 5000 })
  })
})

test.describe('Golden path — pane swaps + Header reflects active file', () => {
  test('clicking a second file swaps the pane content', async ({ page }) => {
    await setupFs(page, {
      'first.md': '# First file heading',
      'second.md': '# Second file heading',
    })
    await openFolder(page)

    await page.getByText('first.md').first().click()
    await expect(page.getByText('First file heading').first()).toBeVisible({ timeout: 5000 })

    await page.getByText('second.md').first().click()
    await expect(page.getByText('Second file heading').first()).toBeVisible({ timeout: 5000 })
    // First file's heading should no longer be the visible editor content.
    await expect(page.getByText('First file heading')).toHaveCount(0)
  })

  test('Save button is disabled for a clean doc immediately after open', async ({ page }) => {
    await setupFs(page, { 'clean.md': 'untouched' })
    await openFolder(page)
    await page.getByText('clean.md').first().click()
    await expect(page.locator('.ProseMirror').first()).toBeVisible({ timeout: 5000 })

    // SHELL-1.2-11: Save button disabled when clean.
    const saveBtn = page.getByRole('button', { name: /^save$/i })
    await expect(saveBtn).toBeDisabled()
  })

  test('empty "No file open" state disappears once a file is opened', async ({ page }) => {
    await setupFs(page, { 'note.md': '# Hello' })
    await openFolder(page)
    // Before clicking, the emptyState is visible.
    await expect(page.getByText('No file open')).toBeVisible()

    await page.getByText('note.md').first().click()
    // Once a doc is open, the empty-state copy is gone.
    await expect(page.getByText('No file open')).toHaveCount(0)
  })
})
