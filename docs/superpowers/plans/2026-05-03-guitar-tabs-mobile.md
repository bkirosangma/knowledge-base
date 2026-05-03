# TAB-012 — Mobile read-only + playback

**Branch:** `plan/guitar-tabs-mobile`
**Spec:** `docs/superpowers/specs/2026-05-02-guitar-tabs-design.md` → "Mobile (KB-040 stance)" (~L294) + Acceptance for M1 ship (~L450).
**Depends on:** TAB-005 (playback), TAB-007a (`readOnly` already plumbed to `TabPaneContext` + `TabView` + `TabProperties`).
**Effort:** ~2 days. Last M1 ticket — after this, M1 = "viewer ship-point" complete.

---

## Goal

Honour the KB-040 mobile stance for the Tabs pane:

1. Tab pane mounts in `readOnly` mode on mobile (≤900px viewport width).
2. The only "create-a-tab" affordance today (`tabs.import-gp` palette command) is suppressed on mobile.
3. The path is unblocked for TAB-008 to lazy-import its editor surface only on desktop.

Acceptance (mirrors spec): "Mobile: open + playback work; create button absent; no editor surface in the bundle."

---

## Pre-implementation context (verified by investigation)

| Question | Answer |
|---|---|
| `isMobile` source of truth | `useViewport()` from `src/app/knowledge_base/shared/hooks/useViewport.ts`; `MOBILE_BREAKPOINT_PX = 900` (matchMedia, SSR-safe). Already imported in `knowledgeBase.tsx:81`. |
| Files-tab routing on mobile | `MobileShell.onSelectFile(path)` delegates to host's `handleSelectFile`, which dispatches via `getFileType(path)` → `panes.openFile(path, "tab")` (`knowledgeBase.tsx:355–364`). `.alphatex` is already routed correctly on mobile. |
| `readOnly` flow into `TabView` | `renderTabPaneEntry(entry, ctx)` spreads `ctx` onto `<TabView>`. `TabPaneContext.readOnly?: boolean` exists (`knowledgeBase.tabRouting.helper.tsx:14`). The call site at `knowledgeBase.tsx:1000–1018` does **not** currently pass `readOnly`. |
| `TabProperties` editable surface | None. Sections / tuning / capo / key / tempo are display-only `<span>`/`<div>`. The only chrome `readOnly` gates today are Attach buttons (`TabProperties.tsx:184`, `:201`, `:238`) and `TabReferencesList` detach buttons. Spec's "shown read-only" requirement is satisfied by current code; we only need to thread `readOnly: isMobile`. |
| "Create new" gating precedent | `ExplorerHeader.tsx:112,138` already gates `New Diagram` / `New Document` buttons with `{!isMobile && (...)}` (KB-040 comment). There is no `New Tab` button — none exists today. The closest tab-creation surface is the `tabs.import-gp` palette command (`knowledgeBase.tsx:840–851`). |
| Editor surface lazy-load | The TAB-008 editor surface does not exist yet. `alphaTabEngine.ts` already dynamically imports the alphaTab library on viewer construction; that's universal, not editor-specific. For TAB-012 we leave a one-line stub comment in `TabView.tsx` so TAB-008 wraps its editor in `next/dynamic` from day one. |

---

## Tasks

### T1 — Wire `readOnly: isMobile` into `TabPaneContext`

**File:** `src/app/knowledge_base/knowledgeBase.tsx` (renderTabPaneEntry call site, ~L1000–1018)

Add `readOnly: isMobile` to the context object spread into `renderTabPaneEntry`. `isMobile` is already in scope via `useViewport()` at L81, but the surrounding `useCallback` deps must include it.

**Acceptance:**
- The context object passed to `renderTabPaneEntry` includes `readOnly: isMobile`.
- The wrapping `useCallback` deps array includes `isMobile`.
- `TabView`, on mobile boot, reflows props such that `TabProperties` receives `readOnly={true}`.

**Test (unit, Vitest):** Extend `TabView.test.tsx` (or add to `knowledgeBase` integration test if one exists) — render `KnowledgeBaseInner` with a mocked viewport (window.matchMedia mock) at mobile width, open a `.alphatex` file, assert `TabProperties`'s Attach button (`role="button"`, name matching `/Attach/i`) is NOT present. Mirror at desktop width to confirm it IS present.

If wiring a full `KnowledgeBaseInner` test is heavy, fall back to a direct call test on `renderTabPaneEntry` confirming the spread receives `readOnly: true` when called with `readOnly: true` and that `TabView` then passes it through to TabProperties.

**TDD red phase:** assert `readOnly` is propagated; current code returns absent → fail. Implement → pass.

### T2 — Gate `tabs.import-gp` palette command on `!isMobile`

**File:** `src/app/knowledge_base/knowledgeBase.tsx` (~L840–851)

Change:
```ts
const importGpCommands = useMemo(() => [{
  id: "tabs.import-gp",
  title: "Import Guitar Pro file…",
  group: "File",
  when: () => fileExplorer.directoryName !== null,
  run: () => gpImport.pickFile(),
}], [gpImport, fileExplorer.directoryName]);
```

to:
```ts
const importGpCommands = useMemo(() => [{
  id: "tabs.import-gp",
  title: "Import Guitar Pro file…",
  group: "File",
  // KB-040: hide on mobile (no editor → no point in importing).
  when: () => !isMobile && fileExplorer.directoryName !== null,
  run: () => gpImport.pickFile(),
}], [gpImport, fileExplorer.directoryName, isMobile]);
```

**Critical:** `isMobile` MUST be in the deps array; without it the closure goes stale on rotation/resize and the gate breaks.

**Acceptance:**
- On mobile, the command palette does NOT list "Import Guitar Pro file…".
- On desktop, the command appears as before.
- Resizing the viewport across the 900px boundary toggles command visibility (re-renders re-run `useMemo`).

**Test (unit, Vitest):** add a test next to the existing palette-command tests (or create `knowledgeBase.gpImport.test.tsx` if none) that mocks `useViewport` to return `isMobile: true`, mounts `KnowledgeBaseInner`, opens the palette, and asserts "Import Guitar Pro file…" is absent. Re-render with `isMobile: false` and assert it appears.

If `KnowledgeBaseInner` is too heavy to mount, extract the command spec into a small helper `buildImportGpCommands({ gpImport, directoryName, isMobile })` and unit-test the helper directly. (Keep the helper colocated; don't over-abstract.)

**TDD red phase:** test fails because the current `when:` ignores `isMobile`. Implement → pass.

### T3 — Stub marker for TAB-008 editor lazy-load

**File:** `src/app/knowledge_base/features/tab/TabView.tsx`

Single comment near the canvas mount, signposting TAB-008:
```tsx
{/* KB-040 / TAB-008: when an editor surface lands, lazy-load it via
    `next/dynamic({ ssr: false })` and gate behind `!readOnly` so the
    chunk is excluded from the mobile bundle. */}
```

No code change. This is the only "TAB-012 deliverable" against the spec's "no editor surface in the bundle" line, since the editor surface doesn't exist yet.

### T4 — Update `Features.md` §11

**File:** `Features.md`

Insert a new `### 11.7 Mobile (TAB-012)` block before the existing `### 11.7 Pending`, then renumber the existing Pending section to `§11.8 Pending` and remove its `Mobile gating` row (now ✅ in §11.7).

New §11.7 body:

```markdown
### 11.7 Mobile (TAB-012)

KB-040 stance: read-only + playback only on mobile.

- ✅ **`TabView` mounts read-only on mobile.** `KnowledgeBaseInner` injects `readOnly: useViewport().isMobile` into `TabPaneContext`. `TabProperties` suppresses Attach affordances; `TabReferencesList` suppresses detach.
- ✅ **`tabs.import-gp` palette command hidden on mobile.** `when:` guard adds `!isMobile`; viewport flips re-evaluate via `useMemo` deps.
- ✅ **Editor surface stub.** No editor today; `TabView` carries a TAB-008 marker so the editor chunk is `next/dynamic({ ssr: false })` from its first commit.
- ⚙️ **Files-tab routing.** `MobileShell.onSelectFile(path)` already routes `.alphatex` via `panes.openFile(path, "tab")` (no change in TAB-012).
```

Renumbered §11.8 Pending body (drop the Mobile-gating bullet):

```markdown
### 11.8 Pending

- ? **Editor (M2)** — TAB-008+.
```

### T5 — Update `test-cases/11-tabs.md` §11.8

**File:** `test-cases/11-tabs.md`

Add new section `## 11.8 Mobile (TAB-012)` between the existing `## 11.7 Cross-references` and the `## Future sections` marker. Remove the `§11.8 Mobile` line from the `Future sections` list (now landed). Numbering for new cases starts at TAB-11.8-01.

Cases:

```markdown
## 11.8 Mobile (TAB-012)

Mobile (≤900px) read-only + playback. Verifies KB-040 stance.

- **TAB-11.8-01** ❌ **`KnowledgeBaseInner` injects `readOnly: true` into `TabPaneContext` on mobile** — `useViewport().isMobile === true` → `TabView` receives `readOnly`. _(unit: `knowledgeBase.tabContext.test.tsx` or extension of an existing integration test.)_
- **TAB-11.8-02** ❌ **`KnowledgeBaseInner` injects `readOnly: false` into `TabPaneContext` on desktop** — `useViewport().isMobile === false` → `TabView` receives `readOnly: false`. _(unit.)_
- **TAB-11.8-03** ❌ **`tabs.import-gp` command absent from palette on mobile** — `useViewport` mocked to mobile; opening palette excludes "Import Guitar Pro file…". _(unit.)_
- **TAB-11.8-04** ❌ **`tabs.import-gp` command present on desktop** — _(unit.)_
- **TAB-11.8-05** ❌ **`tabs.import-gp` command flips when viewport resizes across breakpoint** — `useMemo` deps include `isMobile`; toggling `isMobile` between true/false toggles command visibility. _(unit.)_
- **TAB-11.8-06** ❌ **TabView rendered with `readOnly` hides every Attach affordance and `TabReferencesList` detach** — _(integration extension of `TabView.test.tsx`.)_
- **TAB-11.8-07** ❌ **Mobile e2e: open `.alphatex` from Files tab → tab pane mounts; toolbar play/pause buttons visible; Attach buttons absent** — _(playwright with `viewport: { width: 390, height: 844 }`.)_
- **TAB-11.8-08** ❌ **Mobile e2e: command palette excludes "Import Guitar Pro file…"** — _(playwright.)_
```

### T6 — Optional Playwright coverage (best-effort)

**File:** `e2e/tabsMobile.spec.ts` (new)

Lightweight smoke at mobile viewport. Pattern: mirror `e2e/diagramGoldenPath.spec.ts` with `test.use({ viewport: { width: 390, height: 844 } })`, seed an `.alphatex` file via `fsMock.ts`, navigate Files → tap file, assert TabView mounts and Attach buttons are absent.

If audio-engine readiness in headless Chromium is too flaky (per the existing relaxed TAB-11.3-19), drop the playback assertion and keep this an existence-only smoke. Defer to a follow-up if even that times out — record as deferred and don't block the ticket.

---

## Out of scope

- Editor surfaces (TAB-008+).
- Touch-first UX overhaul of `TabToolbar` (existing transport works adequately on touch).
- Mobile-specific shortcut adjustments.
- Adding a "New Tab" button to `ExplorerHeader` (no equivalent exists for any pane; would be scope creep).

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Stale closure on `isMobile` flip | `useMemo` deps include `isMobile` (T2). |
| Ambiguous "create button absent" criterion | Documented in T2 — the only tab-creation surface today is `tabs.import-gp`; gating it satisfies the spec. |
| Playwright audio readiness flakes | T6 is best-effort; existence-only assertions only; fall back to unit tests for bundle/gate coverage. |
| `KnowledgeBaseInner` integration tests are heavy | Fall back to extracting `buildImportGpCommands` helper for direct unit testing; `renderTabPaneEntry` call test for T1. |

---

## Process

1. Subagent-driven: T1 → T2 → T3 (or batch T2+T3, both small) → T4+T5 (docs in one commit) → T6 (best-effort).
2. Each task gets the standard two-stage review (spec compliance + code quality).
3. Final reviewer pass over the branch diff before PR.
4. Verification ceiling per `feedback_preview_verification_limits.md`: clean build + clean console + green Vitest + best-effort Playwright.
5. After ship: update `docs/superpowers/handoffs/2026-05-03-guitar-tabs.md` per its **Doc-update protocol**. M1 = viewer ship-point complete; the doc's Next Action becomes the "decide M2 vs evaluate" call (or whatever the user dictates).
