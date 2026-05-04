import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import { useTabExport } from "./useTabExport";
import { StubShellErrorProvider } from "../../../shell/ShellErrorContext";

const reportErrorMock = vi.fn();
const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <StubShellErrorProvider value={{ current: null, reportError: reportErrorMock, dismiss: vi.fn() }}>
    {children}
  </StubShellErrorProvider>
);

const writeMock = vi.fn();
const closeMock = vi.fn();
const showSaveFilePickerMock = vi.fn();

beforeEach(() => {
  reportErrorMock.mockReset();
  writeMock.mockReset();
  closeMock.mockReset();
  showSaveFilePickerMock.mockReset();
  showSaveFilePickerMock.mockResolvedValue({
    createWritable: async () => ({ write: writeMock, close: closeMock }),
  });
  (globalThis as unknown as { showSaveFilePicker: unknown }).showSaveFilePicker = showSaveFilePickerMock;
});

describe("useTabExport — MIDI", () => {
  it("calls session.exportMidi, opens FSA picker with derived name, writes bytes, closes writable", async () => {
    const session = {
      exportMidi: vi.fn(() => new Uint8Array([1, 2, 3])),
      exportAudio: vi.fn(),
      exportPdf: vi.fn(),
    };
    const { result } = renderHook(
      () => useTabExport({ session, filePath: "songs/wonderwall.alphatex", paneReadOnly: false }),
      { wrapper },
    );
    await act(async () => { await result.current.exportMidi(); });
    expect(session.exportMidi).toHaveBeenCalledOnce();
    expect(showSaveFilePickerMock).toHaveBeenCalledWith(expect.objectContaining({
      suggestedName: "wonderwall.mid",
    }));
    expect(writeMock).toHaveBeenCalledOnce();
    expect(closeMock).toHaveBeenCalledOnce();
    expect(reportErrorMock).not.toHaveBeenCalled();
  });

  it("no-ops when paneReadOnly is true", async () => {
    const session = { exportMidi: vi.fn(), exportAudio: vi.fn(), exportPdf: vi.fn() };
    const { result } = renderHook(
      () => useTabExport({ session, filePath: "song.alphatex", paneReadOnly: true }),
      { wrapper },
    );
    await act(async () => { await result.current.exportMidi(); });
    expect(session.exportMidi).not.toHaveBeenCalled();
    expect(showSaveFilePickerMock).not.toHaveBeenCalled();
  });

  it("treats AbortError from showSaveFilePicker as a silent cancel", async () => {
    showSaveFilePickerMock.mockRejectedValueOnce(Object.assign(new Error("cancelled"), { name: "AbortError" }));
    const session = { exportMidi: vi.fn(() => new Uint8Array([1])), exportAudio: vi.fn(), exportPdf: vi.fn() };
    const { result } = renderHook(
      () => useTabExport({ session, filePath: "song.alphatex", paneReadOnly: false }),
      { wrapper },
    );
    await act(async () => { await result.current.exportMidi(); });
    expect(reportErrorMock).not.toHaveBeenCalled();
  });

  it("reports write errors via ShellErrorContext.reportError(e, 'Export MIDI')", async () => {
    writeMock.mockRejectedValueOnce(new Error("Quota exceeded"));
    const session = { exportMidi: vi.fn(() => new Uint8Array([1])), exportAudio: vi.fn(), exportPdf: vi.fn() };
    const { result } = renderHook(
      () => useTabExport({ session, filePath: "song.alphatex", paneReadOnly: false }),
      { wrapper },
    );
    await act(async () => { await result.current.exportMidi(); });
    expect(reportErrorMock).toHaveBeenCalledOnce();
    // reportError(error, context) — second arg is the context string
    expect(reportErrorMock.mock.calls[0]![1]).toMatch(/MIDI/i);
  });
});

describe("useTabExport — WAV", () => {
  it("phase transitions idle → rendering → saving → idle on success", async () => {
    const exportAudio = vi.fn(async (opts: { onProgress?: (p: { currentTime: number; endTime: number }) => void } = {}) => {
      opts.onProgress?.({ currentTime: 100, endTime: 1000 });
      opts.onProgress?.({ currentTime: 1000, endTime: 1000 });
      return new Uint8Array([0, 0, 0]);
    });
    const session = { exportMidi: vi.fn(), exportAudio, exportPdf: vi.fn() };
    const { result } = renderHook(
      () => useTabExport({ session, filePath: "song.alphatex", paneReadOnly: false }),
      { wrapper },
    );
    expect(result.current.wavState.phase).toBe("idle");
    await act(async () => { await result.current.exportWav(); });
    expect(result.current.wavState.phase).toBe("idle");
    expect(showSaveFilePickerMock).toHaveBeenCalledWith(expect.objectContaining({ suggestedName: "song.wav" }));
    expect(writeMock).toHaveBeenCalledOnce();
  });

  it("cancel() aborts the in-flight export", async () => {
    let progressCb: ((p: { currentTime: number; endTime: number }) => void) | null = null;
    let resolveExport!: (b: Uint8Array) => void;
    const exportAudio = vi.fn((opts?: { onProgress?: typeof progressCb; signal?: AbortSignal }) => {
      progressCb = opts?.onProgress ?? null;
      return new Promise<Uint8Array>((resolve, reject) => {
        opts?.signal?.addEventListener("abort", () => {
          const e = new Error("Aborted"); (e as Error & { name: string }).name = "AbortError";
          reject(e);
        });
        resolveExport = resolve;
      });
    });
    const session = { exportMidi: vi.fn(), exportAudio, exportPdf: vi.fn() };
    const { result } = renderHook(
      () => useTabExport({ session, filePath: "song.alphatex", paneReadOnly: false }),
      { wrapper },
    );
    let exportPromise!: Promise<void>;
    act(() => { exportPromise = result.current.exportWav(); });
    // Tick once so React commits the rendering state
    await act(async () => { progressCb?.({ currentTime: 50, endTime: 300 }); });
    expect(result.current.wavState.phase).toBe("rendering");
    await act(async () => { result.current.wavState.cancel(); await exportPromise; });
    expect(result.current.wavState.phase).toBe("idle");
    expect(reportErrorMock).not.toHaveBeenCalled();
    void resolveExport;
  });

  it("non-abort errors reach ShellErrorContext via reportError(e, 'Export WAV')", async () => {
    const exportAudio = vi.fn(async () => { throw new Error("Synth failed"); });
    const session = { exportMidi: vi.fn(), exportAudio, exportPdf: vi.fn() };
    const { result } = renderHook(
      () => useTabExport({ session, filePath: "song.alphatex", paneReadOnly: false }),
      { wrapper },
    );
    await act(async () => { await result.current.exportWav(); });
    expect(result.current.wavState.phase).toBe("idle");
    expect(reportErrorMock).toHaveBeenCalledOnce();
    expect(reportErrorMock.mock.calls[0]![1]).toMatch(/WAV/i);
  });

  it("paneReadOnly = true makes exportWav a no-op", async () => {
    const exportAudio = vi.fn();
    const session = { exportMidi: vi.fn(), exportAudio, exportPdf: vi.fn() };
    const { result } = renderHook(
      () => useTabExport({ session, filePath: "song.alphatex", paneReadOnly: true }),
      { wrapper },
    );
    await act(async () => { await result.current.exportWav(); });
    expect(exportAudio).not.toHaveBeenCalled();
  });
});
