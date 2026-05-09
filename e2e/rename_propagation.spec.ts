import { test, expect } from "@playwright/test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { makeTempVault } from "./helpers/tempVault";
import { setVaultPath, currentBackend } from "./helpers/launchApp";

test.describe("rename propagation (proof set)", () => {
  test.skip(currentBackend() === "nextdev", "needs Tauri webdriver backend");

  test("renaming a.md to c.md rewrites the [[a]] in b.md to [[c]]", async ({ page }) => {
    const vault = await makeTempVault({ fixture: "with_links" });

    await page.goto("/");
    await setVaultPath(page, vault.path);
    await expect(page.locator('[data-testid="knowledge-base"]')).toBeVisible();

    // Sanity: b.md initially references [[a]] (fixture body flipped from
    // the seed in this same task — see commit body for rationale).
    const bBefore = await fs.readFile(path.join(vault.path, "b.md"), "utf8");
    expect(bBefore).toContain("[[a]]");

    // Right-click a.md → "Rename" — selectors mirror
    // e2e/fileExplorerOps.spec.ts:128-132 (the only existing rename
    // example): button:has-text("Rename") for the context-menu item,
    // then input[value="..."] for the inline rename input.
    await page
      .getByTestId("explorer-tree")
      .getByText("a.md")
      .first()
      .click({ button: "right" });
    await page.locator('button:has-text("Rename")').click();
    const renameInput = page.locator('input[value="a.md"]').first();
    await expect(renameInput).toBeVisible({ timeout: 3000 });
    await renameInput.selectText();
    await renameInput.pressSequentially("c.md");
    await page.keyboard.press("Enter");

    // Explorer shows c.md and a.md is gone.
    await expect(
      page.getByTestId("explorer-tree").getByText("c.md").first(),
    ).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId("explorer-tree").getByText("a.md")).toHaveCount(
      0,
    );

    // On disk: c.md exists, a.md does not.
    const cExists = await fs
      .stat(path.join(vault.path, "c.md"))
      .then(() => true)
      .catch(() => false);
    const aExists = await fs
      .stat(path.join(vault.path, "a.md"))
      .then(() => true)
      .catch(() => false);
    expect(cExists).toBe(true);
    expect(aExists).toBe(false);

    // b.md got rewritten by the propagateRename pipeline. Wait up to 5s
    // for the link-index → rewrite chain (watcher debounce + write).
    await expect
      .poll(
        async () => fs.readFile(path.join(vault.path, "b.md"), "utf8"),
        { timeout: 5000, intervals: [200] },
      )
      .toContain("[[c]]");

    const bAfter = await fs.readFile(path.join(vault.path, "b.md"), "utf8");
    expect(bAfter).not.toContain("[[a]]");

    await vault.cleanup();
  });
});
