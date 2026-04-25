import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useDocumentFileWatcher } from "./useDocumentFileWatcher";
import { fnv1a } from "../../../shared/utils/historyPersistence";
import { FileWatcherProvider } from "../../../shared/context/FileWatcherContext";
import { ToastProvider } from "../../../shell/ToastContext";
import type { ReactNode } from "react";

function wrapper({ children }: { children: ReactNode }) {
  return <FileWatcherProvider><ToastProvider>{children}</ToastProvider></FileWatcherProvider>;
}

function makeHistory() {
  return { recordAction: vi.fn(), markSaved: vi.fn() };
}

describe("useDocumentFileWatcher", () => {
  it("DOC-4.15-01: no-ops when content checksum matches disk", async () => {
    const history = makeHistory();
    const getContentFromDisk = vi.fn().mockResolvedValue({ text: "abc", checksum: fnv1a("abc") });
    const diskChecksumRef = { current: fnv1a("abc") };
    const resetToContent = vi.fn();
    const { result } = renderHook(
      () => useDocumentFileWatcher({
        filePath: "a.md", dirty: false, diskChecksumRef, getContentFromDisk,
        resetToContent, history, updateDiskChecksum: vi.fn(),
      }),
      { wrapper }
    );
    await act(async () => result.current.__test__.checkForChanges());
    expect(resetToContent).not.toHaveBeenCalled();
  });

  it("DOC-4.15-02: silently reloads when checksum differs and file is clean", async () => {
    const history = makeHistory();
    const newText = "updated content";
    const getContentFromDisk = vi.fn().mockResolvedValue({ text: newText, checksum: fnv1a(newText) });
    const diskChecksumRef = { current: fnv1a("old content") };
    const resetToContent = vi.fn();
    const updateDiskChecksum = vi.fn();
    const { result } = renderHook(
      () => useDocumentFileWatcher({
        filePath: "a.md", dirty: false, diskChecksumRef, getContentFromDisk,
        resetToContent, history, updateDiskChecksum,
      }),
      { wrapper }
    );
    await act(async () => result.current.__test__.checkForChanges());
    expect(history.recordAction).toHaveBeenCalledWith("Reloaded from disk", newText);
    expect(history.markSaved).toHaveBeenCalled();
    expect(resetToContent).toHaveBeenCalledWith(newText);
    expect(updateDiskChecksum).toHaveBeenCalledWith(fnv1a(newText));
  });

  it("DOC-4.15-03: sets conflictContent when file is dirty and disk differs", async () => {
    const history = makeHistory();
    const newText = "disk version";
    const getContentFromDisk = vi.fn().mockResolvedValue({ text: newText, checksum: fnv1a(newText) });
    const diskChecksumRef = { current: fnv1a("saved version") };
    const { result } = renderHook(
      () => useDocumentFileWatcher({
        filePath: "a.md", dirty: true, diskChecksumRef, getContentFromDisk,
        resetToContent: vi.fn(), history, updateDiskChecksum: vi.fn(),
      }),
      { wrapper }
    );
    await act(async () => result.current.__test__.checkForChanges());
    expect(result.current.conflictContent).toBe(newText);
    expect(history.recordAction).not.toHaveBeenCalled();
  });

  it("DOC-4.15-04: handleReloadFromDisk clears conflict and applies disk content", async () => {
    const history = makeHistory();
    const newText = "disk version";
    const getContentFromDisk = vi.fn().mockResolvedValue({ text: newText, checksum: fnv1a(newText) });
    const diskChecksumRef = { current: fnv1a("saved") };
    const resetToContent = vi.fn();
    const updateDiskChecksum = vi.fn();
    const { result } = renderHook(
      () => useDocumentFileWatcher({
        filePath: "a.md", dirty: true, diskChecksumRef, getContentFromDisk,
        resetToContent, history, updateDiskChecksum,
      }),
      { wrapper }
    );
    await act(async () => result.current.__test__.checkForChanges());
    expect(result.current.conflictContent).toBe(newText);
    act(() => result.current.handleReloadFromDisk());
    expect(result.current.conflictContent).toBeNull();
    expect(resetToContent).toHaveBeenCalledWith(newText);
    expect(history.recordAction).toHaveBeenCalledWith("Reloaded from disk", newText);
    expect(history.markSaved).toHaveBeenCalled();
  });

  it("DOC-4.15-05: handleKeepEdits dismisses the banner and suppresses the same checksum", async () => {
    const history = makeHistory();
    const diskText = "disk";
    const getContentFromDisk = vi.fn().mockResolvedValue({ text: diskText, checksum: fnv1a(diskText) });
    const diskChecksumRef = { current: fnv1a("saved") };
    const resetToContent = vi.fn();
    const { result } = renderHook(
      () => useDocumentFileWatcher({
        filePath: "a.md", dirty: true, diskChecksumRef, getContentFromDisk,
        resetToContent, history, updateDiskChecksum: vi.fn(),
      }),
      { wrapper }
    );
    await act(async () => result.current.__test__.checkForChanges());
    act(() => result.current.handleKeepEdits());
    expect(result.current.conflictContent).toBeNull();
    // Trigger again with same disk checksum — should not conflict
    await act(async () => result.current.__test__.checkForChanges());
    expect(result.current.conflictContent).toBeNull();
    expect(resetToContent).not.toHaveBeenCalled();
  });
});
