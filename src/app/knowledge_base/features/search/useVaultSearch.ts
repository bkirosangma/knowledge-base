// React hook for vault search (KB-010b / SEARCH-4.x).
//
// Owns the search worker's lifecycle, multiplexes QUERY/RESULTS by id,
// and exposes a small API the shell uses to pump incremental updates and
// fire user queries. Pending query promises are drained on terminate so
// callers never hang.

import { useCallback, useEffect, useRef, useState } from "react";
import type { DocFields, DocKind, SearchResult } from "./VaultIndex";
import {
  createRealWorkerClient,
  type SearchWorkerClient,
} from "./searchWorkerClient";

export interface VaultSearch {
  /** Run a query against the worker. Resolves to `[]` if the worker has
   *  been terminated mid-flight. */
  search: (q: string, limit?: number) => Promise<SearchResult[]>;
  /** Add or replace a doc in the index. */
  addDoc: (path: string, kind: DocKind, fields: DocFields) => void;
  /** Drop a path from the index. */
  removePath: (path: string) => void;
  /** Rename: drop the old path and add the new one in one transaction. */
  renamePath: (oldPath: string, newPath: string, kind: DocKind, fields: DocFields) => void;
  /** Drop everything — used when swapping vaults. */
  clear: () => void;
  /** True once the worker is up. Does not gate queries on indexing
   *  completeness; partial results are valid. */
  ready: boolean;
}

/** Optional `clientFactory` lets tests inject a deterministic in-process
 *  client. Production callers omit it and get a real Web Worker. */
export function useVaultSearch(
  clientFactory: () => SearchWorkerClient = createRealWorkerClient,
): VaultSearch {
  const clientRef = useRef<SearchWorkerClient | null>(null);
  const [ready, setReady] = useState(false);
  const idCounter = useRef(0);
  const pending = useRef(new Map<number, (items: SearchResult[]) => void>());

  useEffect(() => {
    const client = clientFactory();
    clientRef.current = client;
    // Snapshot the pending Map for cleanup to silence the ref-staleness
    // lint. The Map identity is stable for the hook's lifetime so this
    // is just satisfying the rule — same object either way.
    const pendingMap = pending.current;

    const unsubscribe = client.onMessage((m) => {
      if (m.type === "RESULTS") {
        const cb = pendingMap.get(m.id);
        if (cb) {
          pendingMap.delete(m.id);
          cb(m.items);
        }
      }
      // ERROR messages are ignored here — surfacing them is a follow-up
      // once we wire ShellErrorContext through this hook.
    });

    setReady(true);

    return () => {
      unsubscribe();
      // Drain any in-flight queries so callers don't hang after teardown.
      for (const cb of pendingMap.values()) cb([]);
      pendingMap.clear();
      client.terminate();
      clientRef.current = null;
      setReady(false);
    };
    // clientFactory is treated as static for the hook's lifetime; passing
    // a different one between renders would silently leak workers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const search = useCallback((q: string, limit?: number): Promise<SearchResult[]> => {
    return new Promise((resolve) => {
      const client = clientRef.current;
      if (!client) {
        resolve([]);
        return;
      }
      const id = ++idCounter.current;
      pending.current.set(id, resolve);
      client.post({ type: "QUERY", id, q, limit });
    });
  }, []);

  const addDoc = useCallback((path: string, kind: DocKind, fields: DocFields) => {
    clientRef.current?.post({ type: "ADD_DOC", path, kind, fields });
  }, []);

  const removePath = useCallback((path: string) => {
    clientRef.current?.post({ type: "REMOVE", path });
  }, []);

  const renamePath = useCallback(
    (oldPath: string, newPath: string, kind: DocKind, fields: DocFields) => {
      const client = clientRef.current;
      if (!client) return;
      client.post({ type: "REMOVE", path: oldPath });
      client.post({ type: "ADD_DOC", path: newPath, kind, fields });
    },
    [],
  );

  const clear = useCallback(() => {
    clientRef.current?.post({ type: "CLEAR" });
  }, []);

  return { search, addDoc, removePath, renamePath, clear, ready };
}
