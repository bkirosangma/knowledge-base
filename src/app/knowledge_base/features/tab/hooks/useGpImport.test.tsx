import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { ReactNode } from "react";
import { StubRepositoryProvider } from "../../../shell/RepositoryContext";
import { StubShellErrorProvider } from "../../../shell/ShellErrorContext";
import { useGpImport } from "./useGpImport";

vi.mock("../../../infrastructure/gpToAlphatex", () => ({
  gpToAlphatex: vi.fn(),
}));
import { gpToAlphatex } from "../../../infrastructure/gpToAlphatex";

function Wrap({
  children,
  write = vi.fn().mockResolvedValue(undefined) as (tabPath: string, content: string) => Promise<void>,
  reportError = vi.fn() as (e: unknown, context?: string) => void,
}: {
  children: ReactNode;
  write?: (tabPath: string, content: string) => Promise<void>;
  reportError?: (e: unknown, context?: string) => void;
}) {
  return (
    <StubShellErrorProvider value={{ current: null, reportError, dismiss: vi.fn() }}>
      <StubRepositoryProvider
        value={{
          attachment: null, document: null, diagram: null,
          linkIndex: null, svg: null, vaultConfig: null,
          tab: { read: vi.fn().mockResolvedValue(""), write },
        }}
      >
        {children}
      </StubRepositoryProvider>
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
    const write = vi.fn().mockResolvedValue(undefined);
    const onImported = vi.fn();
    const { result } = renderHook(() => useGpImport({ onImported }), {
      wrapper: ({ children }) => <Wrap write={write}>{children}</Wrap>,
    });

    const file = makeFile("song.gp", [1, 2, 3]);
    await act(async () => {
      await result.current.importBytes(file);
    });

    expect(gpToAlphatex).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith("song.alphatex", "\\title \"Hi\"\n.");
    expect(onImported).toHaveBeenCalledWith("song.alphatex");
  });

  it("strips a multi-segment path to just the basename", async () => {
    vi.mocked(gpToAlphatex).mockResolvedValue("alphatex");
    const write = vi.fn().mockResolvedValue(undefined);
    const onImported = vi.fn();
    const { result } = renderHook(() => useGpImport({ onImported }), {
      wrapper: ({ children }) => <Wrap write={write}>{children}</Wrap>,
    });
    const file = makeFile("solo.gp7", [9]);
    await act(async () => {
      await result.current.importBytes(file);
    });
    expect(write).toHaveBeenCalledWith("solo.alphatex", "alphatex");
  });

  it("handles .gp3/.gp4/.gp5/.gp7 by stripping any of those extensions", async () => {
    vi.mocked(gpToAlphatex).mockResolvedValue("x");
    const write = vi.fn().mockResolvedValue(undefined);
    const onImported = vi.fn();
    for (const ext of ["gp3", "gp4", "gp5", "gp7"]) {
      write.mockClear();
      const { result } = renderHook(() => useGpImport({ onImported }), {
        wrapper: ({ children }) => <Wrap write={write}>{children}</Wrap>,
      });
      const file = makeFile(`song.${ext}`, [1]);
      await act(async () => {
        await result.current.importBytes(file);
      });
      expect(write).toHaveBeenCalledWith("song.alphatex", "x");
      cleanup();
    }
  });

  it("routes a conversion failure through ShellErrorContext", async () => {
    vi.mocked(gpToAlphatex).mockRejectedValue(new Error("Unsupported format"));
    const write = vi.fn();
    const reportError = vi.fn();
    const onImported = vi.fn();
    const { result } = renderHook(() => useGpImport({ onImported }), {
      wrapper: ({ children }) => <Wrap write={write} reportError={reportError}>{children}</Wrap>,
    });
    const file = makeFile("broken.gp", [0]);
    await act(async () => {
      await result.current.importBytes(file);
    });
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError.mock.calls[0][0].message).toBe("Unsupported format");
    expect(write).not.toHaveBeenCalled();
    expect(onImported).not.toHaveBeenCalled();
  });

  it("routes a write failure through ShellErrorContext", async () => {
    vi.mocked(gpToAlphatex).mockResolvedValue("alphatex");
    const write = vi.fn().mockRejectedValue(new Error("permission denied"));
    const reportError = vi.fn();
    const onImported = vi.fn();
    const { result } = renderHook(() => useGpImport({ onImported }), {
      wrapper: ({ children }) => <Wrap write={write} reportError={reportError}>{children}</Wrap>,
    });
    const file = makeFile("a.gp", [1]);
    await act(async () => {
      await result.current.importBytes(file);
    });
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(onImported).not.toHaveBeenCalled();
  });
});
