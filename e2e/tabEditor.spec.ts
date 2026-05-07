/**
 * TAB-11.8-01 — Tab editor smoke: click-edit-save round-trip.
 *
 * Verifies that:
 *   1. The alphaTab canvas renders after opening an .alphatex file.
 *   2. The Edit toggle surfaces the editor chunk (TabEditorToolbar + overlay).
 *   3. Clicking a cursor-target cell sets the cursor.
 *   4. Pressing a digit (fret 5) dispatches a set-fret op via applyEdit.
 *   5. The debounced flush writes the updated score to the in-memory vault
 *      within a reasonable polling window (5 s — the 500 ms debounce +
 *      alphaTab serialize time is not a fixed duration on CI).
 *
 * Known limitations / flakiness mitigations:
 *   - alphaTab loads its WASM worker and parses the score asynchronously;
 *     `waitForFunction` guards on the overlay cells being present before
 *     interacting.
 *   - The debounced save is not a fixed wall-clock time; `expect.poll` retries
 *     every 100 ms up to 5 s — deterministic and CI-safe.
 *   - `session.score` is the same mutated object reference after applyEdit
 *     (alphaTab mutates in place); the `onScoreChange` callback in TabEditor
 *     reads `session.score` rather than the stale `score` prop to guarantee
 *     the post-edit state reaches useTabContent.setScore.
 *   - The cursor-target buttons are 32×18 px transparent overlays. Playwright
 *     clicks by testid regardless of visual overlap with the playback toolbar
 *     that sits above the canvas.
 */

import { test, expect } from "@playwright/test";
import { installMockFS } from "./fixtures/fsMock";
import { SMOKE_TAB, seedTabs, readVaultFile } from "./fixtures/tabFixtures";

test.describe("tab editor", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(installMockFS);
    await page.addInitScript(() => {
      try { indexedDB.deleteDatabase("knowledge-base"); } catch { /* ignore */ }
    });
  });

  // BLOCKED: original Bravura font 404 issue is RESOLVED — the FONT_DIRECTORY
  // wiring in `alphaTabAssets.ts` + the Bravura files now living in
  // `public/font/` let the engine fire its "loaded" event and the loading
  // overlay clears as expected.
  //
  // Remaining staleness (deferred): the body assertions below pre-date the
  // PaneHeader Edit/Read refactor, the editor-toolbar redesign, and possibly
  // the editor metadata/cursor-target gating that's coupled to alphaTab's
  // post-load state. To re-enable, walk through the assertions:
  //   • Edit toggle is now the PaneHeader "Exit Read Mode" button (this part
  //     is already updated below).
  //   • Cursor-target overlay needs `metadata` populated, which only happens
  //     after alphaTab finishes parsing. May need an additional wait
  //     between the Edit toggle and the cursor-target query.
  //   • Verify the keyboard digit dispatch path under the new edit-mode
  //     wiring (no major refactor expected, but assert the flush path still
  //     writes through `useTabContent.setScore`).
  // The unit tests in `TabView.editor.test.tsx`,
  // `TabEditorCanvasOverlay.test.tsx`, etc. continue to verify the wiring.
  // eslint-disable-next-line playwright/no-skipped-test
  test.fixme("TAB-11.8-01: click-edit-save round-trip", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/");

    // Seed the vault with a single-bar tab (4 beats, strings 1-6).
    // Use exact format accepted by alphaTab — same as existing tab.spec.ts.
    await page.evaluate(() => {
      (window as unknown as { __kbMockFS?: { seed: (f: Record<string, string>) => void } }).__kbMockFS?.seed({
        "smoke.alphatex": '\\title "Smoke"\n\\tempo 120\n.\n:4 0.6 1.6 2.6 3.6 |',
      });
    });

    // Open the file through the normal vault picker flow.
    await page.getByRole("button", { name: /open folder/i }).click();
    await page.getByText("smoke.alphatex").click();

    // Wait for the canvas — engine mounted.
    await expect(page.getByTestId("tab-view-canvas")).toBeVisible();

    // Wait until the loading overlay clears (engine finished parsing + rendering).
    // alphaTab parses + lays out the score asynchronously. Increase timeout to
    // 30 s — on CI with cold WASM JIT this can be slow.
    await expect(page.getByTestId("tab-view-loading")).not.toBeVisible({ timeout: 30000 });

    // Toggle edit mode (per-file default is readOnly=true; the PaneHeader's
    // "Exit Read Mode" button unlocks it).
    await page.getByRole("button", { name: /exit read mode/i }).click();

    // Editor chunk is attached and cursor targets are rendered by the overlay.
    await expect(page.getByTestId("tab-editor")).toBeAttached();
    await page.waitForFunction(
      () => !!document.querySelector('[data-testid^="tab-editor-cursor-target-"]'),
      { timeout: 10000 },
    );

    // Click beat 0, string 6 to set the cursor there.
    await page.getByTestId("tab-editor-cursor-target-0-6").click();

    // Type fret 5. The keyboard handler accumulates digits and flushes after
    // 500 ms of silence — pressing "5" alone (no second digit) triggers the
    // DIGIT_TIMEOUT_MS flush.
    await page.keyboard.press("Digit5");

    // Poll the vault until the flush writes the serialized alphaTex.
    // The smoke tab's string 6 beat 0 should now contain "5.6" (fret.string).
    await expect
      .poll(
        async () => readVaultFile(page, "smoke.alphatex"),
        { timeout: 8000, message: "vault file should contain 5.6 after fret edit" },
      )
      .toContain("5.6");

    // No uncaught JS errors during the interaction.
    expect(errors).toEqual([]);
  });
});
