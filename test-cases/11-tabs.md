# Test Cases — Guitar Tabs

> Mirrors §11 of [Features.md](../Features.md). Covers the `.alphatex` file type, `TabEngine` interface, `TabRepository`, the tab pane, and (later) the viewer/editor chrome built on the AlphaTab engine.
>
> ID scheme follows `test-cases/README.md`: `TAB-11.<sub>-<nn>`.
>
> **Scope discipline.** Only `§11.1 Foundation` (TAB-001 → TAB-003) and `§11.2 Viewer` (TAB-004) are pre-enumerated here. Later sub-sections (`§11.3 Playback`, `§11.4 .gp import`, etc.) are added with their owning ticket per the maintenance contract — leaving aspirational ❌ rows years before they're built clutters the coverage snapshot and dilutes the "this is what we still owe" signal.

---

## 11.1 Foundation (TAB-001 → TAB-003)

Domain interfaces, FSA-backed repository, pane-type plumbing, placeholder view. Shipped 2026-05-02.

- **TAB-11.1-01** ✅ **`.alphatex` files route to the `"tab"` pane** — `handleSelectFile` opens a tab pane for any path ending in `.alphatex`; other extensions keep their existing routing. _(unit: `knowledgeBase.tabRouting.test.tsx`.)_
- **TAB-11.1-02** ✅ **Non-tab pane entries fall through to the default renderer** — `renderTabPaneEntry` returns `null` for any `fileType !== "tab"` so the existing `DocumentView` fallback in `renderPane` is preserved. _(unit: `knowledgeBase.tabRouting.test.tsx`.)_
- **TAB-11.1-03** 🚫 **`TabViewStub` deleted in TAB-004** — see TAB-11.1-04. The viewer-mounted-canvas case for the real `TabView` is TAB-11.2-03.
- **TAB-11.1-04** 🚫 **`TabViewStub` deleted in TAB-004** — the placeholder fulfilled its purpose and was removed when the real `TabView` shipped. Kept for traceability. _(no test — file no longer exists.)_
- **TAB-11.1-05** ✅ **`createTabRepository.read` returns raw alphaTex text** — flat-path read returns the on-disk text byte-for-byte. _(unit: `tabRepo.test.ts`.)_
- **TAB-11.1-06** ✅ **`createTabRepository.read` throws `FileSystemError("not-found")` on missing file** — the FSA `NotFoundError` is mapped through `classifyError` to a typed domain error so consumers can branch on `kind`. _(unit: `tabRepo.test.ts`.)_
- **TAB-11.1-07** ✅ **`createTabRepository.read` resolves files in nested subdirectories** — exercises the `parts.slice(0, -1)` path-walking loop with a `subdir/song.alphatex` path. _(unit: `tabRepo.test.ts`.)_
- **TAB-11.1-08** ✅ **`createTabRepository.write` persists content** — round-trip write → read returns the new content; creates parent directories as needed. _(unit: `tabRepo.test.ts`.)_
- **TAB-11.1-09** ✅ **`createTabRepository.write` surfaces FSA failures as `FileSystemError`** — `NotAllowedError` from the underlying handle is mapped to `kind: "permission"`. _(unit: `tabRepo.test.ts`.)_
- **TAB-11.1-10** ✅ **`RepositoryProvider` exposes `tab` when a `rootHandle` is mounted** — `useRepositories().tab` is non-null with `read`/`write` methods. _(unit: `RepositoryContext.test.tsx`.)_
- **TAB-11.1-11** ✅ **`RepositoryProvider` sets `tab = null` when no `rootHandle` is mounted** — pre-picker / post-`clearSavedHandle` state matches every other repo in the bag. _(unit: `RepositoryContext.test.tsx`.)_
- **TAB-11.1-12** ⚙️ **`TabEngine` domain interface compiles without consumers** — pure-types module; no runtime test, but `tsc --noEmit` is the gate. Subsumed by CI typecheck.
- **TAB-11.1-13** ⚙️ **`TabRepository` interface compiles and is implemented by `createTabRepository`** — type-level contract; verified by the live use of the factory in `RepositoryContext.tsx`. Subsumed by CI typecheck.
- **TAB-11.1-14** ⚙️ **`PaneType` and `SavedPaneEntry.fileType` both include `"tab"`** — the duplicate inline union in `shared/utils/persistence.ts:338` was extended in lock-step. Future cleanup (replace duplicate with `import { PaneType }`) tracked as tech debt; for now, this case guards against drift if a new pane type is added. _(no automated test — verified at typecheck time when `panes.openFile(path, "tab")` is assigned to `SavedPaneEntry`.)_

## 11.2 Viewer (TAB-004)

Replaces `TabViewStub` with a real `TabView` that mounts `AlphaTabEngine` and renders the score from disk. **All cases below start at ❌ — flip to ✅ / 🧪 in the same commit as the test lands.**

- **TAB-11.2-01** 🟡 **`TabView` lazy-loads the engine module on mount** — `AlphaTabEngine.mount()` calls `await import("@coderline/alphatab")`; no top-level static import of the package, keeping the chunk out of the doc/diagram bundle. _(unit: TabView.test.tsx — source-level lazy-load assertion against `infrastructure/alphaTabEngine.ts`; bundle-size leg verified manually via vite-bundle-visualizer.)_
- **TAB-11.2-02** ✅ **`TabView` reads the file via `useRepositories().tab`** — opens an `.alphatex` file from the explorer → `TabRepository.read` is invoked exactly once with the vault-relative path. _(unit: TabView.test.tsx — "calls mountInto with the loaded file content".)_
- **TAB-11.2-03** ✅ **`TabView` mounts `AlphaTabEngine` and loads the file content** — the engine's `mount()` is called with the host element; `session.load({ kind: "alphatex", text })` follows. _(unit: TabView.test.tsx — "renders the canvas host when status is 'ready'".)_
- **TAB-11.2-04** 🧪 **Canvas renders within 2 s on a fixture file** — the `"loaded"` event fires within the budget; assertion is wall-clock against a deterministic fixture. _(playwright: `e2e/tab_h1_derivation.spec.ts` — "TAB-11.2-04: canvas mounts within 2s for fixture .alphatex".)_
- **TAB-11.2-05** ✅ **Loading state visible until engine `"ready"` fires** — a `data-testid="tab-view-loading"` placeholder is mounted while async import + asset fetch are in flight. _(unit: TabView.test.tsx — "shows the loading placeholder while status is 'mounting'".)_
- **TAB-11.2-06** ✅ **Engine module load failure renders an inline error pane** — when the dynamic import throws, the view shows a "Reload" button (mirrors the `GraphView` force-graph fallback). _(unit: TabView.test.tsx — "renders the engine-load-error pane with a Reload button" + "Reload button re-invokes mountInto".)_
- **TAB-11.2-07** ✅ **Source parse failure surfaces via `ShellErrorBanner`** — malformed alphaTex routes through `useShellErrors().reportError`; same path the diagram repo uses today. _(unit: TabView.test.tsx — "source-parse errors route through useShellErrors".)_
- **TAB-11.2-08** ❌ **External file change while pane is open triggers `ConflictBanner`** — the file-watcher signal is the same as docs/diagrams use; the tab pane subscribes through the existing hook. _(MVP-5 follow-up: needs test_server vault_watch_start event-stream wiring; future-MVP candidate)_
- **TAB-11.2-09** ✅ **Closing the pane disposes the session** — `session.dispose()` runs in cleanup; subsequent re-open creates a fresh session (no audio context leak). _(unit: useTabEngine.test.tsx — "unmount triggers session.dispose via cleanup effect".)_
- **TAB-11.2-10** 🧪 **Re-opening the same file after close re-renders identically** — content + scroll position not in scope; just file content fidelity. _(playwright: `e2e/tab_reopen_fidelity.spec.ts` — open `song.alphatex`, switch to a sibling, re-open the original; canvas innerHTML length matches within ±64 bytes for ID-suffix variance.)_
- **TAB-11.2-11** 🟡 **Dark-mode toggle (⌘⇧L) flips the canvas without refresh** — `useObservedTheme()` feeds the engine's colour settings; canvas background, staff lines, and notes all swap on toggle. _(unit: TabView.test.tsx — implicit via session.render() call when theme changes; no visual snapshot.)_
- **TAB-11.2-12** ✅ **Tab pane H1 derives from `\title` directive (basename fallback when absent)** — _(playwright: `e2e/tab_h1_derivation.spec.ts` — "with-title leg" asserts `pane-title` is "Greensleeves"; "basename-fallback leg" asserts `pane-title` is "untitled-no-title" for `untitled-no-title.alphatex`.)_ Vitest helper coverage in `src/app/knowledge_base/features/tab/paneTitle.test.ts`. `paneTitleFor` returns the score `\title` when present and meaningful, else falls back to the file's basename without extension; `"Untitled"` is treated as the alphaTab sentinel rather than a real title.
- **TAB-11.2-13** ✅ **Wiki-link parser recognises `// references:` lines in the kb-meta block** — `useLinkIndex.fullRebuild` parses `[[…]]` tokens from any line beginning with `// references:` in a `.alphatex` file. _(unit: `useLinkIndex.test.ts` — TAB-011 cases TAB-11.6-04..06.)_
- **TAB-11.2-14** 🧪 **Open + render flow end-to-end** — Playwright drives a vault with one `.alphatex` fixture: open from explorer → canvas mounts → `data-testid="tab-view-canvas"` visible. Audio assertion is "AudioContext was created", not actual sound. _(e2e: e2e/tab.spec.ts.)_

---

## 11.3 Playback chrome (TAB-005)

Toolbar transport (play/pause/stop/tempo/loop), engine playback methods, SoundFont vendoring + service-worker cache. Shipped 2026-05-03.

- **TAB-11.3-01** ✅ **`mount()` configures `enablePlayer = true` and the SoundFont URL** — `settings.player.enablePlayer === true`, `settings.player.soundFont === "/soundfonts/sonivox.sf2"`. _(unit: alphaTabEngine.test.ts — "mount() configures enablePlayer=true and the SoundFont URL".)_
- **TAB-11.3-02** ✅ **Session play/pause/stop delegate to the alphatab API** — three independent test cases verify each call site. _(unit: alphaTabEngine.test.ts.)_
- **TAB-11.3-03** ✅ **Session seek writes `tickPosition`** — _(unit: alphaTabEngine.test.ts — "session.seek(beat) sets api.tickPosition".)_
- **TAB-11.3-04** ✅ **`setTempoFactor` clamps to 0.25..2.0** — out-of-range values are silently clamped. _(unit: alphaTabEngine.test.ts.)_
- **TAB-11.3-05** ✅ **`setLoop` applies `playbackRange` + `isLooping`** — null clears both. _(unit: alphaTabEngine.test.ts.)_
- **TAB-11.3-06** ✅ **Engine `playerReady` event re-emits as `"ready"` on the session bus** — _(unit: alphaTabEngine.test.ts.)_
- **TAB-11.3-07** ✅ **`playerStateChanged` emits `"played"` / `"paused"` based on the alphatab state value** — _(unit: alphaTabEngine.test.ts.)_
- **TAB-11.3-08** ✅ **`playerPositionChanged` emits `"tick"` with `currentTick`** — _(unit: alphaTabEngine.test.ts.)_
- **TAB-11.3-09** ✅ **`useTabEngine.playerStatus` reflects engine `played` / `paused` events** — _(unit: useTabEngine.test.tsx.)_
- **TAB-11.3-10** ✅ **`useTabEngine.currentTick` reflects engine `tick` events** — _(unit: useTabEngine.test.tsx.)_
- **TAB-11.3-11** ✅ **`useTabEngine.isAudioReady` flips true on `ready`** — _(unit: useTabEngine.test.tsx.)_
- **TAB-11.3-12** ✅ **`useTabPlayback.toggle()` flips between play/pause based on `playerStatus`** — _(unit: useTabPlayback.test.tsx.)_
- **TAB-11.3-13** ✅ **`useTabPlayback.play()` is a no-op when `isAudioReady` is false and sets `audioBlocked = true`** — _(unit: useTabPlayback.test.tsx.)_
- **TAB-11.3-14** ✅ **`TabToolbar` play button is disabled until `isAudioReady`** — _(unit: TabToolbar.test.tsx.)_
- **TAB-11.3-15** ✅ **`TabToolbar` tempo dropdown calls `onSetTempoFactor` with the chosen factor** — _(unit: TabToolbar.test.tsx.)_
- **TAB-11.3-16** ✅ **`TabToolbar` loop checkbox toggles `onSetLoop` with a range vs null** — _(unit: TabToolbar.test.tsx.)_
- **TAB-11.3-17** ✅ **`TabView` mounts the toolbar when status is `ready`** — _(unit: TabView.test.tsx.)_
- **TAB-11.3-18** ✅ **`TabView` does not mount the toolbar in `engine-load-error` state** — _(unit: TabView.test.tsx.)_
- **TAB-11.3-19** 🧪 **TabToolbar mounts alongside the canvas in a real browser** — Playwright opens an `.alphatex` file and confirms `tab-toolbar` testid + Play button are both visible. Click-and-verify of audio start was relaxed because alphatab's SoundFont/`playerReady` flow doesn't complete in headless Chromium within Playwright's timeout. _(e2e: e2e/tab.spec.ts.)_
- **TAB-11.3-20** ❌ **Service-worker cache hit on second load** — `/soundfonts/sonivox.sf2` served from cache without a network request after first fetch. (Manual / future Lighthouse audit.) _(MVP-5 follow-up: needs production-bundle e2e backend for service-worker cache assertions)_

---

## 11.4 .gp import (TAB-006)

Palette command + hook + utility for converting Guitar Pro files (`.gp` / `.gp3..7`) to `.alphatex` via alphatab's importer/exporter. Shipped 2026-05-03.

- **TAB-11.4-01** ✅ **`gpToAlphatex` loads bytes via ScoreLoader and exports via AlphaTexExporter** — pure utility, no DOM access. _(unit: gpToAlphatex.test.ts.)_
- **TAB-11.4-02** ✅ **`gpToAlphatex` propagates importer + exporter errors as-is** — `useGpImport` decides how to surface them; the utility stays unopinionated. _(unit: gpToAlphatex.test.ts.)_
- **TAB-11.4-03** ✅ **`useGpImport.importBytes(file)` writes a sibling `.alphatex` and notifies onImported** — derives the new path from the basename (strips the GP extension). _(unit: useGpImport.test.tsx.)_
- **TAB-11.4-04** ✅ **`.gp3` / `.gp4` / `.gp5` / `.gp7` extensions all map to `.alphatex` correctly** — _(unit: useGpImport.test.tsx.)_
- **TAB-11.4-05** ✅ **Conversion + write failures route through `ShellErrorContext`** — onImported is NOT called on either failure path. _(unit: useGpImport.test.tsx.)_
- **TAB-11.4-06** ❌ **End-to-end import flow** — Playwright drives the palette command, picks a `.gp` fixture, asserts the resulting `.alphatex` opens in a tab pane. Deferred — file-picker drive in headless Chromium requires a custom mock layer; the manual smoke in Task 3 step 4 is the verification ceiling for now. _(MVP-5 follow-up: needs Playwright file-picker mock for the OS-native open-file dialog — test_server doesn't proxy showOpenFilePicker)_

## 11.5 Properties panel (TAB-007)

Read-only side panel surfacing `useTabEngine().metadata` (title, artist, tempo, key, time signature, capo, tuning, tracks, sections). Slide-out chrome with collapse-state persisted to `localStorage["properties-collapsed"]` (shared with document + diagram panels). Shipped 2026-05-03.

- **TAB-11.5-01** ✅ **`TabProperties` renders title, artist, subtitle from metadata** — top-of-panel header. _(unit: TabProperties.test.tsx.)_
- **TAB-11.5-02** ✅ **General fields rendered: tempo / key / time signature / capo** — `120 BPM`, `Gmaj`, `4/4`, `Capo 2`. _(unit: TabProperties.test.tsx.)_
- **TAB-11.5-03** ✅ **Tuning rendered as scientific-pitch low-to-high** — `E2 A2 D3 G3 B3 E4`. _(unit: TabProperties.test.tsx.)_
- **TAB-11.5-04** ✅ **Track names rendered with track count in the header** — single-track or multi-track readout. _(unit: TabProperties.test.tsx.)_
- **TAB-11.5-05** ✅ **Section list shows name + start beat** — kebab-case section IDs are computed for TAB-007a but not displayed. _(unit: TabProperties.test.tsx.)_
- **TAB-11.5-06** ✅ **Optional fields (artist / subtitle / key) omitted when absent** — _(unit: TabProperties.test.tsx.)_
- **TAB-11.5-07** ✅ **Collapse toggle: data-collapsed attribute flips and content hides** — chrome stays mounted for slide animation. _(unit: TabProperties.test.tsx.)_
- **TAB-11.5-08** ✅ **`TabView` mounts panel beside canvas in 'ready' state; absent in 'engine-load-error'; collapse hydrates from localStorage** — three integration cases. _(unit: TabView.test.tsx.)_

---

## 11.6 Vault search (TAB-011)

- **TAB-11.6-01** ✅ **`.alphatex` files are indexed via `searchStream.readForSearchIndex`** — returns `{ kind: "tab", fields: { title, body } }` with title from `\title` and body from a space-joined concatenation of artist/album/subtitle/key/tuning/track-names/lyrics. _(unit: `searchStream.test.ts` — "reads a .alphatex tab and extracts indexable fields".)_
- **TAB-11.6-02** ✅ **A tab with only `\title` indexes successfully** — body is empty string; the file is still findable by title. _(unit: `searchStream.test.ts`.)_
- **TAB-11.6-03** ✅ **Search hits with `kind: "tab"` open in the tab pane** — `handleSearchPick` routes `result.kind === "tab"` through `panesOpenFile(path, "tab")`. _(integration: `knowledgeBase.tsx` — covered indirectly via the routing test in `knowledgeBase.tabRouting.test.tsx` and the existing `.alphatex` extension routing case TAB-11.1-01.)_
- **TAB-11.6-04** ✅ **`fullRebuild` indexes outbound wiki-links from a tab's `// references:` line** — `[[a.md]]`, `[[b.json]]`, etc. resolve to `outboundLinks` with the right `type` (document / diagram / tab). _(unit: `useLinkIndex.test.ts`.)_
- **TAB-11.6-05** ✅ **`//` lines that aren't `// references:` are ignored** — only the canonical comment header is parsed; arbitrary commentary like `// see [[ignored.md]]` does not bleed into the index. _(unit: `useLinkIndex.test.ts`.)_
- **TAB-11.6-06** ✅ **`.alphatex` is a recognised wiki-link target type** — a `.md` document linking to `[[song.alphatex]]` resolves to `{ type: "tab" }` so the receiving pane and the backlinks panel know to label it as a tab. _(unit: `useLinkIndex.test.ts`.)_
- **TAB-11.6-07** ✅ **Importing a `.gp` file re-indexes the new `.alphatex` immediately** — after `useGpImport` writes the tab to disk, the import wrapper calls `searchManager.addDoc` and `linkManager.fullRebuild` for the new path so it's searchable without a full vault rebuild. _(integration: see `knowledgeBase.tsx` `handleTabImported`; smoke-tested via existing GP import tests.)_

---

## 11.7 Cross-references (TAB-007a)

Tab properties cross-references: whole-file + per-section explicit attachments and wiki-link backlinks. Section-rename reconciliation. Read-only suppression of the attachment chrome.

- **TAB-11.7-01** ✅ **`slugifySectionName` derives kebab-case slug** — empty / punctuation-only input falls back to `"section"`. _(unit: `tabEngine.slugify.test.ts`.)_
- **TAB-11.7-02** ✅ **`getSectionIds` resolves duplicate slugs with `-2`/`-3` suffixes** — order-stable. _(unit: `tabEngine.getSectionIds.test.ts`.)_
- **TAB-11.7-03** ✅ **`useDocuments.migrateAttachments` rewrites `tab-section` ids on file** — only matching `${filePath}#${old}` entries change; other paths/types untouched. _(unit: `useDocuments.test.ts`.)_
- **TAB-11.7-04** ✅ **`useTabSectionSync` emits position-aligned migrations on rename** — trailing deletions emit nothing (orphan-by-design). _(unit: `useTabSectionSync.test.tsx`.)_
- **TAB-11.7-05** ✅ **`useTabSectionSync` resets cache on `filePath` change** — first observation per file is a baseline. _(unit: `useTabSectionSync.test.tsx`.)_
- **TAB-11.7-06** ✅ **`TabReferencesList` renders empty state when no rows** — _(unit: `TabReferencesList.test.tsx`.)_
- **TAB-11.7-07** ✅ **`TabReferencesList` distinguishes attachment vs backlink rows** — different icon, attachment-only `[detach]` button. _(unit: `TabReferencesList.test.tsx`.)_
- **TAB-11.7-08** ✅ **`TabReferencesList` de-duplicates by `sourcePath` with attachment winning over backlink** — _(unit: `TabReferencesList.test.tsx`.)_
- **TAB-11.7-09** ✅ **`TabReferencesList` hides detach when `readOnly`** — _(unit: `TabReferencesList.test.tsx`.)_
- **TAB-11.7-10** ✅ **`TabProperties` shows file-level "Whole-file references" listing `tab`-typed attachments** — _(unit: `TabProperties.test.tsx`.)_
- **TAB-11.7-11** ✅ **`TabProperties` per-section "References" sub-list keyed by deterministic `tab-section` id** — _(unit: `TabProperties.test.tsx`.)_
- **TAB-11.7-12** ✅ **`TabProperties` Attach affordance opens picker with composite `${filePath}#${sectionId}`** — file-level uses `entityType="tab"`, `entityId=filePath`. _(unit: `TabProperties.test.tsx`.)_
- **TAB-11.7-13** ✅ **`TabProperties` hides every Attach affordance when `readOnly`** — _(unit: `TabProperties.test.tsx`.)_
- **TAB-11.7-14** ✅ **`TabProperties` renders duplicate section names with deterministic suffixed ids** — both rows mount, no React key collision. _(unit: `TabProperties.test.tsx`.)_
- **TAB-11.7-15** ✅ **`TabView` propagates documents + backlinks to `TabProperties`** — _(unit: `TabView.test.tsx`.)_
- **TAB-11.7-16** ✅ **`TabView` invokes `onMigrateAttachments` when section renames between metadata snapshots** — _(unit: `TabView.test.tsx`.)_
- **TAB-11.7-17** ✅ **`TabView` opens DocumentPicker on Attach click and forwards `onAttachDocument` with composite id** — _(unit: `TabView.test.tsx`.)_

---

## 11.8 Mobile (TAB-012)

KB-040 stance: read-only + playback only on mobile (`useViewport().isMobile`, ≤900px).

- **TAB-11.8-01** ✅ **`buildTabPaneContext` sets `readOnly: true` when `isMobile=true`** — pure helper translates the KB-040 stance to the `TabPaneContext.readOnly` field. _(unit: `knowledgeBase.tabRouting.test.tsx`.)_
- **TAB-11.8-02** ✅ **`buildTabPaneContext` sets `readOnly: false` when `isMobile=false`** — desktop path keeps Attach + detach affordances live. _(unit: `knowledgeBase.tabRouting.test.tsx`.)_
- **TAB-11.8-03** ✅ **`buildImportGpCommands.when()` returns false when `isMobile=true`** — palette excludes "Import Guitar Pro file…" on mobile (no editor → no point in importing). _(unit: `knowledgeBase.gpImport.test.tsx`.)_
- **TAB-11.8-04** ✅ **`buildImportGpCommands.when()` returns true on desktop with a vault open** — _(unit: `knowledgeBase.gpImport.test.tsx`.)_
- **TAB-11.8-05** ✅ **`buildImportGpCommands.when()` returns false without a vault open (mobile or desktop)** — pre-existing `directoryName` gate preserved. _(unit: `knowledgeBase.gpImport.test.tsx`.)_
- **TAB-11.8-06** 🚫 **e2e mobile smoke: `.alphatex` opens read-only at 390×844 viewport** — deferred. Headless Chromium does not reliably parse `.alphatex` content within the test window, so TabProperties stays in the "Loading score…" state and never renders the Attach affordances the assertion would target. The `!readOnly` gate is covered at the helper level by TAB-11.8-01 / TAB-11.8-02. (Same environment limitation as TAB-11.3-19.)
- **TAB-11.8-07** 🧪 **e2e mobile smoke: command palette excludes "Import Guitar Pro file…"** — palette filter on mobile finds no match for the import command (typing `>Import Guitar Pro` shows "No matching commands"). _(playwright: `e2e/tabsMobile.spec.ts`.)_
- **TAB-11.8-08** ✅ **Bend keypress cycles off → ½ → full → off** (TAB-008b) — repeated `B` reads current note state from score and dispatches `add-technique amount=50`, `add-technique amount=100`, `remove-technique` in sequence. Cycle position survives across reload. _(unit: `useTabKeyboard.test.ts`, engine: `alphaTabEngine.applyEdit.test.ts`.)_
- **TAB-11.8-09** ✅ **Slide keypress cycles off → up → down → off** (TAB-008b) — repeated `S` reads current note state and dispatches direction `"up"`, direction `"down"`, `remove-technique`. _(unit: `useTabKeyboard.test.ts`, engine: `alphaTabEngine.applyEdit.test.ts`.)_
- **TAB-11.8-10** ✅ **Undo restores precise cycle position** (TAB-008b) — undoing from full-bend lands on ½-step (not no-bend); undoing from down-slide lands on up-slide. _(unit: `inverseOf.test.ts`, integration: `TabEditor.test.tsx`.)_
- **TAB-11.8-11** ✅ **Switching files while dirty resets dirty + cancels pending debounce** (TAB-008b #17) — pending flush still writes to the original file (closure captures path); UI on new file shows clean state. _(unit: `useTabContent.test.tsx`.)_

---

## 11.9 Editor v1 (TAB-008)

Click-to-place + keyboard fret/duration/technique editing. Single-track scope. Lazy-loaded chunk gated behind `effectiveReadOnly`.

- **TAB-11.9-01** ✅ **Click on a string × beat sets the cursor** — _(component: `TabEditorCanvasOverlay.test.tsx`.)_
- **TAB-11.9-02** ✅ **Bare digit accumulator commits set-fret after 500 ms timeout** — _(unit: `useTabKeyboard.test.ts`.)_
- **TAB-11.9-03** ✅ **Bare digit accumulator commits on non-digit key** — _(unit: `useTabKeyboard.test.ts`.)_
- **TAB-11.9-04** ✅ **Q sets active duration to whole** — _(unit: `useTabKeyboard.test.ts`.)_
- **TAB-11.9-05** ✅ **L toggles tie technique on the current note** — _(unit: `useTabKeyboard.test.ts`.)_
- **TAB-11.9-06** ✅ **Shift+L toggles let-ring (not tie)** — _(unit: `useTabKeyboard.test.ts`.)_
- **TAB-11.9-07** ✅ **B applies default ½-step bend** — _(unit: `alphaTabEngine.applyEdit.test.ts`.)_
- **TAB-11.9-08** ✅ **S applies slide-up by default; repeated S cycles direction** — _(unit: `alphaTabEngine.applyEdit.test.ts`.)_
- **TAB-11.9-09** ✅ **⌘Z dispatches the inverse of the last op** — _(unit: `useTabEditHistory.test.ts`.)_
- **TAB-11.9-10** ✅ **Undo/redo across 250 ops evicts oldest at depth 200** — _(unit: `useTabEditHistory.test.ts`.)_
- **TAB-11.9-11** ✅ **applyEdit set-fret throws on missing beat** — _(unit: `alphaTabEngine.applyEdit.test.ts`.)_
- **TAB-11.9-12** ✅ **applyEdit set-fret with fret=null removes the note** — _(unit: `alphaTabEngine.applyEdit.test.ts`.)_
- **TAB-11.9-13** ✅ **applyEdit add-technique sets the technique flag** — _(unit: `alphaTabEngine.applyEdit.test.ts`.)_
- **TAB-11.9-14** ✅ **applyEdit remove-technique clears the flag** — _(unit: `alphaTabEngine.applyEdit.test.ts`.)_
- **TAB-11.9-15** ✅ **applyEdit set-section adds/renames/removes** — _(unit: `alphaTabEngine.applyEdit.test.ts`.)_
- **TAB-11.9-16** ✅ **applyEdit add-bar appends a master bar** — _(unit: `alphaTabEngine.applyEdit.test.ts`.)_
- **TAB-11.9-17** ✅ **applyEdit remove-bar refuses last bar** — _(unit: `alphaTabEngine.applyEdit.test.ts`.)_
- **TAB-11.9-18** ✅ **resolveSectionIds prefers sidecar over slug fallback** — _(unit: `tabSectionIds.test.ts`.)_
- **TAB-11.9-19** ✅ **resolveSectionIds rename: same stableId both before + after** — _(unit: `tabSectionIds.test.ts`.)_
- **TAB-11.9-20** ✅ **tabRefsRepo round-trips a payload** — _(unit: `tabRefsRepo.test.ts`.)_
- **TAB-11.9-21** ✅ **tabRefsRepo read returns null when sidecar absent** — _(unit: `tabRefsRepo.test.ts`.)_
- **TAB-11.9-22** ✅ **useTabEditMode forces read-only when paneReadOnly=true** — _(unit: `useTabEditMode.test.ts`.)_
- **TAB-11.9-23** ✅ **TabView does not load editor chunk in read-only mode** — _(component: `TabView.editor.test.tsx`.)_
- **TAB-11.9-24** ✅ **TabEditorToolbar shows Edit toggle on desktop only** — _(component: `TabEditorToolbar.test.tsx`.)_
- **TAB-11.9-25** ✅ **Selected note details subsection only renders with cursor + edit mode** — _(component: `TabView.test.tsx`.)_
- **TAB-11.9-26** ✅ **e2e click-edit-save round-trip** — un-fixme'd. Verifies: alphaTab loads, edit mode toggles via PaneHeader's "Exit Read Mode", click on `tab-editor-cursor-target-0-6` sets cursor (asserted via `cursor-highlight` style.top), digit `5` flushes a `set-fret` op through the cursor → internal-string conversion, vault writes `5.6` to disk. _(playwright: `e2e/tabEditor.spec.ts`.)_
- **TAB-11.9-27** ✅ **PROPERTIES_COLLAPSED_KEY consolidated across DocumentView/DiagramView/TabView** — _(unit: `paneStorage.test.ts` / grep assertion.)_

---

## 11.10 Multi-track (TAB-009)

- **TAB-11.10-01** ✅ **Active track shows 6 string inputs for 6-string guitar** — `getAllByLabelText(/String \d/)` has length 6. _(unit: `TabProperties.test.tsx`.)_
- **TAB-11.10-02** ✅ **Active track shows 4 string inputs for 4-string bass** — `getAllByLabelText(/String \d/)` has length 4. _(unit: `TabProperties.test.tsx`.)_
- **TAB-11.10-03** ✅ **Changing a string pitch fires `onSetTrackTuning` with the new array** — blur triggers callback with correct trackId and updated tuning array. _(unit: `TabProperties.test.tsx`.)_
- **TAB-11.10-04** ✅ **Changing capo fires `onSetTrackCapo` with clamped int** — blur triggers callback with `("0", 3)`. _(unit: `TabProperties.test.tsx`.)_
- **TAB-11.10-05** ✅ **Capo input clamps to [0, 24]** — 99 → 24, -5 → 0. _(unit: `TabProperties.test.tsx`.)_
- **TAB-11.10-06** ✅ **Invalid pitch shows inline error and does not fire `onSetTrackTuning`** — "Z9" triggers `role="alert"`, no callback. _(unit: `TabProperties.test.tsx`.)_
- **TAB-11.10-07** ✅ **Only one `TrackEditor` renders (for the active row)** — `querySelectorAll("[data-track-editor]")` length is 1. _(unit: `TabProperties.test.tsx`.)_
- **TAB-11.10-08** ✅ **Clicking inside editor does not fire `onSwitchActiveTrack`** — `e.stopPropagation()` on editor container prevents row's click handler. _(unit: `TabProperties.test.tsx`.)_
- **TAB-11.10-09** ✅ **No-op when pitch is unchanged** — blurring a string input with its original value does not call `onSetTrackTuning`. _(unit: `TabProperties.test.tsx`.)_
- **TAB-11.10-10** ✅ **Active track switch via row click flips cursor.trackIndex** — clicking a track row in TabProperties dispatches `onSwitchActiveTrack(i)`, which `TabView` wires to `setCursor({ trackIndex: i, ... })`. _(component: `TabProperties.test.tsx`, integration: `TabView.tracks.test.tsx`.)_
- **TAB-11.10-11** ✅ **`[` / `]` keyboard shortcuts cycle active track (clamp at ends)** — bare `[` calls `prevTrack()`, bare `]` calls `nextTrack()`; both clamp at ends (no wrap); inherits the C4 input-element guard. _(unit: `useTabKeyboard.test.ts`, `useTabCursor.test.ts`.)_
- **TAB-11.10-12** ✅ **Add track via inline form appends and dispatches `add-track`** — `+ Add track` row expands inline form (Name + Instrument); Save dispatches `applyEdit({ type: "add-track", ... })`; tuning copied from active track if instrument matches, else default. _(component: `TabProperties.test.tsx`, integration: `TabView.tracks.test.tsx`.)_
- **TAB-11.10-13** ✅ **Remove track via kebab + window.confirm; last-track guard hides item** — kebab → "Remove track" → confirm dialog → `applyEdit({ type: "remove-track", trackId })`; last remaining track does not show the menu item. _(component: `TabProperties.test.tsx`.)_
- **TAB-11.10-14** ✅ **Cursor snaps to track 0 on remove-track** — when a track is removed, the cursor resets to `{ trackIndex: 0, voiceIndex: 0, beat: 0, string: 1 }`. _(integration: `TabView.tracks.test.tsx`.)_
- **TAB-11.10-15** ✅ **Per-track edits don't bleed across tracks** — `set-fret` / `set-duration` / `add-technique` on track[1] leaves track[0] untouched (and vice versa). _(unit: `alphaTabEngine.applyEdit.test.ts`.)_
- **TAB-11.10-16** ✅ **Voice 1 edits don't bleed into voice 0 and vice versa** — beat-touching ops with `voiceIndex: 1` route through `voices[1]` only. _(unit: `alphaTabEngine.applyEdit.test.ts`.)_
- **TAB-11.10-17** ✅ **`scoreToMetadata` extracts per-track tuning + capo from staves[0]** — MIDI int array → scientific pitch via `midiToScientificPitch`; `staves[0].capo` becomes `tracks[i].capo`; instrument inferred (≤4 strings → bass). _(unit: `alphaTabEngine.test.ts`.)_
- **TAB-11.10-18** ✅ **`applyAddTrack` appends a new track with matching bar count + rest beats** — capture `TrackCtor` / `StaffCtor` / `TuningCtor` from `mod.model.*`; build staff with `stringTuning` + `capo`; pad rests via `staff.addBar(bar)` until bar count matches existing tracks. _(unit: `alphaTabEngine.applyEdit.test.ts`.)_
- **TAB-11.10-19** ✅ **`applyRemoveTrack` last-track guard throws + .index reset** — engine throws "Cannot remove the only track in a score" when `tracks.length === 1`; after splice, remaining tracks' `.index` reset to their new positions. _(unit: `alphaTabEngine.applyEdit.test.ts`.)_
- **TAB-11.10-20** ✅ **Mute / solo button toggle fires `onToggleMute` / `onToggleSolo`** — clicking M / S on a track row toggles the trackId in/out of mutedTrackIds / soloedTrackIds; `aria-pressed` reflects state. _(component: `TabProperties.test.tsx`.)_
- **TAB-11.10-21** ✅ **Mute / solo state forwards to `session.setPlaybackState`** — TabView's effect on `[session, mutedTrackIds, soloedTrackIds]` calls `setPlaybackState({ mutedTrackIds, soloedTrackIds })`. _(integration: `TabView.muteSolo.test.tsx`.)_
- **TAB-11.10-22** ✅ **Mute / solo state resets when filePath changes (pane reload)** — `useEffect` on `[filePath]` clears mutedTrackIds / soloedTrackIds. _(integration: `TabView.muteSolo.test.tsx`.)_
- **TAB-11.10-23** ✅ **Engine `setPlaybackState` forwards to `api.changeTrackMute` / `api.changeTrackSolo`** — filters `score.tracks` by `String(t.index)`; resets all then applies muted/soloed subsets. _(unit: `alphaTabEngine.applyEdit.test.ts`.)_
- **TAB-11.10-24** ✅ **`VoiceToggle` component renders V1 / V2 with aria-pressed; click fires onChange** — _(component: `VoiceToggle.test.tsx`.)_
- **TAB-11.10-25** ✅ **TabEditorToolbar wires `VoiceToggle` and forwards onChange** — _(component: `TabEditorToolbar.test.tsx`.)_
- **TAB-11.10-26** ✅ **`useTabCursor.moveString` clamps to active track's tuning length** — multi-track metadata; switching to bass clamps string movement at 4 strings. _(unit: `useTabCursor.test.ts`.)_
- **TAB-11.10-27** ✅ **Sidecar v2 trackRefs ordered array** — `tabRefsRepo` round-trips `{ id, name }[]` indexed by track position. _(unit: `tabRefsRepo.test.ts`.)_
- **TAB-11.10-28** ✅ **Sidecar v1 → v2 forward-compat read** — v1 payloads (no `trackRefs`) read as v2 with empty `trackRefs: []`. _(unit: `tabRefsRepo.test.ts`.)_
- **TAB-11.10-29** ✅ **`updateSidecarOnEdit(add-track)` appends new entry; `(remove-track)` splices at position** — _(unit: `sidecarReconcile.test.ts`.)_
- **TAB-11.10-30** ✅ **Track-level attachment via `DocumentPicker` against `tab-track` entity** — entityId = `${filePath}#track:${stableUuid}`. _(component: `TabProperties.test.tsx`.)_
- **TAB-11.10-31** ✅ **Track row attachment badges render from sidecar `trackRefs`** — when sidecar has trackRefs entry, attach button + TabReferencesList show. _(component: `TabProperties.test.tsx`.)_
- **TAB-11.10-32** ✅ **`migrateAttachments` rewrites tab-track ids on path migration** — _(unit: `useDocuments.test.ts`.)_
- **TAB-11.10-33** ✅ **Doc-side backlinks render `track` annotation** — backlinks with `track?: string` annotate as `· track <id>` in DocumentProperties. _(unit: `DocumentProperties.test.tsx`.)_
- **TAB-11.10-34** ✅ **`inverseOf` produces `remove-track` for `add-track` (and vice versa)** — captures trackCount / removedTrack in PreState. _(unit: `inverseOf.test.ts`.)_
- **TAB-11.10-35** 🟡 **Voice 1 visual render verified manually** (TAB-008b) — per `docs/superpowers/plans/2026-05-04-tab-008b-voice-render-probe.md`. Outcome status updates with PR-time smoke test. _(manual observation.)_
- **TAB-11.10-36** ✅ **`handleRemoveTrack` detaches `tab-track` rows for the removed track's stable UUID before the engine splice** — reads the sidecar to get `trackRefs[removedPosition].id`, wraps `detachAttachmentsFor` in `withBatch`; matcher targets only `{ entityType: "tab-track", entityId: "${filePath}#track:${uuid}" }` — other UUIDs and `tab` rows are not matched. _(integration: `TabView.tracks.test.tsx`.)_
- **TAB-11.10-37** ✅ **`handleRemoveTrack` with absent sidecar skips detach but still splices the engine** — when sidecar `read` returns `null`, `stableUuid` is undefined so `detachAttachmentsFor` is never called; `propertiesApply({ type: "remove-track" })` still fires. _(integration: `TabView.tracks.test.tsx`.)_
- **TAB-11.10-38** ✅ **File-tree `.alphatex` delete detaches `tab` + `tab-section` + `tab-track` rows scoped to the file** — `tabFileMatcher` matches: `tab` row with exact path, `tab-section`/`tab-track` rows with `path#` prefix; rows for other files and for diagram entity types are not matched. _(unit: `fileTreeMatchers.test.ts`.)_
- **TAB-11.10-39** ✅ **`tabFileMatcher` prefix discriminator: `path#` prevents false match on `path.bak#`** — `foo.alphatex.bak#sec1` is NOT matched by a matcher built for `foo.alphatex`; the `#` separator is part of the entity-id scheme. _(unit: `fileTreeMatchers.test.ts`.)_

---

## 11.11 Export (TAB-010)

- **TAB-11.11-01** ✅ **Export MIDI: button click → save picker → file written** — `<base>.mid` suggested name; `MidiFileGenerator.toBinary()` produces a valid SMF1 multi-track MIDI buffer; FSA writable receives the bytes. _(unit: `useTabExport.test.tsx`, engine: `alphaTabEngine.export.test.ts`.)_
- **TAB-11.11-02** ✅ **Export MIDI palette command** — `tabs.export-midi` from ⌘P drives the same flow as the panel button; `when` predicate gates on `!isMobile && handle != null && !paneReadOnly`. _(unit: `knowledgeBase.exportTab.test.tsx`.)_
- **TAB-11.11-03** ✅ **Export WAV: progress row → save picker → 16-bit PCM WAV** — chunked render via `IAudioExporter.render(1000)` until undefined; `wavState.phase` transitions `idle → rendering → saving → idle`; encoded via `wavEncoder.encodeWav` with stereo 44.1kHz default. _(unit: `useTabExport.test.tsx`, `wavEncoder.test.ts`, engine: `alphaTabEngine.export.test.ts`.)_
- **TAB-11.11-04** ✅ **Export WAV cancel: AbortController → silent reset** — Cancel button calls `controller.abort()`; engine throws `AbortError`; hook catches silently; `wavState` resets to idle; no error banner. _(unit: `useTabExport.test.tsx`, engine: `alphaTabEngine.export.test.ts`.)_
- **TAB-11.11-05** ✅ **Export WAV respects mute/solo via `AudioExportOptions.trackVolume`** — muted tracks → 0; if any track is soloed, non-soloed tracks → 0; solo wins over mute for a soloed track. _(unit: `alphaTabEngine.export.test.ts`.)_
- **TAB-11.11-06** ✅ **Print / Save as PDF: `api.print()` invocation** — `tabs.export-pdf` and panel button both invoke alphaTab's print popup; missing `api.print` (test stub) is silently no-op. _(unit: `useTabExport.test.tsx`, engine: `alphaTabEngine.export.test.ts`.)_
- **TAB-11.11-07** ✅ **Mobile gating: panel hidden + palette commands gated** — `paneReadOnly = true` returns `null` from `<ExportSection>`; `buildExportTabCommands.when()` returns `false` on mobile or when handle is null or paneReadOnly. _(component: `ExportSection.test.tsx`, unit: `knowledgeBase.exportTab.test.tsx`.)_
- **TAB-11.11-08** ✅ **FSA picker cancel is silent** — user dismisses the save dialog → `AbortError` from `showSaveFilePicker` → hook returns silently → no `reportError` call → UI back to idle. _(unit: `useTabExport.test.tsx`.)_
- **TAB-11.11-09** ✅ **Filename derivation: strip path + `.alphatex`; null → "tab"** — `deriveExportBaseName` returns last path segment minus `.alphatex` suffix; null/empty/missing-segment → `"tab"`. _(unit: `deriveExportBaseName.test.ts`.)_
- **TAB-11.11-10** ✅ **`exportingMidi` flag disables all Export buttons during in-flight MIDI export** — exporting either format flips the unified `anyBusy` gate; all three buttons disabled. _(component: `ExportSection.test.tsx`.)_
- **TAB-11.11-11** ✅ **Split-pane focus: palette dispatches to `panes.focusedSide`** — `getActiveExport` reads the focused side's ref at invocation time; flipping focus routes the next command to the new pane. _(unit: `knowledgeBase.exportTab.test.tsx`.)_
- **TAB-11.11-12** ✅ **TabExportHandle published on mount, cleared on unmount** — `TabView`'s `useEffect` posts the handle via `onTabExportReady` and posts `null` on cleanup. _(component: `TabView` integration via existing tab bucket; not separately tested at TAB-010 scope.)_

## 11.12 Source links (MVP-4b)

- **TAB-11.12-01** ✅ **File-level source links persist via the existing `.alphatex.refs.json` sidecar (v3)** — `tabRefsRepo` round-trips `sources?: SourceLink[]` alongside `sectionRefs`/`trackRefs`; reopening restores the list. _(unit: `tabRefsRepo.test.ts`, component: `TabProperties.test.tsx`.)_
- **TAB-11.12-02** ✅ **`useTabSources` is merge-guarded — re-reads the sidecar inside the debounced write** so a concurrent `useTabEngine` write to `sectionRefs`/`trackRefs` is not clobbered. _(unit: `useTabSources.test.tsx`.)_
- **TAB-11.12-03** ✅ **v2 sidecar on disk reads as v3 in memory** — `tabRefsRepo` migration ladder (v1→v3, v2→v3, v3 passthrough); first save upgrades the on-disk version. _(unit: `tabRefsRepo.test.ts`.)_
- **TAB-11.12-04** ✅ **Adding a source through `TabProperties` writes through to the tabRefs sidecar** — UI integration: user clicks Add source, types URL, blurs input → repo `write` receives a payload with the new URL plus existing sectionRefs/trackRefs preserved. _(component: `TabProperties.test.tsx`.)_
- **TAB-11.12-05** ✅ **Switching tab files flushes any pending source-write to the previous path** — debounce flush on file switch via `useTabSources`. _(unit: `useTabSources.test.tsx`.)_
- **TAB-11.12-06** ✅ **Write failure leaves `isDirty = true`** — `useTabSources` does not clear the dirty marker on `repo.write` rejection. _(unit: `useTabSources.test.tsx`.)_
- **TAB-11.12-07** ✅ **`reconcileSidecar*` helpers preserve sources/attachedTo on section and track ops** — section rename, name-based reconcile, add-track, remove-track all carry forward `sources` and `attachedTo` via conditional spread. _(unit: `sidecarReconcile.test.ts`.)_
- **TAB-11.12-08** ✅ **Sidecar `attachedTo` field round-trips for forward-compat** — `tabRefsRepo` v3 emit accepts `attachedTo?` though no UI in MVP-4b binds it. _(unit: `tabRefsRepo.test.ts`.)_
