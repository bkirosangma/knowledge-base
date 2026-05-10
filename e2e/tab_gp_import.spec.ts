// e2e/tab_gp_import.spec.ts
//
// TAB-11.4-06: End-to-end Guitar Pro import flow.
//
// The case was deferred during MVP-5 on the assumption that production
// used `showOpenFilePicker` and would need a custom mock layer. In fact
// `useGpImport.pickFile` creates a hidden `<input type="file">` and
// triggers `input.click()`, so Playwright's built-in `filechooser`
// event is the load-bearing handler — no extra harness code is needed.
//
// To avoid carrying a real Guitar Pro fixture in the repo, we send
// alphaTex bytes as a `.gp7` file. alphaTab's `ScoreLoader.buildImporters()`
// dispatches Gp3To5Importer / GpxImporter / Gp7To8Importer / MusicXmlImporter
// / CapellaImporter / AlphaTexImporter in order, swallowing
// `UnsupportedFormatError` from each until one succeeds — alphaTex bytes
// fall through to AlphaTexImporter, which round-trips them via
// AlphaTexExporter back to alphaTex.

import { test, expect } from "@playwright/test";
import { makeTempVault } from "./helpers/tempVault";
import { setVaultPath, installShim } from "./helpers/launchApp";

test.describe("TAB-11.4-06 — Guitar Pro import end-to-end", () => {
  test.beforeEach(async ({ page }) => {
    await installShim(page);
  });

  test("palette command writes a .alphatex sibling and opens it in a tab pane", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    const vault = await makeTempVault({ fixture: "empty" });

    await page.goto("/");
    await setVaultPath(page, vault.path);
    await expect(page.getByTestId("explorer-tree")).toBeVisible();

    // Open the command palette and select "Import Guitar Pro file…".
    await page.getByTestId("command-palette-trigger").click();
    await expect(
      page.getByRole("dialog", { name: "Command Palette" }),
    ).toBeVisible({ timeout: 3000 });
    await page
      .getByPlaceholder("Search the vault, or > for commands…")
      .fill(">Import Guitar Pro");

    // Production triggers a hidden `<input type="file">` via `input.click()`,
    // not `showOpenFilePicker`, so Playwright's built-in filechooser event
    // is the load-bearing handler. Set up the listener BEFORE clicking the
    // option that triggers `pickFile()`.
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page
      .getByRole("option", { name: /Import Guitar Pro/i })
      .click();
    const fileChooser = await fileChooserPromise;

    const alphaTex =
      '\\title "Imported"\n\\tempo 120\n.\n:4 5.6 7.6 5.5 7.5 |\n';
    await fileChooser.setFiles({
      name: "tune.gp7",
      mimeType: "application/octet-stream",
      buffer: Buffer.from(alphaTex, "utf-8"),
    });

    // The hook writes `tune.alphatex` and the shell auto-opens it in a
    // pane via `handleSelectFile` → `tab-view-canvas` mounts (mirrors
    // the assertion pair from TAB-11.2-04 / `tab_h1_derivation.spec.ts`).
    //
    // The pane title resolves through `paneTitleFor` (TAB-11.2-12): the
    // basename "tune" appears first, then alphaTab parses the score and
    // promotes the `\title "Imported"` directive into `metadata.title`.
    // Asserting on "Imported" pins the full round-trip (file written →
    // pane mounted → alphaTab read it back).
    await expect(page.getByTestId("tab-view-canvas")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("tab-view-engine-error")).not.toBeVisible();
    await expect(page.getByTestId("pane-title")).toHaveText("Imported", { timeout: 10_000 });

    expect(errors).toEqual([]);

    await vault.cleanup();
  });
});
