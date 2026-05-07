import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { StubRepositoryProvider } from "../../../shell/RepositoryContext";
import { ShellErrorProvider } from "../../../shell/ShellErrorContext";
import { useSvgMeta } from "./useSvgMeta";
import type { SvgRefsPayload, SvgRefsRepository } from "../../../domain/svgRefs";

function stubSvgRefs() {
  const store = new Map<string, SvgRefsPayload>();
  const repo: SvgRefsRepository = {
    async read(p) { return store.get(p) ?? null; },
    async write(p, payload) {
      const sources = payload.sources ?? [];
      const attached = payload.attachedTo ?? [];
      if (sources.length === 0 && attached.length === 0) {
        store.delete(p);
        return;
      }
      store.set(p, { ...payload });
    },
  };
  return { repo, store };
}

function makeWrapper(repo: SvgRefsRepository) {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <ShellErrorProvider>
      <StubRepositoryProvider value={{
        attachment: null, attachmentLinks: null, diagram: null,
        document: null, linkIndex: null, svg: null, svgRefs: repo,
        tab: null, tabRefs: null, vaultConfig: null,
      }}>
        {children}
      </StubRepositoryProvider>
    </ShellErrorProvider>
  );
  return Wrapper;
}

describe("useSvgMeta", () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); });
  afterEach(() => { vi.useRealTimers(); });

  it("loads sources from sidecar on mount", async () => {
    const { repo, store } = stubSvgRefs();
    store.set("a.svg", { version: 1, sources: [{ url: "https://x.test" }] });
    const { result } = renderHook(() => useSvgMeta("a.svg"), { wrapper: makeWrapper(repo) });
    await waitFor(() => expect(result.current.sources).toHaveLength(1));
    expect(result.current.sources[0].url).toBe("https://x.test");
    expect(result.current.isDirty).toBe(false);
  });

  it("setSources flips isDirty true; debounced write resets it", async () => {
    const { repo, store } = stubSvgRefs();
    const { result } = renderHook(() => useSvgMeta("a.svg"), { wrapper: makeWrapper(repo) });
    await waitFor(() => expect(result.current.isDirty).toBe(false));
    act(() => result.current.setSources([{ url: "https://y.test" }]));
    expect(result.current.isDirty).toBe(true);
    await act(async () => { vi.advanceTimersByTime(250); });
    await waitFor(() => expect(result.current.isDirty).toBe(false));
    expect(store.get("a.svg")?.sources).toEqual([{ url: "https://y.test" }]);
  });

  it("setSources([]) deletes sidecar via repo.write", async () => {
    const { repo, store } = stubSvgRefs();
    store.set("a.svg", { version: 1, sources: [{ url: "https://x.test" }] });
    const { result } = renderHook(() => useSvgMeta("a.svg"), { wrapper: makeWrapper(repo) });
    await waitFor(() => expect(result.current.sources).toHaveLength(1));
    act(() => result.current.setSources([]));
    await act(async () => { vi.advanceTimersByTime(250); });
    await waitFor(() => expect(store.has("a.svg")).toBe(false));
  });

  it("filePath=null leaves sources empty and isDirty false", async () => {
    const { repo } = stubSvgRefs();
    const { result } = renderHook(() => useSvgMeta(null), { wrapper: makeWrapper(repo) });
    await waitFor(() => expect(result.current.sources).toEqual([]));
    expect(result.current.isDirty).toBe(false);
  });

  it("write failure leaves isDirty true", async () => {
    const { repo } = stubSvgRefs();
    // Replace write with a failing implementation.
    const failingRepo: SvgRefsRepository = {
      read: repo.read,
      async write() { throw new Error("disk full"); },
    };
    const { result } = renderHook(() => useSvgMeta("a.svg"), { wrapper: makeWrapper(failingRepo) });
    await waitFor(() => expect(result.current.isDirty).toBe(false));
    act(() => result.current.setSources([{ url: "https://x.test" }]));
    expect(result.current.isDirty).toBe(true);
    await act(async () => { vi.advanceTimersByTime(250); });
    // Write rejected → reportError called → isDirty stays true.
    await waitFor(() => expect(result.current.isDirty).toBe(true));
  });

  it("file switch flushes pending debounce to the previous file", async () => {
    const { repo, store } = stubSvgRefs();
    const { result, rerender } = renderHook(
      ({ filePath }: { filePath: string | null }) => useSvgMeta(filePath),
      { wrapper: makeWrapper(repo), initialProps: { filePath: "a.svg" } },
    );
    await waitFor(() => expect(result.current.isDirty).toBe(false));
    // Schedule a pending write to A
    act(() => result.current.setSources([{ url: "https://a.test" }]));
    expect(result.current.isDirty).toBe(true);
    // Switch to B BEFORE debounce fires
    rerender({ filePath: "b.svg" });
    // Pending write to A flushed synchronously by the cleanup
    await waitFor(() => expect(store.get("a.svg")?.sources).toEqual([{ url: "https://a.test" }]));
  });
});
