"use client";

import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";

import type {
  DiagramRepository,
  DocumentRepository,
  LinkIndexRepository,
  VaultConfigRepository,
} from "../domain/repositories";
import { createDiagramRepository } from "../infrastructure/diagramRepo";
import { createDocumentRepository } from "../infrastructure/documentRepo";
import { createLinkIndexRepository } from "../infrastructure/linkIndexRepo";
import { createVaultConfigRepository } from "../infrastructure/vaultConfigRepo";

/**
 * Bag of repositories provided to the knowledge-base component tree. Each
 * member is `null` while no directory handle is active (pre-picker, post-
 * `clearSavedHandle`) — consumers null-check before use, matching the shape
 * of every previous inline `createXRepository(rootHandle)` callsite.
 */
export interface Repositories {
  diagram: DiagramRepository | null;
  document: DocumentRepository | null;
  linkIndex: LinkIndexRepository | null;
  vaultConfig: VaultConfigRepository | null;
}

const EMPTY_REPOS: Repositories = {
  diagram: null,
  document: null,
  linkIndex: null,
  vaultConfig: null,
};

const RepositoryContext = createContext<Repositories | null>(null);

/**
 * Mount beneath `useFileExplorer()`'s consumer in `knowledgeBase.tsx`. The
 * provider re-memoizes the four repos whenever `rootHandle` (the reactive
 * companion to `useFileExplorer.dirHandleRef`) changes — so the pre-picker
 * null state, picker acquisition, and `clearSavedHandle` all flow through
 * the same subscription.
 *
 * Tests can bypass this provider by wrapping components in their own
 * provider with a stub `Repositories` value, avoiding the FSA MockDir tree
 * when the component under test only needs repo I/O.
 */
export function RepositoryProvider({
  rootHandle,
  children,
}: {
  rootHandle: FileSystemDirectoryHandle | null;
  children: ReactNode;
}) {
  const value = useMemo<Repositories>(() => {
    if (!rootHandle) return EMPTY_REPOS;
    return {
      diagram: createDiagramRepository(rootHandle),
      document: createDocumentRepository(rootHandle),
      linkIndex: createLinkIndexRepository(rootHandle),
      vaultConfig: createVaultConfigRepository(rootHandle),
    };
  }, [rootHandle]);

  return (
    <RepositoryContext.Provider value={value}>
      {children}
    </RepositoryContext.Provider>
  );
}

/** Mount any test harness in `RepositoryProvider` or this stub provider. */
export function StubRepositoryProvider({
  value,
  children,
}: {
  value: Repositories;
  children: ReactNode;
}) {
  return (
    <RepositoryContext.Provider value={value}>
      {children}
    </RepositoryContext.Provider>
  );
}

export function useRepositories(): Repositories {
  const ctx = useContext(RepositoryContext);
  if (!ctx) {
    throw new Error(
      "useRepositories must be used within a RepositoryProvider (or StubRepositoryProvider in tests)",
    );
  }
  return ctx;
}
