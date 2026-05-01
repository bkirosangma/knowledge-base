// Web Worker shell — instantiated by the main thread via
// `new Worker(new URL("./vaultIndex.worker.ts", import.meta.url))`.
// Logic lives in `vaultIndex.workerHandler.ts` so it can be unit-tested
// in node; this file just owns the worker globals.

import { createHandler, type WorkerOutMessage } from "./vaultIndex.workerHandler";

interface WorkerScopeLike {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage(m: WorkerOutMessage): void;
}

const ctx = self as unknown as WorkerScopeLike;
const handle = createHandler();

ctx.onmessage = (e: MessageEvent) => {
  handle(e.data, (m) => ctx.postMessage(m));
};
