"use client";

import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";

import type {
  AttachmentLinksRepository,
  AttachmentRepository,
  DiagramRepository,
  DocumentRepository,
  LinkIndexRepository,
  SVGRepository,
  TabRepository,
  VaultConfigRepository,
} from "../domain/repositories";
import type { TabRefsRepository } from "../domain/tabRefs";
import { createAttachmentLinksRepository } from "../infrastructure/attachmentLinksRepo";
import { createAttachmentRepository } from "../infrastructure/attachmentRepo";
import { createDiagramRepository } from "../infrastructure/diagramRepo";
import { createDocumentRepository } from "../infrastructure/documentRepo";
import { createLinkIndexRepository } from "../infrastructure/linkIndexRepo";
import { createSVGRepository } from "../infrastructure/svgRepo";
import { createTabRepository } from "../infrastructure/tabRepo";
import { createTabRefsRepository } from "../infrastructure/tabRefsRepo";
import { createVaultConfigRepository } from "../infrastructure/vaultConfigRepo";

/**
 * Bag of repositories provided to the knowledge-base component tree. Each
 * member is `null` while no directory handle is active (pre-picker, post-
 * `clearSavedHandle`) — consumers null-check before use, matching the shape
 * of every previous inline `createXRepository(rootHandle)` callsite.
 */
export interface Repositories {
  attachment: AttachmentRepository | null;
  attachmentLinks: AttachmentLinksRepository | null;
  diagram: DiagramRepository | null;
  document: DocumentRepository | null;
  linkIndex: LinkIndexRepository | null;
  svg: SVGRepository | null;
  tab: TabRepository | null;
  tabRefs: TabRefsRepository | null;
  vaultConfig: VaultConfigRepository | null;
}

const EMPTY_REPOS: Repositories = {
  attachment: null,
  attachmentLinks: null,
  diagram: null,
  document: null,
  linkIndex: null,
  svg: null,
  tab: null,
  tabRefs: null,
  vaultConfig: null,
};

export const RepositoryContext = createContext<Repositories | null>(null);

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
      attachment: createAttachmentRepository(rootHandle),
      attachmentLinks: createAttachmentLinksRepository(rootHandle),
      diagram: createDiagramRepository(rootHandle),
      document: createDocumentRepository(rootHandle),
      linkIndex: createLinkIndexRepository(rootHandle),
      svg: createSVGRepository(rootHandle),
      tab: createTabRepository(rootHandle),
      tabRefs: createTabRefsRepository(rootHandle),
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
