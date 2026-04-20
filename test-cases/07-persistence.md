# Test Cases — Persistence Surface

> Mirrors §7 of [Features.md](../Features.md). See [README.md](README.md) for ID scheme and coverage markers.
>
> Covers WHERE state lives and how it round-trips across storage layers. Feature-level behaviours that happen to use persistence (e.g. diagram save/load) are in [03-diagram.md](03-diagram.md) / [04-document.md](04-document.md); this file owns the _storage-layer contract_.

---

## 7.1 localStorage (Scoped)

- **PERSIST-7.1-01** ✅ **Every key is scope-prefixed when a scope is set** — `scopedKey('explorer.sort')` with scope `'abc12345'` returns `'explorer.sort[abc12345]'`.
- **PERSIST-7.1-02** ✅ **Unscoped keys used pre-folder** — `scopedKey('x')` with no active scope returns `'x'` verbatim.
- **PERSIST-7.1-03** ✅ **Scope switch isolates keys** — `saveDiagram` under scope A then switch to scope B → `loadDiagram` returns defaults; switch back to A → A's data is intact. Same isolation holds for drafts (`listDrafts`, `hasDraft`).
- **PERSIST-7.1-04** 🚫 **Explorer sort field / direction / grouping persisted.** — not wired to `localStorage`; state is local to `ExplorerPanel`. Implementation gap, not a test gap — open a feature ticket to persist it.
- **PERSIST-7.1-05** 🚫 **Explorer filter (`all | diagrams | documents`) persisted.** — same as 7.1-04; filter state resets on reload.
- **PERSIST-7.1-06** 🚫 **Explorer collapse flag persisted.** — the per-folder collapse set is in-memory only.
- **PERSIST-7.1-07** ✅ **Split ratio persisted per `storageKey`.** — covered by SHELL-1.4-13 in `SplitPane.test.tsx`.
- **PERSIST-7.1-08** ✅ **Pane layout persisted** — `savePaneLayout(left, right, focus, lastClosed)` → `loadPaneLayout` round-trips the full `SavedPaneLayout` shape; corrupted JSON returns `null`.
- **PERSIST-7.1-09** 🚫 **"Don't ask again" flags persisted** — `ConfirmPopover` exposes `onDontAskChange`, but no caller persists the flag to `localStorage`. Implementation gap — the current UX re-prompts every time.
- **PERSIST-7.1-10** ✅ **Per-diagram viewport (zoom + scroll) persisted** — scoped viewport key shape + `migrateViewport`/`clearViewport` covered in `persistence.test.ts`; the `useViewportPersistence` hook wires the DOM-level save on scroll and is exercised in the diagram canvas (DOM-geometry-dependent, so 🟡-level hook coverage).
- **PERSIST-7.1-11** ✅ **Per-diagram drafts persisted** — `saveDraft`/`loadDraft`/`hasDraft`/`clearDraft`/`listDrafts` all scoped; `cleanupOrphanedData` prunes drafts for files no longer in the vault.
- **PERSIST-7.1-12** ✅ **Document-properties collapse flag persisted** — `"properties-collapsed"` boolean key read/written in `DocumentView.tsx` and `DiagramView.tsx` (unscoped global — same state shared across vaults, by design).
- **PERSIST-7.1-13** ✅ **Reset App clears every scoped and unscoped key** — covered by SHELL-1.3-07 in `Footer.test.tsx` (`localStorage.clear` + `window.location.reload`).
- **PERSIST-7.1-14** ✅ **Graceful handling when localStorage is full / unavailable** — `saveDiagram` still swallows `QuotaExceededError` (best-effort snapshot; no caller depends on success). Phase 5c (2026-04-19) flipped `saveDraft` to throw a classified `FileSystemError(kind='quota-exceeded')` so the caller in `useDiagramPersistence` can `reportError` — previously a silent swallow was the highest-impact data-loss vector in the audit. `loadDiagram` / `loadPaneLayout` / `loadDraft` still return defaults / null on corrupt JSON.
- **PERSIST-7.1-15** 🚫 **Private mode** — equivalent to 7.1-14 at the localStorage API level; covered by the quota-error test since jsdom cannot simulate browser private-mode semantics directly.

## 7.2 IndexedDB

- **PERSIST-7.2-01** ✅ **Database name = `knowledge-base`.** — `idbHandles.test.ts`.
- **PERSIST-7.2-02** ✅ **Object store = `handles`.** — `idbHandles.test.ts`.
- **PERSIST-7.2-03** ✅ **`saveDirHandle(handle, scopeId)` writes entry.** — `idbHandles.test.ts`.
- **PERSIST-7.2-04** ✅ **`loadDirHandle` reads entry.** — `idbHandles.test.ts`.
- **PERSIST-7.2-05** ✅ **`clearDirHandle` removes entry.** — `idbHandles.test.ts`.
- **PERSIST-7.2-06** ✅ **Schema upgrade path** — `openIDB` creates the store on first open; re-opens are idempotent. `idbHandles.test.ts`.
- **PERSIST-7.2-07** ✅ **Handle round-trips via structured clone** — stored → loaded returns the same handle shape + scope id (legacy state without scope mints a fresh 8-char hex id). `idbHandles.test.ts`.
- **PERSIST-7.2-08** ✅ **Handle removal leaves DB + store intact for a fresh save** — save→clear→save round-trip works. `idbHandles.test.ts`.

## 7.3 Disk (File System Access API)

### 7.3.a Vault structure
- **PERSIST-7.3-01** 🟡 **Diagrams saved as `.json`.** — the picker/save flow enforces `.json` in `useFileActions` (integration-only); not yet pinned as a unit assertion.
- **PERSIST-7.3-02** 🟡 **Documents saved as `.md`.** — same scope as 7.3-01; markdown (de)serialisation itself is covered by DOC-4.4-01..22.
- **PERSIST-7.3-03** ✅ **History sidecars at `.<name>.history.json`** — hidden (dot-prefix). Covered by HOOK-6.1-09 in `useActionHistory.test.ts`.
- **PERSIST-7.3-04** ✅ **Vault config at `.archdesigner/config.json`.** — `initVault` writes to `.archdesigner/config.json` and `loadVaultConfig` reads from it; both paths directly asserted in FS-2.2-01 in `vaultConfig.test.ts`.
- **PERSIST-7.3-05** ✅ **Link index at `.archdesigner/_links.json`.** — DOC-4.10-01 reads from that exact path.
- **PERSIST-7.3-06** ✅ **Graphify cross-refs at `.archdesigner/cross-references.json`.** — LINK-5.3-01 in `graphifyBridge.test.ts`.
- **PERSIST-7.3-07** ✅ **`.archdesigner/` folder created on first save that needs it.** — `graphifyBridge.test.ts` "creates the .archdesigner directory if it does not exist".

### 7.3.b Round-trips
- **PERSIST-7.3-08** ✅ **Diagram save → reload → identical tree** — layers, nodes, connections, flows. Covered by DIAG-3.19-05/06/07 in `persistence.test.ts`.
- **PERSIST-7.3-09** ✅ **Document save → reload → markdown round-trip preserved.** — DOC-4.4-01..22 in `markdownSerializer.test.ts`.
- **PERSIST-7.3-10** 🟡 **Viewport round-trip** — zoom + scroll restored exactly. Viewport key shape + migrate/clear helpers covered; hook-level save path is DOM-geometry-dependent and JSDOM-incompatible (verified manually / e2e).
- **PERSIST-7.3-11** ✅ **Manual layer sizes restored.** — part of DIAG-3.19-05/06/07 round-trip.
- **PERSIST-7.3-12** 🟡 **Measured node sizes restored.** — `serializeNodes` does not persist runtime-measured sizes (those are recomputed on mount); this case is effectively a no-op for the contract.
- **PERSIST-7.3-13** ✅ **Icon names round-trip** — `iconName: "Server"` survives save/load; lucide aliases (`BarChart`, `Fingerprint`) now also round-trip after the reverse-lookup fix. DIAG-3.4-04 + DIAG-3.19-02/03.
- **PERSIST-7.3-14** ✅ **Legacy colour classes migrated on load** — `bg-[#eff3f9]` → `#eff3f9`. DIAG-3.19-04 in `persistence.test.ts`.

### 7.3.c Failure modes
- **PERSIST-7.3-15** 🚫 **Revoked permission surfaces error.** — requires a real browser to simulate File System Access permission revocation; covered at the Playwright layer when a mock is in place
- **PERSIST-7.3-16** 🚫 **Partial write retry.** — no retry logic in the codebase; this is an explicit non-feature. Open a product ticket if retry semantics are desired.
- **PERSIST-7.3-17** ✅ **External rename detection via FNV-1a** — checksum match restores history (HOOK-6.1-07) and mismatch discards stale sidecar and starts fresh (HOOK-6.1-08); both covered in `useActionHistory.test.ts` with a FS mock that returns prepared JSON.

## 7.4 Draft ↔ Disk Interaction

- **PERSIST-7.4-01** 🟡 **Edit writes draft immediately** — local change → `localStorage` key updated. The `saveDraft` util itself is synchronous (DIAG-3.19-10); the caller's debounce is integration-level.
- **PERSIST-7.4-02** 🟡 **Open file with newer draft than disk** — draft wins; editor marked dirty. The draft-wins logic is in `useFileExplorer.openFile` / `useDocumentContent`; an explicit draft-newer-than-disk test is deferred to the integration harness.
- **PERSIST-7.4-03** 🟡 **Open file with no draft** — disk content used; clean state. Same integration scope as 7.4-02.
- **PERSIST-7.4-04** ✅ **Save clears draft for that path.** — `clearDraft` semantics covered in `persistence.test.ts` DIAG-3.19-14; save → clearDraft wiring is in `useFileActions` and is hit by the useFileActions unit tests.
- **PERSIST-7.4-05** ✅ **Discard clears draft without writing disk.** — `useFileActions.test.ts` "executeDiscard" covers the clear path; disk writes only happen via `saveFile`, which is not called.
- **PERSIST-7.4-06** ✅ **`listDrafts` returns all scoped draft keys.** — DIAG-3.19-13 in `persistence.test.ts` asserts exactly this.
- **PERSIST-7.4-07** ✅ **Draft for deleted file removed** — `cleanupOrphanedData(existingFiles)` removes drafts (and viewport entries) for every file not in the set; unrelated non-draft / non-viewport keys are left untouched.

## 7.5 Cross-Store Invariants

- **PERSIST-7.5-01** ✅ **Scope ID consistency** — `saveDirHandle(handle, scopeId)` writes the scope id into IDB alongside the handle (`idbHandles.test.ts` PERSIST-7.2-03); `setDirectoryScope(scopeId)` in `directoryScope.ts` feeds the same id into `scopedKey` (`directoryScope.test.ts`). Same id flows through both stores.
- **PERSIST-7.5-02** ✅ **No orphaned keys after folder change** — `PERSIST-7.1-03` in `persistence.test.ts` asserts scope-switch isolation; `cleanupOrphanedData` in `persistence.test.ts` verifies per-file pruning.
- **PERSIST-7.5-03** ✅ **Reset App clears localStorage AND reloads AND does NOT wipe disk files** — SHELL-1.3-07 covers the LS clear + reload; disk is untouched because the Reset handler in `Footer.tsx:52` only calls `localStorage.clear` and `window.location.reload`.
- **PERSIST-7.5-04** 🚫 **Reset App does NOT clear IDB handle** — current `Footer.tsx:52` Reset handler only wipes `localStorage`; the IDB entry persists across reload. Intended semantics are unverified (product decision): open a ticket if the IDB handle should be cleared too.
