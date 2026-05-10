// e2e/explorer_move_item.spec.ts
//
// LINK-5.1-10: Move-into-different-folder rewrites cross-document
// references with the new relative path. The production move flow is
// HTML5 drag-and-drop with `dataTransfer.getData("text/plain")` round-
// tripping a JSON path payload; headless Chromium gates `getData()` to
// events from a real drag sequence, so synthetic Playwright drops
// return "" and `propagateMoveLinks` never fires.
//
// We bypass DnD via the `__kbE2EMoveItem` window seam (set in
// `KnowledgeBaseInner` only when `process.env.NODE_ENV !== "production"`
// — same NODE_ENV-gate pattern as `ServiceWorkerRegister`). The seam
// drives `handleMoveItemWithLinks` directly, which is the same React
// callback the DnD `drop` handler eventually calls.

import { test, expect } from "@playwright/test";
import * as fs from "node:fs/promises";
import * as path from "node:path";

import { makeTempVault } from "./helpers/tempVault";
import { setVaultPath, installShim } from "./helpers/launchApp";

test.describe("LINK-5.1-10 — move into a different folder rewrites references", () => {
  test.beforeEach(async ({ page }) => {
    await installShim(page);
  });

  test("moving a.md into subfolder/ updates b.md's [[a]] reference to [[subfolder/a]]", async ({ page }) => {
    const vault = await makeTempVault({ fixture: "with_links" });
    // Production accepts an existing folder as the move target; create
    // it before the move so propagateMoveLinks has a real destination.
    await fs.mkdir(path.join(vault.path, "subfolder"), { recursive: true });

    await page.goto("/");
    await setVaultPath(page, vault.path);
    await expect(page.locator('[data-testid="knowledge-base"]')).toBeVisible();
    await expect(page.getByTestId("explorer-tree")).toBeVisible();

    // Sanity: pre-move state — a.md at root, b.md references [[a]].
    const aBefore = await fs.readFile(path.join(vault.path, "a.md"), "utf8");
    expect(aBefore).toContain("# A");
    const bBefore = await fs.readFile(path.join(vault.path, "b.md"), "utf8");
    expect(bBefore).toContain("[[a]]");

    // Wait for the tree row to be present — `fileMap` is built from the
    // tree, so without it `moveItem` early-returns on
    // `fileMap.get(sourcePath) === undefined`.
    await expect(
      page.getByTestId("explorer-tree").getByRole("treeitem", { name: /^a\.md/ }),
    ).toBeVisible();

    // Drive `fileExplorer.moveItem` + `propagateMoveLinks` via the seam.
    // The seam awaits both — when `evaluate` resolves, the disk move and
    // backlink rewrite have completed.
    await page.evaluate(async () => {
      const fn = (window as unknown as {
        __kbE2EMoveItem?: (sourcePath: string, targetFolderPath: string) => Promise<void>;
      }).__kbE2EMoveItem;
      if (!fn) throw new Error("__kbE2EMoveItem seam not present — production build?");
      await fn("a.md", "subfolder");
    });

    // After-move state on disk: a.md moved, b.md's reference rewritten.
    const subContents = await fs.readdir(path.join(vault.path, "subfolder"));
    expect(subContents).toContain("a.md");
    const rootContents = await fs.readdir(vault.path);
    expect(rootContents).not.toContain("a.md");
    const bAfter = await fs.readFile(path.join(vault.path, "b.md"), "utf8");
    expect(bAfter).toContain("[[subfolder/a]]");
    expect(bAfter).not.toMatch(/\[\[a\]\]/);

    await vault.cleanup();
  });
});
