# Coding-Standards Refactor — Phased Decomposition

**Date:** 2026-04-18
**Scope:** bring the knowledge-base app in line with `~/.claude/CODING_STANDARDS.md`.
**This spec covers in detail:** Phase 0, Phase 0.5, Phase 1.
**This spec lists as roadmap:** Phases 2–5 (to be specced separately once Phase 1 lands).

---

## 1. Context

The knowledge-base app is a Next.js 16 / React 19 / TypeScript local-first knowledge tool with a split-pane shell hosting a diagram editor and a Tiptap-based document editor, persisted via the File System Access API + IndexedDB. The codebase is ~107 files / 565 graph nodes / 810 edges. Test infrastructure (Vitest + Playwright + Testing Library) is in place; most utility modules are well covered. The orchestrators and most hooks are not.

Mapped against the coding standards, the biggest gaps are:

- **SRP** — five files carry far too many responsibilities (`DiagramView.tsx` 1692 lines, `MarkdownEditor.tsx` 1018, `markdownReveal.ts` 1004, `ExplorerPanel.tsx` 770, `useFileExplorer.ts` 675). Each is a single function or hook that mixes state, rendering, interaction, and persistence concerns.
- **OCP** — path routing in `pathRouter.ts:68-93` dispatches on an algorithm string via `switch`; auto-arrange in `DiagramView.tsx` does the same. Adding a new algorithm requires modifying the dispatcher.
- **ISP** — `NodeData` carries 15+ optional fields mixing geometry, appearance, and behaviour; `DiagramBridge` exposes every shell integration point through one wide interface.
- **DIP** — hooks depend on concrete `persistence.ts`, `idbHandles.ts`, File System Access API calls directly; tests reconstruct this with `MockDir/MockFile` fixtures (duplicated across several test files).
- **Boundary validation & error handling** — JSON loads accept `any` without schema validation; File System Access errors are handled ad-hoc with scattered `try { /* ignore */ }` blocks.
- **CI** — no `.github/workflows` — lint/test/build currently gated only by local discipline.

## 2. Non-goals / N/A standards

The following coding-standards items do **not** apply to this app and will be explicitly excluded from the plan:

- `snake_case` for database schemas — no database.
- BEM CSS — styling is Tailwind utility classes only; no custom class names to rename.
- Authenticate/authorize at each hop, never leak stack traces in responses, distributed tracing / APM — no service tier; the app runs in a single browser process.

Explicit non-goals for this refactor:

- No feature additions or user-visible behaviour changes (Phase 5's wiki-link `..` clamp is a bug fix, not a feature).
- No migration to a different framework, state library, or editor.
- No premature abstraction — patterns are only introduced where the existing switch / inline construction already shows 3+ branches or obvious future extension pressure.

## 3. Phase 0 — Characterization tests (safety net)

**Goal.** Before any decomposition, give every god component a regression-detector test so silent breakage is impossible.

**Why first.** `DiagramView.tsx` has no direct component test; `MarkdownEditor.tsx` has partial toolbar harness coverage (DOC-4.5); `ExplorerPanel.tsx` has 385 lines of tests but they don't span the full interaction surface; `markdownReveal.ts` is tested indirectly via editor tests; `useFileExplorer.ts` is covered partially via `useFileActions.test.ts`. The existing Playwright `goldenPath.spec.ts` and `fsMockSanity.spec.ts` plus Vitest integration tests give a foundation to extend.

**Scope.**

1. Audit the test-cases files and identify every ❌ case that asserts externally-observable behaviour of the five god components:
   - `test-cases/03-diagram.md` — DIAG-3.x cases touching DiagramView's rendering / selection / drag / keyboard flows.
   - `test-cases/04-document.md` — DOC-4.x cases for MarkdownEditor / markdownReveal live-syntax behaviour.
   - `test-cases/01-app-shell.md` — SHELL-1.x cases for split-pane / pane switching.
   - `test-cases/02-file-system.md` — FS-2.x cases for ExplorerPanel rendering and useFileExplorer CRUD.
2. For each, decide the right layer:
   - **E2E (Playwright + fsMock)** — any flow that spans panes, persistence, or wiki-link navigation.
   - **Integration (Vitest + React Testing Library)** — within-component interaction that doesn't need disk (toolbar → editor, keyboard → canvas state).
   - **Unit** — pure helpers extracted from the god file during Phase 1; most of Phase 0 avoids these since the helpers are still inlined.
3. Write one test per case using the ID as the test name (`it('DIAG-3.8-01: …')`) so the test-cases file can cross-reference.
4. Flip the status marker in `test-cases/*.md` from ❌ → ✅ in the same commit.

**Target coverage.** Not 100%. Aim for every rendering/interaction path a Phase 1 extraction could plausibly break — prioritise by impact (selection, drag, paste, save, open, type, toggle, undo).

**Exit criteria.**

- Every god component has at least one failing-regression-detector test committed and green.
- `npm run test:run && npm run test:e2e` green.
- test-cases status markers synced.
- `Features.md` untouched (no observable behaviour changes).

## 4. Phase 0.5 — CI/CD gate

**Goal.** Gate every PR on lint, test, e2e, and build so Phase 1+ regressions can't land silently.

**Scope.** Add `.github/workflows/ci.yml` with a single job:

- Trigger: pull requests to `main` and pushes to `main`.
- Node version: read from `.nvmrc`.
- Steps: `npm ci`, `npm run lint`, `npm run test:run`, `npx playwright install --with-deps chromium`, `npm run test:e2e`, `npm run build`.
- Artifacts: upload `playwright-report/` on failure.
- Cache: `actions/setup-node` with `cache: 'npm'`.

**What stays out of scope.**

- No coverage threshold enforcement yet — coverage numbers will stabilise after Phase 1 and can be gated in a follow-up.
- No deploy step. Deployment is manual for this project.
- No branch protection rule changes — those live outside the repo (GitHub UI).

**Exit criteria.**

- One green run on the PR that introduces the workflow.
- README gets a CI badge.

## 5. Phase 1 — SRP: god-component decomposition

Each sub-phase below is scoped to one god file and produces no user-visible change. Every extraction is covered by a Phase 0 test. Target: no single component file > ~300 lines, no single hook > ~200 lines (guideline, not a hard rule — a focused component slightly above is fine).

### 5.1 `DiagramView.tsx` (1692 → composed)

Current: a single 1523-line function body holding state flags, layout persistence, 20+ hook calls, keyboard handling, clipboard, JSX for canvas + overlays + history panel + properties panel, and inline `onMove` / `onUp` / `doCommit` / `walk` callbacks.

Split into:

- **`DiagramView.tsx`** — pure composition root, wires children together.
- **`state/DiagramLayoutState.ts`** — `isLive`, `showLabels`, `showMinimap`, `historyCollapsed`, `propertiesCollapsed`, `properties-collapsed` localStorage persistence. Plain hook returning `{state, actions}`.
- **`state/DiagramClipboard.ts`** — copy/paste state and handlers currently inlined.
- **`components/DiagramCanvasHost.tsx`** — canvas + layer + element + flow-dot + data-line rendering.
- **`components/DiagramOverlays.tsx`** — history panel, properties panel, minimap shell.
- **`components/AutoArrangeDropdown.tsx`** — already logically separate, extract to own file.
- **`hooks/useDiagramHookComposition.ts`** — wires the existing 20 feature hooks into one orchestrator and returns the values DiagramView needs.
- Inline `onMove` (L1306-1338), `onUp` (L1339-1347), `doCommit` (L1441), and `walk` (L1665-1670) move into the owning hooks (`useSegmentDrag` or `useCanvasInteraction` for pointer callbacks; `useLabelEditing` for `doCommit`; `useFileTree` / downstream for `walk`) — names and locations finalised in the implementation plan.

### 5.2 `MarkdownEditor.tsx` (1018 → composed)

Current: `MarkdownEditor` component + a full raw-syntax engine (`countConsecutiveChar`, `findEnclosingSyntaxRange`, `toggleRawSyntax`, `getActiveRawFormats`, `getRawHeadingLevel`, `isRawBlockquote`, `toggleRawBlockType`, `forceExitRawBlock`) + `TBtn`, `Sep`, `TablePicker` UI components.

Split into:

- **`MarkdownEditor.tsx`** — editor host + content sync + serialization debounce. ~300 lines.
- **`extensions/rawSyntaxEngine.ts`** — all the `toggleRawSyntax` / `getActiveRawFormats` / `forceExitRawBlock` helpers. Pure functions of `editor` — unit-testable.
- **`components/MarkdownToolbar.tsx`** — renders toolbar buttons, consumes `rawSyntaxEngine` results.
- **`components/TablePicker.tsx`** — already logically separate, extract.
- **`components/TBtn.tsx` + `Sep.tsx`** — small UI primitives, extract together.

### 5.3 `markdownReveal.ts` (1004 → split)

Current: rich↔raw conversion + syntax decorations + plugin glue + a 242-line `appendTransaction` all in one file.

Split into:

- **`extensions/markdownReveal/index.ts`** — the Tiptap Extension export; composes the below.
- **`extensions/markdownReveal/conversion.ts`** — `richBlockToRawFragment`, `rawBlockToRichNodes`, `marksToRawMarkdown`, `findMergeTarget`.
- **`extensions/markdownReveal/decorations.ts`** — `buildSyntaxDecorations`, `pushSyntaxDecorations`.
- **`extensions/markdownReveal/plugin.ts`** — `appendTransaction` body + plugin config. The 242-line appendTransaction can be broken into smaller named transition handlers (`handleEnterRawBlock`, `handleExitRawBlock`, `handleBackspaceMerge`, etc.) — this is a secondary win.

### 5.4 `ExplorerPanel.tsx` (770 → composed)

Split into:

- **`ExplorerPanel.tsx`** — composition + top-level state. ~250 lines.
- **`components/TreeNodeRow.tsx`** — the recursive `renderNode` becomes a real component.
- **`components/ExplorerHeader.tsx`** — toolbar + filter + sort controls.
- **`components/ExplorerContextMenu.tsx`** — context menu rendering.
- **`hooks/useExplorerSort.ts`** — `sortTree` + sort state.
- **`hooks/useExplorerFilter.ts`** — filter state + `filterNodes` helper.
- **`hooks/useExplorerDnD.ts`** — drag-and-drop state and handlers.
- **`hooks/useExplorerInlineRename.ts`** — inline rename state.

### 5.5 `useFileExplorer.ts` (675 → split)

Current: one 525-line hook doing directory handle management + scan + CRUD + rename/move + drafts + vault config.

Split into:

- **`hooks/useDirectoryHandle.ts`** — IndexedDB handle persistence, re-request flow, `isSupported`.
- **`hooks/useFileTree.ts`** — `scanTree`, tree state, refresh.
- **`hooks/useFileCrud.ts`** — create / read / write / delete files + directories.
- **`hooks/useMoveRename.ts`** — move / rename with wiki-link awareness.
- **`hooks/useDrafts.ts`** — draft lifecycle (loadDraft, clearDraft, listDrafts).
- **`hooks/useFileExplorer.ts`** — thin composer that re-exports the above as a single object for callers that want the monolithic shape.

### 5.6 Exit criteria (Phase 1)

- No component > ~300 lines, no hook > ~200 lines (target, not gate).
- Every Phase 0 test still green.
- No new `any` types introduced; public signatures of the exported composer (`DiagramView`, `MarkdownEditor`, `ExplorerPanel`, `useFileExplorer`) unchanged.
- `Features.md` untouched (internal refactor).
- `test-cases/` flipped where new unit tests replace characterization tests (some ✅ stays ✅; no regressions).
- `graphify . --update` rebuild committed so the graph reflects the new structure.

## 6. Phases 2–5 Roadmap

Specced separately once Phase 1 lands.

- **Phase 2 — OCP: Strategy & Factory.**
  - `LineRoutingStrategy` interface + `StraightRouter` / `BezierRouter` / `OrthogonalRouter` + a registry. `computePath` looks strategies up by key instead of switching on algorithm.
  - Same shape for `LayoutStrategy` (hierarchical-tb, hierarchical-lr, force).
  - `elementFactory.ts` / `layerFactory.ts` replace scattered ID construction and default geometry.
- **Phase 3 — DIP: repositories.**
  - `DiagramRepository`, `DocumentRepository`, `VaultConfigRepository`, `LinkIndexRepository` interfaces in a new `domain/` layer.
  - Concrete impls move to `infrastructure/fs-*-repo.ts`; tests inject in-memory fakes (kills the duplicated `MockDir/MockFile` boilerplate currently spread across five test files).
  - Hooks receive repos via a `RepositoryContext`.
- **Phase 4 — ISP: split wide types.**
  - `NodeData` → `NodeIdentity + NodeGeometry + NodeAppearance + NodeBehavior` (+ `ConditionNodeBehavior` subtype).
  - `DiagramBridge` → `HeaderBridge`, `ExplorerBridge`, `FooterBridge` — callers depend only on the slice they use.
- **Phase 5 — Boundary validation + centralized error handling.**
  - Schema-validate JSON at `DiagramRepository.load`, `DocumentRepository.load`, vault config load (`zod` or hand-rolled type guards — decide in spec).
  - Typed `FileSystemError` at repository boundary; single error-boundary component in shell translates infra errors to user toasts.
  - Wiki-link path resolver clamps `..` that escapes the vault root (fixes known behaviour documented in claude-mem observation 341).

## 7. Per-phase Definition of Done (applies to all)

1. Characterization or unit tests cover the change, added or pre-existing, **before** the refactor lands.
2. `Features.md` updated in the same commit if user-observable behaviour changes (most Phase 1–4 changes don't; Phase 5 error surfaces and the wiki-link clamp do).
3. Matching `test-cases/*.md` status markers flipped (❌ → ✅) in the same commit as the covering test.
4. `npm run lint && npm run test:run && npm run build` green locally; CI green on the PR.
5. `graphify . --update` rebuild run if code files moved.
6. Atomic commits; short-lived branch; PR description references the phase in this spec.

## 8. Risk & rollback

- **Risk: Phase 1 extraction subtly changes render order / effect timing.** Mitigation: Phase 0 characterization tests + E2E golden path.
- **Risk: `MarkdownEditor` raw-syntax engine has implicit dependencies on editor commit phase.** Mitigation: extract as pure functions taking `editor` — no state moves outside.
- **Risk: Test-cases file drift.** Mitigation: per-phase DoD gate + the existing CLAUDE.md contract makes this visible in review.
- **Rollback.** Each phase is a standalone PR; revert is `git revert`. Because extractions preserve public signatures, downstream callers never need changing.

## 9. Open questions

- None blocking. Phases 2–5 will surface specific design questions once the seams are visible after Phase 1.

---

**Next step:** on approval, invoke the `writing-plans` skill to produce the step-by-step implementation plan for Phases 0, 0.5, and 1.
