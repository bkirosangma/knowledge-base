/**
 * Unit tests for `tabRefsRepoTauri` — Tauri implementation of TabRefsRepository
 * with sidecar at `<tab-path>.refs.json`.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  readJson: vi.fn(),
  writeJson: vi.fn(),
  exists: vi.fn(),
}));

vi.mock("./tauriBridge", () => ({ tauriBridge: bridge }));

import { createTabRefsRepositoryTauri } from "./tabRefsRepoTauri";
import type { TabRefsPayload } from "../domain/tabRefs";

describe("tabRefsRepoTauri", () => {
  afterEach(() => {
    bridge.readJson.mockReset();
    bridge.writeJson.mockReset();
    bridge.exists.mockReset();
  });

  describe("read", () => {
    it("returns null when sidecar does not exist", async () => {
      const repo = createTabRefsRepositoryTauri();
      bridge.exists.mockResolvedValue(false);

      const result = await repo.read("vault/song.alphatex");

      expect(result).toBeNull();
      expect(bridge.exists).toHaveBeenCalledWith("vault/song.alphatex.refs.json");
    });

    it("reads and returns payload from sidecar when it exists", async () => {
      const repo = createTabRefsRepositoryTauri();
      const payload: TabRefsPayload = {
        version: 3,
        sectionRefs: { "sec-1": "Intro" },
        trackRefs: [
          {
            id: "track-1",
            name: "Guitar",
          },
        ],
      };

      bridge.exists.mockResolvedValue(true);
      bridge.readJson.mockResolvedValue(payload);

      const result = await repo.read("vault/song.alphatex");

      expect(result).toEqual(payload);
      expect(bridge.exists).toHaveBeenCalledWith("vault/song.alphatex.refs.json");
      expect(bridge.readJson).toHaveBeenCalledWith("vault/song.alphatex.refs.json");
    });

    it("constructs sidecar path by appending .refs.json to tab path", async () => {
      const repo = createTabRefsRepositoryTauri();
      bridge.exists.mockResolvedValue(false);

      await repo.read("path/to/my-song.alphatex");

      expect(bridge.exists).toHaveBeenCalledWith(
        "path/to/my-song.alphatex.refs.json",
      );
    });

    it("handles empty payload (version only, no sections, no tracks)", async () => {
      const repo = createTabRefsRepositoryTauri();
      const payload: TabRefsPayload = {
        version: 3,
        sectionRefs: {},
        trackRefs: [],
      };

      bridge.exists.mockResolvedValue(true);
      bridge.readJson.mockResolvedValue(payload);

      const result = await repo.read("vault/song.alphatex");

      expect(result).toEqual(payload);
    });

    it("handles payload with sources", async () => {
      const repo = createTabRefsRepositoryTauri();
      const payload: TabRefsPayload = {
        version: 3,
        sectionRefs: {},
        trackRefs: [],
        sources: [
          {
            url: "https://example.com/tab",
            title: "Tab Source",
          },
        ],
      };

      bridge.exists.mockResolvedValue(true);
      bridge.readJson.mockResolvedValue(payload);

      const result = await repo.read("vault/song.alphatex");

      expect(result).toEqual(payload);
      expect(result?.sources).toHaveLength(1);
    });

    it("handles payload with attachedTo", async () => {
      const repo = createTabRefsRepositoryTauri();
      const payload: TabRefsPayload = {
        version: 3,
        sectionRefs: {},
        trackRefs: [],
        attachedTo: [
          {
            type: "node",
            id: "abc123",
            documentPath: "placeholder.md",
          },
        ],
      };

      bridge.exists.mockResolvedValue(true);
      bridge.readJson.mockResolvedValue(payload);

      const result = await repo.read("vault/song.alphatex");

      expect(result).toEqual(payload);
      expect(result?.attachedTo).toHaveLength(1);
    });
  });

  describe("write", () => {
    it("writes payload to sidecar JSON file", async () => {
      const repo = createTabRefsRepositoryTauri();
      const payload: TabRefsPayload = {
        version: 3,
        sectionRefs: { "sec-1": "Intro" },
        trackRefs: [
          {
            id: "track-1",
            name: "Guitar",
          },
        ],
      };

      await repo.write("vault/song.alphatex", payload);

      expect(bridge.writeJson).toHaveBeenCalledWith(
        "vault/song.alphatex.refs.json",
        payload,
      );
    });

    it("constructs correct sidecar path for write", async () => {
      const repo = createTabRefsRepositoryTauri();
      const payload: TabRefsPayload = {
        version: 3,
        sectionRefs: {},
        trackRefs: [],
      };

      await repo.write("path/to/my-song.alphatex", payload);

      expect(bridge.writeJson).toHaveBeenCalledWith(
        "path/to/my-song.alphatex.refs.json",
        payload,
      );
    });

    it("writes empty payload (lazy creation only when user adds data)", async () => {
      const repo = createTabRefsRepositoryTauri();
      const payload: TabRefsPayload = {
        version: 3,
        sectionRefs: {},
        trackRefs: [],
      };

      await repo.write("vault/song.alphatex", payload);

      expect(bridge.writeJson).toHaveBeenCalledWith(
        "vault/song.alphatex.refs.json",
        payload,
      );
    });

    it("writes payload with sectionRefs and trackRefs", async () => {
      const repo = createTabRefsRepositoryTauri();
      const payload: TabRefsPayload = {
        version: 3,
        sectionRefs: {
          "sec-1": "Intro",
          "sec-2": "Verse",
          "sec-3": "Chorus",
        },
        trackRefs: [
          {
            id: "track-1",
            name: "Guitar",
          },
          {
            id: "track-2",
            name: "Bass",
          },
        ],
      };

      await repo.write("vault/song.alphatex", payload);

      expect(bridge.writeJson).toHaveBeenCalledWith(
        "vault/song.alphatex.refs.json",
        payload,
      );
    });

    it("writes payload with sources and attachedTo", async () => {
      const repo = createTabRefsRepositoryTauri();
      const payload: TabRefsPayload = {
        version: 3,
        sectionRefs: {},
        trackRefs: [],
        sources: [
          {
            url: "https://example.com/tab",
            title: "Tab",
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

      await repo.write("vault/song.alphatex", payload);

      expect(bridge.writeJson).toHaveBeenCalledWith(
        "vault/song.alphatex.refs.json",
        payload,
      );
    });
  });
});
