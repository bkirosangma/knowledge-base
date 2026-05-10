// e2e/wiki_link_red_pill_on_delete.spec.ts
//
// LINK-5.2-03 / LINK-5.4-03: Deleting a document flips wiki-links
// pointing at it from "resolved" (blue) to "broken" (red pill / click-
// to-create) in any open editor showing them. The link index updates
// when the file is removed; `existingDocPaths` (a memo over
// `linkManager.linkIndex.documents`) shrinks; the host pings the
// wikiLink extension's `forceRepaint` chain, every live NodeView calls
// `paintFromAttrs` against the latest ref-backed state, and the DOM
// class swaps from `bg-blue-100` to `bg-red-100`.
//
// The MVP-5 case note for both cases blamed the strip flow in
// `deleteDocumentWithCleanup` and concluded the live flip required
// either disabling the strip or wiring a watcher reload. That
// diagnosis was about the cascade-delete path (DetachDocModal's "also
// delete" checkbox); the explorer-delete path goes through
// `fileExplorer.deleteFile` (no strip), so the link index update is
// the only signal needed and the live flip works without disturbing
// referencing documents.

import { test, expect } from "@playwright/test";
import * as fs from "node:fs/promises";
import * as path from "node:path";

import { makeTempVault } from "./helpers/tempVault";
import { setVaultPath, installShim } from "./helpers/launchApp";

test.describe("LINK-5.2-03 / LINK-5.4-03 — wiki-link flips to red pill on target delete", () => {
  test.beforeEach(async ({ page }) => {
    await installShim(page);
  });

  test("deleting a.md flips b.md's [[a]] from blue to red without reloading the pane", async ({ page }) => {
    const vault = await makeTempVault({ fixture: "with_links" });

    await page.goto("/");
    await setVaultPath(page, vault.path);
    await expect(page.locator('[data-testid="knowledge-base"]')).toBeVisible();

    // Open b.md (contains `[[a]]`).
    await page.getByTestId("explorer-tree").getByRole("treeitem", { name: /^b\.md/ }).click();
    await expect(page.locator(".ProseMirror").first()).toBeVisible({ timeout: 5000 });

    // Sanity: the wiki-link to a.md is rendered as a resolved (blue) pill.
    const wikiLink = page.locator('.ProseMirror [data-wiki-link="a"]').first();
    await expect(wikiLink).toBeVisible();
    await expect(wikiLink).toHaveClass(/bg-blue-100/);
    await expect(wikiLink).not.toHaveClass(/bg-red-100/);

    // Delete a.md via the seam (mirrors what the explorer's confirm-and-
    // delete flow eventually calls: fileExplorer.deleteFile +
    // linkManager.removeDocumentFromIndex).
    await page.evaluate(async () => {
      const fn = (window as unknown as {
        __kbE2EDeleteFile?: (p: string) => Promise<void>;
      }).__kbE2EDeleteFile;
      if (!fn) throw new Error("__kbE2EDeleteFile seam not present — production build?");
      await fn("a.md");
    });

    // The link must flip to broken without the user opening / reloading
    // anything — it's a live consequence of the link index shrinking.
    await expect(wikiLink).toHaveClass(/bg-red-100/, { timeout: 5_000 });
    await expect(wikiLink).not.toHaveClass(/bg-blue-100/);
    // The text content of the link is unchanged — only the visual state
    // changed. The user can still see exactly what they referenced and
    // decide to clean up or recreate.
    await expect(wikiLink).toContainText("a");

    // a.md is gone from disk.
    await expect.poll(async () => {
      try { await fs.access(path.join(vault.path, "a.md")); return true; } catch { return false; }
    }, { timeout: 5_000 }).toBe(false);
    // b.md's on-disk content STILL contains `[[a]]` — explorer-delete
    // does not strip referencing documents, so the user can audit /
    // clean up or recreate the target. No silent mutation of the
    // surrounding document.
    const bAfter = await fs.readFile(path.join(vault.path, "b.md"), "utf8");
    expect(bAfter).toContain("[[a]]");

    await vault.cleanup();
  });
});
