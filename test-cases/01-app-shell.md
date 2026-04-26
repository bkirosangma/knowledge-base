# Test Cases — App Shell & Layout

> Mirrors §1 of [Features.md](../Features.md). See [README.md](README.md) for ID scheme and coverage markers.

---

## 1.1 Root Layout

- **SHELL-1.1-01** ✅ **App mounts without errors** — navigate to `/` → `[data-testid="knowledge-base"]` visible; zero `pageerror`; zero console-level errors (resource-load failures excluded). _(e2e: `e2e/app.spec.ts`)_
- **SHELL-1.1-02** ✅ **Geist fonts applied** — `<html>` has `--font-geist-sans` and `--font-geist-mono` CSS vars set. _(e2e: `e2e/app.spec.ts`)_
- **SHELL-1.1-03** ✅ **Full-height flex container** — root wrapper computes `display: flex`, `flex-direction: column`, and height equals viewport. _(e2e: `e2e/app.spec.ts`)_
- **SHELL-1.1-04** 🟡 **Tiptap CSS present** — `globals.css` selectors for `.ProseMirror h1`, `ul`, `ol`, `blockquote`, `code`, `table`, `[data-task-item]`, `[data-wiki-link]`. (Implicitly verified in-browser when any editor mounts; dedicated stylesheet-selector assertion not yet written.)

## 1.2 Header

> Title editing, dirty dot, Save, and Discard moved from the top-level `Header` into each pane's `PaneTitle` row on 2026-04-19 — diagram pane renders the editable diagram title (with Save/Discard on the right); document pane renders the debounced first H1 (Save/Discard on the right, title read-only). The top-level bar now only hosts the Split toggle.

- **SHELL-1.2-01** 🚫 **Back button navigates home** — removed; the top-level bar no longer has a Back button. See header strip-down on 2026-04-19.
- **SHELL-1.2-02** ✅ **Title renders as read-only when clean** — `PaneTitle` renders the current title as an `<h1>`; click-to-edit only when `onTitleChange` is provided.
- **SHELL-1.2-03** 🟡 **Click title to edit** — click switches `<h1>` → `<input>` with autofocus (diagram pane only; document pane is read-only). Caret visibility is a UA concern; verified at the Playwright level.
- **SHELL-1.2-04** ✅ **Enter commits title** — Enter blurs the input → `onBlur` commits the trimmed changed value via `onTitleChange`.
- **SHELL-1.2-05** ✅ **Escape cancels title edit** — Escape reverts the draft to the prop title and exits edit mode; `onTitleChange` is not called.
- **SHELL-1.2-06** ✅ **Blur commits title** — blur with a trimmed, changed value calls `onTitleChange`; blur with empty/whitespace value does not commit; blur with unchanged value is a no-op.
- **SHELL-1.2-07** 🚫 **80-char cap** — the old `Header` enforced `maxLength={80}`. `PaneTitle` lets the diagram-title `useState` accept any length; layout truncates visually via `truncate` instead. Revisit if users start pasting absurdly long titles.
- **SHELL-1.2-08** 🚫 **Title input auto-widens** — obsolete. The old `Header` measured `scrollWidth` of a hidden span and set `titleWidth` as a style; the new `PaneTitle` just lets the input take the flex-1 row and truncates with CSS. Keeping the ID to preserve history, but nothing to test.
- **SHELL-1.2-09** ✅ **Dirty indicator visible** — `PaneTitle` renders a dot with `title="Unsaved changes"` when `isDirty && (onSave||onDiscard)`.
- **SHELL-1.2-10** ✅ **Dirty indicator hidden when clean** — `isDirty=false` → dot not rendered. Also hidden when the pane doesn't own Save/Discard (suppresses stray dots on static titles).
- **SHELL-1.2-11** ✅ **Save button disabled when clean** — `disabled={!hasActiveFile || !isDirty}` on the Save button.
- **SHELL-1.2-12** ✅ **Save button enabled when dirty AND has active file** — conversely, both flags must be true to enable.
- **SHELL-1.2-13** ✅ **Discard button disabled when clean** — same disabled expression as Save.
- **SHELL-1.2-14** 🟡 **Discard opens confirm popover** — Header fires `onDiscard`; the popover is constructed inside `useFileActions` (covered by useFileActions (integration)).
- **SHELL-1.2-15** 🟡 **Discard confirmed rolls back** — covered by `useFileActions.executeDiscard`.
- **SHELL-1.2-16** 🟡 **Discard cancel leaves state** — covered by useFileActions.
- **SHELL-1.2-17** 🟡 **"Don't ask again" persists** — the checkbox reports via `onDontAskChange`; the caller writes the flag (`useFileActions.handleDiscard` short-circuit is tested in useFileActions.test.ts).
- **SHELL-1.2-18** ✅ **Split toggle enters split view** — click on the split button (when `onToggleSplit` is provided) fires the callback; button appears with `title="Split view"` when `isSplit=false`.
- **SHELL-1.2-19** ✅ **Split toggle exits split view** — `isSplit=true` swaps the `title` to `"Exit split view"`; same callback toggles the flag externally.
- **SHELL-1.2-20** 🧪 **`Cmd/Ctrl+S` triggers save** — keyboard shortcut lives in `useKeyboardShortcuts`; covered as part of DOC-4.11-03 in `e2e/documentGoldenPath.spec.ts`.
- **SHELL-1.2-21** 🧪 **`Cmd/Ctrl+S` noop when clean** — pressing Cmd+S without editing leaves the file on disk unchanged. _(e2e: `e2e/documentGoldenPath.spec.ts`)_
- **SHELL-1.2-22** ✅ **Switching files from dirty diagram autosaves previous file** — `handleLoadFile` in `shared/hooks/useFileActions.ts` now flushes the outgoing file's dirty state via `fileExplorer.saveFile` before selecting the new one (skipped when no active file, not dirty, or re-selecting the same file). — e2e/diagramGoldenPath.spec.ts
- **SHELL-1.2-23** ✅ **Document pane `PaneTitle` is read-only** — when `onTitleChange` is omitted the `<h1>` does not switch to an input on click. Document panes pass no `onTitleChange`; editing happens in the editor body, and the displayed H1 updates automatically on the next debounce tick.
- **SHELL-1.2-24** ✅ **Dirty dot suppressed without Save/Discard** — when neither `onSave` nor `onDiscard` is provided, the dirty dot does not render even if `isDirty` is true. Keeps stray dots off any static-title host that happens to receive `isDirty` transitively.
- **SHELL-1.2-25** ✅ **Save / Discard buttons absent when handlers omitted** — omitting `onSave` hides the Save button; omitting `onDiscard` hides the Discard button. Panes that don't wire those handlers (none today, but future hosts) get a clean title row.
- **SHELL-1.2-26** 🟡 **Document pane title reflects debounced first H1** — `DocumentView` runs `getFirstHeading(content)` through a 250 ms `setTimeout` and pushes the result into `PaneTitle`. First-H1 extraction is unit-tested in `DOC-4.13-01..14`; the debounce + prop plumbing is integration-level

## 1.3 Footer

- **SHELL-1.3-01** ✅ **Single-view filename** — `isSplit=false` → filename from `focusedEntry.filePath.split("/").pop` with no `[Left]`/`[Right]` prefix.
- **SHELL-1.3-02** ✅ **Split-view side labels** — `isSplit=true` → prefix `[Left]` or `[Right]` based on `ToolbarContext.focusedPane`.
- **SHELL-1.3-03** ✅ **Diagram stats shown** — when the focused side has `DiagramFooterInfo` in `FooterContext`, footer renders `W×H px`, `N patch(es)`, `Z%` (rounded). "1 patch" singularises correctly.
- **SHELL-1.3-04** ✅ **Document pane omits diagram stats** — no `FooterInfo` in context → stats markup is not rendered.
- **SHELL-1.3-05** 🟡 **Zoom updates live** — the live update path goes through `setLeftInfo`/`setRightInfo` calls from the diagram's zoom hook; round-trip verified in [FooterContext.test.tsx](../src/app/knowledge_base/shell/FooterContext.test.tsx). End-to-end live update test
- **SHELL-1.3-06** 🟡 **Patch count updates on content growth** — same path; live assertion deferred to Playwright.
- **SHELL-1.3-07** ✅ **Reset App clears state** — click clears `localStorage` and calls `window.location.reload`; verified with `window.location` swap stub.
- **SHELL-1.3-08** 🚫 **Reset App confirmation** — current implementation wipes silently. Product decision needed; no confirmation is in place.

Also covered in [ToolbarContext.test.tsx](../src/app/knowledge_base/shell/ToolbarContext.test.tsx): pane-count (1 vs 2), focus propagation, mixed-type active-pane derivation, pane-type fallback to `"diagram"` when left is null.

## 1.4 Pane Manager & Split Pane

- **SHELL-1.4-01** ✅ **Defaults to single pane** — fresh load with no saved layout → only left pane renders.
- **SHELL-1.4-02** ✅ **Enter split clones focus** — from single view, Enter Split → right pane exists but empty; left keeps its file.
- **SHELL-1.4-03** ✅ **Exit split closes unfocused pane** — focus left, Exit Split → right pane closes; left retains file.
- **SHELL-1.4-04** ✅ **Exit split from right focus closes left** — focus right, Exit Split → left closes; right pane becomes the single pane.
- **SHELL-1.4-05** ✅ **`lastClosedPane` restores** — after Exit Split, re-enter split → closed pane's prior file reopens on that side. (Hook captures `lastClosedPane`; restoration wiring lives in `KnowledgeBaseInner`.)
- **SHELL-1.4-06** ✅ **Open file routes to focused pane** — split view, focus right, open file from explorer → file opens in right pane.
- **SHELL-1.4-07** 🚫 **Pane type drives Header controls** — obsolete. The 2026-04-19 header strip-down removed all pane-specific controls from the top-level bar; each pane now renders its own Save/Discard in `PaneTitle`, so there's nothing for `activePaneType` to switch between up top. Footer still reads `ToolbarContext.activePaneType` (covered under 1.5).
- **SHELL-1.4-08** ✅ **Focus indicator rendered** — mouse-down in a pane adds 2 px blue border; previously focused pane loses border.
- **SHELL-1.4-09** ✅ **Focus persists across clicks within pane** — mouse-down in left/right pane fires `setFocusedSide`.
- **SHELL-1.4-10** ✅ **Divider drag resizes panes** — drag divider left → left pane narrows, right widens; released ratio sticks.
- **SHELL-1.4-11** ✅ **Divider clamped to 20%–80%** — drag beyond limits → movement clamped; panes never below 20 %.
- **SHELL-1.4-12** ✅ **Divider hover highlight** — `hover:bg-blue-400` class present on divider.
- **SHELL-1.4-13** ✅ **Split ratio persisted** — mouseUp writes ratio to localStorage under `storageKey`.
- **SHELL-1.4-14** ❌ **Layout restored on directory load** — re-open known folder → previous pane layout is restored. Owned by `KnowledgeBaseInner` + File System Access directory picker; e2e Playwright test not yet written.

## 1.5 Contexts (Toolbar / Footer)

- **SHELL-1.5-01** ✅ **`activePaneType` = "diagram"** — single pane shows a diagram → context reports `"diagram"`. (Covered by `ToolbarContext.test.tsx`.)
- **SHELL-1.5-02** ✅ **`activePaneType` = "document"** — single doc pane → `"document"`. (Covered by `ToolbarContext.test.tsx`.)
- **SHELL-1.5-03** ✅ **`activePaneType` = "mixed"** — split view, diagram + doc → derives from focused pane's type. (Covered by `ToolbarContext.test.tsx`.)
- **SHELL-1.5-04** ✅ **`paneCount` reflects view** — single → 1; split → 2. (Covered by `ToolbarContext.test.tsx`.)
- **SHELL-1.5-05** ✅ **`focusedPane` updates on mouse-down** — focus changes to the side that was just clicked.
- **SHELL-1.5-06** ✅ **PaneManager publishes per-side types into ToolbarContext** — left & right types stay independent. (FooterContext per-side coverage lives in `FooterContext.test.tsx`)
- **SHELL-1.5-07** ✅ **Footer/toolbar updates when focus switches** — mouse-down on a pane flips `focusedPane` and `activePaneType` in `ToolbarContext`.

## 1.6 Pane Content Chrome

> 2026-04-26 / SHELL-1.12 — `PaneTitle.tsx` was folded into `PaneHeader.tsx`. The title input, dirty dot, and Save / Discard buttons now live inline in the breadcrumb row. See §1.12 for the collapse-specific cases.

- **SHELL-1.6-01** ✅ **Breadcrumb path** — `filePath` is split on `/` and every segment is rendered; only the last segment gets the `text-slate-700 font-medium` emphasis. Single-segment paths render without chevrons.
- **SHELL-1.6-02** ✅ **Read-Mode toggle icon state** — `readOnly=true` renders `<Lock>`; `readOnly=false` renders `<LockOpen>`. The button's `aria-pressed` mirrors the flag and the accessible name swaps between `"Enter Read Mode"` / `"Exit Read Mode"`.
- **SHELL-1.6-03** 🟡 **Read-Mode toggle disables editing** — click calls `onToggleReadOnly`; the `contenteditable=false` wiring lives inside the Tiptap editor (the Tiptap integration test).
- **SHELL-1.6-04** ✅ **Right-side action slot renders** — `children` prop is rendered after the Read Mode toggle.
- **SHELL-1.6-05** ✅ **PaneHeader title edit commits on Enter** — Enter blurs the input, which fires `onTitleChange` with the trimmed value if it differs from the original. Blur with whitespace-only or unchanged text does NOT commit. (Title row folded into PaneHeader on 2026-04-26.)
- **SHELL-1.6-06** ✅ **PaneHeader title edit cancels on Escape** — Escape resets the draft to the current `title` prop and exits edit mode; `onTitleChange` is not called.
- **SHELL-1.6-07** 🧪 **Empty state** — "No file open" placeholder sits in `PaneManager`, not `PaneHeader`. _(e2e: `e2e/goldenPath.spec.ts`)_

## 1.7 Error Surface (Phase 5c)

Shell-level typed-error surface introduced in Phase 5c (2026-04-19). `ShellErrorProvider` holds a single-slot current error; consumers publish via `useShellErrors.reportError(e, context)`; `ShellErrorBanner` renders it; `ShellErrorBoundary` catches uncaught render throws. See [`src/app/knowledge_base/shell/ShellErrorContext.tsx`](../src/app/knowledge_base/shell/ShellErrorContext.tsx) + [`ShellErrorBanner.tsx`](../src/app/knowledge_base/shell/ShellErrorBanner.tsx) + [`ShellErrorBoundary.tsx`](../src/app/knowledge_base/shell/ShellErrorBoundary.tsx).

- **SHELL-1.7-01** ✅ **Provider starts empty** — `useShellErrors.current` is `null` on mount.
- **SHELL-1.7-02** ✅ **`reportError` classifies + publishes** — accepts a raw Error (classifies via `classifyError`) or a pre-built `FileSystemError` (passes through); `current` reflects `{ kind, message, context, at }`.
- **SHELL-1.7-03** ✅ **Single-slot replacement** — a second `reportError` replaces the first (no queue).
- **SHELL-1.7-04** ✅ **Dismiss clears** — `dismiss` sets `current` back to `null`.
- **SHELL-1.7-05** 🟡 **Banner renders current error** — `ShellErrorBanner` reads `current` and shows `kindLabel(kind)` + `context` + `message` + Dismiss button. Visual-only; the state round-trip is covered by SHELL-1.7-02..04.
- **SHELL-1.7-06** 🟡 **Boundary catches render throws** — `ShellErrorBoundary` React class renders a fallback on uncaught render errors, logs via `classifyError`. No assertion coverage — component is never exercised in the current test suite because no rendered component throws synchronously during normal operation.
- **SHELL-1.7-07** ✅ **`useShellErrors` without provider throws** — guard asserted in `ShellErrorContext.test.tsx`.

## 1.8 Toast Surface

Lightweight info-level toast for transient user feedback (separate from the error-level `ShellErrorContext`). `ToastProvider` wraps the app; consumers call `useToast().showToast(msg, duration?)` to show a timed `role="status"` banner. See [`src/app/knowledge_base/shell/ToastContext.tsx`](../src/app/knowledge_base/shell/ToastContext.tsx).

- **SHELL-1.8-01** ✅ **Toast renders message** — `showToast("…")` causes a `role="status"` element to appear with the message text. _(ToastContext.test.tsx)_
- **SHELL-1.8-02** ✅ **Toast auto-dismisses after 3 s** — after 3000 ms the `role="status"` element is removed from the DOM. _(ToastContext.test.tsx)_
- **SHELL-1.8-03** ✅ **Toast replaces previous toast** — calling `showToast` a second time replaces the first message; only one `role="status"` banner is present. _(ToastContext.test.tsx)_
- **SHELL-1.8-04** ✅ **`useToast` throws outside provider** — calling `useToast()` without a wrapping `ToastProvider` throws with a descriptive message. _(ToastContext.test.tsx)_

## 1.9 Disk Conflict Surface

Banner shown when a file changes on disk while the user has unsaved edits. See [`src/app/knowledge_base/shared/components/ConflictBanner.tsx`](../src/app/knowledge_base/shared/components/ConflictBanner.tsx).

- **SHELL-1.9-01** ✅ **Conflict message rendered with alert role** — `ConflictBanner` renders a `role="alert"` element containing "This file was changed outside the app." _(ConflictBanner.test.tsx)_
- **SHELL-1.9-02** ✅ **Reload from disk button calls handler** — clicking "Reload from disk" invokes the `onReload` callback exactly once. _(ConflictBanner.test.tsx)_
- **SHELL-1.9-03** ✅ **Keep my edits button calls handler** — clicking "Keep my edits" invokes the `onKeep` callback exactly once. _(ConflictBanner.test.tsx)_

## 1.10 File Watcher

Background polling primitive that manages a 5-second interval with named subscriber registry. See [`src/app/knowledge_base/shared/context/FileWatcherContext.tsx`](../src/app/knowledge_base/shared/context/FileWatcherContext.tsx).

- **SHELL-1.10-01** ✅ **Subscribers called on 5s interval** — after mounting `FileWatcherProvider`, registered subscribers fire every 5 seconds. _(FileWatcherContext.test.tsx)_
- **SHELL-1.10-02** ✅ **refresh() fires all subscribers immediately** — calling `refresh()` invokes all registered subscribers without waiting for the interval. _(FileWatcherContext.test.tsx)_
- **SHELL-1.10-03** ✅ **unsubscribe removes subscriber** — calling `unsubscribe(id)` stops firing the subscriber for future ticks. _(FileWatcherContext.test.tsx)_
- **SHELL-1.10-04** ✅ **useFileWatcher throws outside provider** — calling `useFileWatcher()` without a wrapping `FileWatcherProvider` throws with a descriptive message. _(FileWatcherContext.test.tsx)_

## 1.11 Command Registry & Palette

Typed command registry context (`CommandRegistry.tsx`) + `⌘K` palette overlay (`CommandPalette.tsx`). Commands registered by mounted hooks; auto-unregistered on unmount. See [`src/app/knowledge_base/shared/context/CommandRegistry.tsx`](../src/app/knowledge_base/shared/context/CommandRegistry.tsx) and [`src/app/knowledge_base/shared/components/CommandPalette.tsx`](../src/app/knowledge_base/shared/components/CommandPalette.tsx).

- **SHELL-1.11-01** 🧪 **⌘K opens palette** — pressing `⌘K` (or `Ctrl+K`) while focus is not in an input/textarea/contenteditable → `role="dialog"` palette appears with autofocused search input. _(e2e: `e2e/commandPalette.spec.ts` CMD-1-01)_
- **SHELL-1.11-02** 🧪 **Header chip opens palette** — clicking the "Search commands… ⌘K" chip in the header → palette appears. _(e2e: `e2e/commandPalette.spec.ts` CMD-1-04)_
- **SHELL-1.11-03** 🧪 **Typing filters results** — typing in the search input narrows the list by case-insensitive substring match; non-matching query shows "No matching commands". _(e2e: `e2e/commandPalette.spec.ts` CMD-1-02)_
- **SHELL-1.11-04** 🧪 **Escape closes palette** — pressing Escape while palette is open → dialog dismissed. _(e2e: `e2e/commandPalette.spec.ts` CMD-1-03)_
- **SHELL-1.11-05** 🧪 **Enter executes command and closes** — navigating to a command with ↑/↓ and pressing Enter → command fires, palette closes. _(e2e: `e2e/commandPalette.spec.ts` CMD-1-05)_
- **SHELL-1.11-06** ❌ **Backdrop click closes palette** — clicking outside the panel (on the semi-transparent backdrop) → palette closes.
- **SHELL-1.11-07** ❌ **↑/↓ navigate rows** — pressing ArrowDown highlights the next row; ArrowUp highlights the previous; wraps at boundaries.
- **SHELL-1.11-08** ✅ **useRegisterCommands no-ops outside provider** — calling `useRegisterCommands` in a component not wrapped by `CommandRegistryProvider` does not throw. _(covered implicitly by unit tests that render keyboard-shortcut hooks without provider)_
- **SHELL-1.11-09** ✅ **useCommandRegistry returns stub outside provider** — calling `useCommandRegistry()` outside the provider returns empty fallback state without throwing. _(Header.test.tsx renders Header — which calls useCommandRegistry — without provider)_
- **SHELL-1.11-10** ❌ **⌘K blocked inside contenteditable** — pressing `⌘K` while a Tiptap editor has focus → palette does NOT open.
- **SHELL-1.11-11** ❌ **Diagram commands absent when no diagram open** — with only a document pane open, "Delete Selected" and diagram "Toggle Read / Edit Mode" commands do not appear in the palette.
- **SHELL-1.11-12** ❌ **Diagram commands present when diagram open** — with a diagram pane open, "Delete Selected" (when a node is selected) and "Toggle Read / Edit Mode" appear.
- **SHELL-1.11-13** ❌ **Document commands present when document open** — with a document pane open, document "Toggle Read / Edit Mode" appears in the palette.
- **SHELL-1.11-14** ❌ **`when` guard hides Delete Selected when nothing selected** — with a diagram open but nothing selected, "Delete Selected" does not appear.

## 1.12 Shell Collapse — PaneTitle → PaneHeader (Phase 2 PR 2)

> 2026-04-26 — the per-pane chrome stack dropped from 5 strips (Header / Breadcrumb / Title / Toolbar / Content) to 4. `PaneTitle.tsx` was deleted; its title input, dirty dot, Save, and Discard fields now render inline inside `PaneHeader.tsx`. The shell `Header` reclaims the freed real-estate with a global "N unsaved" dirty-stack indicator next to the ⌘K trigger chip.

- **SHELL-1.12-01** 🧪 **Title input lives inside the breadcrumb row** — the title `<h1>` (`data-testid="pane-title"`) and the file's breadcrumb segment share the same `PaneHeader` strip — there is no separate title row above the toolbar. _(e2e: `e2e/shellCollapse.spec.ts`)_
- **SHELL-1.12-02** 🧪 **Editing the title and pressing Enter commits the change** — clicking the heading swaps it for an `<input>` (`data-testid="pane-title-input"`); typing + Enter commits via the existing `onTitleChange` wiring (diagram pane). _(e2e: `e2e/shellCollapse.spec.ts`)_
- **SHELL-1.12-03** 🧪 **Save and Discard appear next to the title** — after a dirtying edit, both buttons render in the same `PaneHeader` row, enabled, with their existing `title` attributes (`Save`, `Discard changes`). _(e2e: `e2e/shellCollapse.spec.ts`)_
- **SHELL-1.12-04** 🧪 **Dirty-stack indicator in Header shows "1 unsaved" after edit** — typing into a freshly opened doc surfaces an amber pill (`data-testid="dirty-stack-indicator"`) in the global header reading "1 unsaved". _(e2e: `e2e/shellCollapse.spec.ts`)_
- **SHELL-1.12-05** 🧪 **Dirty-stack indicator hidden when no files are dirty** — with a clean document open, the indicator is absent from the DOM (`toHaveCount(0)`). _(e2e: `e2e/shellCollapse.spec.ts`)_
- **SHELL-1.12-06** ✅ **`hideTitleControls` dissolves title input + Save/Discard (Focus Mode)** — `PaneHeader` with `hideTitleControls` skips the title section entirely; breadcrumb, Read pill, and reading-time pill still render. _(unit: `PaneHeader.test.tsx`)_
- **SHELL-1.12-07** ✅ **Header dirty-stack badge tooltip lists every dirty file** — the badge's `title` attribute concatenates every path in `dirtyFiles`; rendered with `bg-amber-50 text-amber-700 border border-amber-200` styling. _(unit: `Header.test.tsx`)_
- **SHELL-1.12-08** ✅ **Per-pane dirty publishers prevent split-view race** — when the same `.md` is open in BOTH panes and only the LEFT pane is dirty, the global dirty-stack indicator still reports the file as unsaved. The right pane's mount (which fires `onDirtyChange(path, false)`) and unmount cleanup must not clear a path the left pane still owns. The shell tracks `leftDocDirty` and `rightDocDirty` as separate `Set<string>` publishers and unions them for the Header badge. _(unit: `knowledgeBase.dirty.test.tsx` — split-pane has no e2e harness; covered by Vitest unit test exercising the publish/cleanup contract)_

## 1.13 Theme & Design Tokens (Phase 3 PR 1)

> 2026-04-26 — token layer + dark theme + locked type scale + a11y sweep. Tokens live in `globals.css` (`:root` + `[data-theme="dark"]`); `@theme inline` exposes them as Tailwind utilities so dark-mode flips propagate via `var(--…)`. Theme persists to `vaultConfig.theme`. `useTheme` hook in `shared/hooks/useTheme.ts`; sun/moon button + ⌘⇧L bind in `Header.tsx` and `knowledgeBase.tsx#ThemedShell`.

- **SHELL-1.13-01** 🧪 **⌘⇧L toggles theme; root gains `data-theme="dark"`** — pressing `⌘⇧L` (or `Ctrl+Shift+L`) outside an input/contenteditable flips the `data-theme` attribute on the knowledge-base root between `"light"` and `"dark"`. _(e2e: `e2e/themeToggle.spec.ts`)_
- **SHELL-1.13-02** 🧪 **Sun/moon icon click toggles theme** — clicking `data-testid="theme-toggle"` flips the same attribute, updates `aria-pressed` to mirror the new state, and swaps Sun/Moon icons. _(e2e: `e2e/themeToggle.spec.ts`)_
- **SHELL-1.13-03** 🧪 **First mount reads theme from vault config** — pre-seeding `.archdesigner/config.json` with `{ theme: "dark" }` and opening the folder applies dark on first mount before any user action. (Read half of the toggle→reload→re-read round-trip; the write half is covered by `vaultConfig.test.ts`.) _(e2e: `e2e/themeToggle.spec.ts`)_
- **SHELL-1.13-04** 🧪 **Dark mode applies dark surface via tokenised utility** — the shell root uses `bg-surface-2`; in light its computed `background-color` is `rgb(248, 250, 252)` (token `#f8fafc`), in dark it becomes `rgb(30, 41, 59)` (`#1e293b`). Asserts both that `[data-theme="dark"]` cascades and that `@theme inline` produced a working `var()`-based utility. _(e2e: `e2e/themeToggle.spec.ts`)_
- **SHELL-1.13-05** ❌ **`prefers-color-scheme` precedence** — with no `theme` in vault config and OS dark pref, the app defaults to dark on first mount. _(no e2e harness for OS pref toggling — covered manually + by hook contract)_
- **SHELL-1.13-06** ❌ **Visible focus ring on keyboard nav** — Tab-focusing a button shows a 2px ring using `var(--focus)`. Mouse clicks do NOT trigger the ring (`:focus-visible` only). _(visual; not yet automated)_
- **SHELL-1.13-07** ❌ **Locked type scale resolves through tokens** — `text-base` is `15px`, `text-lg` is `17px`, etc. Asserting computed font-size on a benchmark element with `text-base` confirms the override.
- **SHELL-1.13-08** ❌ **`vaultConfigRepo.update` patches a single field** — calling `repo.update({ theme: "dark" })` reads the existing config, merges the patch, writes it back; existing `name` / `version` / `created` are preserved.
