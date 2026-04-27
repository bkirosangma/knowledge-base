import { test, expect, type Page } from '@playwright/test'
import { installMockFS } from './fixtures/fsMock'

// SVG-6.4-13 (e2e): integration sanity for the SVG editor's
// persistence chain end-to-end — KB-005 routes every read/write through
// `Repositories.svg`, and the 200 ms debounce + flush guarantee that an
// edit makes it to disk without the silent `.catch(() => {})` the audit
// flagged. The unit suite pins the precise unmount-cleanup, file-switch,
// blur, and load-failure behaviours with fake timers (SVG-6.4-04..12);
// this spec proves the same wiring is real in a Chromium browser against
// the mock FSA seam.
//
// We dirty the canvas via a real mouse drag with the rectangle tool,
// wait past the 200 ms debounce so the autosave fires, switch the pane
// to a markdown file (which also unmounts `SVGEditorView`, exercising
// its cleanup as belt-and-braces), and assert the on-disk SVG has been
// rewritten by the @svgedit serializer — the seed is a hand-authored
// `<svg ... />` and the post-write payload includes the library's
// `Created with SVG-edit` comment, so we can tell them apart by content
// alone without depending on which flush path won the race.

const SEED_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"></svg>'

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

test.describe('SVG editor — persistence', () => {
  test('SVG-6.4-13: drawing on the canvas persists to disk through the repo seam', async ({ page }) => {
    await setupFs(page, {
      'drawing.svg': SEED_SVG,
      'note.md': '# Note\n',
    })
    await openFolder(page)

    // Open the SVG. Default opens in read mode — exit so the canvas
    // accepts pointer events.
    await page.getByText('drawing.svg').first().click()
    const canvas = page.getByTestId('svg-canvas-container')
    await expect(canvas).toBeVisible({ timeout: 5_000 })
    await page.getByRole('button', { name: 'Exit Read Mode' }).click()
    await expect(page.getByRole('button', { name: 'Enter Read Mode' })).toBeVisible()

    // Wait for `@svgedit/svgcanvas` to finish booting — the `#svgcontent`
    // shape layer only exists once `setSvgString` has been called with
    // the seed file's content. Without this, mouse events under fully-
    // parallel CI load can land before the library has bound them.
    await page.waitForFunction(() => !!document.getElementById('svgcontent'))

    // Activate the rectangle tool, then drag inside the canvas. The
    // @svgedit/svgcanvas library binds to the wrapper div for its
    // mousedown/move/up handlers; `page.mouse` lands on the wrapper and
    // the events propagate down correctly.
    await page.getByTitle('Rectangle (R)').click()
    const box = await canvas.boundingBox()
    if (!box) throw new Error('canvas has no layout box')
    await page.mouse.move(box.x + 80, box.y + 80)
    await page.mouse.down()
    await page.mouse.move(box.x + 220, box.y + 200, { steps: 5 })
    await page.mouse.up()

    // Wait for the persistence chain to fire its 200 ms debounced write.
    // Polling the disk content directly avoids the wall-clock flake we'd
    // get with a fixed `waitForTimeout` under fully-parallel CI load —
    // the @svgedit serializer stamps a `Created with SVG-edit` comment
    // that the hand-authored seed doesn't have, so its presence proves
    // the editor wrote back through the repo.
    await expect
      .poll(
        () => page.evaluate(() => window.__kbMockFS!.read('drawing.svg')),
        {
          message:
            'drawing.svg should be rewritten by the SVG editor after the debounced autosave fires',
          timeout: 10_000,
        },
      )
      .toContain('Created with SVG-edit')

    // Belt-and-braces: also exercise the unmount cleanup. Switching to
    // the markdown file re-renders the pane content from `SVGEditorView`
    // to `DocumentView`, which triggers the unmount cleanup the unit
    // tests pin (SVG-6.4-09). If a future change accidentally swallowed
    // a write here it would not show up in the assertion above (the
    // debounce already wrote), but the surrounding navigation must
    // still resolve cleanly without a hang.
    await page.getByText('note.md').first().click()
    await expect(page.locator('.ProseMirror').first()).toBeVisible({ timeout: 5_000 })
  })
})
