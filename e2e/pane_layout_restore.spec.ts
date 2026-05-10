import { test, expect } from "@playwright/test";
import { makeTempVault } from "./helpers/tempVault";
import { setVaultPath, installShim } from "./helpers/launchApp";

// SHELL-1.4-14: when a saved pane layout exists in localStorage at boot,
// the restoring effect in `KnowledgeBaseInner` (knowledgeBase.tsx ~line
// 870) re-mounts the previous panes once the explorer tree finishes
// loading.
//
// The localStorage key is `knowledge-base-pane-layout` (no scope prefix
// — `setDirectoryScope` is never called in production code, so
// `scopedKey()` returns the bare base key). The persisted shape is
// `{ leftPane, rightPane, focusedSide, lastClosedPane }` as defined by
// `SavedPaneLayout` in `shared/utils/persistence.ts`.

test.describe("Pane Layout Restore (SHELL-1.4-14)", () => {
  test.beforeEach(async ({ page }) => {
    await installShim(page);
  });

  test("SHELL-1.4-14: layout restored on directory load", async ({ page }) => {
    const vault = await makeTempVault({ fixture: "with_links" });

    await page.goto("/");

    // Seed the saved pane layout BEFORE setVaultPath reloads the page,
    // so the post-reload boot pass picks it up via loadPaneLayout().
    // Two windows are at play: the goto() above gave us localStorage
    // for `localhost:3000`; setVaultPath() then issues page.reload(),
    // and localStorage survives the reload because it's per-origin.
    await page.evaluate(() => {
      const layout = {
        leftPane: { filePath: "a.md", fileType: "document" },
        rightPane: null,
        focusedSide: "left",
        lastClosedPane: null,
      };
      localStorage.setItem("knowledge-base-pane-layout", JSON.stringify(layout));
    });

    await setVaultPath(page, vault.path);
    await expect(page.locator('[data-testid="knowledge-base"]')).toBeVisible();
    await expect(page.getByTestId("explorer-tree")).toBeVisible();

    // The document pane mounts because `a.md` was in the saved layout
    // and `with_links` ships with `a.md` so the validity check passes.
    await expect(
      page.locator('[data-pane-content="document"]')
    ).toBeVisible({ timeout: 5000 });

    // The pane title row reflects the active file. PaneHeader renders
    // the H1 (or filename fallback) under [data-testid="pane-title"].
    // The `with_links` `a.md` body starts with `# A` per the fixture
    // builder, so the title settles to "A" once the debounced first-H1
    // extractor fires.
    await expect(page.locator('[data-testid="pane-title"]').first())
      .toBeVisible({ timeout: 5000 });

    await vault.cleanup();
  });
});
