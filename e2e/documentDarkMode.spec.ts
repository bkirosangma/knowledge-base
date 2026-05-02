import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { installMockFS } from "./fixtures/fsMock";

// KB-037 acceptance — axe-core scan of the document pane prose subtree
// in dark mode reports zero `color-contrast` violations. Scoped to
// `.markdown-editor` (the EditorContent wrapper) so deferred sibling
// surfaces — the `DocumentProperties` rail (Features.md §1.13 explicit
// deferral) and the various floating popovers — don't pollute the
// result. Those carry their own `bg-white` and will land in a separate
// ticket that picks up the §1.13 deferred list.

const DOC_BODY = [
  "# Heading One",
  "",
  "## Heading Two",
  "",
  "Body paragraph with a [link](other.md) to another doc.",
  "",
  "Inline `code` and a `var(--mute)` kicker for the language pill.",
  "",
  "```ts",
  "const x = 1;",
  "```",
].join("\n");

const SEED = {
  "note.md": DOC_BODY,
  // Pre-seed vault config with `theme: "dark"` so the first mount lands
  // in dark mode (mirrors SHELL-1.13-03's pattern).
  ".archdesigner/config.json": JSON.stringify({
    version: "1.0",
    name: "vault",
    created: "2026-05-02T00:00:00.000Z",
    lastOpened: "2026-05-02T00:00:00.000Z",
    theme: "dark",
  }),
};

async function setupFs(page: Page, seed: Record<string, string>) {
  await page.addInitScript(installMockFS);
  await page.addInitScript(() => {
    try { indexedDB.deleteDatabase("knowledge-base"); } catch { /* ignore */ }
    try { localStorage.clear(); } catch { /* ignore */ }
  });
  await page.addInitScript((files) => {
    for (const filename of Object.keys(files)) {
      localStorage.setItem(`document-read-only:${filename}`, "false");
    }
  }, seed);
  await page.goto("/");
  await page.locator('[data-testid="knowledge-base"]').waitFor();
  await page.evaluate((files) => {
    const m = (window as unknown as {
      __kbMockFS: { seed: (f: Record<string, string>) => void };
    }).__kbMockFS;
    m.seed(files);
  }, seed);
}

test.describe("Document pane dark-mode contrast (KB-037)", () => {
  test("DOC-4.1-09: axe-core color-contrast clean on document pane in dark", async ({ page }) => {
    await setupFs(page, SEED);
    await page.getByRole("button", { name: "Open Folder" }).click();

    const root = page.locator('[data-testid="knowledge-base"]');
    await expect(root).toHaveAttribute("data-theme", "dark");

    await page.getByText("note.md").first().click();
    await expect(page.locator('[data-pane-content="document"]')).toBeVisible({ timeout: 5000 });
    // Let post-mount effects settle so axe sees a stable subtree.
    await page.waitForTimeout(500);

    const results = await new AxeBuilder({ page })
      .include(".markdown-editor")
      .withRules(["color-contrast"])
      .analyze();

    if (results.violations.length > 0) {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(results.violations, null, 2));
    }
    expect(results.violations).toEqual([]);
  });
});
