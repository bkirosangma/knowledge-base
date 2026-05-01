// Worker message protocol (KB-010 / SEARCH-8.3).
//
// The actual Web Worker file (`vaultIndex.worker.ts`) is a tiny shell that
// owns the `self.onmessage` plumbing. All real logic lives here so it can
// be unit-tested in node without spinning up a worker runtime.

import { VaultIndex, type DocFields, type DocKind, type SearchResult } from "./VaultIndex";

export type WorkerInMessage =
  | { type: "ADD_DOC"; path: string; kind: DocKind; fields: DocFields }
  | { type: "REMOVE"; path: string }
  | { type: "QUERY"; id: number; q: string; limit?: number }
  | { type: "CLEAR" };

export type WorkerOutMessage =
  | { type: "RESULTS"; id: number; items: SearchResult[] }
  | { type: "ERROR"; message: string };

export type PostBack = (m: WorkerOutMessage) => void;

/** Build a fresh handler bound to its own VaultIndex. The handler is the
 *  callable consumed by `self.onmessage` in the worker shell. */
export function createHandler(): (msg: unknown, postBack: PostBack) => void {
  const index = new VaultIndex();
  return (msg, postBack) => {
    if (!isWorkerInMessage(msg)) {
      postBack({ type: "ERROR", message: `Unknown message: ${describe(msg)}` });
      return;
    }
    try {
      dispatch(msg, index, postBack);
    } catch (err) {
      postBack({ type: "ERROR", message: err instanceof Error ? err.message : String(err) });
    }
  };
}

function dispatch(msg: WorkerInMessage, index: VaultIndex, postBack: PostBack): void {
  switch (msg.type) {
    case "ADD_DOC":
      index.addDoc(msg.path, msg.kind, msg.fields);
      return;
    case "REMOVE":
      index.removeDoc(msg.path);
      return;
    case "QUERY":
      postBack({ type: "RESULTS", id: msg.id, items: index.query(msg.q, msg.limit) });
      return;
    case "CLEAR":
      index.clear();
      return;
  }
}

function isWorkerInMessage(msg: unknown): msg is WorkerInMessage {
  if (!msg || typeof msg !== "object") return false;
  const t = (msg as { type?: unknown }).type;
  return t === "ADD_DOC" || t === "REMOVE" || t === "QUERY" || t === "CLEAR";
}

function describe(msg: unknown): string {
  if (msg && typeof msg === "object" && "type" in msg) {
    return `type=${String((msg as { type: unknown }).type)}`;
  }
  return typeof msg;
}
