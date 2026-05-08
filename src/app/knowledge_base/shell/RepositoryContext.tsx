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
  VaultIndexRepository,
} from "../domain/repositories";
import type { SvgRefsRepository } from "../domain/svgRefs";
import type { TabRefsRepository } from "../domain/tabRefs";
import { createAttachmentLinksRepositoryTauri } from "../infrastructure/attachmentLinksRepoTauri";
import { createAttachmentRepositoryTauri } from "../infrastructure/attachmentRepoTauri";
import { createDiagramRepositoryTauri } from "../infrastructure/diagramRepoTauri";
import { createDocumentRepositoryTauri } from "../infrastructure/documentRepoTauri";
import { createLinkIndexRepositoryTauri } from "../infrastructure/linkIndexRepoTauri";
import { createSVGRepositoryTauri } from "../infrastructure/svgRepoTauri";
import { createSvgRefsRepositoryTauri } from "../infrastructure/svgRefsRepoTauri";
import { createTabRepositoryTauri } from "../infrastructure/tabRepoTauri";
import { createTabRefsRepositoryTauri } from "../infrastructure/tabRefsRepoTauri";
import { createVaultConfigRepositoryTauri } from "../infrastructure/vaultConfigRepoTauri";
import { createVaultIndexRepositoryTauri } from "../infrastructure/vaultIndexRepoTauri";

/**
 * Bag of repositories provided to the knowledge-base component tree. Each
 * member is `null` while no vault path is active (pre-picker state) —
 * consumers null-check before use, matching the shape of every previous
 * inline `createXRepository(rootHandle)` callsite.
 */
export interface Repositories {
  attachment: AttachmentRepository | null;
  attachmentLinks: AttachmentLinksRepository | null;
  diagram: DiagramRepository | null;
  document: DocumentRepository | null;
  linkIndex: LinkIndexRepository | null;
  svg: SVGRepository | null;
  svgRefs: SvgRefsRepository | null;
  tab: TabRepository | null;
  tabRefs: TabRefsRepository | null;
  vaultConfig: VaultConfigRepository | null;
  vaultIndex: VaultIndexRepository | null;
}

const EMPTY_REPOS: Repositories = {
  attachment: null,
  attachmentLinks: null,
  diagram: null,
  document: null,
  linkIndex: null,
  svg: null,
  svgRefs: null,
  tab: null,
  tabRefs: null,
  vaultConfig: null,
  vaultIndex: null,
};

export const RepositoryContext = createContext<Repositories | null>(null);

/**
 * Mount beneath `useFileExplorer()`'s consumer in `knowledgeBase.tsx`. The
 * provider re-memoizes the bag of repos whenever the active `vaultPath`
 * changes — so the pre-picker null state, picker acquisition, and any
 * future "switch vault" action all flow through the same subscription.
 *
 * Tests can bypass this provider by wrapping components in their own
 * provider with a stub `Repositories` value (see `StubRepositoryProvider`).
 */
export function RepositoryProvider({
  vaultPath,
  children,
}: {
  vaultPath: string | null;
  children: ReactNode;
}) {
  const value = useMemo<Repositories>(() => {
    if (!vaultPath) return EMPTY_REPOS;
    return {
      attachment: createAttachmentRepositoryTauri(),
      attachmentLinks: createAttachmentLinksRepositoryTauri(),
      diagram: createDiagramRepositoryTauri(),
      document: createDocumentRepositoryTauri(),
      linkIndex: createLinkIndexRepositoryTauri(),
      svg: createSVGRepositoryTauri(),
      svgRefs: createSvgRefsRepositoryTauri(),
      tab: createTabRepositoryTauri(),
      tabRefs: createTabRefsRepositoryTauri(),
      vaultConfig: createVaultConfigRepositoryTauri(),
      vaultIndex: createVaultIndexRepositoryTauri(),
    };
  }, [vaultPath]);

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
