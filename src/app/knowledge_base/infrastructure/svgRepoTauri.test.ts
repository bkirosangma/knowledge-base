import { afterEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  readText: vi.fn(),
  writeText: vi.fn(),
}));
vi.mock("./tauriBridge", () => ({ tauriBridge: bridge }));

import { createSVGRepositoryTauri } from "./svgRepoTauri";

describe("svgRepoTauri", () => {
  afterEach(() => {
    bridge.readText.mockReset();
    bridge.writeText.mockReset();
  });

  it("read forwards to tauriBridge.readText", async () => {
    bridge.readText.mockResolvedValue("<svg></svg>");
    const repo = createSVGRepositoryTauri();
    const got = await repo.read("diagrams/architecture.svg");
    expect(bridge.readText).toHaveBeenCalledWith("diagrams/architecture.svg");
    expect(got).toBe("<svg></svg>");
  });

  it("write forwards to tauriBridge.writeText", async () => {
    bridge.writeText.mockResolvedValue(undefined);
    const repo = createSVGRepositoryTauri();
    await repo.write("diagrams/architecture.svg", "<svg></svg>");
    expect(bridge.writeText).toHaveBeenCalledWith(
      "diagrams/architecture.svg",
      "<svg></svg>"
    );
  });
});
