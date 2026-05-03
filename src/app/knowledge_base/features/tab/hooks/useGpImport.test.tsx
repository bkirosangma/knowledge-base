import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { ReactNode } from "react";
import { StubShellErrorProvider } from "../../../shell/ShellErrorContext";
import { useGpImport } from "./useGpImport";

vi.mock("../../../infrastructure/gpToAlphatex", () => ({
  gpToAlphatex: vi.fn(),
}));
import { gpToAlphatex } from "../../../infrastructure/gpToAlphatex";

function makeTab() {
  return {
    read: vi.fn().mockResolvedValue(""),
    write: vi.fn().mockResolvedValue(undefined),
  };
}

function Wrap({
  children,
  reportError = vi.fn() as (e: unknown, context?: string) => void,
}: {
  children: ReactNode;
  reportError?: (e: unknown, context?: string) => void;
}) {
  return (
    <StubShellErrorProvider value={{ current: null, reportError, dismiss: vi.fn() }}>
      {children}
    </StubShellErrorProvider>
  );
}

/**
 * Build a minimal File-like object whose `arrayBuffer()` returns the given
 * payload. Real Files are constructed via FormData/Blob; in JSDOM the
 * spec-compliant ArrayBuffer access works without polyfills.
 */
function makeFile(name: string, bytes: number[]): File {
  const buf = new Uint8Array(bytes);
  return new File([buf], name, { type: "application/octet-stream" });
}

describe("useGpImport", () => {
  beforeEach(() => {
    vi.mocked(gpToAlphatex).mockReset();
  });

  it("converts the picked file and writes a sibling .alphatex via TabRepository", async () => {
    vi.mocked(gpToAlphatex).mockResolvedValue("\\title \"Hi\"\n.");
    const tab = makeTab();
    const onImported = vi.fn();
    const { result } = renderHook(() => useGpImport({ tab, onImported }), {
      wrapper: Wrap,
    });

    const file = makeFile("song.gp", [1, 2, 3]);
    await act(async () => {
      await result.current.importBytes(file);
    });

    expect(gpToAlphatex).toHaveBeenCalledTimes(1);
    expect(tab.write).toHaveBeenCalledWith("song.alphatex", "\\title \"Hi\"\n.");
    expect(onImported).toHaveBeenCalledWith("song.alphatex");
  });

  it("preserves multi-segment basenames before the GP extension", async () => {
    vi.mocked(gpToAlphatex).mockResolvedValue("alphatex");
    const tab = makeTab();
    const onImported = vi.fn();
    const { result } = renderHook(() => useGpImport({ tab, onImported }), {
      wrapper: Wrap,
    });
    const file = makeFile("my.song.gp5", [9]);
    await act(async () => {
      await result.current.importBytes(file);
    });
    expect(tab.write).toHaveBeenCalledWith("my.song.alphatex", "alphatex");
  });

  it("handles .gp3/.gp4/.gp5/.gp7 by stripping any of those extensions", async () => {
    vi.mocked(gpToAlphatex).mockResolvedValue("x");
    const onImported = vi.fn();
    for (const ext of ["gp3", "gp4", "gp5", "gp7"]) {
      const tab = makeTab();
      const { result } = renderHook(() => useGpImport({ tab, onImported }), {
        wrapper: Wrap,
      });
      const file = makeFile(`song.${ext}`, [1]);
      await act(async () => {
        await result.current.importBytes(file);
      });
      expect(tab.write).toHaveBeenCalledWith("song.alphatex", "x");
      cleanup();
    }
  });

  it("routes a conversion failure through ShellErrorContext", async () => {
    vi.mocked(gpToAlphatex).mockRejectedValue(new Error("Unsupported format"));
    const tab = makeTab();
    const reportError = vi.fn();
    const onImported = vi.fn();
    const { result } = renderHook(() => useGpImport({ tab, onImported }), {
      wrapper: ({ children }) => <Wrap reportError={reportError}>{children}</Wrap>,
    });
    const file = makeFile("broken.gp", [0]);
    await act(async () => {
      await result.current.importBytes(file);
    });
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError.mock.calls[0][0].message).toBe("Unsupported format");
    expect(tab.write).not.toHaveBeenCalled();
    expect(onImported).not.toHaveBeenCalled();
  });

  it("routes a write failure through ShellErrorContext", async () => {
    vi.mocked(gpToAlphatex).mockResolvedValue("alphatex");
    const tab = makeTab();
    tab.write.mockRejectedValue(new Error("permission denied"));
    const reportError = vi.fn();
    const onImported = vi.fn();
    const { result } = renderHook(() => useGpImport({ tab, onImported }), {
      wrapper: ({ children }) => <Wrap reportError={reportError}>{children}</Wrap>,
    });
    const file = makeFile("a.gp", [1]);
    await act(async () => {
      await result.current.importBytes(file);
    });
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(onImported).not.toHaveBeenCalled();
  });
});
