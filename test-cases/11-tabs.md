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

- **TAB-11.2-01** ❌ **`TabView` lazy-loads the engine module on mount** — `next/dynamic({ ssr: false })` deferred import; the `@coderline/alphatab` chunk is not in the doc/diagram bundle. _(unit + bundle-size assertion.)_
- **TAB-11.2-02** ✅ **`TabView` reads the file via `useRepositories().tab`** — opens an `.alphatex` file from the explorer → `TabRepository.read` is invoked exactly once with the vault-relative path. _(unit: TabView.test.tsx — "calls mountInto with the loaded file content".)_
- **TAB-11.2-03** ✅ **`TabView` mounts `AlphaTabEngine` and loads the file content** — the engine's `mount()` is called with the host element; `session.load({ kind: "alphatex", text })` follows. _(unit: TabView.test.tsx — "renders the canvas host when status is 'ready'".)_
- **TAB-11.2-04** ❌ **Canvas renders within 2 s on a fixture file** — the `"loaded"` event fires within the budget; assertion is wall-clock against a deterministic fixture under JSDOM-stub.
- **TAB-11.2-05** ✅ **Loading state visible until engine `"ready"` fires** — a `data-testid="tab-view-loading"` placeholder is mounted while async import + asset fetch are in flight. _(unit: TabView.test.tsx — "shows the loading placeholder while status is 'mounting'".)_
- **TAB-11.2-06** ✅ **Engine module load failure renders an inline error pane** — when the dynamic import throws, the view shows a "Reload" button (mirrors the `GraphView` force-graph fallback). _(unit: TabView.test.tsx — "renders the engine-load-error pane with a Reload button" + "Reload button re-invokes mountInto".)_
- **TAB-11.2-07** ✅ **Source parse failure surfaces via `ShellErrorBanner`** — malformed alphaTex routes through `useShellErrors().reportError`; same path the diagram repo uses today. _(unit: TabView.test.tsx — "source-parse errors route through useShellErrors".)_
- **TAB-11.2-08** ❌ **External file change while pane is open triggers `ConflictBanner`** — the file-watcher signal is the same as docs/diagrams use; the tab pane subscribes through the existing hook.
- **TAB-11.2-09** ✅ **Closing the pane disposes the session** — `session.dispose()` runs in cleanup; subsequent re-open creates a fresh session (no audio context leak). _(unit: useTabEngine.test.tsx — "unmount triggers session.dispose via cleanup effect".)_
- **TAB-11.2-10** ❌ **Re-opening the same file after close re-renders identically** — content + scroll position not in scope; just file content fidelity.
- **TAB-11.2-11** 🟡 **Dark-mode toggle (⌘⇧L) flips the canvas without refresh** — `useObservedTheme()` feeds the engine's colour settings; canvas background, staff lines, and notes all swap on toggle. _(unit: TabView.test.tsx — implicit via session.render() call when theme changes; no visual snapshot.)_
- **TAB-11.2-12** ❌ **Tab pane H1 derives from `\title` directive** — falls back to the file basename if `\title` is absent.
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
- **TAB-11.3-20** ❌ **Service-worker cache hit on second load** — `/soundfonts/sonivox.sf2` served from cache without a network request after first fetch. (Manual / future Lighthouse audit.)

---

## 11.4 .gp import (TAB-006)

Palette command + hook + utility for converting Guitar Pro files (`.gp` / `.gp3..7`) to `.alphatex` via alphatab's importer/exporter. Shipped 2026-05-03.

- **TAB-11.4-01** ✅ **`gpToAlphatex` loads bytes via ScoreLoader and exports via AlphaTexExporter** — pure utility, no DOM access. _(unit: gpToAlphatex.test.ts.)_
- **TAB-11.4-02** ✅ **`gpToAlphatex` propagates importer + exporter errors as-is** — `useGpImport` decides how to surface them; the utility stays unopinionated. _(unit: gpToAlphatex.test.ts.)_
- **TAB-11.4-03** ✅ **`useGpImport.importBytes(file)` writes a sibling `.alphatex` and notifies onImported** — derives the new path from the basename (strips the GP extension). _(unit: useGpImport.test.tsx.)_
- **TAB-11.4-04** ✅ **`.gp3` / `.gp4` / `.gp5` / `.gp7` extensions all map to `.alphatex` correctly** — _(unit: useGpImport.test.tsx.)_
- **TAB-11.4-05** ✅ **Conversion + write failures route through `ShellErrorContext`** — onImported is NOT called on either failure path. _(unit: useGpImport.test.tsx.)_
- **TAB-11.4-06** ❌ **End-to-end import flow** — Playwright drives the palette command, picks a `.gp` fixture, asserts the resulting `.alphatex` opens in a tab pane. Deferred — file-picker drive in headless Chromium requires a custom mock layer; the manual smoke in Task 3 step 4 is the verification ceiling for now.

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
- **TAB-11.8-06** 🧪 **e2e mobile smoke: `.alphatex` opens read-only at 390×844 viewport** — TabView mounts; no Attach button surfaces. _(playwright: `e2e/tabsMobile.spec.ts`.)_
- **TAB-11.8-07** 🧪 **e2e mobile smoke: command palette excludes "Import Guitar Pro file…"** — palette filter on mobile finds no match for the import command. _(playwright: `e2e/tabsMobile.spec.ts`.)_

---

## Future sections (added with their owning ticket)

- **§11.9 Editor** (TAB-008) — click-to-place fret + duration shortcuts + technique toolbar + undo/redo.
- **§11.10 Multi-track** (TAB-009 / TAB-009a) — add/remove tracks, per-track tuning/capo, track-level attachments.
- **§11.11 Export** (TAB-010) — MIDI / WAV / PDF.

Each ticket's PR adds the corresponding sub-section + flips its cases ✅ / 🧪 in the same change set, per the working-agreements contract.
