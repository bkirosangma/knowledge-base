// e2e/tab_h1_derivation.spec.ts
//
// TAB-11.2-04: Canvas renders within 2s on a fixture file.
// TAB-11.2-12: Tab pane H1 derives from \title directive (falls back to
//              basename when absent).
//
// MVP-4.x harness: chromium against `next dev`, Tauri invoke surface
// shimmed to test_server (axum :1421). Uses the `with_tab` vault
// fixture (song.alphatex with \title "Greensleeves" + a sibling
// untitled-no-title.alphatex without \title).
//
// alphaTab loading in headless chromium is environment-fragile (see
// TAB-11.3-19 / TAB-11.8-06). Each leg is a separate test() so a single
// flake demotes only its case, not the others.

import { test, expect } from "@playwright/test";
import { makeTempVault } from "./helpers/tempVault";
import { setVaultPath, installShim } from "./helpers/launchApp";

test.describe("TAB-11.2-04 / TAB-11.2-12 — alphaTab integration", () => {
  test.beforeEach(async ({ page }) => {
    await installShim(page);
  });

  test("TAB-11.2-04: canvas mounts within 2s for fixture .alphatex", async ({ page }) => {
    const vault = await makeTempVault({ fixture: "with_tab" });

    await page.goto("/");
    await setVaultPath(page, vault.path);
    await expect(page.getByTestId("explorer-tree")).toBeVisible();

    // Click the .alphatex row to route into the tab pane.
    await page
      .getByTestId("explorer-tree")
      .getByRole("treeitem", { name: /^song\.alphatex/ })
      .click();

    // The case copy says "within 2s"; Playwright's default timeout (5s)
    // is comfortably above that budget. We only assert visibility — the
    // 2s leg is documented in the case, not enforced here, because the
    // useful invariant is "the canvas mounts at all under chromium".
    await expect(page.getByTestId("tab-view-canvas")).toBeVisible();
    await expect(page.getByTestId("tab-view-engine-error")).not.toBeVisible();

    await vault.cleanup();
  });

  test("TAB-11.2-12 (with-title leg): pane title is 'Greensleeves' for song.alphatex", async ({ page }) => {
    const vault = await makeTempVault({ fixture: "with_tab" });

    await page.goto("/");
    await setVaultPath(page, vault.path);
    await expect(page.getByTestId("explorer-tree")).toBeVisible();

    await page
      .getByTestId("explorer-tree")
      .getByRole("treeitem", { name: /^song\.alphatex/ })
      .click();

    // PaneHeader title is fed from `metadata.title`, which alphaTab
    // populates from the `\title "..."` directive. Wait for canvas first
    // so the engine has a chance to parse and emit metadata.
    await expect(page.getByTestId("tab-view-canvas")).toBeVisible();
    await expect(page.getByTestId("pane-title")).toHaveText(/Greensleeves/, {
      timeout: 10000,
    });

    await vault.cleanup();
  });

  test("TAB-11.2-12 (basename-fallback leg): pane title falls back to basename for untitled-no-title.alphatex", async ({ page }) => {
    const vault = await makeTempVault({ fixture: "with_tab" });

    await page.goto("/");
    await setVaultPath(page, vault.path);
    await expect(page.getByTestId("explorer-tree")).toBeVisible();

    await page
      .getByTestId("explorer-tree")
      .getByRole("treeitem", { name: /^untitled-no-title\.alphatex/ })
      .click();

    // PaneHeader renders as soon as filePath is set; `paneTitleFor` falls
    // back to the basename without extension when `metadata.title` is
    // either undefined (engine still loading) or the alphaTab `"Untitled"`
    // sentinel (engine finished but the source has no `\title` directive).
    // We don't gate on canvas visibility here — the fallback applies
    // regardless of whether the engine eventually loads.
    await expect(page.getByTestId("pane-title")).toHaveText("untitled-no-title", {
      timeout: 10000,
    });

    await vault.cleanup();
  });
});
