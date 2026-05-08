import { describe, it, expect, vi, beforeEach } from "vitest";
import { FileSystemError } from "../domain/errors";
import { createLinkIndexRepositoryTauri } from "./linkIndexRepoTauri";

// Mock tauriBridge at module load time via hoisted vi.mock.
vi.mock("./tauriBridge", () => ({
  tauriBridge: {
    exists: vi.fn(),
    readJson: vi.fn(),
    writeJson: vi.fn(),
    readText: vi.fn(),
  },
}));

// Import after mock is set up.
import { tauriBridge } from "./tauriBridge";

describe("linkIndexRepoTauri", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("load()", () => {
    it("throws FileSystemError with kind 'not-found' if the file does not exist", async () => {
      vi.mocked(tauriBridge.exists).mockResolvedValue(false);

      const repo = createLinkIndexRepositoryTauri();

      await expect(repo.load()).rejects.toThrow(FileSystemError);
      const err = await repo.load().catch((e) => e);
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

      vi.mocked(tauriBridge.exists).mockResolvedValue(true);
      vi.mocked(tauriBridge.readJson).mockResolvedValue(validIndex);

      const repo = createLinkIndexRepositoryTauri();
      const result = await repo.load();

      expect(result).toEqual(validIndex);
      expect(vi.mocked(tauriBridge.exists)).toHaveBeenCalledWith(".archdesigner/_links.json");
      expect(vi.mocked(tauriBridge.readJson)).toHaveBeenCalledWith(".archdesigner/_links.json");
    });

    it("throws FileSystemError with kind 'malformed' if documents field is missing", async () => {
      vi.mocked(tauriBridge.exists).mockResolvedValue(true);
      vi.mocked(tauriBridge.readJson).mockResolvedValue({
        backlinks: {},
        updatedAt: "2026-05-08T00:00:00Z",
      });

      const repo = createLinkIndexRepositoryTauri();

      await expect(repo.load()).rejects.toThrow(FileSystemError);
      const err = await repo.load().catch((e) => e);
      expect(err.kind).toBe("malformed");
    });

    it("throws FileSystemError with kind 'malformed' if backlinks field is missing", async () => {
      vi.mocked(tauriBridge.exists).mockResolvedValue(true);
      vi.mocked(tauriBridge.readJson).mockResolvedValue({
        documents: {},
        updatedAt: "2026-05-08T00:00:00Z",
      });

      const repo = createLinkIndexRepositoryTauri();

      await expect(repo.load()).rejects.toThrow(FileSystemError);
      const err = await repo.load().catch((e) => e);
      expect(err.kind).toBe("malformed");
    });

    it("throws FileSystemError with kind 'malformed' if the parsed JSON is null", async () => {
      vi.mocked(tauriBridge.exists).mockResolvedValue(true);
      vi.mocked(tauriBridge.readJson).mockResolvedValue(null);

      const repo = createLinkIndexRepositoryTauri();

      await expect(repo.load()).rejects.toThrow(FileSystemError);
      const err = await repo.load().catch((e) => e);
      expect(err.kind).toBe("malformed");
    });
  });

  describe("save()", () => {
    it("stamps updatedAt and writes to the store", async () => {
      vi.mocked(tauriBridge.writeJson).mockResolvedValue(undefined);

      const repo = createLinkIndexRepositoryTauri();
      const index = {
        documents: { "doc1.md": { outbound: [], inbound: [], mtime: 1000 } },
        backlinks: {},
      };

      const beforeTime = new Date();
      await repo.save(index);
      const afterTime = new Date();

      expect(vi.mocked(tauriBridge.writeJson)).toHaveBeenCalledOnce();
      const [path, written] = vi.mocked(tauriBridge.writeJson).mock.calls[0];
      expect(path).toBe(".archdesigner/_links.json");
      expect(written).toHaveProperty("updatedAt");
      expect(written.documents).toEqual(index.documents);
      expect(written.backlinks).toEqual(index.backlinks);

      const writtenTime = new Date(written.updatedAt);
      expect(writtenTime.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(writtenTime.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });

    it("propagates errors from tauriBridge.writeJson", async () => {
      const testError = new Error("write failed");
      vi.mocked(tauriBridge.writeJson).mockRejectedValue(testError);

      const repo = createLinkIndexRepositoryTauri();
      const index = {
        documents: {},
        backlinks: {},
      };

      await expect(repo.save(index)).rejects.toThrow("write failed");
    });
  });

  describe("readDocContent()", () => {
    it("reads and returns document content by path", async () => {
      const content = "# My Document\n\nSome content here.";
      vi.mocked(tauriBridge.readText).mockResolvedValue(content);

      const repo = createLinkIndexRepositoryTauri();
      const result = await repo.readDocContent("docs/example.md");

      expect(result).toBe(content);
      expect(vi.mocked(tauriBridge.readText)).toHaveBeenCalledWith("docs/example.md");
    });

    it("works with nested paths", async () => {
      const content = "diagram content";
      vi.mocked(tauriBridge.readText).mockResolvedValue(content);

      const repo = createLinkIndexRepositoryTauri();
      await repo.readDocContent("diagrams/folder/my-diagram.json");

      expect(vi.mocked(tauriBridge.readText)).toHaveBeenCalledWith("diagrams/folder/my-diagram.json");
    });

    it("propagates errors from tauriBridge.readText", async () => {
      const testError = new Error("read failed");
      vi.mocked(tauriBridge.readText).mockRejectedValue(testError);

      const repo = createLinkIndexRepositoryTauri();

      await expect(repo.readDocContent("missing.md")).rejects.toThrow("read failed");
    });
  });
});
