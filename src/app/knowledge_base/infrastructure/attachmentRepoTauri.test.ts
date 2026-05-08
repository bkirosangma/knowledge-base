import { afterEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  writeBytes: vi.fn(),
  exists: vi.fn(),
}));
vi.mock("./tauriBridge", () => ({ tauriBridge: bridge }));

import { createAttachmentRepositoryTauri } from "./attachmentRepoTauri";

describe("attachmentRepoTauri", () => {
  afterEach(() => {
    bridge.writeBytes.mockReset();
    bridge.exists.mockReset();
  });

  it("write skips when exists returns true (hash dedup)", async () => {
    bridge.exists.mockResolvedValue(true);
    const repo = createAttachmentRepositoryTauri();
    await repo.write("hash123.png", new Uint8Array([1, 2, 3]).buffer);
    expect(bridge.writeBytes).not.toHaveBeenCalled();
  });

  it("write forwards bytes when file does not exist", async () => {
    bridge.exists.mockResolvedValue(false);
    bridge.writeBytes.mockResolvedValue(undefined);
    const repo = createAttachmentRepositoryTauri();
    const buf = new Uint8Array([1, 2, 3]).buffer;
    await repo.write("hash123.png", buf);
    expect(bridge.writeBytes).toHaveBeenCalledWith(".attachments/hash123.png", buf);
  });

  it("exists checks the .attachments path", async () => {
    bridge.exists.mockResolvedValue(true);
    const repo = createAttachmentRepositoryTauri();
    const got = await repo.exists("hash123.png");
    expect(bridge.exists).toHaveBeenCalledWith(".attachments/hash123.png");
    expect(got).toBe(true);
  });

  it("read delegates to bridge.readBytes and wraps result in Blob", async () => {
    const buf = new Uint8Array([1, 2, 3]).buffer;
    bridge.readBytes = vi.fn().mockResolvedValue(buf);
    const repo = createAttachmentRepositoryTauri();
    const got = await repo.read("hash123.png");
    expect(bridge.readBytes).toHaveBeenCalledWith(".attachments/hash123.png");
    expect(got).toBeInstanceOf(Blob);
    const data = await got.arrayBuffer();
    expect(new Uint8Array(data)).toEqual(new Uint8Array([1, 2, 3]));
  });
});
