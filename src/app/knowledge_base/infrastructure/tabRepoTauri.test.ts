/**
 * Tests for Tauri implementation of `TabRepository`. Verifies that the
 * repository forwards all interface methods to `tauriBridge` correctly.
 */

import { describe, it, expect, vi } from "vitest";
import type { TabRepository } from "../domain/repositories";

const mockTauriBridge = {
  readText: vi.fn(),
  writeText: vi.fn(),
};

vi.mock("./tauriBridge", () => ({
  tauriBridge: mockTauriBridge,
}));

// Import after mock is registered
const { createTabRepositoryTauri } = await import(
  "./tabRepoTauri"
);

describe("TabRepository (Tauri)", () => {
  let repo: TabRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = createTabRepositoryTauri();
  });

  it("read() forwards to tauriBridge.readText", async () => {
    const tabPath = "songs/stairway.alphatex";
    const content = "\\title \"Stairway to Heaven\"";
    mockTauriBridge.readText.mockResolvedValueOnce(content);

    const result = await repo.read(tabPath);

    expect(result).toBe(content);
    expect(mockTauriBridge.readText).toHaveBeenCalledWith(tabPath);
    expect(mockTauriBridge.readText).toHaveBeenCalledTimes(1);
  });

  it("write() forwards to tauriBridge.writeText", async () => {
    const tabPath = "songs/stairway.alphatex";
    const content = "\\title \"Stairway to Heaven\"";
    mockTauriBridge.writeText.mockResolvedValueOnce(undefined);

    await repo.write(tabPath, content);

    expect(mockTauriBridge.writeText).toHaveBeenCalledWith(
      tabPath,
      content
    );
    expect(mockTauriBridge.writeText).toHaveBeenCalledTimes(1);
  });

  it("read() propagates tauriBridge errors", async () => {
    const tabPath = "songs/missing.alphatex";
    const error = new Error("File not found");
    mockTauriBridge.readText.mockRejectedValueOnce(error);

    await expect(repo.read(tabPath)).rejects.toThrow(error);
  });

  it("write() propagates tauriBridge errors", async () => {
    const tabPath = "songs/readonly.alphatex";
    const content = "...";
    const error = new Error("Permission denied");
    mockTauriBridge.writeText.mockRejectedValueOnce(error);

    await expect(repo.write(tabPath, content)).rejects.toThrow(error);
  });
});
