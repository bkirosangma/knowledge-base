import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("alphaTabAssets", () => {
  const originalEnv = process.env.NEXT_PUBLIC_BASE_PATH;

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.NEXT_PUBLIC_BASE_PATH;
    else process.env.NEXT_PUBLIC_BASE_PATH = originalEnv;
    vi.resetModules();
  });

  it("returns root-relative paths when NEXT_PUBLIC_BASE_PATH is empty", async () => {
    delete process.env.NEXT_PUBLIC_BASE_PATH;
    vi.resetModules();
    const mod = await import("./alphaTabAssets");
    expect(mod.SOUNDFONT_URL).toBe("/soundfonts/sonivox.sf2");
    expect(mod.FONT_DIRECTORY).toBe("/font/");
  });

  it("prefixes assets with NEXT_PUBLIC_BASE_PATH on GitHub Pages", async () => {
    process.env.NEXT_PUBLIC_BASE_PATH = "/knowledge-base";
    vi.resetModules();
    const mod = await import("./alphaTabAssets");
    expect(mod.SOUNDFONT_URL).toBe("/knowledge-base/soundfonts/sonivox.sf2");
    expect(mod.FONT_DIRECTORY).toBe("/knowledge-base/font/");
  });

  it("FONT_DIRECTORY ends with a trailing slash so AlphaTab can append filenames", async () => {
    delete process.env.NEXT_PUBLIC_BASE_PATH;
    vi.resetModules();
    const { FONT_DIRECTORY } = await import("./alphaTabAssets");
    expect(FONT_DIRECTORY.endsWith("/")).toBe(true);
  });
});
