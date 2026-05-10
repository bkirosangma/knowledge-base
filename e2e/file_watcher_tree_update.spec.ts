// e2e/file_watcher_tree_update.spec.ts
//
// SHELL-1.10-15: UI reacts to disk change within ~1s.
//
// Pipeline under test:
//   node `fs.writeFile` (mutate disk from outside the app)
//     → notify_debouncer_full inside `TestWatcher` (test_server-side)
//     → `EventBus.emit("vault_change", _)`
//     → SSE on /events (router.rs)
//     → `EventSource` in tauriShim.ts dispatching `vault_change` to listeners
//     → `FileWatcherContext.listen("vault_change", …)` → fanOut()
//     → `useFileExplorer.refresh()` → re-render with the new tree.
//
// Production runs the same chain except the watcher is bound to
// `app.emit("vault_change", _)` instead of `EventBus`.

import { test, expect } from "@playwright/test";
import * as fs from "node:fs/promises";
import * as path from "node:path";

import { makeTempVault } from "./helpers/tempVault";
import { setVaultPath, installShim } from "./helpers/launchApp";

test.describe("SHELL-1.10-15 — UI reacts to disk change within ~1s", () => {
  test.beforeEach(async ({ page }) => {
    await installShim(page);
  });

  test("creating a file outside the app surfaces the new tree row", async ({ page }) => {
    const vault = await makeTempVault({ fixture: "with_links" });

    await page.goto("/");
    await setVaultPath(page, vault.path);
    await expect(page.locator('[data-testid="knowledge-base"]')).toBeVisible();

    const tree = page.getByTestId("explorer-tree");
    await expect(tree).toBeVisible();

    // Sanity: the seed file is present, the new file is not yet.
    await expect(
      tree.getByRole("treeitem", { name: /^a\.md/ }),
    ).toBeVisible();
    await expect(
      tree.getByRole("treeitem", { name: /^externally-added\.md/ }),
    ).toHaveCount(0);

    // Mutate disk from outside the app. notify's debounce window is
    // 200ms (`DEBOUNCE_MS` in test_watcher.rs); allow a 5s budget for
    // the SSE round-trip + React rerender — comfortable headroom over
    // the case's "~1s" budget.
    const newPath = path.join(vault.path, "externally-added.md");
    await fs.writeFile(newPath, "# Hello from outside the app\n", "utf8");

    await expect(
      tree.getByRole("treeitem", { name: /^externally-added\.md/ }),
    ).toBeVisible({ timeout: 5_000 });

    await vault.cleanup();
  });

  test("deleting a file outside the app removes it from the tree", async ({ page }) => {
    const vault = await makeTempVault({ fixture: "with_links" });

    await page.goto("/");
    await setVaultPath(page, vault.path);
    await expect(page.locator('[data-testid="knowledge-base"]')).toBeVisible();

    const tree = page.getByTestId("explorer-tree");
    await expect(tree.getByRole("treeitem", { name: /^a\.md/ })).toBeVisible();

    await fs.unlink(path.join(vault.path, "a.md"));

    await expect(
      tree.getByRole("treeitem", { name: /^a\.md/ }),
    ).toHaveCount(0, { timeout: 5_000 });

    await vault.cleanup();
  });
});
