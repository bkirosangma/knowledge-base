import { test, expect, type Page } from '@playwright/test'
import { installMockFS } from './fixtures/fsMock'

// SVG-6.4-22 (e2e): per-instance scoping for the SVG editor's DOM
// lookups. Before KB-006 the canvas resolved its background-rect via
// the global `document.getElementById('svg-editor-bg')`, which returns
// the FIRST match across the document. With two SVGs open in left +
// right split panes, mutating the background on one pane silently
// mutated the *other* pane's bg-rect; that pane's `MutationObserver`
// fired `onChanged`, and the 200 ms debounced autosave wrote the new
// colour into the unrelated file. The fix scopes lookups to each
// canvas's own `containerRef`, so a `setBackground` call from one pane
// never reaches into the other pane's DOM subtree — and therefore
// never autosaves the wrong file.
//
// The contract this spec pins is exactly the audit's promise: when
// background changes on one pane, the *other* file is untouched. We
// don't assert on the modified pane's on-disk content because
// `@svgedit/svgcanvas` 7.x has a module-level singleton in
// `core/svg-exec.js` (`let svgCanvas = null` rebound by every
// `svgInit(this)` constructor call) — its `svgCanvasToString`
// serialises whichever canvas was constructed last, regardless of
// which instance you hold a reference to. Working around that is a
// separate ticket; KB-006's job is the per-instance lookup, and the
// other-file-untouched assertion below is selector-agnostic and
// captures it directly.

const SEED_LEFT =
  '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"></svg>'
const SEED_RIGHT =
  '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">' +
  '<rect id="svg-editor-bg" pointer-events="none" x="0" y="0" width="800" height="600" fill="#ff0000"/>' +
  '</svg>'

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

test.describe('SVG editor — split-pane id scoping (KB-006)', () => {
  test('SVG-6.4-22: changing background on one pane does not corrupt the other', async ({ page }) => {
    await setupFs(page, {
      'left.svg': SEED_LEFT,
      'right.svg': SEED_RIGHT,
    })
    await openFolder(page)

    // Open left.svg in the (single) left pane.
    await page.getByText('left.svg').first().click()
    await expect(page.getByTestId('svg-canvas-container').first()).toBeVisible({ timeout: 5_000 })

    // Wait for `@svgedit/svgcanvas` to mount its `#svgcontent` shape
    // layer — without this the split below could race the first-load
    // initialisation under fully-parallel CI load.
    await page.waitForFunction(() => !!document.querySelector('#svgcontent'))

    // Enter split-view. The shell duplicates the focused file into the
    // right pane and moves focus there.
    await page.getByRole('button', { name: 'Enter split view' }).click()

    // With focus on the right pane, clicking another file in the
    // explorer opens it in that pane — left = left.svg, right = right.svg.
    await page.getByText('right.svg').first().click()

    // Both canvases mounted; both have their own `#svgcontent` element
    // and right.svg's bg-rect is in right's container.
    await expect(page.getByTestId('svg-canvas-container')).toHaveCount(2)
    await page.waitForFunction(
      () => document.querySelectorAll('#svgcontent').length === 2,
    )

    // Focus the LEFT pane so the bg-color picker we open belongs to it.
    await page.getByTestId('svg-canvas-container').nth(0).click()

    // Open Canvas settings on the left pane (the Crop-icon button) and
    // set the Background colour from the popup. The popup contains a
    // section labelled "Background" with one `<input type="color">`;
    // anchoring on that label keeps the locator robust against future
    // toolbar reshuffles that would invalidate a positional `nth()`.
    await page.getByTitle('Canvas settings').first().click()
    const bgInput = page
      .getByText('Background', { exact: true })
      .locator('..')
      .locator('input[type="color"]')
    await bgInput.fill('#00ff00')

    // Wait past the 200 ms autosave debounce window. With the bug, the
    // global `getElementById` lookup resolves to right.svg's bg-rect,
    // setBackground mutates it to green, the right pane's
    // MutationObserver fires `onChanged`, and the debounce writes the
    // green colour into right.svg. With the fix, no mutation lands on
    // right's container so right.svg never gets autosaved.
    await page.waitForTimeout(500)

    const rightContent = await page.evaluate(() => window.__kbMockFS!.read('right.svg'))
    expect(rightContent, 'right.svg must not contain the new green color').not.toMatch(/00ff00/i)
    expect(rightContent, 'right.svg must still contain its original red background').toMatch(/ff0000/i)
  })
})
