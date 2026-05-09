// e2e/explorer_recents.spec.ts
//
// EXPL-2.8-03/04/05/06/07 — explorer Recents group.
// EXPL-2.9-02/03 — explorer Unsaved-changes group.
//
// MVP-4.x harness: chromium against `next dev`, Tauri invoke surface
// shimmed to test_server (axum :1421) via `installShim`. Production
// markup has no testid hooks for the Recents/Unsaved sections (per
// MVP-5 Decision 5 we don't add them); instead we use stable text +
// role + `title` attributes on the rendered controls.

import { test, expect, type Page } from "@playwright/test";
import { makeTempVault } from "./helpers/tempVault";
import { setVaultPath, installShim } from "./helpers/launchApp";

const RECENTS_KEY = "kb-recents";
const DRAFT_PREFIX = "knowledge-base-draft:";

async function clearLocalStorage(page: Page): Promise<void> {
  await page.evaluate(() => {
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
  });
}

test.describe("Explorer recents and unsaved (EXPL-2.8 / 2.9)", () => {
  test.beforeEach(async ({ page }) => {
    await installShim(page);
  });

  test("EXPL-2.8-03: recents deduplicates by path", async ({ page }) => {
    const vault = await makeTempVault({ fixture: "with_links" });
    await page.goto("/");
    await clearLocalStorage(page);
    await setVaultPath(page, vault.path);
    await expect(page.getByTestId("explorer-tree")).toBeVisible();

    // Open a.md twice — second click is a re-select on the already-open
    // pane. The recents tracker dedups by path.
    const aRow = page.getByTestId("explorer-tree").getByText("a.md").first();
    await aRow.click();
    await aRow.click();

    // The Recents header is a <button> labelled "Recents".
    const recentsHeader = page.getByRole("button", { name: "Recents" });
    await expect(recentsHeader).toBeVisible();

    // Recent rows are buttons with `title` set to the path. Filter rows
    // for `title="a.md"` directly — that's a stable, unambiguous selector
    // (unlike text content, which appears in the tree as well).
    const aRecent = page.locator('button[title="a.md"]');
    await expect(aRecent).toHaveCount(1);

    await vault.cleanup();
  });

  test("EXPL-2.8-04: recents capped at 10 (oldest dropped on 11th)", async ({ page }) => {
    const vault = await makeTempVault({ fixture: "with_many_files" });
    await page.goto("/");
    await clearLocalStorage(page);
    await setVaultPath(page, vault.path);
    await expect(page.getByTestId("explorer-tree")).toBeVisible();

    // Open f01..f12 in order. f01 should be the oldest and drop out.
    for (let i = 1; i <= 12; i++) {
      const name = `f${String(i).padStart(2, "0")}.md`;
      await page.getByTestId("explorer-tree").getByText(name).first().click();
      // Tiny wait to let React commit the activeEntry change so the
      // recents effect runs in order. (without this, multiple clicks
      // collapse into one effect tick and the dedup ordering is racy.)
      await page.waitForTimeout(40);
    }

    // localStorage is the source of truth — assert the on-disk shape so
    // the test doesn't depend on the rendered ordering / collapse state.
    const recents = (await page.evaluate(
      (k: string) => JSON.parse(localStorage.getItem(k) ?? "[]"),
      RECENTS_KEY,
    )) as string[];

    expect(recents).toHaveLength(10);
    expect(recents).not.toContain("f01.md");
    expect(recents).not.toContain("f02.md");
    expect(recents).toContain("f12.md"); // most recent

    await vault.cleanup();
  });

  test("EXPL-2.8-05: recents persists across page reload", async ({ page }) => {
    const vault = await makeTempVault({ fixture: "with_links" });
    await page.goto("/");
    await clearLocalStorage(page);
    await setVaultPath(page, vault.path);
    await expect(page.getByTestId("explorer-tree")).toBeVisible();

    await page.getByTestId("explorer-tree").getByText("a.md").first().click();

    // Recents header now shows.
    await expect(page.getByRole("button", { name: "Recents" })).toBeVisible();

    // Hard reload — `kb-recents` is read on mount via `loadRecents`.
    // (setVaultPath already reloaded once; this is a second reload.)
    await page.reload();
    await expect(page.getByTestId("explorer-tree")).toBeVisible();

    await expect(page.getByRole("button", { name: "Recents" })).toBeVisible();
    await expect(page.locator('button[title="a.md"]')).toHaveCount(1);

    await vault.cleanup();
  });

  test("EXPL-2.8-06: recents header hidden when empty", async ({ page }) => {
    const vault = await makeTempVault({ fixture: "empty" });
    await page.goto("/");
    await clearLocalStorage(page);
    await setVaultPath(page, vault.path);
    await expect(page.getByTestId("explorer-tree")).toBeVisible();

    // No file opened yet → no recents.
    await expect(page.getByRole("button", { name: "Recents" })).toHaveCount(0);

    await vault.cleanup();
  });

  test("EXPL-2.8-07: recents collapse toggle hides and re-shows entries", async ({ page }) => {
    const vault = await makeTempVault({ fixture: "with_links" });
    await page.goto("/");
    await clearLocalStorage(page);
    await setVaultPath(page, vault.path);
    await expect(page.getByTestId("explorer-tree")).toBeVisible();

    await page.getByTestId("explorer-tree").getByText("a.md").first().click();

    const recentsHeader = page.getByRole("button", { name: "Recents" });
    await expect(recentsHeader).toBeVisible();
    const aRecent = page.locator('button[title="a.md"]');
    await expect(aRecent).toBeVisible();

    // Click collapses.
    await recentsHeader.click();
    await expect(aRecent).toHaveCount(0);

    // Click again expands.
    await recentsHeader.click();
    await expect(aRecent).toBeVisible();

    await vault.cleanup();
  });

  test("EXPL-2.9-02: unsaved group hidden when no files are dirty", async ({ page }) => {
    const vault = await makeTempVault({ fixture: "with_links" });
    await page.goto("/");
    await clearLocalStorage(page);
    await setVaultPath(page, vault.path);
    await expect(page.getByTestId("explorer-tree")).toBeVisible();

    await page.getByTestId("explorer-tree").getByText("a.md").first().click();

    // No edit was made → dirty set is empty → header not rendered.
    await expect(page.getByText("Unsaved changes", { exact: true })).toHaveCount(0);

    await vault.cleanup();
  });

  test("EXPL-2.9-03: clicking an Unsaved entry opens the file", async ({ page }) => {
    const vault = await makeTempVault({ fixture: "with_links" });
    await page.goto("/");
    await clearLocalStorage(page);

    // Seed a document draft for b.md BEFORE setVaultPath's reload so the
    // mount-time `listDrafts()` picks it up. The dirty set is derived
    // from any localStorage key prefixed `knowledge-base-draft:` — see
    // src/app/knowledge_base/shared/utils/persistence.ts:listDrafts.
    await page.evaluate(
      ({ prefix, path }) => {
        const payload = JSON.stringify({
          kind: "document",
          content: "# B (edited)\n\n[[a]] modified",
          savedAt: Date.now(),
        });
        localStorage.setItem(prefix + path, payload);
      },
      { prefix: DRAFT_PREFIX, path: "b.md" },
    );

    await setVaultPath(page, vault.path);
    await expect(page.getByTestId("explorer-tree")).toBeVisible();

    // Unsaved header now visible — and a row for b.md inside it.
    await expect(page.getByText("Unsaved changes", { exact: true })).toBeVisible();
    const unsavedRow = page.locator('button[title="b.md"]').filter({ hasText: "b.md" });
    await expect(unsavedRow).toBeVisible();

    // Click the unsaved row → b.md becomes the active pane file (the
    // explorer's tree row gets `bg-blue-50` for the active leftPaneFile).
    await unsavedRow.click();

    // Robust assertion: the explorer-tree's b.md row has the active-file
    // highlight class set when leftPaneFile === "b.md".
    const treeBRow = page.getByTestId("explorer-tree").getByText("b.md").first();
    await expect(treeBRow).toBeVisible();
    // Walk up to the row's button container; ExplorerPanel applies
    // `bg-blue-50` on the row when leftPaneFile === path.
    const activeBg = await treeBRow.evaluate((el) => {
      let n: HTMLElement | null = el;
      while (n && !n.className.includes("bg-blue-50") && !n.className.includes("from-blue-50")) {
        n = n.parentElement;
      }
      return Boolean(n);
    });
    expect(activeBg).toBe(true);

    await vault.cleanup();
  });
});
