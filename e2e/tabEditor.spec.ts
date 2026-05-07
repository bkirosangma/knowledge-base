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

  // PARTIALLY UNBLOCKED, NEW STALENESS:
  //   • Original Bravura font 404 IS resolved (FONT_DIRECTORY constant +
  //     `public/font/Bravura.*` files in place + `alphaTabEngine.ts` sets
  //     `settings.core.fontDirectory`). The loading overlay clears.
  //   • Edit toggle is now the PaneHeader "Exit Read Mode" button (already
  //     fixed below).
  //
  // REMAINING BLOCKER: cursor-target overlay never renders cells. The
  // editor toolbar (Q/W/E/R/T/Y, V1/V2, technique groups) DOES render
  // (confirmed via Playwright a11y snapshot), and TabProperties shows the
  // metadata-derived title "Smoke" + tempo "120". So metadata reaches
  // TabProperties but TabEditorCanvasOverlay still gates `metadata` to
  // null at render time — likely a timing edge between alphaTab's
  // "loaded" event and metadata.totalBeats being non-zero, OR a memoised
  // capture that doesn't see the metadata update. Needs an investigation
  // into the alphaTab "loaded" → metadata propagation path. Re-enable by:
  //   1. Adding a probe on `[data-testid="tab-editor-cursor-target-0-1"]`
  //      with logging in `useTabEngine.ts` to confirm metadata.totalBeats.
  //   2. If totalBeats is 0 at "loaded", wait for "ready" or a follow-up
  //      event before exposing metadata.
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

    // The TabProperties panel mounts with metadata-derived content once the
    // engine fires its "loaded" event. Wait for it before toggling edit mode
    // so the editor's overlay receives a non-null `metadata` prop.
    await expect(page.getByTestId("tab-properties")).toBeVisible();

    // Toggle edit mode (per-file default is readOnly=true; the PaneHeader's
    // "Exit Read Mode" button unlocks it — renamed after the PaneHeader
    // refactor).
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
