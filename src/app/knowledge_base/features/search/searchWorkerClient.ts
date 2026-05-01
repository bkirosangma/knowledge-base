// Worker client wrapper (KB-010b).
//
// `useVaultSearch` consumes this interface, not `Worker` directly, so unit
// tests can inject a fake that runs the message handler synchronously in
// node — without the cross-environment pain of mocking
// `new Worker(new URL(..., import.meta.url))` under jsdom + Turbopack.

import type { WorkerInMessage, WorkerOutMessage } from "./vaultIndex.workerHandler";

export interface SearchWorkerClient {
  post(message: WorkerInMessage): void;
  /** Subscribe to messages from the worker. Returns an unsubscribe fn. */
  onMessage(cb: (m: WorkerOutMessage) => void): () => void;
  /** Tear down. After terminate, posts/onMessage are no-ops. */
  terminate(): void;
}

/** Production client backed by a real Web Worker. Lazy-instantiated by
 *  `useVaultSearch` so server-side renders never touch `Worker`. */
export function createRealWorkerClient(): SearchWorkerClient {
  const worker = new Worker(new URL("./vaultIndex.worker.ts", import.meta.url), {
    type: "module",
  });
  const subs = new Set<(m: WorkerOutMessage) => void>();
  worker.onmessage = (e: MessageEvent<WorkerOutMessage>) => {
    for (const cb of subs) cb(e.data);
  };
  let alive = true;
  return {
    post(msg) {
      if (!alive) return;
      worker.postMessage(msg);
    },
    onMessage(cb) {
      if (!alive) return () => {};
      subs.add(cb);
      return () => {
        subs.delete(cb);
      };
    },
    terminate() {
      if (!alive) return;
      alive = false;
      subs.clear();
      worker.terminate();
    },
  };
}
