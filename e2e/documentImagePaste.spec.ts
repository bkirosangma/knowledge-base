import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { installMockFS } from './fixtures/fsMock'

// Covers DOC-4.20-01 through DOC-4.20-05.

const SAMPLE_PNG_BASE64 = readFileSync(resolve(__dirname, 'fixtures/sample.png'), 'base64')

async function setupFs(page: Page, seed: Record<string, string>) {
  await page.addInitScript(installMockFS)
  await page.addInitScript(() => {
    try { indexedDB.deleteDatabase('knowledge-base') } catch { /* ignore */ }
    try { localStorage.clear() } catch { /* ignore */ }
  })
  await page.goto('/')
  await page.locator('[data-testid="knowledge-base"]').waitFor()
  await page.evaluate((files) => {
    window.__kbMockFS!.seed(files)
  }, seed)
}

async function openFolder(page: Page) {
  await page.getByRole('button', { name: 'Open Folder' }).click()
}

async function openFile(page: Page, filename: string) {
  await page.getByText(filename).first().click()
  await expect(page.locator('.ProseMirror').first()).toBeVisible({ timeout: 5_000 })
  // Newly opened docs default to read-only mode (useReadOnlyState defaults
  // to true). Exit so the editor accepts paste / drop events.
  await page.getByRole('button', { name: 'Exit Read Mode' }).click()
  await expect(page.locator('.ProseMirror[contenteditable="true"]').first()).toBeVisible()
}

/** Dispatch a paste ClipboardEvent carrying a PNG file onto the editor.
 *  Uses Object.defineProperty to inject clipboardData because Chrome's
 *  ClipboardEvent constructor ignores the clipboardData init option for
 *  security reasons. */
async function pasteImage(page: Page, base64: string) {
  await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const file = new File([bytes], 'sample.png', { type: 'image/png' })
    const dt = new DataTransfer()
    dt.items.add(file)
    const editor = document.querySelector('.ProseMirror')!
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: dt })
    editor.dispatchEvent(event)
  }, base64)
}

/** Drop a PNG file onto the editor at its centre. */
async function dropImage(page: Page, base64: string) {
  await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const file = new File([bytes], 'sample.png', { type: 'image/png' })
    const dt = new DataTransfer()
    dt.items.add(file)
    const editor = document.querySelector('.ProseMirror')!
    const rect = editor.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const event = new DragEvent('drop', {
      dataTransfer: dt,
      clientX: cx,
      clientY: cy,
      bubbles: true,
      cancelable: true,
    })
    editor.dispatchEvent(event)
  }, base64)
}

test.describe('DOC-4.20 Image paste-to-attachments', () => {
  test('DOC-4.20-01/02: paste PNG inserts inline image and writes file to .attachments/', async ({ page }) => {
    await setupFs(page, { 'doc.md': '# Test\n\n' })
    await openFolder(page)
    await openFile(page, 'doc.md')

    await pasteImage(page, SAMPLE_PNG_BASE64)

    // Image node attaches to the editor inline within ~500 ms. The
    // VaultImage NodeView assigns a `blob:` URL to `src` for rendering and
    // stashes the canonical vault path on `data-vault-src`, which is what
    // the markdown serializer round-trips. We use `toBeAttached` rather
    // than `toBeVisible` because the mock FS round-trips bytes through
    // TextDecoder, mangling the PNG signature so the decoded blob fails to
    // render visually — but the canonical path is still the contract.
    const img = page.locator('.ProseMirror img').first()
    await expect(img).toBeAttached({ timeout: 3_000 })

    // The canonical vault path follows the expected pattern.
    const vaultSrc = await img.getAttribute('data-vault-src')
    expect(vaultSrc).toMatch(/^\.attachments\/[0-9a-f]{12}\.png$/)

    // The DOM `src` is replaced with a blob URL by the resolver.
    await expect(img).toHaveAttribute('src', /^blob:/, { timeout: 3_000 })

    // File exists on disk.
    const filename = vaultSrc!.replace('.attachments/', '')
    const fileContent = await page.evaluate(
      (f) => window.__kbMockFS!.read(`.attachments/${f}`),
      filename,
    )
    expect(fileContent).toBeDefined()
  })

  test('DOC-4.20-03: same image pasted twice → only one file on disk (hash dedup)', async ({ page }) => {
    await setupFs(page, { 'doc.md': '# Test\n\n' })
    await openFolder(page)
    await openFile(page, 'doc.md')

    await pasteImage(page, SAMPLE_PNG_BASE64)
    const img1 = page.locator('.ProseMirror img').first()
    await expect(img1).toBeAttached({ timeout: 3_000 })
    const vaultSrc1 = await img1.getAttribute('data-vault-src')

    await pasteImage(page, SAMPLE_PNG_BASE64)
    // Second image should also appear.
    await expect(page.locator('.ProseMirror img')).toHaveCount(2, { timeout: 3_000 })
    const vaultSrc2 = await page.locator('.ProseMirror img').nth(1).getAttribute('data-vault-src')

    // Both images point to the same canonical file (same hash).
    expect(vaultSrc1).toBe(vaultSrc2)

    // File exists on disk.
    const filename = vaultSrc1!.replace('.attachments/', '')
    const fileContent = await page.evaluate(
      (f) => window.__kbMockFS!.read(`.attachments/${f}`),
      filename,
    )
    expect(fileContent).toBeDefined()
  })

  test('DOC-4.20-04: FS write error surfaces ShellErrorContext banner, no image inserted', async ({ page }) => {
    await setupFs(page, { 'doc.md': '# Test\n\n' })
    await openFolder(page)
    await openFile(page, 'doc.md')

    // Arm the next write to fail with a permission error.
    await page.evaluate(() => { window.__kbMockFS!.failNextWrite() })

    await pasteImage(page, SAMPLE_PNG_BASE64)

    // Error banner appears.
    await expect(page.getByTestId('shell-error-banner')).toBeVisible({ timeout: 3_000 })

    // No image was inserted because the write failed before the insert step.
    await expect(page.locator('.ProseMirror img')).toHaveCount(0)
  })

  test('DOC-4.20-05: drag-drop PNG onto editor → same behavior as paste', async ({ page }) => {
    await setupFs(page, { 'doc.md': '# Test\n\n' })
    await openFolder(page)
    await openFile(page, 'doc.md')

    await dropImage(page, SAMPLE_PNG_BASE64)

    const img = page.locator('.ProseMirror img').first()
    await expect(img).toBeAttached({ timeout: 3_000 })

    const vaultSrc = await img.getAttribute('data-vault-src')
    expect(vaultSrc).toMatch(/^\.attachments\/[0-9a-f]{12}\.png$/)

    const filename = vaultSrc!.replace('.attachments/', '')
    const fileContent = await page.evaluate(
      (f) => window.__kbMockFS!.read(`.attachments/${f}`),
      filename,
    )
    expect(fileContent).toBeDefined()
  })
})
