import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const mountMock = vi.fn();
const disposeMock = vi.fn();
const loadMock = vi.fn();

vi.mock("../../../infrastructure/alphaTabEngine", () => ({
  AlphaTabEngine: class {
    mount = mountMock;
  },
}));

import { useTabEngine } from "./useTabEngine";

describe("useTabEngine", () => {
  beforeEach(() => {
    mountMock.mockReset();
    disposeMock.mockReset();
    loadMock.mockReset();
  });

  function makeFakeSession() {
    const handlers: Record<string, ((p: unknown) => void)[]> = {};
    return {
      load: loadMock,
      dispose: disposeMock,
      on: (event: string, handler: (p: unknown) => void) => {
        (handlers[event] ??= []).push(handler);
        return () => {
          handlers[event] = handlers[event].filter((h) => h !== handler);
        };
      },
      emit: (event: string, payload: unknown) =>
        (handlers[event] ?? []).forEach((h) => h(payload)),
    };
  }

  it("status starts at 'idle' before the container ref attaches", () => {
    const { result } = renderHook(() => useTabEngine());
    expect(result.current.status).toBe("idle");
    expect(result.current.metadata).toBeNull();
  });

  it("mountInto() loads the source and transitions through 'mounting' → 'ready'", async () => {
    const fakeSession = makeFakeSession();
    mountMock.mockResolvedValue(fakeSession);

    const { result } = renderHook(() => useTabEngine());
    const container = document.createElement("div");
    await act(async () => {
      await result.current.mountInto(container, "\\title \"hi\"\n.");
    });

    expect(mountMock).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("mounting");

    await act(async () => {
      fakeSession.emit("loaded", {
        event: "loaded",
        metadata: { title: "hi", tempo: 90, timeSignature: { numerator: 4, denominator: 4 }, capo: 0, tuning: [], tracks: [], sections: [], totalBeats: 0, durationSeconds: 0 },
      });
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.metadata?.title).toBe("hi");
  });

  it("transitions to 'error' when the engine emits an error event", async () => {
    const fakeSession = makeFakeSession();
    mountMock.mockResolvedValue(fakeSession);
    const { result } = renderHook(() => useTabEngine());
    const container = document.createElement("div");
    await act(async () => {
      await result.current.mountInto(container, "broken");
    });
    await act(async () => {
      fakeSession.emit("error", { event: "error", error: new Error("parse fail") });
    });
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error?.message).toBe("parse fail");
  });

  it("unmount triggers session.dispose via cleanup effect", async () => {
    const fakeSession = makeFakeSession();
    mountMock.mockResolvedValue(fakeSession);
    const { result, unmount } = renderHook(() => useTabEngine());
    const container = document.createElement("div");
    await act(async () => {
      await result.current.mountInto(container, "x");
    });
    expect(disposeMock).not.toHaveBeenCalled();
    unmount();
    expect(disposeMock).toHaveBeenCalledTimes(1);
  });

  it("transitions to 'engine-load-error' when the dynamic import throws", async () => {
    mountMock.mockRejectedValue(new Error("chunk load failed"));
    const { result } = renderHook(() => useTabEngine());
    const container = document.createElement("div");
    await act(async () => {
      await result.current.mountInto(container, "x");
    });
    await waitFor(() => expect(result.current.status).toBe("engine-load-error"));
  });
});
