import { afterEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  readText: vi.fn(),
  writeText: vi.fn(),
}));
vi.mock("./tauriBridge", () => ({ tauriBridge: bridge }));

import { createTabRepositoryTauri } from "./tabRepoTauri";

describe("tabRepoTauri", () => {
  afterEach(() => {
    bridge.readText.mockReset();
    bridge.writeText.mockReset();
  });

  it("read forwards to tauriBridge.readText", async () => {
    bridge.readText.mockResolvedValue("\\title \"Song\"");
    const repo = createTabRepositoryTauri();
    const got = await repo.read("tabs/song.alphatex");
    expect(bridge.readText).toHaveBeenCalledWith("tabs/song.alphatex");
    expect(got).toBe("\\title \"Song\"");
  });

  it("write forwards to tauriBridge.writeText", async () => {
    bridge.writeText.mockResolvedValue(undefined);
    const repo = createTabRepositoryTauri();
    await repo.write("tabs/song.alphatex", "\\title \"X\"");
    expect(bridge.writeText).toHaveBeenCalledWith(
      "tabs/song.alphatex",
      "\\title \"X\"",
    );
  });

  it("read propagates errors from tauriBridge", async () => {
    bridge.readText.mockRejectedValue(new Error("boom"));
    const repo = createTabRepositoryTauri();
    await expect(repo.read("tabs/song.alphatex")).rejects.toThrow("boom");
  });

  it("write propagates errors from tauriBridge", async () => {
    bridge.writeText.mockRejectedValue(new Error("boom"));
    const repo = createTabRepositoryTauri();
    await expect(repo.write("tabs/song.alphatex", "x")).rejects.toThrow("boom");
  });
});
