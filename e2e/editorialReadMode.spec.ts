import { test, expect, type Page } from '@playwright/test'
import { installMockFS } from './fixtures/fsMock'

// Covers DOC-4.16-01..05 — Editorial Read Mode chrome:
//   serif typography, reading-time pill, TOC rail with toggle (⌘⇧O),
//   and Focus Mode (⌘.).  IDs renumbered to 4.16 to avoid the 4.13
//   collision with Pane Header Title.

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

async function openDocument(page: Page, filename: string) {
  await page.getByText(filename).first().click()
  await expect(page.locator('.ProseMirror').first()).toBeVisible({ timeout: 5000 })
}

async function enterReadMode(page: Page) {
  await page.getByRole('button', { name: 'Enter Read Mode' }).click()
  await expect(page.getByRole('button', { name: 'Exit Read Mode' })).toBeVisible({ timeout: 3000 })
}

const SHORT_DOC = '# Short Doc\n\nA tiny note.'
const LONG_DOC = [
  '# Editorial Heading',
  '',
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(40),
  '',
  '## Section Two',
  '',
  'Pellentesque dapibus suscipit ligula. Donec posuere augue in quam. '.repeat(20),
  '',
  '## Section Three',
  '',
  'Etiam vel tortor sodales tellus ultricies commodo. '.repeat(20),
  '',
  '### Subsection 3a',
  '',
  'Sed lectus. Praesent elementum hendrerit tortor.',
].join('\n')

test.describe('Editorial Read Mode', () => {
  test('DOC-4.16-01: read mode applies serif editorial typography', async ({ page }) => {
    await setupFs(page, { 'note.md': SHORT_DOC })
    await openFolder(page)
    await openDocument(page, 'note.md')
    await enterReadMode(page)

    // The EditorContent wrapper now carries the `editorial` class
    const editor = page.locator('.markdown-editor.editorial .ProseMirror').first()
    await expect(editor).toBeVisible()

    const fontFamily = await editor.evaluate((el) => getComputedStyle(el).fontFamily)
    // Computed value normalises whitespace + may wrap names in quotes — assert
    // any of the editorial stack members is present.
    expect(fontFamily).toMatch(/Source Serif|Charter|Georgia|serif/i)
  })

  test('DOC-4.16-02: reading-time pill appears in read mode and hides in edit mode', async ({ page }) => {
    await setupFs(page, { 'long.md': LONG_DOC })
    await openFolder(page)
    await openDocument(page, 'long.md')

    // Edit mode — pill is hidden
    await expect(page.getByTestId('reading-time-pill')).toHaveCount(0)

    await enterReadMode(page)

    // Read mode — pill renders with "<N> min read"
    const pill = page.getByTestId('reading-time-pill')
    await expect(pill).toBeVisible()
    await expect(pill).toContainText(/min read/)
  })

  test('DOC-4.16-03: TOC rail appears for documents with three or more headings', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await setupFs(page, { 'long.md': LONG_DOC })
    await openFolder(page)
    await openDocument(page, 'long.md')
    await enterReadMode(page)

    const toc = page.getByTestId('reading-toc')
    await expect(toc).toBeVisible()
    // The seed has H1 "Editorial Heading" + H2 "Section Two" + H2 "Section Three"
    // + H3 "Subsection 3a" — at least the first three should be listed.
    await expect(toc).toContainText('Editorial Heading')
    await expect(toc).toContainText('Section Two')
    await expect(toc).toContainText('Section Three')
  })

  test('DOC-4.16-04: ⌘⇧O toggles TOC visibility', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await setupFs(page, { 'long.md': LONG_DOC })
    await openFolder(page)
    await openDocument(page, 'long.md')
    await enterReadMode(page)

    const toc = page.getByTestId('reading-toc')
    await expect(toc).toBeVisible()

    // Click neutral chrome so the keyboard shortcut isn't captured by Tiptap.
    await page.locator('[data-testid="knowledge-base"]').click({ position: { x: 10, y: 10 } })
    await page.keyboard.press('Meta+Shift+O')
    await expect(toc).toHaveCount(0)

    await page.keyboard.press('Meta+Shift+O')
    await expect(toc).toBeVisible({ timeout: 3000 })
  })

  test('DOC-4.16-05: ⌘. toggles Focus Mode (explorer hides, then reappears)', async ({ page }) => {
    await setupFs(page, { 'note.md': SHORT_DOC })
    await openFolder(page)
    await openDocument(page, 'note.md')

    const explorerContainer = page.getByTestId('explorer-container')
    // Edit mode — explorer is visible (260px wide)
    const startWidth = await explorerContainer.evaluate((el) => (el as HTMLElement).getBoundingClientRect().width)
    expect(startWidth).toBeGreaterThan(100)

    // ⌘. — focus mode on, explorer collapses to width 0
    await page.locator('[data-testid="knowledge-base"]').click({ position: { x: 10, y: 10 } })
    await page.keyboard.press('Meta+.')
    await expect.poll(async () => {
      return await explorerContainer.evaluate((el) => (el as HTMLElement).getBoundingClientRect().width)
    }, { timeout: 3000 }).toBeLessThan(5)

    // ⌘. again — restore.  Explorer width returns to its prior value.
    await page.keyboard.press('Meta+.')
    await expect.poll(async () => {
      return await explorerContainer.evaluate((el) => (el as HTMLElement).getBoundingClientRect().width)
    }, { timeout: 3000 }).toBeGreaterThan(100)
  })
})
