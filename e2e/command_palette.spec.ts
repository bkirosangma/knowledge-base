import { test, expect, type Page } from "@playwright/test";
import { makeTempVault } from "./helpers/tempVault";
import { setVaultPath, installShim } from "./helpers/launchApp";

const PLACEHOLDER = "Search the vault, or > for commands…";

async function openPaletteViaTrigger(page: Page) {
  await page.getByTestId("command-palette-trigger").click();
  await expect(
    page.getByRole("dialog", { name: "Command Palette" }),
  ).toBeVisible({ timeout: 3000 });
}

test.describe("Command Palette (SHELL-1.11)", () => {
  test.beforeEach(async ({ page }) => {
    await installShim(page);
  });

  test("SHELL-1.11-06: backdrop click closes palette", async ({ page }) => {
    const vault = await makeTempVault({ fixture: "with_links" });
    await page.goto("/");
    await setVaultPath(page, vault.path);
    await expect(page.locator('[data-testid="knowledge-base"]')).toBeVisible();

    await openPaletteViaTrigger(page);

    // The dialog div is the full-viewport backdrop (`fixed inset-0`).
    // Clicking near the bottom-left corner falls on the backdrop, not
    // on the inner panel (which is centred at top: 20vh, max-w: 560px).
    // The component uses `onMouseDown` with `e.target === e.currentTarget`
    // to gate the close, so dispatch via mouse:down + up at a safe coord.
    const dialog = page.getByRole("dialog", { name: "Command Palette" });
    const box = await dialog.boundingBox();
    if (!box) throw new Error("dialog has no box");
    await page.mouse.move(box.x + 5, box.y + box.height - 5);
    await page.mouse.down();
    await page.mouse.up();

    await expect(dialog).not.toBeVisible({ timeout: 3000 });

    await vault.cleanup();
  });

  test("SHELL-1.11-07: ↑/↓ navigate rows (clamps at boundaries)", async ({ page }) => {
    const vault = await makeTempVault({ fixture: "with_links" });
    await page.goto("/");
    await setVaultPath(page, vault.path);
    await expect(page.locator('[data-testid="knowledge-base"]')).toBeVisible();

    // Open a document so at least the global commands have an active
    // pane (the document Toggle entry registers when a doc is open).
    await page.getByTestId("explorer-tree").getByRole("treeitem", { name: /^a\.md/ }).click();

    await openPaletteViaTrigger(page);

    await page.getByPlaceholder(PLACEHOLDER).fill(">Toggle");

    // Wait for the command listbox to populate.
    const options = page.locator('[role="option"]');
    await expect(options.first()).toBeVisible({ timeout: 3000 });

    const count = await options.count();
    expect(count).toBeGreaterThanOrEqual(2);

    // First row is active by default.
    await expect(options.nth(0)).toHaveAttribute("aria-selected", "true");

    // ArrowDown moves to second row.
    await page.keyboard.press("ArrowDown");
    await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
    await expect(options.nth(0)).toHaveAttribute("aria-selected", "false");

    // ArrowUp returns to the first.
    await page.keyboard.press("ArrowUp");
    await expect(options.nth(0)).toHaveAttribute("aria-selected", "true");

    // ArrowUp from first clamps at first (production code uses
    // Math.max(i - 1, 0); see CommandPalette.tsx ~line 136). Boundary
    // does NOT wrap — the case-line note records this.
    await page.keyboard.press("ArrowUp");
    await expect(options.nth(0)).toHaveAttribute("aria-selected", "true");

    // ArrowDown to the last row, then ArrowDown again clamps at last
    // (Math.min(i + 1, totalItems - 1)).
    for (let i = 0; i < count - 1; i++) {
      await page.keyboard.press("ArrowDown");
    }
    await expect(options.nth(count - 1)).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowDown");
    await expect(options.nth(count - 1)).toHaveAttribute("aria-selected", "true");

    await vault.cleanup();
  });

  test("SHELL-1.11-10: ⌘K blocked inside contenteditable", async ({ page }) => {
    const vault = await makeTempVault({ fixture: "with_links" });
    await page.goto("/");
    await setVaultPath(page, vault.path);
    await expect(page.locator('[data-testid="knowledge-base"]')).toBeVisible();

    // Open a.md as a document so a Tiptap ProseMirror editor mounts.
    await page.getByTestId("explorer-tree").getByRole("treeitem", { name: /^a\.md/ }).click();
    const editor = page.locator(".ProseMirror").first();
    await expect(editor).toBeVisible({ timeout: 5000 });

    // Documents default to read-only (useReadOnlyState defaults true).
    // The contenteditable=false in read mode would let ⌘K through, so
    // flip to edit mode first via the pane-header Read Mode toggle.
    //
    // PaneHeader's aria-label flips with the readOnly state:
    //   readOnly=true  → "Exit Read Mode" (click to enter edit mode)
    //   readOnly=false → "Enter Read Mode" (click to enter read mode)
    const exitReadBtn = page.getByRole("button", { name: "Exit Read Mode" });
    if (await exitReadBtn.isVisible().catch(() => false)) {
      await exitReadBtn.click();
    }
    await expect(editor).toHaveAttribute("contenteditable", "true", {
      timeout: 3000,
    });

    // Click into the editor body so document.activeElement.isContentEditable
    // is true. The global ⌘K handler at knowledgeBase.tsx ~line 754 returns
    // early when the active element is INPUT, TEXTAREA, or contenteditable.
    await editor.click();

    await page.keyboard.press("Meta+k");

    // Palette must NOT open.
    await expect(
      page.getByRole("dialog", { name: "Command Palette" }),
    ).toHaveCount(0);

    await vault.cleanup();
  });

  test("SHELL-1.11-11: diagram commands absent when no diagram open", async ({ page }) => {
    const vault = await makeTempVault({ fixture: "with_links" });
    await page.goto("/");
    await setVaultPath(page, vault.path);
    await expect(page.locator('[data-testid="knowledge-base"]')).toBeVisible();

    // Open `a.md` (document only). The `with_links` fixture has no
    // diagrams, so the diagram-scoped commands (registered by the
    // diagram canvas's useKeyboardShortcuts hook) never enter the
    // registry.
    await page.getByTestId("explorer-tree").getByRole("treeitem", { name: /^a\.md/ }).click();
    await expect(page.locator('.ProseMirror').first()).toBeVisible({ timeout: 5000 });

    await openPaletteViaTrigger(page);

    // "Delete Selected" is a diagram-only command — must be absent.
    await page.getByPlaceholder(PLACEHOLDER).fill(">Delete Selected");
    await expect(page.getByText("No matching commands")).toBeVisible();

    // "Toggle Read / Edit Mode" should resolve only the document
    // entry (group "Document"), not the diagram entry.
    await page.getByPlaceholder(PLACEHOLDER).fill(">Toggle Read");
    await expect(page.getByText("Toggle Read / Edit Mode").first()).toBeVisible({
      timeout: 3000,
    });
    // The Document group label is rendered above the Toggle entry.
    await expect(
      page.locator('[role="group"][aria-label="Document"]'),
    ).toBeVisible();
    // The Diagram group must be absent.
    await expect(
      page.locator('[role="group"][aria-label="Diagram"]'),
    ).toHaveCount(0);

    await vault.cleanup();
  });

  test("SHELL-1.11-14: `when` guard hides Delete Selected when nothing selected", async ({ page }) => {
    // Seed a fresh empty diagram into the vault and re-set the vault
    // root so the explorer rescan picks it up. Diagrams are detected
    // via `.json` extension in fileTree.ts (`.kbjson` is treated as an
    // attachment and filtered out of the tree).
    const vault = await makeTempVault({ fixture: "with_links" });
    const TEST_SERVER_URL =
      process.env.KB_TEST_SERVER_URL ?? "http://localhost:1421";
    // Set the test_server's vault root to the new temp vault BEFORE
    // writing — vault_write_json writes relative to whatever root is
    // currently set (which may be a stale path from the previous spec).
    const setRes = await fetch(`${TEST_SERVER_URL}/invoke`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        cmd: "vault_set_root",
        args: { path: vault.path },
      }),
    });
    if (!setRes.ok) {
      throw new Error(`set_root failed: ${await setRes.text()}`);
    }
    const seedRes = await fetch(`${TEST_SERVER_URL}/invoke`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        cmd: "vault_write_json",
        args: {
          path: "diagram.json",
          value: {
            // Mirror createEmptyDiagram() in
            // shared/utils/persistence.ts so loadDiagramFromData
            // doesn't classify the file as malformed.
            title: "diagram",
            layers: [],
            nodes: [],
            connections: [],
            layerManualSizes: {},
            lineCurve: "orthogonal",
            flows: [],
          },
        },
      }),
    });
    if (!seedRes.ok) {
      throw new Error(`seed write failed: ${await seedRes.text()}`);
    }

    await page.goto("/");
    await setVaultPath(page, vault.path);
    await expect(page.locator('[data-testid="knowledge-base"]')).toBeVisible();

    const tree = page.getByTestId("explorer-tree");
    await expect(tree).toBeVisible();

    const diagramRow = tree.getByText(/^diagram\.json$/).first();
    await expect(diagramRow).toBeVisible({ timeout: 5000 });
    await diagramRow.click();

    // Wait for diagram canvas to mount (DiagramCanvas roots its own
    // testid; there is no `data-pane-content="diagram"` on the pane
    // itself).
    await expect(page.locator('[data-testid="diagram-canvas-root"]')).toBeVisible({
      timeout: 5000,
    });

    await openPaletteViaTrigger(page);

    await page.getByPlaceholder(PLACEHOLDER).fill(">Delete Selected");
    // The `when` guard hides the entry — listbox renders the
    // "No matching commands" placeholder.
    await expect(page.getByText("No matching commands")).toBeVisible({
      timeout: 3000,
    });

    await vault.cleanup();
  });

  test("SHELL-1.11-13: document Toggle Read / Edit command present when doc open", async ({ page }) => {
    const vault = await makeTempVault({ fixture: "with_links" });
    await page.goto("/");
    await setVaultPath(page, vault.path);
    await expect(page.locator('[data-testid="knowledge-base"]')).toBeVisible();

    await page.getByTestId("explorer-tree").getByRole("treeitem", { name: /^a\.md/ }).click();
    await expect(page.locator('.ProseMirror').first()).toBeVisible({ timeout: 5000 });

    await openPaletteViaTrigger(page);

    await page.getByPlaceholder(PLACEHOLDER).fill(">Toggle Read");
    await expect(
      page.locator('[role="group"][aria-label="Document"]'),
    ).toBeVisible({ timeout: 3000 });
    await expect(
      page
        .locator('[role="group"][aria-label="Document"]')
        .getByText("Toggle Read / Edit Mode"),
    ).toBeVisible();

    await vault.cleanup();
  });
});
