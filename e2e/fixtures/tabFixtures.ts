/**
 * Shared helpers for guitar-tab e2e tests.
 *
 * `seedTabs` / `readVaultFile` delegate to the in-memory FSA mock that
 * `installMockFS` installs. They must be called AFTER the page has loaded
 * (i.e. after `page.goto()`).
 */
import type { Page } from "@playwright/test";

/** Minimal single-bar tab used in smoke tests. */
export const SMOKE_TAB = '\\title "Smoke"\n.\n:4 0.6 1.6 2.6 3.6 |\n';

/** Two-bar tab for tests that need multiple bars. */
export const TWO_BAR_TAB = '\\title "Two Bar"\n.\n:4 0.6 0.6 0.6 0.6 | :4 5.6 7.6 5.6 0.6 |\n';

/**
 * Seed the in-memory vault with the given files.
 * Must be called after `page.goto()` so the mock is initialised.
 */
export async function seedTabs(page: Page, files: Record<string, string>): Promise<void> {
  await page.evaluate((seedFiles) => {
    const m = (window as unknown as { __kbMockFS?: { seed: (f: Record<string, string>) => void } }).__kbMockFS;
    if (!m) throw new Error("installMockFS must run before seedTabs");
    m.seed(seedFiles);
  }, files);
}

/**
 * Read a file from the in-memory vault; returns undefined if not found.
 * Useful for asserting persisted content after an edit.
 */
export async function readVaultFile(page: Page, path: string): Promise<string | undefined> {
  return page.evaluate((p) => {
    const m = (window as unknown as { __kbMockFS?: { read: (path: string) => string | undefined } }).__kbMockFS;
    return m?.read(p);
  }, path);
}
