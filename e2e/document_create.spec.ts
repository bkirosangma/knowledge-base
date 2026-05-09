import { test, expect } from "@playwright/test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { makeTempVault } from "./helpers/tempVault";
import { setVaultPath, installShim } from "./helpers/launchApp";

test.describe("document create → file on disk (proof set)", () => {
  test.beforeEach(async ({ page }) => {
    await installShim(page);
  });

  test("clicking the explorer header's New Document button writes the file to the vault tempdir", async ({ page }) => {
    // `with_links` fixture has a.md + b.md so the tree isn't empty (an
    // empty tree would surface the empty-state CTA instead of the
    // header buttons).
    const vault = await makeTempVault({ fixture: "with_links" });

    await page.goto("/");
    await setVaultPath(page, vault.path);
    await expect(page.locator('[data-testid="knowledge-base"]')).toBeVisible();
    await expect(page.getByTestId("explorer-tree")).toBeVisible();

    // Click the explorer header's "New Document" button. The aria-label
    // includes the selected-folder suffix when a folder is selected;
    // we use a regex to match "New Document" or "New Document in <name>".
    // (The folder-context "New → Document" submenu in ExplorerPanel
    // requires a folder right-click, not a file right-click — using
    // the header button is the load-bearing affordance the spec exercises.)
    await page.getByRole("button", { name: /^New Document( in .+)?$/ }).click();

    // createDocument auto-generates "untitled.md" (or "untitled-2.md" if
    // collision) — see useFileExplorer.ts createDocument. The new file
    // immediately enters inline-rename mode so the visible label is an
    // input's value, not text. Match by treeitem name (an aria-label
    // composite) which the page renders for the new row regardless of
    // rename-mode state.
    await expect(
      page
        .getByTestId("explorer-tree")
        .getByRole("treeitem", { name: /^untitled(-\d+)?\.md/ }),
    ).toBeVisible({ timeout: 5000 });

    // Confirm on disk. We don't know the exact suffix, so check the
    // canonical "untitled.md" path first (no collision in fresh fixture).
    const onDisk = path.join(vault.path, "untitled.md");
    const exists = await fs
      .stat(onDisk)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);

    await vault.cleanup();
  });
});
