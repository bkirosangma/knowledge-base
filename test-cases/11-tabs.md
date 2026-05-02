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
- **TAB-11.2-13** ❌ **Wiki-link parser recognises `// references:` lines in the kb-meta block** — `useLinkIndex` indexes outbound links from `.alphatex`. (May land alongside TAB-011; track here for traceability.)
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

## Future sections (added with their owning ticket)

- **§11.4 `.gp` import** (TAB-006) — drag-drop + palette command, save-as `.alphatex`.
- **§11.5 Properties panel** (TAB-007 / TAB-007a) — tuning/capo/key/tempo + section attachments via `DocumentsSection`.
- **§11.6 Vault search** (TAB-011) — title/artist/key/tuning indexed; lyrics body when `\lyrics` directive present.
- **§11.7 Mobile** (TAB-012) — read-only + playback; no editor in bundle; no Create button.
- **§11.8 Editor** (TAB-008) — click-to-place fret + duration shortcuts + technique toolbar + undo/redo.
- **§11.9 Multi-track** (TAB-009 / TAB-009a) — add/remove tracks, per-track tuning/capo, track-level attachments.
- **§11.10 Export** (TAB-010) — MIDI / WAV / PDF.

Each ticket's PR adds the corresponding sub-section + flips its cases ✅ / 🧪 in the same change set, per the working-agreements contract.
