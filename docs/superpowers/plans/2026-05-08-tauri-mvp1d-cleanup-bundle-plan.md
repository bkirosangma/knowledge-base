# MVP-1d — Cleanup, Bundle & CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire the now-orphaned File System Access (FSA) layer, delete the GitHub Pages deployment path, switch Next.js to permanent static export (Tauri's `frontendDist`), add a macOS `tauri build --debug` CI job to keep the desktop bundle honest, and finalize `tauri.conf.json` for shipping. This MVP is scoped to **mechanical** cleanup and CI work — no new product behaviour.

**Architecture:** Pure subtraction + CI addition. The FSA `*Repo.ts` originals were already shadowed by `*RepoTauri.ts` since MVP-1a; only one consumer (`useFileActions.ts`) still imports an FSA original (`diagramRepo.ts`). Migrate that single callsite to `createDiagramRepositoryTauri()`, then the FSA originals + their orphaned support files (`idbHandles.ts`, `useDirectoryHandle.ts`, `useOfflineCache.ts`, `vaultIndexRepoFsa.ts`, `types/file-system.d.ts`) can be deleted in one sweep. TypeScript's `lib.dom` already declares `FileSystemDirectoryHandle` / `FileSystemFileHandle` / `showDirectoryPicker`, so removing the project's local `types/file-system.d.ts` is type-safe (the ~22 references resolve via the DOM lib). `next.config.ts` collapses to a single configuration where `output: "export"` is unconditional — Tauri loads the static build from `out/`, the same as the deleted Pages workflow did but without the basePath gymnastics. CI gains a `macos-latest` job that runs `cargo tauri build --debug` end-to-end so a future regression in the Tauri layer doesn't hide behind the existing Ubuntu typecheck/lint/vitest job.

**Tech Stack:**
- Frontend: existing `@tauri-apps/api/core` (`invoke`) — no new deps.
- Rust: no new crates; finalize the existing `tauri.conf.json`.
- CI: GitHub-hosted `macos-latest` runner; `dtolnay/rust-toolchain@stable` for Rust; Node from `.nvmrc`.

---

## 1. Goal

Make the FSA layer a closed chapter: delete the dead implementations + orphaned support, collapse `next.config.ts` to its Tauri-only shape, retire the Pages deploy, and prove the Tauri bundle still builds in CI on macOS. Leave the `historyPersistence` / `useBackgroundScanner` / `useFileExplorer.dirHandleRef` substrate untouched — those depend on a not-yet-designed in-memory history pattern and are explicitly deferred to a follow-up MVP (see **§ 2 Out of scope**).

## 2. Scope

**In scope:**
- Migrate the **only** remaining FSA-Repo consumer: `src/app/knowledge_base/shared/hooks/useFileActions.ts` swaps `createDiagramRepository(rootHandle)` for `createDiagramRepositoryTauri()`. All other consumers were migrated to `*RepoTauri.ts` during MVP-1a.
- Delete the 10 FSA `*Repo.ts` originals under `src/app/knowledge_base/infrastructure/`:
  - `documentRepo.ts`, `diagramRepo.ts`, `svgRepo.ts`, `tabRepo.ts`, `attachmentRepo.ts`, `attachmentLinksRepo.ts`, `linkIndexRepo.ts`, `vaultConfigRepo.ts`, `svgRefsRepo.ts`, `tabRefsRepo.ts`.
- Delete `src/app/knowledge_base/infrastructure/vaultIndexRepoFsa.ts` — already orphaned by MVP-1a's `vaultIndexRepoTauri.ts`.
- Delete `src/app/knowledge_base/shared/utils/idbHandles.ts` + `idbHandles.test.ts` — only consumer is `useDirectoryHandle.ts` (also deleted in this MVP).
- Delete `src/app/knowledge_base/shared/hooks/useDirectoryHandle.ts` + `useDirectoryHandle.test.ts` — orphaned (only its own test references it).
- Delete `src/app/knowledge_base/shared/hooks/useOfflineCache.ts` + `useOfflineCache.test.ts` — already a no-op stub since MVP-1a; remove the single live callsite in `knowledgeBase.tsx`.
- Delete `src/app/knowledge_base/types/file-system.d.ts` — TypeScript's `lib.dom` (already in `tsconfig.json` `lib`) declares `FileSystemDirectoryHandle`, `FileSystemFileHandle`, `FileSystemWritableFileStream`, and `Window.showDirectoryPicker`. The ~22 references across the codebase resolve via the DOM lib without behaviour change.
- Strip `GITHUB_PAGES` / `isPages` from `next.config.ts`. `output: "export"` becomes unconditional (Tauri's `frontendDist: "../out"` consumes it). `basePath` and `NEXT_PUBLIC_BASE_PATH` collapse to `""`. The `images: { unoptimized: true }` + `trailingSlash: true` settings move outside the conditional (Tauri requires both, same as Pages did).
- Delete `.github/workflows/pages.yml` — no GitHub Pages deploy after this MVP.
- Add a new CI job in `.github/workflows/ci.yml` named `tauri-build` running on `macos-latest`: install Rust + Node, `cargo install tauri-cli --version "^2"` (or `npx tauri build --debug`), run `npm install --prefer-offline`, `npm run typecheck`, `npm run lint`, `npm run test:run`, and finally `npx tauri build --debug --no-bundle` (skip the bundle step — we just need the Rust + frontend integration to compile and link). Preserve the existing `checks` and `build` jobs unchanged.
- Finalize `src-tauri/tauri.conf.json`: confirm `productName: "Knowledge Base"`, `identifier: "com.kiro.knowledge-base"`, full icon set, `bundle.targets: ["app", "dmg"]`, no `updater` plugin config (auto-update stays off for MVP-1; can be revisited post-MVP-5). Verify `app.windows[0].title` matches `productName`. No `mainBinaryName` change.
- `Features.md` updates — remove the GitHub-Pages bullet under "Deployment / hosting", note the static-export-by-default change under "Build pipeline".
- `test-cases/` updates — flip any FSA-deletion-blocked status markers (none expected — this MVP doesn't add user-observable behaviour, just retires deprecated paths). Add a single case under `01-app-shell.md` noting "Tauri bundle builds via `cargo tauri build --debug`" if not already present.
- `docs/superpowers/handoffs/2026-05-07-tauri-claude-integration.md` — flip MVP-1c → ✅ Merged with PR #151, MVP-1d → 🚧, replace **Next Action** with the post-MVP-1d step (write MVP-1e plan or jump to MVP-2 depending on the deferral decision), add MVP-1e to **Open follow-up items** for the history substrate work.

**Out of scope (explicitly — these are deferred to a new MVP-1e or folded into MVP-2's substrate):**
- `historyPersistence.ts` deletion — has 23 callers using runtime functions (`fnv1a`, `historyFileName`, `readHistoryFile`, `writeHistoryFile`); no in-memory replacement designed yet. The hash + filename helpers are still useful even in Tauri mode, so this needs a substrate decision (extract pure helpers to a new file vs. inline) rather than a deletion.
- `useBackgroundScanner.ts` migration — depends on `historyPersistence` substrate decision; still receives `dirHandleRef` (now-stub) from `knowledgeBase.tsx:246`.
- `useHistoryFileSync.ts` / `useDocumentHistory.ts` — `initHistory` accepts `FileSystemDirectoryHandle | null` as a parameter; signature cleanup deferred until the substrate decision lands.
- `useFileExplorer.dirHandleRef` stub + `seed: (handle: FileSystemDirectoryHandle) => Promise<void>` callback — removing them requires migrating `useBackgroundScanner` first.
- `FirstRunHero.tsx` + `seedSampleVault.ts` — currently broken in Tauri mode (calls FSA APIs against `null`), but not crashing because the path is only triggered by a button. Defer the redesign alongside the seed-callback signature.
- Remaining FSA-mode helpers in `src/app/knowledge_base/shared/hooks/fileExplorerHelpers.ts` — used by `historyPersistence.ts` and the `seedSampleVault` flow; tied to the same substrate decision.
- `tauri-plugin-webdriver` / Playwright restoration — this is MVP-4, not MVP-1d.
- Auto-update wiring (`tauri-plugin-updater`) — out of scope for the whole MVP-1 sequence.

---

## 3. File structure

**Modified (Frontend):**
- `src/app/knowledge_base/shared/hooks/useFileActions.ts`:
  - Swap import `createDiagramRepository` → `createDiagramRepositoryTauri` (drop the `from "../../infrastructure/diagramRepo"` line; new line: `from "../../infrastructure/diagramRepoTauri"`).
  - Inside `handleLoadFile`'s legacy-document migration block:
    - Before: `const rootHandle = fileExplorer.dirHandleRef.current; if (rootHandle) { const repo = createDiagramRepository(rootHandle); await repo.write(fileName, data); }`
    - After: `const repo = createDiagramRepositoryTauri(); await repo.write(fileName, data);`
  - Drop `fileExplorer.dirHandleRef` from the `useCallback` dep array (the `currentStateRef` mutation pattern keeps the migrated code stable).
  - Leave the `history.initHistory(... fileExplorer.dirHandleRef.current ...)` call alone — that goes in MVP-1e.
- `src/app/knowledge_base/knowledgeBase.tsx`:
  - Drop the `import { useOfflineCache } from "./shared/hooks/useOfflineCache";` line.
  - Drop the `useOfflineCache({ tree: fileExplorer.tree });` call (line 276 currently). The `// TODO MVP-1d:` comment beside it goes with it.
- `next.config.ts` — collapse to:
  ```ts
  import type { NextConfig } from "next";

  const nextConfig: NextConfig = {
    devIndicators: false,
    output: "export",
    images: { unoptimized: true },
    trailingSlash: true,
    env: {
      NEXT_PUBLIC_BASE_PATH: "",
    },
  };

  export default nextConfig;
  ```
  (Drop `isPages`, `basePath`, the conditional-spread block, and the explanatory Pages comment.)
- `.github/workflows/ci.yml` — add a `tauri-build` job after the existing `build` job, on `macos-latest`. Keep `checks` and `build` unchanged. (Exact YAML in **Task 9**.)

**Modified (Rust / Tauri config):**
- `src-tauri/tauri.conf.json` — verify-only pass; if any field needs editing, scope is limited to the MVP-1d scope items (identifier, productName, icons, bundle.targets, updater absence). Do not touch `app.security.csp`.

**Deleted:**
- `src/app/knowledge_base/infrastructure/documentRepo.ts`
- `src/app/knowledge_base/infrastructure/diagramRepo.ts`
- `src/app/knowledge_base/infrastructure/svgRepo.ts`
- `src/app/knowledge_base/infrastructure/tabRepo.ts`
- `src/app/knowledge_base/infrastructure/attachmentRepo.ts`
- `src/app/knowledge_base/infrastructure/attachmentLinksRepo.ts`
- `src/app/knowledge_base/infrastructure/linkIndexRepo.ts`
- `src/app/knowledge_base/infrastructure/vaultConfigRepo.ts`
- `src/app/knowledge_base/infrastructure/svgRefsRepo.ts`
- `src/app/knowledge_base/infrastructure/tabRefsRepo.ts`
- `src/app/knowledge_base/infrastructure/vaultIndexRepoFsa.ts`
- `src/app/knowledge_base/shared/utils/idbHandles.ts`
- `src/app/knowledge_base/shared/utils/idbHandles.test.ts`
- `src/app/knowledge_base/shared/hooks/useDirectoryHandle.ts`
- `src/app/knowledge_base/shared/hooks/useDirectoryHandle.test.ts`
- `src/app/knowledge_base/shared/hooks/useOfflineCache.ts`
- `src/app/knowledge_base/shared/hooks/useOfflineCache.test.ts`
- `src/app/knowledge_base/types/file-system.d.ts`
- `.github/workflows/pages.yml`

**Updated (docs / catalogues):**
- `Features.md` — remove "GitHub Pages deploy" bullet (under "Deployment / hosting" or wherever it lives); add/update the Build pipeline bullet to note "static export is permanent — Next config emits `out/` for Tauri's `frontendDist`".
- `test-cases/01-app-shell.md` — add a case noting "Tauri debug bundle builds in CI on macOS" if not already present (status `❌` until the CI job runs green on the PR's first push, then flip to `✅`).
- `docs/superpowers/handoffs/2026-05-07-tauri-claude-integration.md` — Where-we-are flips MVP-1c to ✅ Merged (PR #151), MVP-1d to 🚧; Next Action becomes the MVP-1e/MVP-2 fork; Open follow-up items consolidates the deferred history-substrate work into a single named MVP-1e item.

---

## 4. Cross-cutting rules

- **Branch:** `feat/tauri-mvp1d-cleanup-bundle`, already created off `main` at the merged MVP-1c tip.
- **Commits:** small, frequent, prefixed `chore(infra):` / `feat(shell):` / `chore(tauri):` / `chore(ci):` / `docs(handoff):` / `docs(kb):` to match the MVP-1a/1b/1c history. **Do not skip hooks** — if a pre-commit hook fails, fix the root cause and create a new commit (never amend a hook-failed commit).
- **TDD discipline:** This MVP is mostly subtraction; the only behaviour change is `useFileActions`'s migration in Task 1, which has existing test coverage (`useFileActions.test.ts` if present, otherwise the migration check is the typecheck + manual smoke). Add a Vitest case **only if** the migration introduces a behaviour gap not caught by typecheck; otherwise the safety net is the existing 942-test suite passing after each deletion.
- **Order matters:** consumer migration (Task 1) **before** deletion (Task 2). `useOfflineCache` import removal (Task 4) before file deletion in the same task. Inside Task 5, `useDirectoryHandle` deletion before `idbHandles` deletion (the former imports the latter).
- **Static-export discipline:** after Task 7, `npm run build` produces `out/` unconditionally. Verify `next.config.ts` no longer reads `process.env.GITHUB_PAGES` and that `npm run build` succeeds locally before committing.
- **CI surface:** the new `tauri-build` job uses `--debug` and `--no-bundle` to keep runtime under 10 minutes on `macos-latest`. Caching for cargo + node is via `Swatinem/rust-cache@v2` and `actions/setup-node@v4`'s `cache: npm`.
- **POSIX-relative paths in IPC:** unchanged — no IPC additions in this MVP.
- **No new Tauri plugins:** stay scoped to existing `tauri-plugin-dialog` + `tauri-plugin-store` + `tauri-plugin-fs` + `notify`.
- **Cross-platform discipline:** the macOS-only CI job is allowed because shipping is macOS-only-but-Linux-port-clean (spec § 5). Do not add macOS-only Tauri plugins or flags during this MVP.

---

## Task 1: Migrate `useFileActions.ts` to `createDiagramRepositoryTauri`

**Files:**
- Modified: `src/app/knowledge_base/shared/hooks/useFileActions.ts`

**Steps:**

- [ ] Read `src/app/knowledge_base/shared/hooks/useFileActions.ts` to confirm the FSA-import line and the legacy-document migration block.
- [ ] Edit the import:
  ```ts
  // Before
  import { createDiagramRepository } from "../../infrastructure/diagramRepo";
  // After
  import { createDiagramRepositoryTauri } from "../../infrastructure/diagramRepoTauri";
  ```
- [ ] Edit the legacy-document migration block inside `handleLoadFile` (currently around line 105–113):
  ```ts
  // Before
  const rootHandle = fileExplorer.dirHandleRef.current;
  if (rootHandle) {
    const repo = createDiagramRepository(rootHandle);
    await repo.write(fileName, data);
  }
  // After
  const repo = createDiagramRepositoryTauri();
  await repo.write(fileName, data);
  ```
- [ ] Update the `useCallback` dep array for `handleLoadFile` — drop `fileExplorer.dirHandleRef` (remaining deps stay).
- [ ] Leave `history.initHistory(..., fileExplorer.dirHandleRef.current, ...)` untouched — it's part of the deferred history-substrate work.

**Acceptance:**

- [ ] `npm run typecheck` passes.
- [ ] `npm run lint` passes (no new warnings beyond the pre-existing 78).
- [ ] `npm run test:run` is green on at least the diagram-flow + useFileActions test files.

**Commit:** `chore(infra): useFileActions — migrate diagramRepo → diagramRepoTauri`

---

## Task 2: Delete the 10 FSA `*Repo.ts` originals

**Files:**
- Deleted: 10 files under `src/app/knowledge_base/infrastructure/`:
  - `documentRepo.ts`
  - `diagramRepo.ts`
  - `svgRepo.ts`
  - `tabRepo.ts`
  - `attachmentRepo.ts`
  - `attachmentLinksRepo.ts`
  - `linkIndexRepo.ts`
  - `vaultConfigRepo.ts`
  - `svgRefsRepo.ts`
  - `tabRefsRepo.ts`

**Steps:**

- [ ] Run `grep -rln "from .*infrastructure/\(documentRepo\|diagramRepo\|svgRepo\|tabRepo\|attachmentRepo\|attachmentLinksRepo\|linkIndexRepo\|vaultConfigRepo\|svgRefsRepo\|tabRefsRepo\)\"" src` to confirm zero remaining importers (Task 1 cleared the only one). If any survive, **stop** and migrate them — do not delete with live importers.
- [ ] `git rm src/app/knowledge_base/infrastructure/documentRepo.ts src/app/knowledge_base/infrastructure/diagramRepo.ts src/app/knowledge_base/infrastructure/svgRepo.ts src/app/knowledge_base/infrastructure/tabRepo.ts src/app/knowledge_base/infrastructure/attachmentRepo.ts src/app/knowledge_base/infrastructure/attachmentLinksRepo.ts src/app/knowledge_base/infrastructure/linkIndexRepo.ts src/app/knowledge_base/infrastructure/vaultConfigRepo.ts src/app/knowledge_base/infrastructure/svgRefsRepo.ts src/app/knowledge_base/infrastructure/tabRefsRepo.ts`

**Acceptance:**

- [ ] `npm run typecheck` passes (no broken imports).
- [ ] `npm run lint` passes.
- [ ] `npm run test:run` passes the full Vitest suite.

**Commit:** `chore(infra): delete FSA *Repo.ts originals (10 files) — Tauri repos shadow them`

---

## Task 3: Delete `vaultIndexRepoFsa.ts`

**Files:**
- Deleted: `src/app/knowledge_base/infrastructure/vaultIndexRepoFsa.ts`

**Steps:**

- [ ] Run `grep -rln "vaultIndexRepoFsa" src` to confirm zero importers.
- [ ] `git rm src/app/knowledge_base/infrastructure/vaultIndexRepoFsa.ts`

**Acceptance:**

- [ ] `npm run typecheck` passes.
- [ ] `npm run test:run` passes.

**Commit:** `chore(infra): delete vaultIndexRepoFsa.ts — orphaned by vaultIndexRepoTauri`

---

## Task 4: Delete `useOfflineCache.ts` and remove its callsite

**Files:**
- Modified: `src/app/knowledge_base/knowledgeBase.tsx`
- Deleted: `src/app/knowledge_base/shared/hooks/useOfflineCache.ts`
- Deleted: `src/app/knowledge_base/shared/hooks/useOfflineCache.test.ts`

**Steps:**

- [ ] Edit `src/app/knowledge_base/knowledgeBase.tsx`:
  - Remove the `import { useOfflineCache } from "./shared/hooks/useOfflineCache";` line.
  - Remove the `useOfflineCache({ tree: fileExplorer.tree });` call (currently around line 276) and the inline `// TODO MVP-1d:` comment beside it.
- [ ] `git rm src/app/knowledge_base/shared/hooks/useOfflineCache.ts src/app/knowledge_base/shared/hooks/useOfflineCache.test.ts`
- [ ] Run `grep -rln "useOfflineCache\|cacheKeyForPath\|KB_CACHE_PREFIX" src` to confirm zero references.

**Acceptance:**

- [ ] `npm run typecheck` passes.
- [ ] `npm run lint` passes.
- [ ] `npm run test:run` passes (the deleted test count drops by however many useOfflineCache test cases were green; total should still be ≥ 942 minus a small number).

**Commit:** `chore(shell): drop useOfflineCache — Tauri ships native, no PWA cache needed`

---

## Task 5: Delete `useDirectoryHandle.ts` and `idbHandles.ts`

**Files:**
- Deleted: `src/app/knowledge_base/shared/hooks/useDirectoryHandle.ts`
- Deleted: `src/app/knowledge_base/shared/hooks/useDirectoryHandle.test.ts`
- Deleted: `src/app/knowledge_base/shared/utils/idbHandles.ts`
- Deleted: `src/app/knowledge_base/shared/utils/idbHandles.test.ts`

**Steps:**

- [ ] Run `grep -rln "useDirectoryHandle\b" src` — should match only the file itself + its test.
- [ ] Run `grep -rln "idbHandles\|saveDirHandle\|loadDirHandle\|clearDirHandle" src` — should match only `idbHandles.ts`, `idbHandles.test.ts`, and `useDirectoryHandle.ts` + its test.
- [ ] `git rm src/app/knowledge_base/shared/hooks/useDirectoryHandle.ts src/app/knowledge_base/shared/hooks/useDirectoryHandle.test.ts`
- [ ] `git rm src/app/knowledge_base/shared/utils/idbHandles.ts src/app/knowledge_base/shared/utils/idbHandles.test.ts`

**Acceptance:**

- [ ] `npm run typecheck` passes.
- [ ] `npm run test:run` passes.

**Commit:** `chore(shell): delete useDirectoryHandle + idbHandles — orphaned FSA persistence path`

---

## Task 6: Delete `types/file-system.d.ts`

**Files:**
- Deleted: `src/app/knowledge_base/types/file-system.d.ts`

**Steps:**

- [ ] Verify `tsconfig.json` `lib` contains `"dom"` (it does — `["dom", "dom.iterable", "esnext"]`).
- [ ] `git rm src/app/knowledge_base/types/file-system.d.ts`
- [ ] Run `npm run typecheck` — expect zero errors. The ~22 references to `FileSystemDirectoryHandle` / `FileSystemFileHandle` resolve via `lib.dom.d.ts` (TypeScript 5 ships these). If a type error appears, do **not** restore the file — instead, identify the missing field and add it to the consuming file as a local interface or type widening, since the FSA layer is otherwise dead code.

**Acceptance:**

- [ ] `npm run typecheck` passes with no FSA-type errors.
- [ ] `npm run test:run` passes.
- [ ] `npm run build` succeeds (catches any TS-config quirk that `typecheck` misses).

**Commit:** `chore(infra): delete types/file-system.d.ts — TypeScript lib.dom covers the FSA types`

---

## Task 7: Strip `GITHUB_PAGES` from `next.config.ts`; static export becomes default

**Files:**
- Modified: `next.config.ts`

**Steps:**

- [ ] Replace the entire body of `next.config.ts` with:
  ```ts
  import type { NextConfig } from "next";

  const nextConfig: NextConfig = {
    devIndicators: false,
    output: "export",
    images: { unoptimized: true },
    trailingSlash: true,
    env: {
      NEXT_PUBLIC_BASE_PATH: "",
    },
  };

  export default nextConfig;
  ```
- [ ] Run `grep -rln "GITHUB_PAGES\|isPages\|NEXT_PUBLIC_BASE_PATH" src` — `NEXT_PUBLIC_BASE_PATH` consumers (if any) read an empty string now and should still work; investigate any that don't and either drop the consumer (if Pages-specific) or document why it stays.
- [ ] Run `npm run build` and confirm `out/` is produced.

**Acceptance:**

- [ ] `next.config.ts` has no `process.env.GITHUB_PAGES` reference and no conditional spread.
- [ ] `npm run build` produces `out/` with the static export.
- [ ] `npm run typecheck` passes.

**Commit:** `chore(shell): make static export the default — drop GITHUB_PAGES env switch`

---

## Task 8: Delete `.github/workflows/pages.yml`

**Files:**
- Deleted: `.github/workflows/pages.yml`

**Steps:**

- [ ] `git rm .github/workflows/pages.yml`
- [ ] Verify `.github/workflows/` still contains `ci.yml` (and any other workflows the repo had).

**Acceptance:**

- [ ] No GitHub Pages workflow remains.
- [ ] `gh workflow list` (after the next push) does not show "Deploy to GitHub Pages".

**Commit:** `chore(ci): drop GitHub Pages deploy — Tauri ships, Pages is retired`

---

## Task 9: Add `tauri-build` job on `macos-latest` in `.github/workflows/ci.yml`

**Files:**
- Modified: `.github/workflows/ci.yml`

**Steps:**

- [ ] Append a new `tauri-build` job after the existing `build` job:
  ```yaml
    tauri-build:
      name: Tauri debug bundle (macOS)
      runs-on: macos-latest
      timeout-minutes: 30

      steps:
        - uses: actions/checkout@v4

        - name: Read Node version from .nvmrc
          id: nvmrc
          run: echo "version=$(cat .nvmrc)" >> "$GITHUB_OUTPUT"

        - uses: actions/setup-node@v4
          with:
            node-version: ${{ steps.nvmrc.outputs.version }}
            cache: npm

        - uses: dtolnay/rust-toolchain@stable

        - uses: Swatinem/rust-cache@v2
          with:
            workspaces: src-tauri -> target

        - name: Install Tauri CLI
          run: cargo install tauri-cli --version "^2" --locked

        - name: Install dependencies
          run: npm install --prefer-offline

        - name: Typecheck
          run: npm run typecheck

        - name: Unit + integration tests
          run: npm run test:run

        - name: Build Tauri (debug, no-bundle)
          run: cargo tauri build --debug --no-bundle
  ```
- [ ] Verify the `checks` and `build` jobs are unchanged.
- [ ] Optional: if the existing `# E2E job intentionally disabled` comment block is now stale (it references this MVP-4 transition), leave it alone — MVP-4 will revisit it.

**Acceptance:**

- [ ] `actionlint` (via pre-commit hook) accepts the YAML.
- [ ] On the PR push, the `Tauri debug bundle (macOS)` job runs and turns green.

**Commit:** `chore(ci): add macos-latest tauri-build debug job`

---

## Task 10: Finalize `src-tauri/tauri.conf.json`

**Files:**
- Possibly modified: `src-tauri/tauri.conf.json`

**Steps:**

- [ ] Read `src-tauri/tauri.conf.json`. Confirm:
  - `productName` is `"Knowledge Base"`.
  - `identifier` is `"com.kiro.knowledge-base"`.
  - `bundle.icon` lists the 5 icon files (`32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.icns`, `icon.ico`).
  - `bundle.targets` is `["app", "dmg"]`.
  - No `updater` plugin entry under `plugins` or `bundle`.
  - `app.windows[0].title` is `"Knowledge Base"` (matches `productName`).
- [ ] If any field is missing or wrong, fix it minimally — do not add new keys beyond what's listed above.
- [ ] If everything is already correct, this task is a no-op verification (still close the checkboxes and commit a documentation-only summary or skip the commit if nothing changed).

**Acceptance:**

- [ ] All fields above are correct in `tauri.conf.json`.
- [ ] `cargo tauri build --debug --no-bundle` succeeds locally (catches schema drift).

**Commit:** `chore(tauri): finalize tauri.conf.json for shipping` (only if a field changed; otherwise skip).

---

## Task 11: Manual smoke test (`npx tauri dev`)

**Files:** none.

**Steps:**

- [ ] `nvm use` (matches `.nvmrc`).
- [ ] `npm install --prefer-offline` (idempotent if already installed).
- [ ] `npx tauri dev` — verify the app boots, picks/restores a vault, opens a document, and closes cleanly. The MVP-1c init splash, vault switcher, and watcher delete-rewrite should all still work.
- [ ] Trigger the legacy-document migration path (open an old diagram with `data.documents` present) to validate Task 1's `createDiagramRepositoryTauri` swap. If you don't have such a fixture, skip — the typecheck + write-call shape is sufficient evidence.
- [ ] Confirm no console errors on boot.

**Acceptance:**

- [ ] App boots on `npx tauri dev`.
- [ ] No new console errors compared to MVP-1c's smoke.
- [ ] Watcher events still fire on file changes (smoke check, not a full integration test).

No commit — manual smoke is a verification step.

---

## Task 12: Run the full local CI surface

**Files:** none.

**Steps:**

- [ ] `nvm use`.
- [ ] `npm install --prefer-offline`.
- [ ] `npm run typecheck` — must pass.
- [ ] `npm run lint` — must pass (≤ 78 pre-existing warnings is fine; 0 errors).
- [ ] `npm run test:run` — must pass. Test count drops slightly from the deleted `idbHandles.test.ts` + `useDirectoryHandle.test.ts` + `useOfflineCache.test.ts` cases.
- [ ] `npm run build` — must succeed and produce `out/`.
- [ ] `cd src-tauri && cargo fmt --check && cargo clippy -- -D warnings && cargo test` — all must pass.
- [ ] `cd src-tauri && cargo tauri build --debug --no-bundle` — must succeed.

**Acceptance:**

- [ ] All commands above succeed.

No commit — this is a verification step before opening the PR.

---

## Task 13: Update `Features.md`, `test-cases/`, handoff doc

**Files:**
- Modified: `Features.md`
- Modified: `test-cases/01-app-shell.md` (add 1 case if missing)
- Modified: `docs/superpowers/handoffs/2026-05-07-tauri-claude-integration.md`

**Steps:**

- [ ] `Features.md`:
  - Find the Deployment / hosting / Build pipeline section. Remove any GitHub Pages bullet. Add or update a bullet noting "Static export is permanent — `next.config.ts` emits `out/` for Tauri's `frontendDist` (no `GITHUB_PAGES` switch)."
  - If a "GitHub Pages" sub-feature exists anywhere (search for `GITHUB_PAGES`, `Pages deploy`, `pages.yml`), delete the bullet — no tombstone.
- [ ] `test-cases/01-app-shell.md`:
  - Add a single case (next free number in the appropriate section): `SHELL-1.20-01: Tauri debug bundle builds in CI on macOS-latest` with status `❌` initially. The MVP-1d PR's first green CI run flips it to `✅` in the same commit as Task 14.
- [ ] `docs/superpowers/handoffs/2026-05-07-tauri-claude-integration.md`:
  - **Last updated** — bump to today's date with parenthetical: "MVP-1d implementation complete on `feat/tauri-mvp1d-cleanup-bundle` — FSA layer retired, Pages deploy gone, static export permanent, macOS Tauri debug job added. Task 14 opens the PR. Next action after merge: write the MVP-1e plan (history substrate retirement) or jump straight to MVP-2 if MVP-1e is folded into MVP-2's setup."
  - **Where we are** — flip MVP-1c row to ✅ Merged via PR #151 (`a74f847` on `main`). Flip MVP-1d row to 🚧 (PR #152 pending Task 14). Add a new MVP-1e row: `MVP-1e | History substrate retirement | _not yet written; due after MVP-1d merges_ | ⏳ Not started.`
  - **Implementation** — add an MVP-1d bullet listing the 10 FSA-Repo + 5 orphaned-support deletions, the `next.config.ts` collapse, the Pages workflow removal, the macOS CI job, and the `useFileActions` migration.
  - **Reference architecture / Deferred** — move all the "Open follow-up items" entries about `historyPersistence`, `useBackgroundScanner`, `useHistoryFileSync`, `useDocumentHistory`, `useFileExplorer.dirHandleRef`, `FirstRunHero` + `seedSampleVault`, and `fileExplorerHelpers.ts` into a single **MVP-1e** bullet under "Deferred / future MVPs" — name it "History substrate retirement (MVP-1e)" and list the targets.
  - **Open follow-up items** — close the FSA-cleanup row (the half that landed in this MVP); shrink the "MVP-1d cleanup target list grew" row to just the items remaining in MVP-1e (or replace it with a one-line pointer to the MVP-1e row in the table). Close the "CI `e2e` job disabled in MVP-1a" row only when MVP-4 lands — not now.
  - **Next Action** — replace the body with the MVP-1e bootstrap (or "decide MVP-1e vs MVP-2 ordering" if you want to defer that decision to the merge moment): which spec section to read, which targets, ship target.

**Acceptance:**

- [ ] `Features.md` no longer mentions `GITHUB_PAGES` / `pages.yml` / GitHub Pages deploy.
- [ ] `test-cases/01-app-shell.md` contains the new case.
- [ ] The handoff doc reflects this MVP's completion and names MVP-1e.

**Commit:** `docs(kb): MVP-1d — Features.md, test-cases, handoff updates`

---

## Task 14: Push and open PR

**Files:** none (git operations).

**Steps:**

- [ ] `git status` — verify the branch is clean and on `feat/tauri-mvp1d-cleanup-bundle`.
- [ ] `git log --oneline main..HEAD` — verify all task commits are present in order.
- [ ] `git push -u origin feat/tauri-mvp1d-cleanup-bundle`.
- [ ] Open the PR with `gh pr create`:
  - Title: `feat(tauri): MVP-1d — retire FSA layer, Pages deploy, add macOS bundle CI`
  - Body (template):
    ```
    ## Summary
    - Migrate the only remaining FSA-Repo consumer (`useFileActions.ts`) to `createDiagramRepositoryTauri`
    - Delete 10 FSA `*Repo.ts` originals + `vaultIndexRepoFsa.ts` + `useDirectoryHandle.ts` + `idbHandles.ts` + `useOfflineCache.ts` + `types/file-system.d.ts`
    - Collapse `next.config.ts` — `output: "export"` is permanent, drop `GITHUB_PAGES` / `isPages`
    - Delete `.github/workflows/pages.yml`
    - Add `macos-latest` `tauri-build` job in `.github/workflows/ci.yml` (`cargo tauri build --debug --no-bundle`)
    - Verify-pass on `tauri.conf.json` final shape
    - Defer history substrate retirement (`historyPersistence`, `useBackgroundScanner`, `useHistoryFileSync`, `useDocumentHistory`, `dirHandleRef` stub, `FirstRunHero` / `seedSampleVault`, FSA helpers in `fileExplorerHelpers.ts`) to MVP-1e

    ## Test plan
    - [ ] `npm run typecheck` green locally
    - [ ] `npm run lint` green (no new warnings)
    - [ ] `npm run test:run` green (count drops slightly from deleted FSA tests)
    - [ ] `npm run build` produces `out/`
    - [ ] `cd src-tauri && cargo fmt --check && cargo clippy -- -D warnings && cargo test` green
    - [ ] `cargo tauri build --debug --no-bundle` green
    - [ ] CI green: `checks` + `build` + new `tauri-build` (macOS) jobs
    - [ ] Manual smoke: `npx tauri dev` boots, vault picker + switcher + splash + watcher all behave as MVP-1c shipped
    ```
- [ ] After CI runs and `tauri-build` is green, flip `SHELL-1.20-01` in `test-cases/01-app-shell.md` from `❌` to `✅` and `git commit --amend` is **not** allowed — make a follow-up commit (`docs(kb): SHELL-1.20-01 → ✅ on first green CI`) on the same branch and push.

**Acceptance:**

- [ ] PR is open with the title and body above.
- [ ] CI is green on all three jobs (`checks`, `build`, `tauri-build`).
- [ ] Reviewer-requested changes (if any) are addressed via new commits, never amends.

**Commit:** PR creation is not a commit; the post-CI test-case flip is `docs(kb): SHELL-1.20-01 → ✅ on first green CI`.

---

## Summary

13 implementation tasks (1–13) + 1 PR task (14). The plan is mostly subtraction:
- **Task 1**: One TS migration (the only live FSA-Repo consumer).
- **Tasks 2–6**: 19 file deletions in 5 batches, each followed by typecheck + test.
- **Task 7**: `next.config.ts` collapse — static export becomes the default.
- **Task 8**: GitHub Pages workflow deletion.
- **Task 9**: New macOS CI job.
- **Task 10**: `tauri.conf.json` final-shape verification.
- **Tasks 11–12**: Manual smoke + full local CI surface.
- **Task 13**: Doc + catalogue updates.
- **Task 14**: PR.

Total expected diff: ~−1500 / +150 lines (heavy net deletion), 1 new CI job (~30 lines YAML), 1 new test case row.

## Test plan

- Vitest: full suite passes after each deletion task. Final count is ~942 minus the deleted FSA-test cases (`idbHandles.test.ts` + `useDirectoryHandle.test.ts` + `useOfflineCache.test.ts`) — likely ~920–930.
- Cargo: `cargo test` is unchanged (no Rust source touched in this MVP). Only `cargo tauri build --debug --no-bundle` is added as a CI gate.
- Manual smoke: `npx tauri dev` exercises Task 1's migration path indirectly (open a diagram, save it, watch the legacy-doc migration write succeed).

## Out of scope (next MVPs)

- **MVP-1e** (new — created during MVP-1d planning): retire `historyPersistence.ts`, `useBackgroundScanner.ts`, `useHistoryFileSync.ts` / `useDocumentHistory.ts` `initHistory` signature, `useFileExplorer.dirHandleRef` stub + `seed` callback, `FirstRunHero.tsx` + `seedSampleVault.ts` redesign, FSA-mode helpers in `fileExplorerHelpers.ts`. Requires designing an in-memory history substrate first.
- **MVP-2**: Claude subprocess integration. Bottom-overlay chat surface + footer status line + multi-turn conversation.
- **MVP-3**: Skill bootstrap + `/kb` invocation.
- **MVP-4**: `tauri-plugin-webdriver` + restored Playwright + `ClaudeRunner` trait + stub.
- **MVP-5**: Promote previously-blocked test cases.

## Self-Review

- **Order safety:** Task 1 (consumer migration) before Task 2 (deletion). Task 4's import removal before file deletion (same task). Task 5's `useDirectoryHandle` deletion implicitly precedes `idbHandles` deletion (declared first in the task; the directory order in the `git rm` command preserves it).
- **Type safety after `file-system.d.ts` deletion:** `tsconfig.json` confirms `lib: ["dom", "dom.iterable", "esnext"]`. TypeScript 5 ships `FileSystemDirectoryHandle`, `FileSystemFileHandle`, `FileSystemWritableFileStream`, and `Window.showDirectoryPicker` in `lib.dom.d.ts`. The ~22 references resolve via the DOM lib without behaviour change.
- **Static-export safety:** `next.config.ts` already enabled `output: "export"` under the `isPages` conditional; making it unconditional just removes a branch. Tauri's `frontendDist: "../out"` already consumes the same artifact. The `NEXT_PUBLIC_BASE_PATH` consumers (if any) read an empty string in non-Pages mode today, so collapsing to `""` is a no-op.
- **CI runtime budget:** the macOS `tauri-build` job uses `Swatinem/rust-cache@v2` for cargo and `actions/setup-node@v4`'s `cache: npm` for node. `--debug` + `--no-bundle` keeps the Rust+frontend link step under 10 minutes on a cold cache, well under the 30-minute timeout.
- **Reversibility:** every step is git-trackable; if a deletion is later regretted, `git revert` restores it. The plan introduces no irreversible system mutations.
- **Out-of-scope integrity:** the deferred items are all coupled to the history substrate decision (which itself depends on whether MVP-2 wants in-memory history as part of its chat-context substrate). Naming MVP-1e explicitly in this plan + the handoff prevents scope creep without losing the work.
