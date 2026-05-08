import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../infrastructure/tauriBridge", () => ({
  tauriBridge: {
    readText: vi.fn(),
    writeText: vi.fn(),
  },
}));

import { tauriBridge } from "../../infrastructure/tauriBridge";
import {
  fnv1a,
  historyFileName,
  readHistoryFile,
  writeHistoryFile,
} from "./historyPersistence";
import type { HistoryFile } from "./historyPersistence";

const readText = tauriBridge.readText as unknown as ReturnType<typeof vi.fn>;
const writeText = tauriBridge.writeText as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  readText.mockReset();
  writeText.mockReset();
});

describe("fnv1a", () => {
  it("returns 8-character hex", () => {
    expect(fnv1a("hello")).toMatch(/^[0-9a-f]{8}$/);
  });
  it("is deterministic", () => {
    expect(fnv1a("abc")).toBe(fnv1a("abc"));
  });
  it("differs across inputs", () => {
    expect(fnv1a("abc")).not.toBe(fnv1a("xyz"));
  });
});

describe("historyFileName", () => {
  it("prepends a dot and appends .history.json", () => {
    expect(historyFileName("diagram.json")).toBe(".diagram.json.history.json");
    expect(historyFileName("notes.md")).toBe(".notes.md.history.json");
  });
  it("preserves directory prefix", () => {
    expect(historyFileName("docs/notes.md")).toBe("docs/.notes.md.history.json");
    expect(historyFileName("a/b/c.json")).toBe("a/b/.c.json.history.json");
  });
});

describe("HIST-5.4: readHistoryFile", () => {
  it("returns null when sidecar is missing (both new and legacy)", async () => {
    readText.mockRejectedValue(new Error("NotFound"));
    const result = await readHistoryFile("notes.md");
    expect(result).toBeNull();
    expect(readText).toHaveBeenCalledWith(".notes.md.history.json");
    expect(readText).toHaveBeenCalledWith(".notes.history.json");
  });

  it("parses the new sidecar name", async () => {
    const data: HistoryFile<string> = {
      checksum: "abc",
      currentIndex: 0,
      savedIndex: 0,
      entries: [{ id: 0, description: "loaded", timestamp: 1, snapshot: "x" }],
    };
    readText.mockResolvedValueOnce(JSON.stringify(data));
    const result = await readHistoryFile<string>("notes.md");
    expect(result).toEqual(data);
    expect(readText).toHaveBeenCalledWith(".notes.md.history.json");
  });

  it("falls back to legacy name when new name is missing", async () => {
    const data: HistoryFile<string> = {
      checksum: "abc",
      currentIndex: 0,
      savedIndex: 0,
      entries: [{ id: 0, description: "loaded", timestamp: 1, snapshot: "y" }],
    };
    readText
      .mockRejectedValueOnce(new Error("NotFound"))
      .mockResolvedValueOnce(JSON.stringify(data));
    const result = await readHistoryFile<string>("notes.md");
    expect(result).toEqual(data);
    expect(readText).toHaveBeenNthCalledWith(1, ".notes.md.history.json");
    expect(readText).toHaveBeenNthCalledWith(2, ".notes.history.json");
  });

  it("returns null when JSON is malformed", async () => {
    readText.mockResolvedValueOnce("not json");
    const result = await readHistoryFile("notes.md");
    expect(result).toBeNull();
  });
});

describe("HIST-5.5: writeHistoryFile", () => {
  it("writes serialized JSON to the new sidecar path", async () => {
    writeText.mockResolvedValue(undefined);
    const data: HistoryFile<string> = {
      checksum: "abc",
      currentIndex: 0,
      savedIndex: 0,
      entries: [{ id: 0, description: "loaded", timestamp: 1, snapshot: "x" }],
    };
    await writeHistoryFile("notes.md", data);
    expect(writeText).toHaveBeenCalledWith(".notes.md.history.json", JSON.stringify(data));
  });

  it("swallows write errors silently", async () => {
    writeText.mockRejectedValue(new Error("Denied"));
    await expect(
      writeHistoryFile("notes.md", {
        checksum: "abc",
        currentIndex: 0,
        savedIndex: 0,
        entries: [],
      }),
    ).resolves.toBeUndefined();
  });
});
