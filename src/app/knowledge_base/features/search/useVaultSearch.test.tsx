import { describe, it, expect } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useVaultSearch } from "./useVaultSearch";
import { createHandler, type WorkerOutMessage } from "./vaultIndex.workerHandler";
import type { SearchWorkerClient } from "./searchWorkerClient";

// In-process client backed by the real worker handler. Lets us exercise
// the full hook + index round-trip without a Worker runtime.
function createTestClient(): { client: SearchWorkerClient; deliver: () => void } {
  const subscribers = new Set<(m: WorkerOutMessage) => void>();
  const handle = createHandler();
  // Outbound queue — the real worker is async, so simulate that by
  // queueing replies and flushing on demand. Tests can drive the cadence.
  const inbox: WorkerOutMessage[] = [];
  const post = (m: WorkerOutMessage) => inbox.push(m);
  let alive = true;
  const client: SearchWorkerClient = {
    post(msg) {
      if (!alive) return;
      handle(msg, post);
      // Microtask hop to mimic worker round-trip.
      queueMicrotask(() => {
        while (inbox.length > 0) {
          const out = inbox.shift()!;
          for (const cb of subscribers) cb(out);
        }
      });
    },
    onMessage(cb) {
      if (!alive) return () => {};
      subscribers.add(cb);
      return () => {
        subscribers.delete(cb);
      };
    },
    terminate() {
      alive = false;
      subscribers.clear();
    },
  };
  return {
    client,
    deliver: () => {
      while (inbox.length > 0) {
        const out = inbox.shift()!;
        for (const cb of subscribers) cb(out);
      }
    },
  };
}

describe("useVaultSearch", () => {
  it("SEARCH-4.1-01: edit reflects in search after addDoc replaces the entry", async () => {
    const { client } = createTestClient();
    const { result } = renderHook(() => useVaultSearch(() => client));

    await waitFor(() => expect(result.current.ready).toBe(true));

    // Initial state
    act(() => {
      result.current.addDoc("notes/a.md", "doc", { body: "alpha" });
    });
    let r = await result.current.search("alpha");
    expect(r.map((x) => x.path)).toEqual(["notes/a.md"]);

    // Simulated edit-and-save: replace the entry with new content
    const t0 = performance.now();
    act(() => {
      result.current.addDoc("notes/a.md", "doc", { body: "alpha bravo" });
    });
    r = await result.current.search("bravo");
    const elapsed = performance.now() - t0;

    expect(r.map((x) => x.path)).toEqual(["notes/a.md"]);
    // Round-trip stays well under the 1-second budget the spec asserts
    // for the user-perceived save → search-reflects path.
    expect(elapsed).toBeLessThan(1000);
  });

  it("SEARCH-4.1-02: renamePath drops the old path and adds the new", async () => {
    const { client } = createTestClient();
    const { result } = renderHook(() => useVaultSearch(() => client));
    await waitFor(() => expect(result.current.ready).toBe(true));

    act(() => {
      result.current.addDoc("old.md", "doc", { body: "alpha" });
    });
    expect((await result.current.search("alpha")).map((r) => r.path)).toEqual(["old.md"]);

    act(() => {
      result.current.renamePath("old.md", "new.md", "doc", { body: "alpha" });
    });
    expect((await result.current.search("alpha")).map((r) => r.path)).toEqual(["new.md"]);
  });

  it("SEARCH-4.1-03: removePath drops a doc from the index", async () => {
    const { client } = createTestClient();
    const { result } = renderHook(() => useVaultSearch(() => client));
    await waitFor(() => expect(result.current.ready).toBe(true));

    act(() => {
      result.current.addDoc("a.md", "doc", { body: "alpha" });
      result.current.addDoc("b.md", "doc", { body: "alpha bravo" });
    });
    expect((await result.current.search("alpha")).map((r) => r.path).sort()).toEqual([
      "a.md",
      "b.md",
    ]);

    act(() => {
      result.current.removePath("a.md");
    });
    expect((await result.current.search("alpha")).map((r) => r.path)).toEqual(["b.md"]);
  });

  it("clear() empties the index", async () => {
    const { client } = createTestClient();
    const { result } = renderHook(() => useVaultSearch(() => client));
    await waitFor(() => expect(result.current.ready).toBe(true));

    act(() => {
      result.current.addDoc("a.md", "doc", { body: "alpha" });
      result.current.clear();
    });
    expect(await result.current.search("alpha")).toEqual([]);
  });

  it("pending queries resolve to [] when the worker is terminated mid-flight", async () => {
    const { client } = createTestClient();
    const { result, unmount } = renderHook(() => useVaultSearch(() => client));
    await waitFor(() => expect(result.current.ready).toBe(true));

    // Fire a query but tear down before it can drain.
    const promise = result.current.search("alpha");
    unmount();
    await expect(promise).resolves.toEqual([]);
  });
});
