import { test, expect } from "@playwright/test";
import { makeTempVault } from "./helpers/tempVault";
import { setVaultPath, currentBackend } from "./helpers/launchApp";

test.describe("vault picker (proof set)", () => {
  test.skip(currentBackend() === "nextdev", "needs Tauri webdriver backend");

  test("open vault → explorer renders tree", async ({ page }) => {
    const vault = await makeTempVault({ fixture: "empty" });

    await page.goto("/");
    await setVaultPath(page, vault.path);

    // App shell is the established root marker (used by every existing
    // e2e spec). The file explorer's tree node is `explorer-tree` (per
    // e2e/fileExplorerOps.spec.ts:55).
    await expect(page.locator('[data-testid="knowledge-base"]')).toBeVisible();
    await expect(page.getByTestId("explorer-tree")).toBeVisible();

    await vault.cleanup();
  });
});
