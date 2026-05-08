import { afterEach, describe, expect, it, vi } from "vitest";

import { FileSystemError } from "../domain/errors";

const bridge = vi.hoisted(() => ({
  exists: vi.fn(),
  readJson: vi.fn(),
  writeJson: vi.fn(),
  readText: vi.fn(),
}));
vi.mock("./tauriBridge", () => ({ tauriBridge: bridge }));

import { createLinkIndexRepositoryTauri } from "./linkIndexRepoTauri";

const STORE = ".archdesigner/_links.json";

describe("linkIndexRepoTauri", () => {
  afterEach(() => {
    bridge.exists.mockReset();
    bridge.readJson.mockReset();
    bridge.writeJson.mockReset();
    bridge.readText.mockReset();
  });

  describe("load()", () => {
    it("throws FileSystemError with kind 'not-found' if the file does not exist", async () => {
      bridge.exists.mockResolvedValue(false);

      const repo = createLinkIndexRepositoryTauri();

      const err = await repo.load().catch((e) => e);
      expect(err).toBeInstanceOf(FileSystemError);
      expect(err.kind).toBe("not-found");
    });

    it("loads a valid LinkIndex with documents and backlinks", async () => {
      const validIndex = {
        documents: {
          "doc1.md": { outbound: ["doc2.md"], inbound: [], mtime: 1000 },
        },
        backlinks: {
          "doc2.md": ["doc1.md"],
        },
        updatedAt: "2026-05-08T00:00:00Z",
      };

      bridge.exists.mockResolvedValue(true);
      bridge.readJson.mockResolvedValue(validIndex);

      const repo = createLinkIndexRepositoryTauri();
      const result = await repo.load();

      expect(result).toEqual(validIndex);
      expect(bridge.exists).toHaveBeenCalledWith(STORE);
      expect(bridge.readJson).toHaveBeenCalledWith(STORE);
    });

    it("throws FileSystemError with kind 'malformed' if documents field is missing", async () => {
      bridge.exists.mockResolvedValue(true);
      bridge.readJson.mockResolvedValue({
        backlinks: {},
        updatedAt: "2026-05-08T00:00:00Z",
      });

      const repo = createLinkIndexRepositoryTauri();
      const err = await repo.load().catch((e) => e);
      expect(err).toBeInstanceOf(FileSystemError);
      expect(err.kind).toBe("malformed");
    });

    it("throws FileSystemError with kind 'malformed' if backlinks field is missing", async () => {
      bridge.exists.mockResolvedValue(true);
      bridge.readJson.mockResolvedValue({
        documents: {},
        updatedAt: "2026-05-08T00:00:00Z",
      });

      const repo = createLinkIndexRepositoryTauri();
      const err = await repo.load().catch((e) => e);
      expect(err).toBeInstanceOf(FileSystemError);
      expect(err.kind).toBe("malformed");
    });

    it("throws FileSystemError with kind 'malformed' if the parsed JSON is null", async () => {
      bridge.exists.mockResolvedValue(true);
      bridge.readJson.mockResolvedValue(null);

      const repo = createLinkIndexRepositoryTauri();
      const err = await repo.load().catch((e) => e);
      expect(err).toBeInstanceOf(FileSystemError);
      expect(err.kind).toBe("malformed");
    });
  });

  describe("save()", () => {
    it("stamps updatedAt and writes to the store", async () => {
      bridge.writeJson.mockResolvedValue(undefined);

      const repo = createLinkIndexRepositoryTauri();
      const index = {
        updatedAt: '',
        documents: { "doc1.md": { outboundLinks: [], sectionLinks: [], headers: [] } },
        backlinks: {},
      };

      const beforeTime = new Date();
      await repo.save(index);
      const afterTime = new Date();

      expect(bridge.writeJson).toHaveBeenCalledOnce();
      const [path, written] = bridge.writeJson.mock.calls[0] as [
        string,
        { updatedAt: string; documents: unknown; backlinks: unknown },
      ];
      expect(path).toBe(STORE);
      expect(written).toHaveProperty("updatedAt");
      expect(written.documents).toEqual(index.documents);
      expect(written.backlinks).toEqual(index.backlinks);

      const writtenTime = new Date(written.updatedAt);
      expect(writtenTime.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(writtenTime.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });

    it("propagates errors from tauriBridge.writeJson", async () => {
      bridge.writeJson.mockRejectedValue(new Error("write failed"));

      const repo = createLinkIndexRepositoryTauri();
      await expect(
        repo.save({ updatedAt: '', documents: {}, backlinks: {} }),
      ).rejects.toThrow("write failed");
    });
  });

  describe("readDocContent()", () => {
    it("reads and returns document content by path", async () => {
      const content = "# My Document\n\nSome content here.";
      bridge.readText.mockResolvedValue(content);

      const repo = createLinkIndexRepositoryTauri();
      const result = await repo.readDocContent("docs/example.md");

      expect(result).toBe(content);
      expect(bridge.readText).toHaveBeenCalledWith("docs/example.md");
    });

    it("works with nested paths", async () => {
      bridge.readText.mockResolvedValue("diagram content");

      const repo = createLinkIndexRepositoryTauri();
      await repo.readDocContent("diagrams/folder/my-diagram.json");

      expect(bridge.readText).toHaveBeenCalledWith(
        "diagrams/folder/my-diagram.json",
      );
    });

    it("propagates errors from tauriBridge.readText", async () => {
      bridge.readText.mockRejectedValue(new Error("read failed"));

      const repo = createLinkIndexRepositoryTauri();
      await expect(repo.readDocContent("missing.md")).rejects.toThrow(
        "read failed",
      );
    });
  });
});
