// e2e/visual_hover_focus.spec.ts
//
// Theme D — visual / hover / focus-visible Playwright assertions promoted
// out of the MVP-5 deferred set. Each case is independent and uses the
// modern test_server harness (chromium against `next dev`, Tauri invoke
// shimmed to test_server :1421 via installShim).
//
// Cases:
//   SHELL-1.13-06  Visible focus ring on keyboard Tab focus, NOT on click.
//   SHELL-1.16-01  Tab focus on a Tooltip-wrapped button surfaces the bubble.
//   SHELL-1.16-02  Pointer hover surfaces the same bubble.
//   SHELL-1.16-04  Disabled trigger suppresses the bubble.
//   FS-2.3-45      Folder context menu "New ▸" submenu surfaces on hover.
//
// Selector contract:
//   - `[data-testid="command-palette-trigger"]` — Header tooltip-wrapped
//     button. Always present once a vault is loaded; its tooltip label is
//     "Open command palette (⌘K)".
//   - `[data-testid="theme-toggle"]` — Header tooltip-wrapped button.
//     Used as the keyboard-focus target so the assertion doesn't depend
//     on first-tab semantics for the centre column.
//   - `[role="tooltip"]` with text content matching the tooltip's `label`
//     prop — the bubble (`Tooltip.tsx:46`); always present in the DOM,
//     visibility is CSS-driven (`tooltip.css:62-71`).

import { test, expect, type Page } from "@playwright/test";
import { makeTempVault } from "./helpers/tempVault";
import { setVaultPath, installShim } from "./helpers/launchApp";

async function openVault(page: Page, fixture: string): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const vault = await makeTempVault({ fixture });
  await page.goto("/");
  await setVaultPath(page, vault.path);
  await expect(page.locator('[data-testid="knowledge-base"]')).toBeVisible();
  return vault;
}

test.describe("Theme D — visual / hover / focus-visible (Playwright)", () => {
  test.beforeEach(async ({ page }) => {
    await installShim(page);
  });

  test("SHELL-1.13-06: Tab-focusing a button shows a 2px focus-visible ring; mouse click does not", async ({ page }) => {
    const vault = await openVault(page, "with_links");
    const themeToggle = page.getByTestId("theme-toggle");
    await expect(themeToggle).toBeVisible();

    // Programmatically focus the button via real keyboard. `:focus-visible`
    // matches keyboard-driven focus across modern browsers; `el.focus()`
    // alone may bypass the heuristic in some headless modes — see
    // diagramKeyboardNav.spec for the canonical workaround. We use
    // `keyboard.press('Tab')` after seeding focus on the body so the
    // very next focus transition is keyboard-driven.
    await page.evaluate(() => document.body.focus());
    // Walk Tab until the theme toggle is focused. 30 hops is a safe bound;
    // the chrome is shallow.
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press("Tab");
      const focused = await themeToggle.evaluate((el) => el === document.activeElement);
      if (focused) break;
    }
    await expect(themeToggle).toBeFocused();

    // The `*:focus-visible` rule (globals.css:33-36) sets
    //   box-shadow: 0 0 0 2px var(--focus);
    // `--focus` resolves to an rgba colour. Assert the box-shadow contains
    // a 2px spread token — the colour resolves at computed-style time so
    // we don't pin the exact rgba value.
    const tabShadow = await themeToggle.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(tabShadow).toMatch(/\b0(?:px)? 0(?:px)? 0(?:px)? 2px\b/);
    expect(tabShadow).not.toBe("none");

    // Now drop the keyboard-focus state by blurring, then click via mouse:
    // `:focus-visible` should NOT match on a mouse-driven focus transition.
    // Box-shadow drops to "none" (the non-focus-visible baseline — the
    // theme toggle has no other shadow rule).
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
    // A direct click on the same trigger after blur counts as a fresh
    // mouse-driven focus: chromium's heuristic does not treat it as
    // keyboard-driven, so :focus-visible should not match.
    await themeToggle.click();
    const clickShadow = await themeToggle.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(clickShadow).not.toMatch(/\b0(?:px)? 0(?:px)? 0(?:px)? 2px\b/);

    await vault.cleanup();
  });

  test("SHELL-1.16-01: Tab-focusing a Tooltip-wrapped button surfaces the bubble", async ({ page }) => {
    const vault = await openVault(page, "with_links");
    // The header theme toggle is a Tooltip-wrapped button on the right
    // edge of the chrome — Tab-walking reaches it reliably without
    // depending on explorer-tree depth (which can swallow many Tab hops).
    const trigger = page.getByTestId("theme-toggle");
    await expect(trigger).toBeVisible();

    await page.evaluate(() => document.body.focus());
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press("Tab");
      const focused = await trigger.evaluate((el) => el === document.activeElement);
      if (focused) break;
    }
    await expect(trigger).toBeFocused();

    // The `[role="tooltip"]` bubble inside the same `.kb-tooltip` wrapper
    // becomes visible via `:has(:focus-visible)` (tooltip.css:62-65).
    // Locate it via the trigger's `aria-describedby`.
    const tooltipId = await trigger.getAttribute("aria-describedby");
    expect(tooltipId, "trigger should be wired to a tooltip via aria-describedby").toBeTruthy();
    // React-generated useId() values can start with characters that
    // make `#id` CSS selectors invalid; use the attribute selector.
    const bubble = page.locator(`[id="${tooltipId}"]`);
    // Tooltip label resolves to the active theme branch — assert the
    // common substring rather than a specific theme.
    await expect(bubble).toHaveText(/Switch to (light|dark) theme/);
    const visibility = await bubble.evaluate((el) => getComputedStyle(el).visibility);
    const opacity = await bubble.evaluate((el) => parseFloat(getComputedStyle(el).opacity));
    expect(visibility).toBe("visible");
    expect(opacity).toBeGreaterThan(0);

    await vault.cleanup();
  });

  test("SHELL-1.16-02: Pointer hover over a Tooltip-wrapped button surfaces the same bubble", async ({ page }) => {
    const vault = await openVault(page, "with_links");
    const trigger = page.getByTestId("command-palette-trigger");
    await expect(trigger).toBeVisible();

    // Locate the bubble via its `.kb-tooltip` wrapper rather than via
    // React's `useId()`-generated id — wrappers are structural and
    // stable, while id selectors are sensitive to React's id format
    // and to hot-reload churn.
    const wrapper = page.locator(".kb-tooltip", { has: trigger });
    const bubble = wrapper.locator('[role="tooltip"]');
    await expect(bubble).toHaveText("Open command palette (⌘K)");

    // Move focus to the body so the bubble starts hidden — chromium's
    // initial focus can otherwise leave a focus-visible match.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());

    // Baseline: bubble visibility should be hidden before hover.
    await expect.poll(
      async () => bubble.evaluate((el) => getComputedStyle(el).visibility),
    ).toBe("hidden");

    // Hover the trigger; the `.kb-tooltip:hover` rule (tooltip.css:62-65)
    // flips visibility/opacity on the bubble.
    await trigger.hover();
    await expect.poll(
      async () => bubble.evaluate((el) => getComputedStyle(el).visibility),
    ).toBe("visible");
    const opacity = await bubble.evaluate((el) => parseFloat(getComputedStyle(el).opacity));
    expect(opacity).toBeGreaterThan(0);

    await vault.cleanup();
  });

  test("SHELL-1.16-04: Disabled Tooltip-wrapped button suppresses the bubble", async ({ page }) => {
    const vault = await openVault(page, "with_links");

    // Open a doc so the PaneHeader Save/Discard surface mounts; both
    // buttons are wrapped in `<Tooltip>` and `disabled` when the doc is
    // not dirty (PaneHeader.tsx:152-180). We use Discard because it has
    // an explicit `aria-label="Discard changes"` that disambiguates.
    await page
      .getByTestId("explorer-tree")
      .getByRole("treeitem", { name: /^a\.md/ })
      .click();
    const discardBtn = page.getByRole("button", { name: "Discard changes" });
    await expect(discardBtn).toBeVisible();
    await expect(discardBtn).toBeDisabled();

    const tooltipId = await discardBtn.getAttribute("aria-describedby");
    expect(tooltipId, "Discard should still be wired via aria-describedby even when disabled").toBeTruthy();
    // React-generated useId() values can start with characters that
    // make `#id` CSS selectors invalid; use the attribute selector.
    const bubble = page.locator(`[id="${tooltipId}"]`);

    // Hover the disabled trigger. The `.kb-tooltip:has(:disabled)` rule
    // (tooltip.css:70-72) sets the bubble to `display: none` — overrides
    // the hover rule, so it stays hidden.
    await discardBtn.hover();
    const display = await bubble.evaluate((el) => getComputedStyle(el).display);
    expect(display).toBe("none");

    await vault.cleanup();
  });

  test("FS-2.3-45: Right-clicking a folder and hovering 'New' surfaces the Diagram/Document/SVG/Folder submenu", async ({ page }) => {
    const vault = await openVault(page, "with_folders");

    // Right-click the `drawings` folder row. ExplorerPanel.tsx:549 wires
    // onContextMenu on the row to setContextMenu({ type: 'folder', ... }).
    const folderRow = page
      .getByTestId("explorer-tree")
      .getByRole("treeitem", { name: /^drawings/ });
    await expect(folderRow).toBeVisible();
    await folderRow.click({ button: "right" });

    // Folder context menu shows up with a "New" trigger that has a
    // ChevronRight indicator and an `onMouseEnter` listener that opens
    // the submenu (ExplorerPanel.tsx:673-694). The submenu items are
    // "Diagram", "Document", "SVG", "Folder".
    const newTrigger = page.getByRole("button", { name: /^New$/ });
    await expect(newTrigger).toBeVisible();

    // Pre-hover: the submenu items must NOT be visible yet.
    await expect(page.getByRole("button", { name: /^Diagram$/ })).toHaveCount(0);

    await newTrigger.hover();

    // Post-hover: all four items render in the submenu.
    await expect(page.getByRole("button", { name: /^Diagram$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Document$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^SVG$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Folder$/ })).toBeVisible();

    await vault.cleanup();
  });

  test("FS-2.3-49: Right-clicking the empty area below the tree opens the root folder context menu", async ({ page }) => {
    const vault = await openVault(page, "with_links");

    // The scroll container around the tree wires `onContextMenu` (ExplorerPanel.tsx:549)
    // and dispatches a folder-typed context menu with `path=""` whenever the
    // event target isn't inside a `[data-tree-node]`. To hit that branch,
    // right-click below the last visible tree row but still inside the
    // scroll container's bounds.
    const tree = page.getByTestId("explorer-tree");
    await expect(tree).toBeVisible();
    const treeBox = await tree.boundingBox();
    if (!treeBox) throw new Error("explorer-tree has no bounding box");

    // Centre the click horizontally over the tree, but vertically just
    // below the last row. The scroll container extends past the tree's
    // bottom edge — offsetting by a few pixels lands on empty space.
    const x = treeBox.x + treeBox.width / 2;
    const y = treeBox.y + treeBox.height + 24;
    await page.mouse.move(x, y);
    await page.mouse.click(x, y, { button: "right" });

    // Same root menu shape as FS-2.3-45: a "New" trigger that gates the
    // Diagram/Document/SVG/Folder submenu on hover. We assert the trigger
    // is visible — the submenu mechanics are already covered by FS-2.3-45.
    const newTrigger = page.getByRole("button", { name: /^New$/ });
    await expect(newTrigger).toBeVisible();

    await vault.cleanup();
  });
});
