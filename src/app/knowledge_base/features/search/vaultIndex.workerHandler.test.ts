import { describe, it, expect } from "vitest";
import { createHandler, type WorkerOutMessage } from "./vaultIndex.workerHandler";

function captureHandler(): {
  handle: (msg: unknown) => void;
  out: WorkerOutMessage[];
} {
  const out: WorkerOutMessage[] = [];
  const inner = createHandler();
  return {
    handle: (msg) => inner(msg, (m) => out.push(m)),
    out,
  };
}

describe("vaultIndex.workerHandler", () => {
  it("SEARCH-1.3-01: ADD_DOC indexes the doc; query returns it", () => {
    const { handle, out } = captureHandler();
    handle({ type: "ADD_DOC", path: "a.md", kind: "doc", fields: { body: "alpha bravo" } });
    expect(out).toEqual([]); // ADD_DOC has no response
    handle({ type: "QUERY", id: 1, q: "alpha" });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ type: "RESULTS", id: 1 });
    if (out[0].type === "RESULTS") {
      expect(out[0].items).toHaveLength(1);
      expect(out[0].items[0].path).toBe("a.md");
    }
  });

  it("SEARCH-1.3-02: REMOVE drops the doc; subsequent QUERY returns nothing", () => {
    const { handle, out } = captureHandler();
    handle({ type: "ADD_DOC", path: "a.md", kind: "doc", fields: { body: "alpha" } });
    handle({ type: "REMOVE", path: "a.md" });
    handle({ type: "QUERY", id: 7, q: "alpha" });
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ type: "RESULTS", id: 7, items: [] });
  });

  it("SEARCH-1.3-03: QUERY echoes the request id", () => {
    const { handle, out } = captureHandler();
    handle({ type: "ADD_DOC", path: "a.md", kind: "doc", fields: { body: "alpha" } });
    handle({ type: "QUERY", id: 42, q: "alpha", limit: 1 });
    expect(out[0]).toMatchObject({ type: "RESULTS", id: 42 });
  });

  it("SEARCH-1.3-04: CLEAR empties the index", () => {
    const { handle, out } = captureHandler();
    handle({ type: "ADD_DOC", path: "a.md", kind: "doc", fields: { body: "alpha" } });
    handle({ type: "CLEAR" });
    handle({ type: "QUERY", id: 0, q: "alpha" });
    expect(out).toEqual([{ type: "RESULTS", id: 0, items: [] }]);
  });

  it("SEARCH-1.3-05: unknown message type produces ERROR", () => {
    const { handle, out } = captureHandler();
    handle({ type: "WHATEVER" });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ type: "ERROR" });
    if (out[0].type === "ERROR") {
      expect(out[0].message).toContain("WHATEVER");
    }
  });

  it("non-object messages produce ERROR", () => {
    const { handle, out } = captureHandler();
    handle("not an object");
    handle(null);
    handle(undefined);
    handle(42);
    expect(out).toHaveLength(4);
    for (const m of out) expect(m.type).toBe("ERROR");
  });
});
