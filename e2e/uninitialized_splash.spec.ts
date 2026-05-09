import { test, expect } from "@playwright/test";
import { makeTempVault } from "./helpers/tempVault";
import { setVaultPath } from "./helpers/launchApp";

test.describe("uninitialized splash → init (proof set)", () => {
  test("uninitialized vault renders the splash; clicking Initialize mounts the explorer", async ({ page }) => {
    const vault = await makeTempVault({ initialized: false });

    await page.goto("/");
    await setVaultPath(page, vault.path);

    // Splash renders as a role=dialog with the canonical "is not yet a
    // knowledge-base vault" copy. Explorer is not yet mounted.
    const splash = page.getByRole("dialog");
    await expect(splash).toBeVisible();
    await expect(splash).toContainText("is not yet a knowledge-base vault");
    await expect(page.getByTestId("explorer-tree")).toHaveCount(0);

    // Click "Initialize this vault" (NOT "Initialize Vault" — exact text
    // matters; see UninitializedVaultSplash.tsx).
    await page.getByRole("button", { name: "Initialize this vault" }).click();

    // Now the explorer mounts and the splash is gone.
    await expect(page.getByTestId("explorer-tree")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await vault.cleanup();
  });
});
