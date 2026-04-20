# Phase 3a — DIP: LinkIndex + VaultConfig Repositories

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Introduce a `domain/` + `infrastructure/` split with typed repository interfaces for the two smallest FS-touching subsystems (link index and vault config). Establish the pattern so Phase 3b can migrate the larger ones (DiagramRepository, DocumentRepository).

**Why this slice:** useLinkIndex and vaultConfig together account for only ~4 direct FS callsites. Migrating them is low-risk, proves the repository + context wiring, and gives Phase 3b a reusable template.

**Architecture:**
- `domain/repositories.ts` — pure TypeScript interfaces, no FS imports.
- `infrastructure/linkIndexRepo.ts`, `infrastructure/vaultConfigRepo.ts` — File System Access API implementations of the interfaces.
- `shell/RepositoryContext.tsx` — React context providing the repos to consumers.
- Callers migrate from direct utility imports to `useRepositories()`.

**Tech Stack:** TypeScript 5, React 19 context, no new runtime deps.

**Baseline:** 831 unit + 25 e2e tests passing on Node 22.

---

## Task 1: Define domain interfaces

**File:** `src/app/knowledge_base/domain/repositories.ts`

Exports two typed interfaces plus the value types they exchange. No FS types, no React, no classes — pure TS:

```ts
export interface LinkIndex { /* moved from useLinkIndex.ts */ }

export interface LinkIndexRepository {
  load(): Promise<LinkIndex | null>;
  save(index: LinkIndex): Promise<void>;
  readDocContent(docPath: string): Promise<string>;
}

export interface VaultConfig { /* moved from vaultConfig.ts */ }

export interface VaultConfigRepository {
  init(vaultName: string): Promise<VaultConfig>;
  read(): Promise<VaultConfig | null>;
  touchLastOpened(): Promise<void>;
  isVault(config: VaultConfig | null): boolean;
}
```

## Task 2: Implement `infrastructure/linkIndexRepo.ts`

Concrete class-less implementation: factory function taking a `FileSystemDirectoryHandle` and returning a `LinkIndexRepository`. Internal calls use existing `readTextFile` / `writeTextFile` from `fileExplorerHelpers`. Move `LINKS_FILE` + `CONFIG_DIR` constants into the impl.

## Task 3: Migrate `useLinkIndex.ts` to use the repo

Replace direct `readTextFile` / `writeTextFile` / `getSubdirectoryHandle` calls with repository methods. The hook accepts the repo (via `useRepositories()` context, once wired) or takes it as a parameter for now — pick the lighter change.

## Task 4: Implement `infrastructure/vaultConfigRepo.ts`

Wrap the 4 existing `vaultConfig.ts` functions into the `VaultConfigRepository` interface.

## Task 5: Migrate vaultConfig callsites

`grep` for `initVault` / `readVaultConfig` / `updateVaultLastOpened` / `isVaultDirectory` and replace with `repos.vaultConfig.*`.

## Task 6: Wire `RepositoryContext`

`src/app/knowledge_base/shell/RepositoryContext.tsx` — provides a `{ linkIndex, vaultConfig }` bag. Default value: factory that constructs repos from the directory handle held in `useFileExplorer` (pass-through for now; no behaviour change).

## Task 7: Cleanup + Features.md

- Leave `vaultConfig.ts` re-exporting the new repo's functions for backward compat if direct callers still exist.
- Document the domain/ + infrastructure/ pattern in Features.md with a note that DiagramRepository + DocumentRepository are Phase 3b.

---

## Definition of Done

- [ ] All task commits green on Node 22.
- [ ] 831 unit + 25 e2e tests pass unchanged.
- [ ] New directories `domain/` and `infrastructure/` with the stated files.
- [ ] `useLinkIndex.ts` no longer directly imports `readTextFile` / `writeTextFile`.
- [ ] Vault config callsites use the repository.
- [ ] `Features.md` notes the new layer boundaries.
- [ ] No user-visible behaviour change.

## Risk & rollback

- **Risk: Test fixtures break** when `useLinkIndex` changes from FS calls to repo calls. Mitigation: existing tests use `MockDir/MockFile` to stub FS — if the repo is constructed inside the hook, the test can continue to pass the mocked handle without changing anything.
- **Rollback:** each task = one commit.
