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
