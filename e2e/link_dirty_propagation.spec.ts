// e2e/link_dirty_propagation.spec.ts
//
// LINK-5.4-02 — rename of a file does NOT mark unrelated open docs dirty.
//   Fixture: with_links (a.md, b.md → [[a]]) plus an inline-seeded c.md
//   that contains no wiki-links. Open c.md, rename a.md → e.md; assert
//   that the dirty-stack indicator never appears (c.md was never
//   modified by the propagation pipeline).
//
// LINK-5.4-03 (live pill flip on delete) was demoted to 🅑 in this
// sweep — production strips the wiki-link from disk via
// `stripWikiLinksForPath` and the open editor's NodeView does not
// auto-reload from the watcher, so a "live red flip without reload"
// would require production changes.

import { test, expect } from "@playwright/test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { makeTempVault } from "./helpers/tempVault";
import { setVaultPath, installShim } from "./helpers/launchApp";

test.describe("link-aware file ops dirty propagation (§5.4)", () => {
  test.beforeEach(async ({ page }) => {
    await installShim(page);
  });

  test("LINK-5.4-02: renaming a.md does not mark unrelated open c.md dirty", async ({
    page,
  }) => {
    const vault = await makeTempVault({ fixture: "with_links" });

    // Seed c.md (empty of wiki-links) on disk BEFORE the React boot
    // reload so the explorer scan picks it up. Write directly via
    // node `fs` against the tempvault path — vault_write_text via
    // test_server would require setting the root first, re-ordering
    // against the React boot.
    await fs.writeFile(
      path.join(vault.path, "c.md"),
      "# C\n\nNo links here.",
    );

    await page.goto("/");
    await setVaultPath(page, vault.path);
    await expect(page.locator('[data-testid="knowledge-base"]')).toBeVisible();

    // Open c.md in the pane.
    const tree = page.getByTestId("explorer-tree");
    await tree.getByText("c.md").first().click();

    // Sanity: dirty-stack indicator absent on a fresh open (no edits).
    await expect(
      page.locator('[data-testid="dirty-stack-indicator"]'),
    ).toHaveCount(0);

    // Rename a.md → e.md via inline rename (mirrors rename_propagation).
    await tree.getByText("a.md").first().click({ button: "right" });
    await page.locator('button:has-text("Rename")').click();
    const renameInput = page.locator('input[value="a.md"]').first();
    await expect(renameInput).toBeVisible({ timeout: 3000 });
    await renameInput.selectText();
    await renameInput.pressSequentially("e.md");
    await page.keyboard.press("Enter");

    // Wait for the rename to land.
    await expect(tree.getByText("e.md").first()).toBeVisible({ timeout: 5000 });

    // After the propagation chain completes, c.md (which has no [[a]]
    // reference and therefore no rewritten content) must NOT appear in
    // the dirty-stack indicator.  The indicator is only rendered when
    // there is at least one dirty file, so the simplest assertion is
    // that the testid never appears.
    await expect(
      page.locator('[data-testid="dirty-stack-indicator"]'),
    ).toHaveCount(0);

    await vault.cleanup();
  });
});
