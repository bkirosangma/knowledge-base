import { afterEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  readJson: vi.fn(),
  writeJson: vi.fn(),
  exists: vi.fn(),
}));
vi.mock("./tauriBridge", () => ({ tauriBridge: bridge }));

import { createAttachmentLinksRepositoryTauri } from "./attachmentLinksRepoTauri";

const STORE = ".kb/attachment-links.json";

describe("attachmentLinksRepoTauri", () => {
  afterEach(() => {
    bridge.readJson.mockReset();
    bridge.writeJson.mockReset();
    bridge.exists.mockReset();
  });

  it("read returns empty array when file is absent", async () => {
    bridge.exists.mockResolvedValue(false);
    const repo = createAttachmentLinksRepositoryTauri();
    const got = await repo.read();
    expect(bridge.readJson).not.toHaveBeenCalled();
    expect(got).toEqual([]);
  });

  it("read returns existing rows when file is present", async () => {
    const rows = [
      { docPath: "docs/test.md", entityType: "node", entityId: "n1" },
    ];
    bridge.exists.mockResolvedValue(true);
    bridge.readJson.mockResolvedValue(rows);
    const repo = createAttachmentLinksRepositoryTauri();
    const got = await repo.read();
    expect(bridge.readJson).toHaveBeenCalledWith(STORE);
    expect(got).toEqual(rows);
  });

  it("read throws FileSystemError when data is not an array", async () => {
    bridge.exists.mockResolvedValue(true);
    bridge.readJson.mockResolvedValue({ invalid: "object" });
    const repo = createAttachmentLinksRepositoryTauri();
    try {
      await repo.read();
      expect.fail("Should have thrown");
    } catch (e) {
      expect(e).toHaveProperty("name", "FileSystemError");
      expect(e).toHaveProperty("kind", "malformed");
    }
  });

  it("read throws FileSystemError when array contains invalid shape", async () => {
    bridge.exists.mockResolvedValue(true);
    bridge.readJson.mockResolvedValue([
      { docPath: "docs/test.md", entityType: "node", entityId: "n1" },
      { invalid: "shape" },
    ]);
    const repo = createAttachmentLinksRepositoryTauri();
    try {
      await repo.read();
      expect.fail("Should have thrown");
    } catch (e) {
      expect(e).toHaveProperty("name", "FileSystemError");
      expect(e).toHaveProperty("kind", "malformed");
    }
  });

  it("read throws FileSystemError when entityType is invalid", async () => {
    bridge.exists.mockResolvedValue(true);
    bridge.readJson.mockResolvedValue([
      { docPath: "docs/test.md", entityType: "invalid-type", entityId: "n1" },
    ]);
    const repo = createAttachmentLinksRepositoryTauri();
    try {
      await repo.read();
      expect.fail("Should have thrown");
    } catch (e) {
      expect(e).toHaveProperty("name", "FileSystemError");
      expect(e).toHaveProperty("kind", "malformed");
    }
  });

  it("read throws FileSystemError when docPath is empty string", async () => {
    bridge.exists.mockResolvedValue(true);
    bridge.readJson.mockResolvedValue([
      { docPath: "", entityType: "node", entityId: "n1" },
    ]);
    const repo = createAttachmentLinksRepositoryTauri();
    try {
      await repo.read();
      expect.fail("Should have thrown");
    } catch (e) {
      expect(e).toHaveProperty("name", "FileSystemError");
      expect(e).toHaveProperty("kind", "malformed");
    }
  });

  it("read throws FileSystemError when entityId is empty string", async () => {
    bridge.exists.mockResolvedValue(true);
    bridge.readJson.mockResolvedValue([
      { docPath: "docs/test.md", entityType: "node", entityId: "" },
    ]);
    const repo = createAttachmentLinksRepositoryTauri();
    try {
      await repo.read();
      expect.fail("Should have thrown");
    } catch (e) {
      expect(e).toHaveProperty("name", "FileSystemError");
      expect(e).toHaveProperty("kind", "malformed");
    }
  });

  it("write forwards rows to tauriBridge.writeJson", async () => {
    bridge.writeJson.mockResolvedValue(undefined);
    const repo = createAttachmentLinksRepositoryTauri();
    const rows = [
      { docPath: "docs/test.md", entityType: "node", entityId: "n1" },
      { docPath: "docs/other.md", entityType: "connection", entityId: "c1" },
    ];
    await repo.write(rows);
    expect(bridge.writeJson).toHaveBeenCalledWith(STORE, rows);
  });

  it("write forwards empty array", async () => {
    bridge.writeJson.mockResolvedValue(undefined);
    const repo = createAttachmentLinksRepositoryTauri();
    await repo.write([]);
    expect(bridge.writeJson).toHaveBeenCalledWith(STORE, []);
  });
});
