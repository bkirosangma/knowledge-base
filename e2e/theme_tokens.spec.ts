import { test, expect, type Page } from "@playwright/test";
import { makeTempVault } from "./helpers/tempVault";
import { setVaultPath, installShim } from "./helpers/launchApp";

// Theme & token plumbing — Tailwind v4 `@theme inline` resolves
// `text-base` to `var(--text-base) = 15px`, and the `[data-theme="dark"]`
// scope flips active-row backgrounds. Both SHELL-1.13-07 (token resolve)
// and SHELL-1.13-09 (WCAG AA contrast on the active explorer row in
// both themes) ride on the live computed-style assertion.

// WCAG 2.1 relative-luminance + contrast formula.
function luminance(rgb: [number, number, number]): number {
  const lin = rgb.map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function contrastRatio(
  fg: [number, number, number],
  bg: [number, number, number],
): number {
  const lFg = luminance(fg);
  const lBg = luminance(bg);
  const [hi, lo] = lFg > lBg ? [lFg, lBg] : [lBg, lFg];
  return (hi + 0.05) / (lo + 0.05);
}

async function readActiveRowContrast(page: Page): Promise<number> {
  // Locate the active row + label, then resolve every observed colour
  // (text, row bg, surface) into a flat rgba tuple by writing into a
  // 1×1 canvas. Modern browsers return `oklab(…)` from getComputedStyle
  // when the input was an oklab/lch/Tailwind v4 token; canvas roundtrip
  // is the reliable cross-browser way to read the rendered rgba.
  const data = await page.evaluate(() => {
    function rgbaFor(input: string): [number, number, number, number] {
      const c = document.createElement("canvas");
      c.width = 1;
      c.height = 1;
      const ctx = c.getContext("2d");
      if (!ctx) throw new Error("no 2d ctx");
      // Clear with transparent black so partially-translucent inputs
      // composite over a known floor; we only use `imageData` for the
      // text colour where alpha is always 1, and we read the bg's
      // computed colour against transparent so the alpha survives.
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = input;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2], d[3] / 255];
    }

    const tree = document.querySelector('[data-testid="explorer-tree"]');
    if (!tree) throw new Error("no explorer-tree");
    const row = tree.querySelector(
      '[role="treeitem"][aria-selected="true"]',
    );
    if (!row) throw new Error("no active treeitem");
    const label = row.querySelector("span") as HTMLElement | null;
    const target = (label ?? row) as HTMLElement;
    const cs = getComputedStyle(target);

    // Walk up to find the first non-transparent background-color
    // declaration; we want the row's own bg, not body's. The match is
    // on the alpha-bearing computed string — including 0% alpha as a
    // skip — because `bg-blue-50` may resolve via oklab() in dark mode.
    let bgEl: HTMLElement | null = row as HTMLElement;
    let bgRaw = "transparent";
    while (bgEl) {
      const c = getComputedStyle(bgEl).backgroundColor;
      const t = rgbaFor(c);
      if (t[3] > 0.01) {
        bgRaw = c;
        break;
      }
      bgEl = bgEl.parentElement;
    }

    const rootCs = getComputedStyle(document.documentElement);
    const surfaceVar = rootCs.getPropertyValue("--surface").trim();

    return {
      color: rgbaFor(cs.color),
      bg: rgbaFor(bgRaw),
      surface: rgbaFor(surfaceVar || "rgb(255, 255, 255)"),
    };
  });

  // Composite bg over surface on the node side using premultiplied alpha.
  const [r, g, b, a] = data.bg;
  const [sr, sg, sb] = data.surface;
  const composed: [number, number, number] = [
    Math.round(r * a + sr * (1 - a)),
    Math.round(g * a + sg * (1 - a)),
    Math.round(b * a + sb * (1 - a)),
  ];
  const fg: [number, number, number] = [data.color[0], data.color[1], data.color[2]];
  return contrastRatio(fg, composed);
}

test.describe("Theme tokens (SHELL-1.13)", () => {
  test.beforeEach(async ({ page }) => {
    await installShim(page);
  });

  test("SHELL-1.13-07: text-base resolves to 15px through @theme inline", async ({ page }) => {
    const vault = await makeTempVault({ fixture: "with_links" });
    await page.goto("/");
    await setVaultPath(page, vault.path);
    await expect(page.locator('[data-testid="knowledge-base"]')).toBeVisible();

    // Mount a benchmark element with `text-base` and read its computed
    // font-size. `text-base` is locked to 15px via the `@theme inline`
    // block in tokens.css; if Tailwind ever drops to its default 16px,
    // this fires.
    const px = await page.evaluate(() => {
      const el = document.createElement("div");
      el.className = "text-base";
      el.textContent = "benchmark";
      el.style.position = "fixed";
      el.style.top = "-9999px";
      document.body.appendChild(el);
      const fs = getComputedStyle(el).fontSize;
      el.remove();
      return fs;
    });

    expect(px).toBe("15px");

    await vault.cleanup();
  });

  test("SHELL-1.13-09: active explorer row contrast clears WCAG AA in both themes", async ({ page }) => {
    const vault = await makeTempVault({ fixture: "with_links" });
    await page.goto("/");
    await setVaultPath(page, vault.path);

    await expect(page.locator('[data-testid="knowledge-base"]')).toBeVisible();
    const tree = page.getByTestId("explorer-tree");
    await expect(tree).toBeVisible();

    // Click `a.md` to make it the active row in both panes' explorer.
    await tree.getByRole("treeitem", { name: /^a\.md/ }).click();
    await expect(
      tree.locator('[role="treeitem"][aria-selected="true"]'),
    ).toBeVisible({ timeout: 5000 });

    // Light theme is the default — assert AA (4.5:1).
    const lightContrast = await readActiveRowContrast(page);
    expect(lightContrast).toBeGreaterThanOrEqual(4.5);

    // Toggle to dark theme via ⌘⇧L. Click root first to make sure the
    // shortcut isn't swallowed by an editor / explorer search.
    await page.locator('[data-testid="knowledge-base"]').click({
      position: { x: 5, y: 5 },
    });
    await page.keyboard.press("Meta+Shift+l");

    // Wait for the data-theme flip — the root ThemedShell sets
    // [data-testid="knowledge-base"][data-theme=…] on the next paint.
    await expect(page.locator('[data-testid="knowledge-base"]')).toHaveAttribute(
      "data-theme",
      "dark",
      { timeout: 5000 },
    );

    const darkContrast = await readActiveRowContrast(page);
    expect(darkContrast).toBeGreaterThanOrEqual(4.5);

    await vault.cleanup();
  });
});
