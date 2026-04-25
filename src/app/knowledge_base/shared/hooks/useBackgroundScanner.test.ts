import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useBackgroundScanner } from "./useBackgroundScanner";
import { fnv1a } from "../utils/historyPersistence";
import type { TreeNode } from "../utils/fileTree";
import type { HistoryFile } from "../utils/historyPersistence";

function makeTree(paths: string[]): TreeNode[] {
  return paths.map((p) => ({
    name: p.split("/").pop()!,
    path: p,
    type: "file" as const,
    fileType: p.endsWith(".json") ? ("diagram" as const) : ("document" as const),
  }));
}

function makeHistoryFile(content: string, isDirty = false): HistoryFile<string> {
  const snapshot = isDirty ? "draft content" : content;
  return {
    checksum: fnv1a(content),
    currentIndex: 0,
    savedIndex: 0,
    entries: [{ id: 0, description: "Initial", timestamp: 1000, snapshot }],
  };
}

describe("useBackgroundScanner", () => {
  it("SCAN-1-01: skips the currently open file", async () => {
    const readFile = vi.fn().mockResolvedValue("content");
    const readHistory = vi.fn().mockResolvedValue(makeHistoryFile("content"));
    const writeHistory = vi.fn();
    const tree = makeTree(["a.md", "b.md"]);
    const dirHandleRef = { current: null };

    const { result } = renderHook(() =>
      useBackgroundScanner({
        tree,
        openFilePath: "a.md",
        dirHandleRef,
        dirtyFiles: new Set(),
        readFile,
        readHistory,
        writeHistory,
      })
    );

    await act(async () => {
      await result.current.scan();
    });

    // a.md should be skipped — readHistory should only be called for b.md
    expect(readHistory).not.toHaveBeenCalledWith("a.md");
    expect(readHistory).toHaveBeenCalledWith("b.md");
  });

  it("SCAN-1-02: skips files with no history sidecar", async () => {
    const content = "hello world";
    const readFile = vi.fn().mockResolvedValue(content);
    // readHistory returns null for no sidecar
    const readHistory = vi.fn().mockResolvedValue(null);
    const writeHistory = vi.fn();
    const tree = makeTree(["notes.md"]);
    const dirHandleRef = { current: null };

    const { result } = renderHook(() =>
      useBackgroundScanner({
        tree,
        openFilePath: null,
        dirHandleRef,
        dirtyFiles: new Set(),
        readFile,
        readHistory,
        writeHistory,
      })
    );

    let count: number;
    await act(async () => {
      count = await result.current.scan();
    });

    expect(writeHistory).not.toHaveBeenCalled();
    expect(count!).toBe(0);
  });

  it("SCAN-1-03: updates sidecar when checksum differs and file is clean", async () => {
    const oldContent = "old content";
    const newContent = "new content from disk";
    const readFile = vi.fn().mockResolvedValue(newContent);
    const sidecar = makeHistoryFile(oldContent);
    const readHistory = vi.fn().mockResolvedValue(sidecar);
    const writeHistory = vi.fn();
    const tree = makeTree(["notes.md"]);
    const dirHandleRef = { current: null };

    const { result } = renderHook(() =>
      useBackgroundScanner({
        tree,
        openFilePath: null,
        dirHandleRef,
        dirtyFiles: new Set(),
        readFile,
        readHistory,
        writeHistory,
      })
    );

    let count: number;
    await act(async () => {
      count = await result.current.scan();
    });

    expect(writeHistory).toHaveBeenCalledOnce();
    const [path, written] = writeHistory.mock.calls[0] as [string, HistoryFile<string>];
    expect(path).toBe("notes.md");
    expect(written.checksum).toBe(fnv1a(newContent));
    expect(written.entries).toHaveLength(2);
    expect(written.entries[1].description).toBe("Reloaded from disk");
    expect(written.entries[1].snapshot).toBe(newContent);
    expect(written.currentIndex).toBe(1);
    expect(written.savedIndex).toBe(1);
    expect(count!).toBe(1);
  });

  it("SCAN-1-04: preserves draft then appends disk entry when file is dirty", async () => {
    const savedContent = "saved content";
    const draftContent = "draft content";
    const newDiskContent = "new disk content";

    const readFile = vi.fn().mockResolvedValue(newDiskContent);
    // Simulate dirty state: sidecar has draft as snapshot, but checksum is still saved content's
    const sidecar: HistoryFile<string> = {
      checksum: fnv1a(savedContent),
      currentIndex: 0,
      savedIndex: 0,
      entries: [{ id: 0, description: "Initial", timestamp: 1000, snapshot: draftContent }],
    };
    const readHistory = vi.fn().mockResolvedValue(sidecar);
    const writeHistory = vi.fn();
    const tree = makeTree(["notes.md"]);
    const dirHandleRef = { current: null };

    const { result } = renderHook(() =>
      useBackgroundScanner({
        tree,
        openFilePath: null,
        dirHandleRef,
        dirtyFiles: new Set(["notes.md"]),
        readFile,
        readHistory,
        writeHistory,
      })
    );

    let count: number;
    await act(async () => {
      count = await result.current.scan();
    });

    expect(writeHistory).toHaveBeenCalledOnce();
    const [path, written] = writeHistory.mock.calls[0] as [string, HistoryFile<string>];
    expect(path).toBe("notes.md");
    // Should have 3 entries: original + draft preservation + disk reload
    expect(written.entries).toHaveLength(3);
    expect(written.entries[1].description).toBe("Unsaved changes (auto-preserved)");
    expect(written.entries[1].snapshot).toBe(draftContent);
    expect(written.entries[2].description).toBe("Reloaded from disk");
    expect(written.entries[2].snapshot).toBe(newDiskContent);
    expect(written.currentIndex).toBe(2);
    expect(written.savedIndex).toBe(2);
    expect(count!).toBe(1);
  });

  it("SCAN-1-05: returns count of updated files", async () => {
    const oldContent = "old";
    const newContent = "new";
    const readFile = vi.fn().mockResolvedValue(newContent);
    const readHistory = vi.fn().mockResolvedValue(makeHistoryFile(oldContent));
    const writeHistory = vi.fn();
    // Three files, none open, all with changed content
    const tree = makeTree(["a.md", "b.md", "c.md"]);
    const dirHandleRef = { current: null };

    const { result } = renderHook(() =>
      useBackgroundScanner({
        tree,
        openFilePath: null,
        dirHandleRef,
        dirtyFiles: new Set(),
        readFile,
        readHistory,
        writeHistory,
      })
    );

    let count: number;
    await act(async () => {
      count = await result.current.scan();
    });

    expect(count!).toBe(3);
    expect(writeHistory).toHaveBeenCalledTimes(3);
  });
});
