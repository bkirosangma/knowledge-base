import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { StubRepositoryProvider, type Repositories } from "../../../shell/RepositoryContext";
import { FileSystemError } from "../../../domain/errors";
import { useTabContent } from "./useTabContent";

// Mock the alphaTexExporter so tests don't pull in the full alphatab bundle.
vi.mock("../../../infrastructure/alphaTexExporter", () => ({
  serializeScoreToAlphatex: vi.fn(async (s: unknown) => `serialized:${JSON.stringify(s)}`),
}));

function renderWithTab(
  path: string | null,
  tab: Partial<Repositories["tab"]> | null,
  initialPath?: string | null,
) {
  const stub: Repositories = {
    attachment: null, document: null, diagram: null,
    linkIndex: null, svg: null, vaultConfig: null,
    tab: tab as Repositories["tab"], tabRefs: null,
  };
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(StubRepositoryProvider, { value: stub, children });
  return renderHook(({ p }: { p: string | null }) => useTabContent(p), {
    wrapper,
    initialProps: { p: initialPath !== undefined ? initialPath : path },
  });
}

describe("useTabContent", () => {
  let read: ReturnType<typeof vi.fn>;
  let write: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    read = vi.fn(async () => "");
    write = vi.fn(async () => {});
  });

  it("loads the file content when the path changes", async () => {
    read.mockResolvedValue("\\title \"x\"\n.");
    const { result } = renderWithTab("song.alphatex", { read, write } as Partial<Repositories["tab"]>);
    await waitFor(() => expect(result.current.content).toBe("\\title \"x\"\n."));
    expect(read).toHaveBeenCalledWith("song.alphatex");
    expect(result.current.loadError).toBeNull();
  });

  it("captures FileSystemError on load failure", async () => {
    read.mockRejectedValue(new FileSystemError("malformed", "bad"));
    const { result } = renderWithTab("song.alphatex", { read, write } as Partial<Repositories["tab"]>);
    await waitFor(() => expect(result.current.loadError).toBeInstanceOf(FileSystemError));
    expect(result.current.content).toBeNull();
  });

  it("clears prior content when the path changes to null", async () => {
    read.mockResolvedValue("first");
    const stub: Repositories = {
      attachment: null, document: null, diagram: null,
      linkIndex: null, svg: null, vaultConfig: null,
      tab: { read, write } as Repositories["tab"], tabRefs: null,
    };
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(StubRepositoryProvider, { value: stub, children });
    const { result, rerender } = renderHook(
      ({ path }: { path: string | null }) => useTabContent(path),
      { wrapper, initialProps: { path: "a.alphatex" as string | null } },
    );
    await waitFor(() => expect(result.current.content).toBe("first"));
    rerender({ path: null });
    await waitFor(() => expect(result.current.content).toBeNull());
  });

  it("refresh() re-reads the file from disk", async () => {
    read.mockResolvedValueOnce("v1").mockResolvedValueOnce("v2");
    const { result } = renderWithTab("song.alphatex", { read, write } as Partial<Repositories["tab"]>);
    await waitFor(() => expect(result.current.content).toBe("v1"));
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.content).toBe("v2");
    expect(read).toHaveBeenCalledTimes(2);
  });
});

describe("useTabContent (editor flow)", () => {
  let read: ReturnType<typeof vi.fn>;
  let write: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    read = vi.fn(async () => "");
    write = vi.fn(async () => {});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("read-only flow (no setScore call) leaves score=null, dirty=false", async () => {
    const { result } = renderWithTab("song.alphatex", { read, write } as Partial<Repositories["tab"]>);
    // Drain the initial load effect.
    await act(async () => { await vi.runAllTimersAsync(); });
    expect(result.current.score).toBeNull();
    expect(result.current.dirty).toBe(false);
    expect(result.current.saveError).toBeNull();
  });

  it("setScore marks dirty=true and schedules a flush", async () => {
    const { result } = renderWithTab("song.alphatex", { read, write } as Partial<Repositories["tab"]>);
    await act(async () => { await vi.runAllTimersAsync(); });

    act(() => { result.current.setScore({ title: "test" }); });
    expect(result.current.dirty).toBe(true);
    expect(write).not.toHaveBeenCalled();

    // Advance past the debounce window — the timer fires and flush() runs.
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(write).toHaveBeenCalledTimes(1);
    expect(result.current.dirty).toBe(false);
  });

  it("rapid setScore calls coalesce into one write at DRAFT_DEBOUNCE_MS", async () => {
    const { result } = renderWithTab("song.alphatex", { read, write } as Partial<Repositories["tab"]>);
    await act(async () => { await vi.runAllTimersAsync(); });

    act(() => {
      result.current.setScore({ title: "a" });
      result.current.setScore({ title: "b" });
      result.current.setScore({ title: "c" });
    });

    await act(async () => { await vi.advanceTimersByTimeAsync(500); });

    // Only a single write — the last score.
    expect(write).toHaveBeenCalledTimes(1);
    expect(result.current.dirty).toBe(false);
  });

  it("flush() writes immediately and clears dirty", async () => {
    const { result } = renderWithTab("song.alphatex", { read, write } as Partial<Repositories["tab"]>);
    await act(async () => { await vi.runAllTimersAsync(); });

    act(() => { result.current.setScore({ title: "manual" }); });
    expect(result.current.dirty).toBe(true);

    // Flush manually before the timer fires.
    await act(async () => { await result.current.flush(); });

    expect(write).toHaveBeenCalledTimes(1);
    expect(result.current.dirty).toBe(false);
  });

  it("setScore failure sets saveError and keeps dirty=true", async () => {
    const writeError = new FileSystemError("permission", "denied");
    write.mockRejectedValue(writeError);

    const { result } = renderWithTab("song.alphatex", { read, write } as Partial<Repositories["tab"]>);
    await act(async () => { await vi.runAllTimersAsync(); });

    act(() => { result.current.setScore({ title: "fail" }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });

    expect(result.current.saveError).toBeInstanceOf(FileSystemError);
    expect(result.current.saveError?.kind).toBe("permission");
    // dirty must stay true so the user can retry.
    expect(result.current.dirty).toBe(true);
  });

  it("TAB-008b T5: filePath change resets dirty + saveError + cancels pending debounce", async () => {
    const stub: Repositories = {
      attachment: null, document: null, diagram: null,
      linkIndex: null, svg: null, vaultConfig: null,
      tab: { read, write } as Repositories["tab"], tabRefs: null,
    };
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(StubRepositoryProvider, { value: stub, children });
    const { result, rerender } = renderHook(
      ({ path }: { path: string | null }) => useTabContent(path),
      { wrapper, initialProps: { path: "a.alphatex" as string | null } },
    );

    // Drain the initial load effect.
    await act(async () => { await vi.runAllTimersAsync(); });

    // Mark dirty via setScore.
    act(() => { result.current.setScore({ title: "pending" }); });
    expect(result.current.dirty).toBe(true);

    // Switch to a different file — the path-change effect should reset UI state.
    rerender({ path: "b.alphatex" });

    expect(result.current.dirty).toBe(false);
    expect(result.current.saveError).toBeNull();
  });
});
