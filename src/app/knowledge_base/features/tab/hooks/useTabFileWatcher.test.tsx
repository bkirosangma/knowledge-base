import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useTabFileWatcher } from "./useTabFileWatcher";
import { fnv1a } from "../../../shared/utils/historyPersistence";
import { FileWatcherProvider } from "../../../shared/context/FileWatcherContext";
import { ToastProvider } from "../../../shell/ToastContext";
import type { ReactNode } from "react";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <FileWatcherProvider vaultPath={null}>
      <ToastProvider>{children}</ToastProvider>
    </FileWatcherProvider>
  );
}

describe("useTabFileWatcher", () => {
  it("no-ops when on-disk checksum matches the last-known checksum", async () => {
    const text = '\\title "Stable"\n.\n:4 5.6 |';
    const getContentFromDisk = vi.fn().mockResolvedValue({ text, checksum: fnv1a(text) });
    const diskChecksumRef = { current: fnv1a(text) };
    const resetToContent = vi.fn();
    const { result } = renderHook(
      () => useTabFileWatcher({
        filePath: "song.alphatex", dirty: false, diskChecksumRef,
        getContentFromDisk, resetToContent,
      }),
      { wrapper }
    );
    await act(async () => result.current.__test__.checkForChanges());
    expect(resetToContent).not.toHaveBeenCalled();
    expect(result.current.conflictContent).toBeNull();
  });

  it("silently reloads when disk text changes and the editor is clean", async () => {
    const newText = '\\title "Updated"\n.\n:4 7.6 |';
    const getContentFromDisk = vi.fn().mockResolvedValue({ text: newText, checksum: fnv1a(newText) });
    const diskChecksumRef = { current: fnv1a('\\title "Old"\n.') };
    const resetToContent = vi.fn();
    const { result } = renderHook(
      () => useTabFileWatcher({
        filePath: "song.alphatex", dirty: false, diskChecksumRef,
        getContentFromDisk, resetToContent,
      }),
      { wrapper }
    );
    await act(async () => result.current.__test__.checkForChanges());
    expect(resetToContent).toHaveBeenCalledTimes(1);
    expect(resetToContent).toHaveBeenCalledWith(newText, fnv1a(newText));
    expect(result.current.conflictContent).toBeNull();
  });

  // TAB-11.2-08: the load-bearing assertion — external file change while
  // pane is open and editor is dirty surfaces the ConflictBanner via the
  // `conflictContent` state, without modifying the live editor.
  it("TAB-11.2-08: surfaces a conflict when disk changes and the editor is dirty", async () => {
    const newText = '\\title "Updated"\n.\n:4 7.6 |';
    const getContentFromDisk = vi.fn().mockResolvedValue({ text: newText, checksum: fnv1a(newText) });
    const diskChecksumRef = { current: fnv1a('\\title "Old"\n.') };
    const resetToContent = vi.fn();
    const { result } = renderHook(
      () => useTabFileWatcher({
        filePath: "song.alphatex", dirty: true, diskChecksumRef,
        getContentFromDisk, resetToContent,
      }),
      { wrapper }
    );
    await act(async () => result.current.__test__.checkForChanges());
    expect(resetToContent).not.toHaveBeenCalled();
    expect(result.current.conflictContent).toBe(newText);
  });

  it("handleReloadFromDisk clears the conflict and applies disk content", async () => {
    const newText = '\\title "Updated"\n.\n:4 7.6 |';
    const getContentFromDisk = vi.fn().mockResolvedValue({ text: newText, checksum: fnv1a(newText) });
    const diskChecksumRef = { current: fnv1a('\\title "Old"\n.') };
    const resetToContent = vi.fn();
    const { result } = renderHook(
      () => useTabFileWatcher({
        filePath: "song.alphatex", dirty: true, diskChecksumRef,
        getContentFromDisk, resetToContent,
      }),
      { wrapper }
    );
    await act(async () => result.current.__test__.checkForChanges());
    expect(result.current.conflictContent).toBe(newText);
    act(() => result.current.handleReloadFromDisk());
    expect(resetToContent).toHaveBeenCalledTimes(1);
    expect(resetToContent).toHaveBeenCalledWith(newText, fnv1a(newText));
    expect(result.current.conflictContent).toBeNull();
  });

  it("handleKeepEdits dismisses and suppresses re-prompting for the same disk checksum", async () => {
    const newText = '\\title "Updated"\n.\n:4 7.6 |';
    const getContentFromDisk = vi.fn().mockResolvedValue({ text: newText, checksum: fnv1a(newText) });
    const diskChecksumRef = { current: fnv1a('\\title "Old"\n.') };
    const resetToContent = vi.fn();
    const { result } = renderHook(
      () => useTabFileWatcher({
        filePath: "song.alphatex", dirty: true, diskChecksumRef,
        getContentFromDisk, resetToContent,
      }),
      { wrapper }
    );
    await act(async () => result.current.__test__.checkForChanges());
    expect(result.current.conflictContent).toBe(newText);
    act(() => result.current.handleKeepEdits());
    expect(result.current.conflictContent).toBeNull();
    // A second checkForChanges with the same disk checksum must not re-open
    // the banner — the dismissed-checksum guard suppresses repeats.
    await act(async () => result.current.__test__.checkForChanges());
    expect(result.current.conflictContent).toBeNull();
    expect(resetToContent).not.toHaveBeenCalled();
  });
});
