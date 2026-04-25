import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useDiagramFileWatcher } from "./useDiagramFileWatcher";
import { fnv1a } from "../../../shared/utils/historyPersistence";
import { FileWatcherProvider } from "../../../shared/context/FileWatcherContext";
import { ToastProvider } from "../../../shell/ToastContext";
import type { DiagramSnapshot } from "../../../shared/hooks/useDiagramHistory";
import type { ReactNode } from "react";

function wrapper({ children }: { children: ReactNode }) {
  return <FileWatcherProvider><ToastProvider>{children}</ToastProvider></FileWatcherProvider>;
}

const emptySnapshot: DiagramSnapshot = {
  title: "test", layerDefs: [], nodes: [], connections: [],
  layerManualSizes: {}, lineCurve: "bezier", flows: [],
};

function makeHistory() {
  return { recordAction: vi.fn(), markSaved: vi.fn() };
}

describe("useDiagramFileWatcher", () => {
  it("DIAG-3.21-01: no-ops when checksum matches disk", async () => {
    const json = JSON.stringify(emptySnapshot);
    const getJsonFromDisk = vi.fn().mockResolvedValue({ json, checksum: fnv1a(json), snapshot: emptySnapshot });
    const diskChecksumRef = { current: fnv1a(json) };
    const applySnapshot = vi.fn();
    const { result } = renderHook(
      () => useDiagramFileWatcher({
        activeFile: "a.json", dirty: false, diskChecksumRef, getJsonFromDisk,
        applySnapshot, history: makeHistory(), updateDiskChecksum: vi.fn(),
      }),
      { wrapper }
    );
    await act(async () => result.current.__test__.checkForChanges());
    expect(applySnapshot).not.toHaveBeenCalled();
  });

  it("DIAG-3.21-02: silently reloads when clean and disk differs", async () => {
    const newSnapshot = { ...emptySnapshot, title: "updated" };
    const json = JSON.stringify(newSnapshot);
    const getJsonFromDisk = vi.fn().mockResolvedValue({ json, checksum: fnv1a(json), snapshot: newSnapshot });
    const diskChecksumRef = { current: fnv1a(JSON.stringify(emptySnapshot)) };
    const applySnapshot = vi.fn();
    const history = makeHistory();
    const { result } = renderHook(
      () => useDiagramFileWatcher({
        activeFile: "a.json", dirty: false, diskChecksumRef, getJsonFromDisk,
        applySnapshot, history, updateDiskChecksum: vi.fn(),
      }),
      { wrapper }
    );
    await act(async () => result.current.__test__.checkForChanges());
    expect(history.recordAction).toHaveBeenCalledWith("Reloaded from disk", newSnapshot);
    expect(history.markSaved).toHaveBeenCalled();
    expect(applySnapshot).toHaveBeenCalledWith(newSnapshot);
  });

  it("DIAG-3.21-03: sets conflictSnapshot when dirty and disk differs", async () => {
    const newSnapshot = { ...emptySnapshot, title: "disk" };
    const json = JSON.stringify(newSnapshot);
    const getJsonFromDisk = vi.fn().mockResolvedValue({ json, checksum: fnv1a(json), snapshot: newSnapshot });
    const diskChecksumRef = { current: fnv1a(JSON.stringify(emptySnapshot)) };
    const { result } = renderHook(
      () => useDiagramFileWatcher({
        activeFile: "a.json", dirty: true, diskChecksumRef, getJsonFromDisk,
        applySnapshot: vi.fn(), history: makeHistory(), updateDiskChecksum: vi.fn(),
      }),
      { wrapper }
    );
    await act(async () => result.current.__test__.checkForChanges());
    expect(result.current.conflictSnapshot).toEqual(newSnapshot);
  });

  it("DIAG-3.21-04: handleReloadFromDisk clears conflict and applies disk snapshot", async () => {
    const newSnapshot = { ...emptySnapshot, title: "disk" };
    const json = JSON.stringify(newSnapshot);
    const getJsonFromDisk = vi.fn().mockResolvedValue({ json, checksum: fnv1a(json), snapshot: newSnapshot });
    const diskChecksumRef = { current: fnv1a(JSON.stringify(emptySnapshot)) };
    const applySnapshot = vi.fn();
    const history = makeHistory();
    const updateDiskChecksum = vi.fn();
    const { result } = renderHook(
      () => useDiagramFileWatcher({
        activeFile: "a.json", dirty: true, diskChecksumRef, getJsonFromDisk,
        applySnapshot, history, updateDiskChecksum,
      }),
      { wrapper }
    );
    await act(async () => result.current.__test__.checkForChanges());
    expect(result.current.conflictSnapshot).toEqual(newSnapshot);
    act(() => result.current.handleReloadFromDisk());
    expect(result.current.conflictSnapshot).toBeNull();
    expect(applySnapshot).toHaveBeenCalledWith(newSnapshot);
    expect(history.recordAction).toHaveBeenCalledWith("Reloaded from disk", newSnapshot);
    expect(history.markSaved).toHaveBeenCalled();
  });

  it("DIAG-3.21-05: handleKeepEdits dismisses banner and suppresses same checksum", async () => {
    const newSnapshot = { ...emptySnapshot, title: "disk" };
    const json = JSON.stringify(newSnapshot);
    const getJsonFromDisk = vi.fn().mockResolvedValue({ json, checksum: fnv1a(json), snapshot: newSnapshot });
    const diskChecksumRef = { current: fnv1a(JSON.stringify(emptySnapshot)) };
    const applySnapshot = vi.fn();
    const { result } = renderHook(
      () => useDiagramFileWatcher({
        activeFile: "a.json", dirty: true, diskChecksumRef, getJsonFromDisk,
        applySnapshot, history: makeHistory(), updateDiskChecksum: vi.fn(),
      }),
      { wrapper }
    );
    await act(async () => result.current.__test__.checkForChanges());
    act(() => result.current.handleKeepEdits());
    expect(result.current.conflictSnapshot).toBeNull();
    // Trigger again with same disk checksum — should not conflict
    await act(async () => result.current.__test__.checkForChanges());
    expect(result.current.conflictSnapshot).toBeNull();
    expect(applySnapshot).not.toHaveBeenCalled();
  });
});
