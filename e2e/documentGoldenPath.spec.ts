import { test, expect, type Page } from '@playwright/test'
import { installMockFS } from './fixtures/fsMock'

// Characterization tests for MarkdownEditor + markdownReveal + useDocumentContent
// captured before Phase 1 decomposition.
//
// Covers: DOC-4.1-01 (open), DOC-4.11-03 + DOC-4.11-05 (typing + save),
//         DOC-4.5-03 (mode toggle), DOC-4.11-02 (cross-file autosave),
//         DOC-4.3-01 (wiki-link display).

async function setupFs(page: Page, seed: Record<string, string>) {
  await page.addInitScript(installMockFS)
  await page.addInitScript(() => {
    try { indexedDB.deleteDatabase('knowledge-base') } catch { /* ignore */ }
    try { localStorage.clear() } catch { /* ignore */ }
  })
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

async function readMockFile(page: Page, path: string): Promise<string | undefined> {
  return page.evaluate((p) => {
    const m = (window as unknown as {
      __kbMockFS: { read: (p: string) => string | undefined }
    }).__kbMockFS
    return m.read(p)
  }, path)
}

test.describe('Document golden path', () => {
  test('DOC-4.1-01: clicking a .md opens the ProseMirror editor with the content', async ({ page }) => {
    await setupFs(page, {
      'note.md': '# Hello\n\nFirst paragraph.',
    })
    await openFolder(page)
    await page.getByText('note.md').first().click()

    await expect(page.locator('.ProseMirror').first()).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Hello').first()).toBeVisible()
    await expect(page.getByText('First paragraph.').first()).toBeVisible()
  })

  test('DOC-4.11-03 / DOC-4.11-05: typing into the editor and saving persists to disk', async ({ page }) => {
    await setupFs(page, { 'note.md': '# Start' })
    await openFolder(page)
    await page.getByText('note.md').first().click()
    await expect(page.locator('.ProseMirror').first()).toBeVisible({ timeout: 5000 })

    // Focus the editor and type.
    await page.locator('.ProseMirror').first().click()
    await page.keyboard.press('End')
    await page.keyboard.type('\n\nAppended line.')

    // Wait for the editor's 200 ms onChange debounce to fire and mark dirty,
    // then save. The Header Save button is only wired for diagrams; documents
    // save via the Cmd/Ctrl+S keyboard handler in knowledgeBase.tsx.
    await page.waitForTimeout(300)
    await page.keyboard.press('ControlOrMeta+s')

    // Wait for the async docBridge.save() to complete.
    await expect.poll(async () => await readMockFile(page, 'note.md'), { timeout: 3000 })
      .toContain('Appended line.')

    const saved = await readMockFile(page, 'note.md')
    expect(saved).toContain('# Start')
    expect(saved).toContain('Appended line.')
  })

  test('DOC-4.5-03: toggling Raw / WYSIWYG preserves content', async ({ page }) => {
    await setupFs(page, { 'note.md': '# Round Trip\n\n**bold** and *italic*.' })
    await openFolder(page)
    await page.getByText('note.md').first().click()
    await expect(page.locator('.ProseMirror').first()).toBeVisible({ timeout: 5000 })

    // Click Raw tab — the button text is literally "Raw" with no aria-label.
    await page.getByRole('button', { name: /^raw$/i }).click()
    // The textarea appears with the raw markdown.
    const textarea = page.locator('textarea').first()
    await expect(textarea).toBeVisible()
    await expect(textarea).toHaveValue(/# Round Trip/)
    await expect(textarea).toHaveValue(/\*\*bold\*\*/)

    // Click WYSIWYG to go back.
    await page.getByRole('button', { name: /wysiwyg/i }).click()
    await expect(page.locator('.ProseMirror').first()).toBeVisible()
    await expect(page.getByText('Round Trip').first()).toBeVisible()
    // Bold mark renders as <strong>.
    await expect(page.locator('strong').getByText('bold')).toBeVisible()
  })

  test('DOC-4.11-02: switching documents flushes the previous one on the way out', async ({ page }) => {
    await setupFs(page, {
      'a.md': '# A',
      'b.md': '# B',
    })
    await openFolder(page)
    await page.getByText('a.md').first().click()
    await expect(page.locator('.ProseMirror').first()).toBeVisible({ timeout: 5000 })

    await page.locator('.ProseMirror').first().click()
    await page.keyboard.press('End')
    await page.keyboard.type('\n\nEdited A.')

    // Switch files without clicking Save — useDocumentContent auto-saves on filePath change.
    await page.getByText('b.md').first().click()
    await expect(page.getByText('B').first()).toBeVisible({ timeout: 5000 })

    // a.md on disk should still include the edit — useDocumentContent flushes on switch.
    const savedA = await readMockFile(page, 'a.md')
    expect(savedA).toContain('Edited A.')
  })

  test('DOC-4.3-01: an existing [[target]] renders as a blue wiki-link pill', async ({ page }) => {
    await setupFs(page, {
      'index.md': 'See [[target]] for more.',
      'target.md': '# Target',
    })
    await openFolder(page)
    await page.getByText('index.md').first().click()
    await expect(page.locator('.ProseMirror').first()).toBeVisible({ timeout: 5000 })

    // WikiLink is rendered by a NodeView (not renderHTML), so the live DOM is a
    // plain <span class="wiki-link bg-blue-100 …"> with no data-wiki-link attr.
    // Select via the wiki-link class + text match.
    const pill = page.locator('.ProseMirror .wiki-link').filter({ hasText: 'target' }).first()
    await expect(pill).toBeVisible()
    await expect(pill).toHaveClass(/bg-blue-100/)
    // It's not rendered as plain brackets text.
    await expect(page.getByText('[[target]]', { exact: true })).toHaveCount(0)
  })
})
