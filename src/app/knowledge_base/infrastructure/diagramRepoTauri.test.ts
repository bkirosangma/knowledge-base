import { afterEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  readJson: vi.fn(),
  writeJson: vi.fn(),
}));
vi.mock("./tauriBridge", () => ({ tauriBridge: bridge }));

import { createDiagramRepositoryTauri } from "./diagramRepoTauri";

describe("diagramRepoTauri", () => {
  afterEach(() => {
    bridge.readJson.mockReset();
    bridge.writeJson.mockReset();
  });

  it("read forwards to tauriBridge.readJson", async () => {
    const data = {
      title: "Test Diagram",
      layers: [],
      nodes: [],
      connections: [],
    };
    bridge.readJson.mockResolvedValue(data);
    const repo = createDiagramRepositoryTauri();
    const got = await repo.read("diagrams/x.json");
    expect(bridge.readJson).toHaveBeenCalledWith("diagrams/x.json");
    expect(got).toEqual(data);
  });

  it("read validates shape and throws FileSystemError on malformed data", async () => {
    bridge.readJson.mockResolvedValue({ invalid: "data" });
    const repo = createDiagramRepositoryTauri();
    try {
      await repo.read("diagrams/x.json");
      expect.fail("Should have thrown");
    } catch (e) {
      expect(e).toHaveProperty("name", "FileSystemError");
      expect(e).toHaveProperty("kind", "malformed");
    }
  });

  it("write forwards to tauriBridge.writeJson", async () => {
    bridge.writeJson.mockResolvedValue(undefined);
    const repo = createDiagramRepositoryTauri();
    const data = {
      title: "Test Diagram",
      layers: [],
      nodes: [],
      connections: [],
    };
    await repo.write("diagrams/x.json", data);
    expect(bridge.writeJson).toHaveBeenCalledWith("diagrams/x.json", data);
  });
});
