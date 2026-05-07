import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { StubRepositoryProvider } from "../../../shell/RepositoryContext";
import { ShellErrorProvider } from "../../../shell/ShellErrorContext";
import { useTabSources } from "./useTabSources";
import type { TabRefsPayload, TabRefsRepository } from "../../../domain/tabRefs";

function stubTabRefs() {
  const store = new Map<string, TabRefsPayload>();
  const writeSpy = vi.fn(async (p: string, payload: TabRefsPayload) => {
    store.set(p, { ...payload });
  });
  const repo: TabRefsRepository = {
    async read(p) { return store.get(p) ?? null; },
    write: writeSpy,
  };
  return { repo, store, writeSpy };
}

function makeWrapper(repo: TabRefsRepository) {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <ShellErrorProvider>
      <StubRepositoryProvider value={{
        attachment: null, attachmentLinks: null, diagram: null,
        document: null, linkIndex: null, svg: null, svgRefs: null,
        tab: null, tabRefs: repo, vaultConfig: null,
      }}>
        {children}
      </StubRepositoryProvider>
    </ShellErrorProvider>
  );
  return Wrapper;
}

describe("useTabSources", () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); });
  afterEach(() => { vi.useRealTimers(); });

  it("loads existing sources from sidecar on mount", async () => {
    const { repo, store } = stubTabRefs();
    store.set("a.alphatex", {
      version: 3, sectionRefs: {}, trackRefs: [],
      sources: [{ url: "https://x.test" }],
    });
    const { result } = renderHook(() => useTabSources("a.alphatex"), {
      wrapper: makeWrapper(repo),
    });
    await waitFor(() => expect(result.current.sources).toHaveLength(1));
    expect(result.current.sources[0].url).toBe("https://x.test");
  });

  it("write preserves sectionRefs and trackRefs (merge guard)", async () => {
    const { repo, store, writeSpy } = stubTabRefs();
    store.set("a.alphatex", {
      version: 3,
      sectionRefs: { "sec-1": "Verse" },
      trackRefs: [{ id: "trk-1", name: "Lead" }],
    });
    const { result } = renderHook(() => useTabSources("a.alphatex"), {
      wrapper: makeWrapper(repo),
    });
    await waitFor(() => expect(result.current.sources).toEqual([]));
    act(() => result.current.setSources([{ url: "https://x.test" }]));
    await act(async () => { vi.advanceTimersByTime(250); });
    await waitFor(() => expect(writeSpy).toHaveBeenCalled());
    const written = writeSpy.mock.calls[0][1] as TabRefsPayload;
    expect(written.sectionRefs).toEqual({ "sec-1": "Verse" });
    expect(written.trackRefs).toEqual([{ id: "trk-1", name: "Lead" }]);
    expect(written.sources).toEqual([{ url: "https://x.test" }]);
  });

  it("write merges with current sidecar — no race with concurrent track rename", async () => {
    const { repo, store, writeSpy } = stubTabRefs();
    store.set("a.alphatex", {
      version: 3, sectionRefs: {}, trackRefs: [{ id: "trk-1", name: "Lead" }],
    });
    const { result } = renderHook(() => useTabSources("a.alphatex"), {
      wrapper: makeWrapper(repo),
    });
    await waitFor(() => expect(result.current.sources).toEqual([]));
    act(() => result.current.setSources([{ url: "https://x.test" }]));
    // Simulate a track rename writing through the sidecar mid-debounce.
    store.set("a.alphatex", {
      version: 3, sectionRefs: {},
      trackRefs: [{ id: "trk-1", name: "Renamed Lead" }],
    });
    await act(async () => { vi.advanceTimersByTime(250); });
    await waitFor(() => expect(writeSpy).toHaveBeenCalled());
    const written = writeSpy.mock.calls[0][1] as TabRefsPayload;
    expect(written.trackRefs).toEqual([{ id: "trk-1", name: "Renamed Lead" }]);
    expect(written.sources).toEqual([{ url: "https://x.test" }]);
  });

  it("setSources([]) keeps the rest of the sidecar but drops sources", async () => {
    const { repo, store, writeSpy } = stubTabRefs();
    store.set("a.alphatex", {
      version: 3, sectionRefs: { "sec-1": "Verse" }, trackRefs: [],
      sources: [{ url: "https://x.test" }],
    });
    const { result } = renderHook(() => useTabSources("a.alphatex"), {
      wrapper: makeWrapper(repo),
    });
    await waitFor(() => expect(result.current.sources).toHaveLength(1));
    act(() => result.current.setSources([]));
    await act(async () => { vi.advanceTimersByTime(250); });
    await waitFor(() => expect(writeSpy).toHaveBeenCalled());
    const written = writeSpy.mock.calls[0][1] as TabRefsPayload;
    expect(written.sources).toEqual([]);
    expect(written.sectionRefs).toEqual({ "sec-1": "Verse" });
  });

  it("write failure leaves isDirty true", async () => {
    const writeSpy = vi.fn(async () => { throw new Error("disk full"); });
    const repo: TabRefsRepository = {
      async read() { return null; },
      write: writeSpy,
    };
    const { result } = renderHook(() => useTabSources("a.alphatex"), {
      wrapper: makeWrapper(repo),
    });
    await waitFor(() => expect(result.current.isDirty).toBe(false));
    act(() => result.current.setSources([{ url: "https://x.test" }]));
    expect(result.current.isDirty).toBe(true);
    await act(async () => { vi.advanceTimersByTime(250); });
    await waitFor(() => expect(writeSpy).toHaveBeenCalled());
    expect(result.current.isDirty).toBe(true);
  });

  it("file switch flushes pending debounce to the previous file", async () => {
    const { repo, store, writeSpy } = stubTabRefs();
    store.set("a.alphatex", { version: 3, sectionRefs: {}, trackRefs: [] });
    const { result, rerender } = renderHook(
      ({ filePath }: { filePath: string | null }) => useTabSources(filePath),
      { wrapper: makeWrapper(repo), initialProps: { filePath: "a.alphatex" } },
    );
    await waitFor(() => expect(result.current.isDirty).toBe(false));
    act(() => result.current.setSources([{ url: "https://a.test" }]));
    expect(result.current.isDirty).toBe(true);
    rerender({ filePath: "b.alphatex" });
    await waitFor(() => expect(writeSpy).toHaveBeenCalled());
    const written = writeSpy.mock.calls[0];
    expect(written[0]).toBe("a.alphatex");
    expect((written[1] as TabRefsPayload).sources).toEqual([{ url: "https://a.test" }]);
  });
});
