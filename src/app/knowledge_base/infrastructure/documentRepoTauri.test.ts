import { afterEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  readText: vi.fn(),
  writeText: vi.fn(),
}));
vi.mock("./tauriBridge", () => ({ tauriBridge: bridge }));

import { createDocumentRepositoryTauri } from "./documentRepoTauri";

describe("documentRepoTauri", () => {
  afterEach(() => {
    bridge.readText.mockReset();
    bridge.writeText.mockReset();
  });

  it("read forwards to tauriBridge.readText", async () => {
    bridge.readText.mockResolvedValue("content");
    const repo = createDocumentRepositoryTauri();
    const got = await repo.read("docs/topic.md");
    expect(bridge.readText).toHaveBeenCalledWith("docs/topic.md");
    expect(got).toBe("content");
  });

  it("write forwards to tauriBridge.writeText", async () => {
    bridge.writeText.mockResolvedValue(undefined);
    const repo = createDocumentRepositoryTauri();
    await repo.write("docs/topic.md", "x");
    expect(bridge.writeText).toHaveBeenCalledWith("docs/topic.md", "x");
  });
});
