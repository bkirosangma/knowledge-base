# Test Cases — Guitar Tabs

> Mirrors §14 of [Features.md](../Features.md). Covers the `.alphatex` file type, `TabEngine` interface, `TabRepository`, the tab pane, and (later) the viewer/editor chrome built on the AlphaTab engine.
>
> ID scheme follows `test-cases/README.md`: `TAB-14.<sub>-<nn>`.
>
> **Scope discipline.** Only `§14.1 Foundation` (TAB-001 → TAB-003) and `§14.2 Viewer` (TAB-004) are pre-enumerated here. Later sub-sections (`§14.3 Playback`, `§14.4 .gp import`, etc.) are added with their owning ticket per the maintenance contract — leaving aspirational ❌ rows years before they're built clutters the coverage snapshot and dilutes the "this is what we still owe" signal.

---

## 14.1 Foundation (TAB-001 → TAB-003)

Domain interfaces, FSA-backed repository, pane-type plumbing, placeholder view. Shipped 2026-05-02.

- **TAB-14.1-01** ✅ **`.alphatex` files route to the `"tab"` pane** — `handleSelectFile` opens a tab pane for any path ending in `.alphatex`; other extensions keep their existing routing. _(unit: `knowledgeBase.tabRouting.test.tsx`.)_
- **TAB-14.1-02** ✅ **Non-tab pane entries fall through to the default renderer** — `renderTabPaneEntry` returns `null` for any `fileType !== "tab"` so the existing `DocumentView` fallback in `renderPane` is preserved. _(unit: `knowledgeBase.tabRouting.test.tsx`.)_
- **TAB-14.1-03** ✅ **`TabViewStub` renders a placeholder with the file path** — `data-testid="tab-view-stub"` is mounted; the file path is rendered as supporting text. _(unit: `TabViewStub.test.tsx`.)_
- **TAB-14.1-04** ✅ **`TabViewStub` names TAB-004 in its placeholder copy** — the message reads "Guitar tab viewer coming in TAB-004"; this case is the regression guard against accidentally shipping the stub when the real `TabView` lands. Flip to 🚫 (intentional removal) when TAB-004 deletes the stub. _(unit: `TabViewStub.test.tsx`.)_
- **TAB-14.1-05** ✅ **`createTabRepository.read` returns raw alphaTex text** — flat-path read returns the on-disk text byte-for-byte. _(unit: `tabRepo.test.ts`.)_
- **TAB-14.1-06** ✅ **`createTabRepository.read` throws `FileSystemError("not-found")` on missing file** — the FSA `NotFoundError` is mapped through `classifyError` to a typed domain error so consumers can branch on `kind`. _(unit: `tabRepo.test.ts`.)_
- **TAB-14.1-07** ✅ **`createTabRepository.read` resolves files in nested subdirectories** — exercises the `parts.slice(0, -1)` path-walking loop with a `subdir/song.alphatex` path. _(unit: `tabRepo.test.ts`.)_
- **TAB-14.1-08** ✅ **`createTabRepository.write` persists content** — round-trip write → read returns the new content; creates parent directories as needed. _(unit: `tabRepo.test.ts`.)_
- **TAB-14.1-09** ✅ **`createTabRepository.write` surfaces FSA failures as `FileSystemError`** — `NotAllowedError` from the underlying handle is mapped to `kind: "permission"`. _(unit: `tabRepo.test.ts`.)_
- **TAB-14.1-10** ✅ **`RepositoryProvider` exposes `tab` when a `rootHandle` is mounted** — `useRepositories().tab` is non-null with `read`/`write` methods. _(unit: `RepositoryContext.test.tsx`.)_
- **TAB-14.1-11** ✅ **`RepositoryProvider` sets `tab = null` when no `rootHandle` is mounted** — pre-picker / post-`clearSavedHandle` state matches every other repo in the bag. _(unit: `RepositoryContext.test.tsx`.)_
- **TAB-14.1-12** ⚙️ **`TabEngine` domain interface compiles without consumers** — pure-types module; no runtime test, but `tsc --noEmit` is the gate. Subsumed by CI typecheck.
- **TAB-14.1-13** ⚙️ **`TabRepository` interface compiles and is implemented by `createTabRepository`** — type-level contract; verified by the live use of the factory in `RepositoryContext.tsx`. Subsumed by CI typecheck.
- **TAB-14.1-14** ⚙️ **`PaneType` and `SavedPaneEntry.fileType` both include `"tab"`** — the duplicate inline union in `shared/utils/persistence.ts:338` was extended in lock-step. Future cleanup (replace duplicate with `import { PaneType }`) tracked as tech debt; for now, this case guards against drift if a new pane type is added. _(no automated test — verified at typecheck time when `panes.openFile(path, "tab")` is assigned to `SavedPaneEntry`.)_

## 14.2 Viewer (TAB-004)

Replaces `TabViewStub` with a real `TabView` that mounts `AlphaTabEngine` and renders the score from disk. **All cases below start at ❌ — flip to ✅ / 🧪 in the same commit as the test lands.**

- **TAB-14.2-01** ❌ **`TabView` lazy-loads the engine module on mount** — `next/dynamic({ ssr: false })` deferred import; the `@coderline/alphatab` chunk is not in the doc/diagram bundle. _(unit + bundle-size assertion.)_
- **TAB-14.2-02** ❌ **`TabView` reads the file via `useRepositories().tab`** — opens an `.alphatex` file from the explorer → `TabRepository.read` is invoked exactly once with the vault-relative path.
- **TAB-14.2-03** ❌ **`TabView` mounts `AlphaTabEngine` and loads the file content** — the engine's `mount()` is called with the host element; `session.load({ kind: "alphatex", text })` follows.
- **TAB-14.2-04** ❌ **Canvas renders within 2 s on a fixture file** — the `"loaded"` event fires within the budget; assertion is wall-clock against a deterministic fixture under JSDOM-stub.
- **TAB-14.2-05** ❌ **Loading state visible until engine `"ready"` fires** — a `data-testid="tab-view-loading"` placeholder is mounted while async import + asset fetch are in flight.
- **TAB-14.2-06** ❌ **Engine module load failure renders an inline error pane** — when the dynamic import throws, the view shows a "Reload" button (mirrors the `GraphView` force-graph fallback).
- **TAB-14.2-07** ❌ **Source parse failure surfaces via `ShellErrorBanner`** — malformed alphaTex routes through `useShellErrors().reportError`; same path the diagram repo uses today.
- **TAB-14.2-08** ❌ **External file change while pane is open triggers `ConflictBanner`** — the file-watcher signal is the same as docs/diagrams use; the tab pane subscribes through the existing hook.
- **TAB-14.2-09** ❌ **Closing the pane disposes the session** — `session.dispose()` runs in cleanup; subsequent re-open creates a fresh session (no audio context leak).
- **TAB-14.2-10** ❌ **Re-opening the same file after close re-renders identically** — content + scroll position not in scope; just file content fidelity.
- **TAB-14.2-11** ❌ **Dark-mode toggle (⌘⇧L) flips the canvas without refresh** — `useObservedTheme()` feeds the engine's colour settings; canvas background, staff lines, and notes all swap on toggle.
- **TAB-14.2-12** ❌ **Tab pane H1 derives from `\title` directive** — falls back to the file basename if `\title` is absent.
- **TAB-14.2-13** ❌ **Wiki-link parser recognises `// references:` lines in the kb-meta block** — `useLinkIndex` indexes outbound links from `.alphatex`. (May land alongside TAB-011; track here for traceability.)
- **TAB-14.2-14** 🧪 **Open + render flow end-to-end** — Playwright drives a vault with one `.alphatex` fixture: open from explorer → canvas mounts → `data-testid="tab-view-canvas"` visible. Audio assertion is "AudioContext was created", not actual sound.

---

## Future sections (added with their owning ticket)

- **§14.3 Playback chrome** (TAB-005) — play/pause/scrub/loop/speed/count-in.
- **§14.4 `.gp` import** (TAB-006) — drag-drop + palette command, save-as `.alphatex`.
- **§14.5 Properties panel** (TAB-007 / TAB-007a) — tuning/capo/key/tempo + section attachments via `DocumentsSection`.
- **§14.6 Vault search** (TAB-011) — title/artist/key/tuning indexed; lyrics body when `\lyrics` directive present.
- **§14.7 Mobile** (TAB-012) — read-only + playback; no editor in bundle; no Create button.
- **§14.8 Editor** (TAB-008) — click-to-place fret + duration shortcuts + technique toolbar + undo/redo.
- **§14.9 Multi-track** (TAB-009 / TAB-009a) — add/remove tracks, per-track tuning/capo, track-level attachments.
- **§14.10 Export** (TAB-010) — MIDI / WAV / PDF.

Each ticket's PR adds the corresponding sub-section + flips its cases ✅ / 🧪 in the same change set, per the working-agreements contract.
