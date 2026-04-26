import { test, expect, type Page } from '@playwright/test'
import { installMockFS } from './fixtures/fsMock'

// Covers DOC-4.17-01..04 — Wiki-link hover preview card.
//   Hovering a `[[wiki-link]]` for ≥200ms shows a floating preview card with
//   the target's first heading, an excerpt, and the backlink count. The card
//   dismisses on mouseleave from both the link and the card. Broken links
//   (target file does not exist) never open the card.

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

const SOURCE_DOC = '# Source Doc\n\nSee [[target]] for related info.\n\nAlso [[missing-target]] is broken.'
const TARGET_DOC = '# Target Heading\n\nThis is the body of the target document used by the hover preview test. It contains enough text to populate the excerpt area of the floating card.'

test.describe('Wiki-link hover preview', () => {
  test('DOC-4.17-01: hovering a wiki-link for >=200ms shows the hover card', async ({ page }) => {
    await setupFs(page, {
      'source.md': SOURCE_DOC,
      'target.md': TARGET_DOC,
    })
    await openFolder(page)
    // Open source first so the link index sees source -> target.
    await openFile(page, 'source.md')
    // Give the async index update a moment to settle.
    await page.waitForTimeout(800)

    // Hover the resolved (blue) wiki-link.
    const link = page.locator('[data-wiki-link="target"]').first()
    await expect(link).toBeVisible()
    await link.hover()

    // Card appears after the 200ms dwell.
    const card = page.getByTestId('wiki-link-hover-card')
    await expect(card).toBeVisible({ timeout: 1500 })
  })

  test('DOC-4.17-02: card displays the target\'s first heading or filename', async ({ page }) => {
    await setupFs(page, {
      'source.md': SOURCE_DOC,
      'target.md': TARGET_DOC,
    })
    await openFolder(page)
    await openFile(page, 'source.md')
    await page.waitForTimeout(800)

    await page.locator('[data-wiki-link="target"]').first().hover()

    const card = page.getByTestId('wiki-link-hover-card')
    await expect(card).toBeVisible({ timeout: 1500 })
    // Heading from the target's H1.
    await expect(card).toContainText('Target Heading')
    // Excerpt text from the body.
    await expect(card).toContainText(/body of the target document/i)
    // Footer line shows backlink count.
    await expect(card).toContainText(/backlink/i)
  })

  test('DOC-4.17-03: card disappears when mouse leaves both link and card', async ({ page }) => {
    await setupFs(page, {
      'source.md': SOURCE_DOC,
      'target.md': TARGET_DOC,
    })
    await openFolder(page)
    await openFile(page, 'source.md')
    await page.waitForTimeout(800)

    const link = page.locator('[data-wiki-link="target"]').first()
    await link.hover()
    const card = page.getByTestId('wiki-link-hover-card')
    await expect(card).toBeVisible({ timeout: 1500 })

    // Move the cursor far away from both link and card.
    await page.mouse.move(0, 0)

    // The card dismisses (60ms overshoot tolerance + transition).
    await expect(card).toHaveCount(0, { timeout: 1500 })
  })

  test('DOC-4.17-04: broken link (missing target) does not show the hover card', async ({ page }) => {
    await setupFs(page, {
      // Note: no missing-target.md, so [[missing-target]] is broken.
      'source.md': SOURCE_DOC,
    })
    await openFolder(page)
    await openFile(page, 'source.md')
    await page.waitForTimeout(800)

    const broken = page.locator('[data-wiki-link="missing-target"]').first()
    await expect(broken).toBeVisible()
    await broken.hover()

    // Wait past the 200ms delay — the card must NOT appear.
    await page.waitForTimeout(600)
    await expect(page.getByTestId('wiki-link-hover-card')).toHaveCount(0)
  })
})
