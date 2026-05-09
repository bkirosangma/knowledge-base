import { test, expect } from "@playwright/test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { makeTempVault } from "./helpers/tempVault";
import { setVaultPath } from "./helpers/launchApp";

test.describe("document create → file on disk (proof set)", () => {
  test("creating a document via the explorer context menu writes the file to the vault tempdir", async ({ page }) => {
    // Use the `with_links` fixture so the tree has at least one existing
    // file we can right-click to open the parent-dir context menu —
    // ExplorerPanel's "New → Document" affordance is gated behind that
    // context menu (see explorer/ExplorerPanel.tsx ~L676).
    const vault = await makeTempVault({ fixture: "with_links" });

    await page.goto("/");
    await setVaultPath(page, vault.path);
    await expect(page.locator('[data-testid="knowledge-base"]')).toBeVisible();
    await expect(page.getByTestId("explorer-tree")).toBeVisible();

    // Right-click the existing a.md to open the context menu.
    await page.getByTestId("explorer-tree").getByText("a.md").first().click({ button: "right" });

    // Hover/click "New" to open the submenu, then click "Document".
    // ExplorerPanel uses onMouseEnter/Leave for the submenu — Playwright
    // hover is reliable here.
    await page.getByRole("button", { name: "New" }).hover();
    await page.getByRole("button", { name: "Document" }).click();

    // createDocument auto-generates "untitled.md" (or "untitled-2.md" if
    // collision) — see useFileExplorer.ts createDocument. No prompt UI.
    await expect(
      page.getByTestId("explorer-tree").getByText(/^untitled(-\d+)?\.md$/),
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
