/**
 * Unit tests for `svgRefsRepoTauri` — Tauri implementation of SvgRefsRepository
 * with sidecar at `<svg-path>.refs.json`.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  readJson: vi.fn(),
  writeJson: vi.fn(),
  exists: vi.fn(),
}));

vi.mock("./tauriBridge", () => ({ tauriBridge: bridge }));

import { createSvgRefsRepositoryTauri } from "./svgRefsRepoTauri";
import type { SvgRefsPayload } from "../domain/svgRefs";

describe("svgRefsRepoTauri", () => {
  afterEach(() => {
    bridge.readJson.mockReset();
    bridge.writeJson.mockReset();
    bridge.exists.mockReset();
  });

  describe("read", () => {
    it("returns null when sidecar does not exist", async () => {
      const repo = createSvgRefsRepositoryTauri();
      bridge.exists.mockResolvedValue(false);

      const result = await repo.read("vault/diagram.svg");

      expect(result).toBeNull();
      expect(bridge.exists).toHaveBeenCalledWith("vault/diagram.svg.refs.json");
    });

    it("reads and returns payload from sidecar when it exists", async () => {
      const repo = createSvgRefsRepositoryTauri();
      const payload: SvgRefsPayload = {
        version: 1,
        sources: [
          {
            url: "https://example.com/doc",
            title: "Example Doc",
          },
        ],
      };

      bridge.exists.mockResolvedValue(true);
      bridge.readJson.mockResolvedValue(payload);

      const result = await repo.read("vault/diagram.svg");

      expect(result).toEqual(payload);
      expect(bridge.exists).toHaveBeenCalledWith("vault/diagram.svg.refs.json");
      expect(bridge.readJson).toHaveBeenCalledWith("vault/diagram.svg.refs.json");
    });

    it("constructs sidecar path by appending .refs.json to svg path", async () => {
      const repo = createSvgRefsRepositoryTauri();
      bridge.exists.mockResolvedValue(false);

      await repo.read("path/to/my-file.svg");

      expect(bridge.exists).toHaveBeenCalledWith("path/to/my-file.svg.refs.json");
    });

    it("handles empty payload (version only, no sources or attachedTo)", async () => {
      const repo = createSvgRefsRepositoryTauri();
      const payload: SvgRefsPayload = { version: 1 };

      bridge.exists.mockResolvedValue(true);
      bridge.readJson.mockResolvedValue(payload);

      const result = await repo.read("vault/svg.svg");

      expect(result).toEqual(payload);
    });
  });

  describe("write", () => {
    it("writes payload to sidecar JSON file", async () => {
      const repo = createSvgRefsRepositoryTauri();
      const payload: SvgRefsPayload = {
        version: 1,
        sources: [
          {
            url: "https://example.com",
            title: "Source",
          },
        ],
      };

      await repo.write("vault/diagram.svg", payload);

      expect(bridge.writeJson).toHaveBeenCalledWith("vault/diagram.svg.refs.json", payload);
    });

    it("constructs correct sidecar path for write", async () => {
      const repo = createSvgRefsRepositoryTauri();
      const payload: SvgRefsPayload = { version: 1 };

      await repo.write("path/to/my-file.svg", payload);

      expect(bridge.writeJson).toHaveBeenCalledWith("path/to/my-file.svg.refs.json", payload);
    });

    it("writes empty payload (lazy creation only when user adds data)", async () => {
      const repo = createSvgRefsRepositoryTauri();
      const payload: SvgRefsPayload = { version: 1 };

      await repo.write("vault/svg.svg", payload);

      expect(bridge.writeJson).toHaveBeenCalledWith("vault/svg.svg.refs.json", payload);
    });

    it("writes payload with both sources and attachedTo", async () => {
      const repo = createSvgRefsRepositoryTauri();
      const payload: SvgRefsPayload = {
        version: 1,
        sources: [
          {
            url: "https://example.com",
            title: "Doc",
          },
        ],
        attachedTo: [
          {
            type: "node",
            id: "abc123",
            documentPath: "placeholder.md",
          },
        ],
      };

      await repo.write("vault/diagram.svg", payload);

      expect(bridge.writeJson).toHaveBeenCalledWith("vault/diagram.svg.refs.json", payload);
    });
  });
});
