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
- **SHELL-1.2-27** ✅ **Title text prepends "•" when dirty (KB-032 non-color signal)** — `PaneHeader` renders the title as `• {title}` whenever `isDirty && (onSave || onDiscard)`. Clean files and panes without Save/Discard render the bare title. Survives "disable browser CSS color" because the bullet glyph lives in text content, not styling. WCAG 1.4.1. _(unit: `PaneHeader.test.tsx`)_
- **SHELL-1.2-28** ✅ **Dirty dot announces "Modified" to screen readers (KB-032)** — the orange dot now carries `role="img"` + `aria-label="Modified"` so SR users get the state independently of the colour cue. WCAG 1.4.1. _(unit: `PaneHeader.test.tsx`)_

### Vault Switcher (MVP-1c)

- **SHELL-1.2-29** ✅ **Switcher trigger shows current vault basename** — `[data-testid="vault-switcher-trigger"]` renders the `path.basename(vaultPath)` of the open vault; renders "No vault open" when `vaultPath` is null. _(unit: `VaultSwitcher.test.tsx`)_
- **SHELL-1.2-30** ✅ **Switcher → Open Vault drives picker → switchVault** — clicking the **Open Vault…** entry calls the bridge picker; on a successful path return the dropdown calls `useFileExplorer.switchVault(path)`. _(unit: `VaultSwitcher.test.tsx`)_
- **SHELL-1.2-31** ✅ **Switcher → recent path switches without picker** — clicking a recents entry calls `switchVault(path)` directly (no picker invocation). _(unit: `VaultSwitcher.test.tsx`)_
- **SHELL-1.2-32** ✅ **Switcher → Initialize Vault calls `vaultConfig.init`** — clicking **Initialize Vault…** calls `vaultConfigRepo.init(name)`; on success the dropdown closes and `vaultStatus` re-evaluates so the splash dismisses. _(unit: `VaultSwitcher.test.tsx`)_
- **SHELL-1.2-33** ✅ **Switcher dismisses on outside click and Escape** — clicking outside the dropdown or pressing `Escape` closes it without firing any action. _(unit: `VaultSwitcher.test.tsx`)_
- **SHELL-1.2-34** ✅ **switchVault prompts confirm when files are dirty** — `useFileExplorer.switchVault(path)` calls `window.confirm` if any file in `dirtyFiles` is unsaved; cancelling aborts the switch with state untouched. Confirming proceeds with the new vault path and updates `settingsStore.lastPath` + `pushRecent`. _(unit: `useFileExplorer.switchVault.test.tsx`)_

## 1.3 Footer

- **SHELL-1.3-01** ✅ **Single-view filename** — `isSplit=false` → filename from `focusedEntry.filePath.split("/").pop` with no `[Left]`/`[Right]` prefix.
- **SHELL-1.3-02** ✅ **Split-view side labels** — `isSplit=true` → prefix `[Left]` or `[Right]` based on `ToolbarContext.focusedPane`.
- **SHELL-1.3-03** ✅ **Diagram stats shown** — when the focused side has `DiagramFooterInfo` in `FooterContext`, footer renders `W×H px`, `N patch(es)`, `Z%` (rounded). "1 patch" singularises correctly.
- **SHELL-1.3-04** ✅ **Document pane omits diagram stats** — no `FooterInfo` in context → stats markup is not rendered.
- **SHELL-1.3-05** 🟡 **Zoom updates live** — the live update path goes through `setLeftInfo`/`setRightInfo` calls from the diagram's zoom hook; round-trip verified in [FooterContext.test.tsx](../src/app/knowledge_base/shell/FooterContext.test.tsx). End-to-end live update test
- **SHELL-1.3-06** 🟡 **Patch count updates on content growth** — same path; live assertion deferred to Playwright.
- **SHELL-1.3-07** ✅ **Reset App clears state** — first click opens confirm popover; second click (confirm button) clears `localStorage` and calls `window.location.reload`; verified with `window.location` swap stub.
- **SHELL-1.3-08** ✅ **Reset App confirmation** — `ConfirmPopover` with destructive variant wraps the Reset button; Escape dismisses without resetting; confirmed in `Footer.test.tsx`.
- **SHELL-1.3-09** ✅ **"Last synced N s ago" chip is visible (KB-041)** — Footer renders a small `data-testid="last-synced-chip"` element when wrapped by `FileWatcherProvider`; reads `useFileWatcher().lastSyncedAt` and displays `"Last synced 0s ago"` immediately after mount. _(Footer.test.tsx)_
- **SHELL-1.3-10** ✅ **Chip ticks up once per second (KB-041)** — after one second of real time, the chip text re-renders to `"Last synced 1s ago"`; after another second `"Last synced 2s ago"`. _(Footer.test.tsx, fake timers)_
- **SHELL-1.3-11** ✅ **Footer no longer renders ClaudeStatusLine (MVP-3.5)** — after the terminal-surface pivot, `<ClaudeStatusLine>` is absent from `<Footer>`; status is surfaced directly in the embedded terminal. _(unit: `Footer.test.tsx`)_

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
- **SHELL-1.4-14** 🧪 **Layout restored on directory load** — re-open known folder → previous pane layout is restored. Owned by `KnowledgeBaseInner`; the test seeds `localStorage["knowledge-base-pane-layout"]` before `setVaultPath` reload and asserts the document pane re-mounts. _(e2e: `e2e/pane_layout_restore.spec.ts`)_
- **SHELL-1.4-15** ✅ **Active pane carries an sr-only "Focused" label (KB-032 non-color signal)** — the focus border `<div>` for the active side wraps `<span class="sr-only">Focused</span>`; only one such label exists in the DOM at any time. Survives "disable browser CSS color" because screen readers read the text directly. WCAG 1.4.1. _(unit: `PaneManager.test.tsx`)_
- **SHELL-1.4-16** ✅ **`openFile` writes anchor onto the active `PaneEntry`** — calling `openFile(path, "document", { anchor: "intro" })` results in `activeEntry.anchor === "intro"`. Wiki-link MVP 3 plumbing for `[[doc.md#section]]`. _(unit: `PaneManager.test.tsx`)_
- **SHELL-1.4-17** ✅ **`openFile` defaults anchor to `null`** — calling `openFile(path, "document")` (no opts) or `openFile(path, "document", {})` leaves `activeEntry.anchor === null`, so a stale anchor never bleeds into a fresh navigation. _(unit: `PaneManager.test.tsx`)_
- **SHELL-1.4-18** ✅ **Subsequent navigation without anchor resets the entry's anchor** — after `openFile(path, "document", { anchor: "intro" })` then `openFile(path, "document")`, `activeEntry.anchor === null`. Each navigation produces a fresh entry, so an old `#section` cannot persist. _(unit: `PaneManager.test.tsx`)_
- **SHELL-1.4-19** 🟡 **Footer renders drawer toggle button on the left edge** — `<DrawerToggleButton>` (renamed from `ChatToggleButton` in MVP-3.5) is the left-most footer slot, present on every page with an open vault. _(unit: `DrawerToggleButton.test.tsx`)_
- **SHELL-1.4-20** 🟡 **Drawer toggle icon pulses when drawer is closed and a stream is in flight on chat surface** — `animate-pulse` class applied to the icon while `isStreaming && !isOpen && surface === 'chat'`; never pulses on terminal surface. _(unit: `DrawerToggleButton.test.tsx`)_
- **SHELL-1.4-21** ✅ **DrawerToggleButton renders with "Open Claude" accessible label** — the button has an accessible name matching `/open claude/i`. _(unit: `DrawerToggleButton.test.tsx`; see TERM-14.6)_
- **SHELL-1.4-22** ✅ **DrawerToggleButton pulses on streaming when surface='chat'** — `animate-pulse` applied when `isStreaming && !isOpen && surface === 'chat'`. _(unit: `DrawerToggleButton.test.tsx`; see TERM-14.6)_
- **SHELL-1.4-23** ✅ **DrawerToggleButton does NOT pulse when drawer is open** — `animate-pulse` absent when `isOpen=true` regardless of streaming state or surface. _(unit: `DrawerToggleButton.test.tsx`; see TERM-14.6)_
- **SHELL-1.4-24** ✅ **DrawerToggleButton does NOT pulse when surface='terminal'** — `animate-pulse` absent when `surface='terminal'` even while streaming and drawer is closed. _(unit: `DrawerToggleButton.test.tsx`; see TERM-14.6)_

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

- **SHELL-1.6-01** ✅ **Breadcrumb path** — `filePath` is split on `/` and every segment is rendered; only the last segment gets the `text-slate-700 font-medium` emphasis. **KB-013 (2026-05-01):** the breadcrumb element is hidden entirely at path depth ≤ 1 (root-level files don't have useful crumbs); covered by `e2e/paneChromeDensity.spec.ts` and the updated `PaneHeader.test.tsx` "single-segment path hides the breadcrumb entirely" case.
- **SHELL-1.6-02** ✅ **Read-Mode toggle icon state** — `readOnly=true` renders `<Lock>`; `readOnly=false` renders `<LockOpen>`. The button's `aria-pressed` mirrors the flag and the accessible name swaps between `"Enter Read Mode"` / `"Exit Read Mode"`.
- **SHELL-1.6-03** 🟡 **Read-Mode toggle disables editing** — click calls `onToggleReadOnly`; the `contenteditable=false` wiring lives inside the Tiptap editor (the Tiptap integration test).
- **SHELL-1.6-04** ✅ **Right-side action slot renders** — `children` prop is rendered after the Read Mode toggle.
- **SHELL-1.6-05** ✅ **PaneHeader title edit commits on Enter** — Enter blurs the input, which fires `onTitleChange` with the trimmed value if it differs from the original. Blur with whitespace-only or unchanged text does NOT commit. (Title row folded into PaneHeader on 2026-04-26.)
- **SHELL-1.6-06** ✅ **PaneHeader title edit cancels on Escape** — Escape resets the draft to the current `title` prop and exits edit mode; `onTitleChange` is not called.
- **SHELL-1.6-07** 🧪 **Empty state** — KB-045's `EmptyState` component sits in `PaneManager`'s empty-state slot, not `PaneHeader`; visible when both panes are null and a vault is open. _(e2e: `e2e/goldenPath.spec.ts`)_
- **SHELL-1.6-08** 🧪 **KB-013 — root-file breadcrumb hidden** — opening a depth-1 file shows no `[data-testid="pane-breadcrumb"]`; opening a deeper file surfaces it with each segment as text. _(e2e: `paneChromeDensity.spec.ts`.)_
- **SHELL-1.6-09** 🧪 **KB-013 — same-depth path switch keeps title within 4 px** — switching between two depth-2 files (`notes/a.md` ↔ `notes/b.md`) shifts the `[data-testid="pane-title"]` bounding box by less than 4 px on the x-axis. _(e2e: `paneChromeDensity.spec.ts`.)_
- **SHELL-1.6-10** 🧪 **KB-013 — diagram toolbar collapses at compact width** — at 1024 px viewport, Live / Labels / Minimap inline buttons disappear; the `data-testid="diagram-toolbar-overflow-trigger"` button surfaces; clicking it reveals the three menu items. Zoom controls remain inline. _(e2e: `paneChromeDensity.spec.ts`.)_
- **SHELL-1.6-11** ✅ **KB-013 — `DiagramToolbarOverflow` open/close + toggle behaviour** — unit-tested in `DiagramToolbarOverflow.test.tsx`: trigger opens/closes the menu, items fire their toggle and close, `aria-checked` reflects state, Escape closes.
- **SHELL-1.6-12** 🧪 **KB-013 — explorer width is 240 px (was 260 px)** — `[data-testid="explorer-container"]` measures 240 px wide on a fresh vault open. _(e2e: `paneChromeDensity.spec.ts`.)_

### KB-045 — Useful empty state

- **SHELL-1.6-13** ✅ **`EmptyState` lists the canonical 5 shortcut chips (⌘K, ⌘N, ⌘S, ⌘., ⌘\\)** — order matches the KB-045 ticket; chips are documentation only (action wiring lives at the shell level). (Covered by `EmptyState.test.tsx`.)
- **SHELL-1.6-14** ✅ **`EmptyState` shows up to 5 recent files; clicks route through `onSelectRecent`** — recents arrive sliced to 5 from `useRecentFiles`; clicking a row calls `handleSelectFile` which honours `.md` / `.json` / `.svg` routing. The empty case renders a "no recents yet" hint instead. (Covered by `EmptyState.test.tsx`.)
- **SHELL-1.6-15** ✅ **`EmptyState` "New Note" button creates and opens an `untitled.md`** — host wires the click to `fileExplorer.createDocument("")` followed by `handleSelectFile`, so the new doc takes over the pane and the empty state unmounts. (Covered by `EmptyState.test.tsx` for the button → callback contract; `e2e/goldenPath.spec.ts` covers the visibility flip.)

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

- **SHELL-1.9-01** ✅ **Conflict banner is a polite status live region (KB-035)** — `ConflictBanner` renders a `role="status"` element with `aria-live="polite"` containing "This file was changed outside the app." Replaces the previous `role="alert"` so screen readers announce the message without interrupting; the audit found assertive announcements were excessive given the user can keep editing. _(ConflictBanner.test.tsx)_
- **SHELL-1.9-02** ✅ **Reload from disk button calls handler** — clicking "Reload from disk" invokes the `onReload` callback exactly once. _(ConflictBanner.test.tsx)_
- **SHELL-1.9-03** ✅ **Keep my edits button calls handler** — clicking "Keep my edits" invokes the `onKeep` callback exactly once. _(ConflictBanner.test.tsx)_
- **SHELL-1.9-04** ✅ **Live region announces only the content message (KB-035)** — the visible content of the banner's status region is the message string (chrome buttons are inside the region but never change after first mount, so screen readers announce the message on appearance only). Verified by snapshotting the banner's accessible-name string. _(ConflictBanner.test.tsx)_

### 1.9.1 Broken Anchor Banner

Shell-level amber banner shown after a save deletes one or more headings that other docs link to. See [`src/app/knowledge_base/shared/components/BrokenAnchorBanner.tsx`](../src/app/knowledge_base/shared/components/BrokenAnchorBanner.tsx).

- **SHELL-1.9.1-01** ✅ **Renders with testid and singular text for one heading + one ref** — `BrokenAnchorBanner` exposes `data-testid="broken-anchor-banner"` and reports `1 heading removed from <docPath>; 1 wiki-link now broken.` for `deletedIds=['intro']` + a single affected ref. _(BrokenAnchorBanner.test.tsx)_
- **SHELL-1.9.1-02** ✅ **Plural copy for multiple headings and refs** — `2 headings removed from <docPath>; 3 wiki-links now broken.` for two deleted ids + three affected refs. _(BrokenAnchorBanner.test.tsx)_
- **SHELL-1.9.1-03** ✅ **Remove anchors button calls `onRemoveAnchors`** — clicking the "Remove anchors" button invokes the handler exactly once. _(BrokenAnchorBanner.test.tsx)_
- **SHELL-1.9.1-04** ✅ **Leave broken button calls `onLeaveBroken`** — clicking the "Leave broken" button invokes the handler exactly once. _(BrokenAnchorBanner.test.tsx)_

## 1.10 File Watcher

> **MVP-1b (2026-05-08):** The polling-based implementation (5 s / 30 s adaptive cadence, idle/visibility/input backoff, round-robin stagger) is **retired**. `FileWatcherContext` is now event-driven: it listens for `vault_change` Tauri events emitted by the Rust `notify`-debouncer-full watcher (~200 ms coalesce window) and dispatches them to subscribers. The public API (`subscribe`, `unsubscribe`, `refresh`, `lastSyncedAt`) is preserved. Cases SHELL-1.10-01 through SHELL-1.10-09 below are **superseded** by the new event-driven spec. Cases specific to the polling implementation (5 s interval, idle backoff, stagger) are replaced — see new cases 10–15. Full e2e wiring (vault opened in Tauri, real disk changes observed) defers to MVP-4.

See [`src/app/knowledge_base/shared/context/FileWatcherContext.tsx`](../src/app/knowledge_base/shared/context/FileWatcherContext.tsx), [`src-tauri/src/vault/watcher.rs`](../src-tauri/src/vault/watcher.rs).

- **SHELL-1.10-01** 🚫 **Subscribers called on 5s interval** — superseded by MVP-1b event-driven model; 5 s polling is retired. _(was FileWatcherContext.test.tsx; old test deleted)_
- **SHELL-1.10-02** 🚫 **refresh() fires every subscriber on the same tick (no stagger)** — stagger logic is retired; `refresh()` semantics preserved (fires all subscribers immediately) but the old stagger test is deleted. _(see SHELL-1.10-11)_
- **SHELL-1.10-03** 🚫 **unsubscribe removes subscriber** — superseded; subscriber registry preserved but old polling-based test deleted. _(see SHELL-1.10-12)_
- **SHELL-1.10-04** 🚫 **useFileWatcher throws outside provider** — superseded; hook guard preserved, old test deleted. _(see SHELL-1.10-13)_
- **SHELL-1.10-05** 🚫 **Idle backoff to 30 s after 2 minutes (KB-041)** — polling backoff retired in MVP-1b; no replacement test. _(was FileWatcherContext.test.tsx)_
- **SHELL-1.10-06** 🚫 **Input resumes 5 s polling (KB-041)** — polling cadence retired; no replacement test. _(was FileWatcherContext.test.tsx)_
- **SHELL-1.10-07** 🚫 **Subscribers stagger across 1-second slots (KB-041)** — stagger logic retired in MVP-1b. _(was FileWatcherContext.test.tsx)_
- **SHELL-1.10-08** 🚫 **Stagger order rotates round-robin across cycles (KB-041)** — stagger logic retired. _(was FileWatcherContext.test.tsx)_
- **SHELL-1.10-09** ✅ **`lastSyncedAt` exposed and updates per event (KB-041)** — context value includes `lastSyncedAt: number`; initialised at mount time and reset to `Date.now()` each time a `vault_change` event is dispatched to subscribers. _(FileWatcherContext.test.tsx)_
- **SHELL-1.10-10** ✅ **`vault_change` event dispatches to subscribers** — when a `vault_change` event arrives, all registered subscribers are called with the `VaultChangeEvent` payload. _(FileWatcherContext.test.tsx)_
- **SHELL-1.10-11** ✅ **`refresh()` fires every subscriber immediately** — calling `refresh()` invokes all registered subscribers synchronously without waiting for an event. _(FileWatcherContext.test.tsx)_
- **SHELL-1.10-12** ✅ **`unsubscribe` removes subscriber** — after `unsubscribe(id)`, the subscriber is not called on subsequent events. _(FileWatcherContext.test.tsx)_
- **SHELL-1.10-13** ✅ **`useFileWatcher` throws outside provider** — calling `useFileWatcher()` without a wrapping `FileWatcherProvider` throws with a descriptive message. _(FileWatcherContext.test.tsx)_
- **SHELL-1.10-14** ✅ **`watchStop` called on unmount** — when `FileWatcherProvider` unmounts, `tauriBridge.watchStop()` is called to tear down the Rust watcher. _(FileWatcherContext.test.tsx)_
- **SHELL-1.10-15** ❌ **UI reacts to disk change within ~1 s (e2e)** — full end-to-end: open Tauri shell, create/edit/delete a file on disk from a separate terminal, observe the UI tree updating within ~1 s. Deferred to MVP-4 (requires `tauri-plugin-webdriver`). _(MVP-5 follow-up: needs test_server vault_watch_start event-stream wiring — future-MVP candidate)_
- **SHELL-1.10-16** ✅ **Watcher post-processes `Modified` → `Deleted` when file is gone (MVP-1c)** — `src-tauri/src/vault/watcher.rs::postprocess_existence` runs in the dispatcher worker on each `Modified` event; if `tokio::fs::metadata(absolute_path)` returns an error (file no longer exists on disk), the kind is rewritten to `Deleted` before the `vault_change` event is emitted. Closes half of the macOS FSEvents kind-mapping gap (`tokio::fs::remove_file` emitting `Modified(Data)` instead of `Deleted`). _(Rust unit: `src-tauri/src/vault/watcher.rs` `tests::postprocess_*`)_

## 1.11 Command Registry & Palette

Typed command registry context (`CommandRegistry.tsx`) + `⌘K` palette overlay (`CommandPalette.tsx`). Commands registered by mounted hooks; auto-unregistered on unmount. See [`src/app/knowledge_base/shared/context/CommandRegistry.tsx`](../src/app/knowledge_base/shared/context/CommandRegistry.tsx) and [`src/app/knowledge_base/shared/components/CommandPalette.tsx`](../src/app/knowledge_base/shared/components/CommandPalette.tsx).

- **SHELL-1.11-01** 🧪 **⌘K opens palette** — pressing `⌘K` (or `Ctrl+K`) while focus is not in an input/textarea/contenteditable → `role="dialog"` palette appears with autofocused search input. _(e2e: `e2e/commandPalette.spec.ts` CMD-1-01)_
- **SHELL-1.11-02** 🧪 **Header chip opens palette** — clicking the "Search commands… ⌘K" chip in the header → palette appears. _(e2e: `e2e/commandPalette.spec.ts` CMD-1-04)_
- **SHELL-1.11-03** 🧪 **Typing filters results** — typing in the search input narrows the list by case-insensitive substring match; non-matching query shows "No matching commands". _(e2e: `e2e/commandPalette.spec.ts` CMD-1-02)_
- **SHELL-1.11-04** 🧪 **Escape closes palette** — pressing Escape while palette is open → dialog dismissed. _(e2e: `e2e/commandPalette.spec.ts` CMD-1-03)_
- **SHELL-1.11-05** 🧪 **Enter executes command and closes** — navigating to a command with ↑/↓ and pressing Enter → command fires, palette closes. _(e2e: `e2e/commandPalette.spec.ts` CMD-1-05)_
- **SHELL-1.11-06** 🧪 **Backdrop click closes palette** — clicking outside the panel (on the semi-transparent backdrop) → palette closes. _(e2e: `e2e/command_palette.spec.ts`)_
- **SHELL-1.11-07** 🧪 **↑/↓ navigate rows (clamps at boundaries)** — ArrowDown highlights the next row, ArrowUp the previous. **Production behaviour clamps**, not wraps (`Math.max(i-1, 0)` / `Math.min(i+1, n-1)` in `CommandPalette.tsx`); the case description's "wraps at boundaries" was aspirational and the spec asserts the clamp. _(e2e: `e2e/command_palette.spec.ts`)_
- **SHELL-1.11-08** ✅ **useRegisterCommands no-ops outside provider** — calling `useRegisterCommands` in a component not wrapped by `CommandRegistryProvider` does not throw. _(covered implicitly by unit tests that render keyboard-shortcut hooks without provider)_
- **SHELL-1.11-09** ✅ **useCommandRegistry returns stub outside provider** — calling `useCommandRegistry()` outside the provider returns empty fallback state without throwing. _(Header.test.tsx renders Header — which calls useCommandRegistry — without provider)_
- **SHELL-1.11-10** 🧪 **⌘K blocked inside contenteditable** — pressing `⌘K` while a Tiptap editor has focus → palette does NOT open. _(e2e: `e2e/command_palette.spec.ts` — flips the document into edit mode, clicks the ProseMirror, asserts the dialog stays absent.)_
- **SHELL-1.11-11** 🧪 **Diagram commands absent when no diagram open** — with only a document pane open, "Delete Selected" and the diagram-group "Toggle Read / Edit Mode" command do not appear in the palette. _(e2e: `e2e/command_palette.spec.ts`)_
- **SHELL-1.11-12** ✅ **Diagram commands present when diagram open** — `e2e/diagram_palette_commands.spec.ts` seeds a single-node `diagram.json` via `vault_write_json` through test_server, opens the diagram, clicks the node to select it, and asserts that both `Delete Selected` and `Toggle Read / Edit Mode` surface in the palette under `[role="group"][aria-label="Diagram"]`. The original "needs diagram-canvas pointer-event harness" framing was overestimated — `[data-testid="node-n1"]`.click() seeds selection cleanly (mirrors `diagramKeyboard.spec.ts`); the real harness gap was the obsolete `installMockFS` boot path, which the modern `installShim + makeTempVault` flow side-steps. _(e2e: `diagram_palette_commands.spec.ts`.)_
- **SHELL-1.11-13** 🧪 **Document commands present when document open** — with a document pane open, the document-group "Toggle Read / Edit Mode" entry appears in the palette. _(e2e: `e2e/command_palette.spec.ts`)_
- **SHELL-1.11-14** 🧪 **`when` guard hides Delete Selected when nothing selected** — with an empty diagram open and nothing selected, "Delete Selected" filters to "No matching commands". _(e2e: `e2e/command_palette.spec.ts`)_

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
- **SHELL-1.12-09** ✅ **Dirty-stack indicator is wrapped in a polite status live region (KB-035)** — the header column that hosts the amber pill is a `role="status"` element with `aria-live="polite"`. The wrapper is always present (even when no files are dirty), so the empty→"N unsaved" transition fires the live announcement on every dirty-count change. The text content "{N} unsaved" is what gets read; layout chrome stays empty until the count goes positive. _(unit: `Header.test.tsx`)_

## 1.13 Theme & Design Tokens (Phase 3 PR 1)

> 2026-04-26 — token layer + dark theme + locked type scale + a11y sweep. Tokens live in `globals.css` (`:root` + `[data-theme="dark"]`); `@theme inline` exposes them as Tailwind utilities so dark-mode flips propagate via `var(--…)`. Theme persists to `vaultConfig.theme`. `useTheme` hook in `shared/hooks/useTheme.ts`; sun/moon button + ⌘⇧L bind in `Header.tsx` and `knowledgeBase.tsx#ThemedShell`.

- **SHELL-1.13-01** 🧪 **⌘⇧L toggles theme; root gains `data-theme="dark"`** — pressing `⌘⇧L` (or `Ctrl+Shift+L`) outside an input/contenteditable flips the `data-theme` attribute on the knowledge-base root between `"light"` and `"dark"`. _(e2e: `e2e/themeToggle.spec.ts`)_
- **SHELL-1.13-02** 🧪 **Sun/moon icon click toggles theme** — clicking `data-testid="theme-toggle"` flips the same attribute, updates `aria-pressed` to mirror the new state, and swaps Sun/Moon icons. _(e2e: `e2e/themeToggle.spec.ts`)_
- **SHELL-1.13-03** 🧪 **First mount reads theme from vault config** — pre-seeding `.archdesigner/config.json` with `{ theme: "dark" }` and opening the folder applies dark on first mount before any user action. (Read half of the toggle→reload→re-read round-trip; the write half is covered by `vaultConfig.test.ts`.) _(e2e: `e2e/themeToggle.spec.ts`)_
- **SHELL-1.13-04** 🧪 **Dark mode applies dark surface via tokenised utility** — the shell root uses `bg-surface-2`; in light its computed `background-color` is `rgb(248, 250, 252)` (token `#f8fafc`), in dark it becomes `rgb(30, 41, 59)` (`#1e293b`). Asserts both that `[data-theme="dark"]` cascades and that `@theme inline` produced a working `var()`-based utility. _(e2e: `e2e/themeToggle.spec.ts`)_
- **SHELL-1.13-05** ✅ **`prefers-color-scheme` precedence** — with no `theme` in vault config and OS dark pref, the app defaults to dark on first mount; the corollary (OS light → light) covers the same code path. Playwright in `e2e/theme_priming.spec.ts`. The harness uses `test.use({ colorScheme })` so the browser context provisions the emulation **before** `page.goto()` runs — eliminating the race the original `note:` flagged.
- **SHELL-1.13-06** ✅ **Visible focus ring on keyboard nav** — Tab-focusing a button shows a 2px ring using `var(--focus)`. Mouse clicks do NOT trigger the ring (`:focus-visible` only). Playwright in `e2e/visual_hover_focus.spec.ts` (asserts `box-shadow: 0 0 0 2px …` after Tab focus on the header theme toggle, and that the same shadow does not match after a mouse-driven click).
- **SHELL-1.13-07** 🧪 **Locked type scale resolves through tokens** — `text-base` is `15px`, `text-lg` is `17px`, etc. Asserting computed font-size on a benchmark element with `text-base` confirms the override. _(e2e: `e2e/theme_tokens.spec.ts`)_
- **SHELL-1.13-08** ✅ **`vaultConfigRepo.update` patches a single field** — calling `repo.update({ theme: "dark" })` reads the existing config, merges the patch, writes it back; existing `name` / `version` / `created` are preserved. _(unit: `vaultConfigRepoTauri.test.ts`)_
- **SHELL-1.13-09** 🧪 **Active explorer-row text clears WCAG AA in both themes (KB-034)** — the `[data-theme="dark"] .bg-blue-50` rule in `src/app/styles/tokens.css` paints active rows with `rgba(52, 211, 153, 0.25)` (alpha bumped from .18 in KB-034), which composites over `--surface`. The filename text on selected/active explorer rows uses `--accent`. Both themes clear the 4.5:1 AA threshold, asserted via canvas-rgba-roundtrip + WCAG 2.1 contrast formula in the spec. _(e2e: `e2e/theme_tokens.spec.ts`)_

## 1.14 Mobile Shell & Bottom Nav (Phase 3 PR 3)

> 2026-04-26 — viewport-aware shell. Below the 900 px breakpoint the desktop split-pane layout is replaced by `MobileShell` (thin Header + active tab content + BottomNav with Files / Read / Graph). `useViewport` returns `{ isMobile }` (SSR-safe — defaults to `false` so first paint matches server output, then `useEffect` reads `matchMedia`). Touch canvas (DIAG-3.24) and PWA (SHELL-1.15) are companion features.

- **SHELL-1.14-01** 🧪 **At 390×844 viewport, MobileShell renders (BottomNav visible)** — setting an iPhone-class viewport before page load → `[data-testid="mobile-shell"]` mounts and `[data-testid="bottom-nav"]` shows all three tabs. _(e2e: `e2e/mobileLayout.spec.ts`)_
- **SHELL-1.14-02** 🧪 **Files tab → tap a file → switches to Read tab and shows content** — opening a `.md` from the explorer flips `bottom-nav-read`'s `aria-selected` to `true` and renders the editor inside `mobile-tab-read`. _(e2e: `e2e/mobileLayout.spec.ts`)_
- **SHELL-1.14-03** 🧪 **Bottom nav Graph tab opens GraphView** — tapping `bottom-nav-graph` swaps the visible tab to `mobile-tab-graph` containing `[data-testid="graph-view"]`. _(e2e: `e2e/mobileLayout.spec.ts`)_
- **SHELL-1.14-04** 🧪 **Above 900px viewport, MobileShell does NOT render** — at 1280 × 720 (Playwright default) the mobile shell stays unmounted; the desktop Split toggle is still visible. _(e2e: `e2e/mobileLayout.spec.ts`)_
- **SHELL-1.14-05** ✅ **`useViewport` SSR-safe — initial state is `{ isMobile: false }`** — without a `matchMedia` mock the hook returns the desktop default; mounting on the client doesn't crash. _(unit: `useViewport.test.ts`)_
- **SHELL-1.14-06** ✅ **`useViewport` reads `matchMedia(max-width: 900px)` on mount** — the hook calls `window.matchMedia` exactly once with the canonical query and reflects `.matches`. _(unit: `useViewport.test.ts`)_
- **SHELL-1.14-07** ✅ **`useViewport` listener flips `isMobile` on media-query change** — firing the registered listener with `matches: true` updates state to `true`, then back to `false`. _(unit: `useViewport.test.ts`)_
- **SHELL-1.14-08** ✅ **`useViewport` cleans up listener on unmount** — after `unmount()` the registered listener is removed. _(unit: `useViewport.test.ts`)_
- **SHELL-1.14-09** ✅ **BottomNav renders 3 tabs with stable testids** — `bottom-nav-files`, `bottom-nav-read`, `bottom-nav-graph`. _(unit: `BottomNav.test.tsx`)_
- **SHELL-1.14-10** ✅ **BottomNav active tab has `aria-selected="true"`; others `"false"`** — switching the `active` prop swaps which tab carries the active attribute. _(unit: `BottomNav.test.tsx`)_
- **SHELL-1.14-11** ✅ **BottomNav clicking a tab fires `onChange(id)`** — the tap target reports the canonical tab id back to the host. _(unit: `BottomNav.test.tsx`)_

## 1.15 PWA — Manifest, Service Worker, Offline Cache (Phase 3 PR 3)

> 2026-04-26 — `public/manifest.json` + `public/sw.js` (hand-rolled, not next-pwa — incompatible with Next 16). `ServiceWorkerRegister` mounts inside `KnowledgeBaseInner` and only registers in production. `useOfflineCache` writes the last 10 recents into the `kb-files-v1` Cache Storage bucket on visibilitychange/heartbeat; the SW serves them back on `/__kb-cache/*` fetches.

- **SHELL-1.15-01** ✅ **Manifest serves at `/manifest.json`** — `e2e/manifest_serving.spec.ts` uses Playwright's `request.get('/manifest.json')` against `next dev` and asserts a 200 with the expected JSON shape (`name`, `theme_color`, `icons[].src`). The case's "not Playwright-friendly" framing was wrong: `next dev` already serves `public/*` at the root URL, so no harness change was required. _(e2e: `manifest_serving.spec.ts`.)_
- **SHELL-1.15-02** ✅ **Layout references manifest via `metadata.manifest`** — Vitest classifier check in `src/app/layout.test.ts` asserts `metadata.manifest === "${basePath}/manifest.json"`. The case's "needs production-bundle e2e backend" framing was wrong: the metadata *export itself* can be classifier-checked without rendering, mirroring the already-shipped SHELL-1.15-03 pattern. _(unit: `layout.test.ts`.)_
- **SHELL-1.15-03** ✅ **`themeColor` lives in viewport export (Next 16)** — moved out of `metadata` to satisfy Next 16's metadata classifier; `npm run build` is silent. Vitest in `src/app/layout.test.ts`.
- **SHELL-1.15-04** ❌ **Service worker registered in production** — `ServiceWorkerRegister` calls `navigator.serviceWorker.register("/sw.js")` only when `NODE_ENV === "production"`. Dev mode is a no-op so HMR / Turbopack chunks aren't intercepted. _(MVP-5 follow-up: needs production-bundle e2e backend; SW only registers on `NODE_ENV === "production"`)_
- **SHELL-1.15-05** 🚫 **`useOfflineCache` opens `kb-files-v1` cache** — `useOfflineCache.ts` was deleted in MVP-1d Task 4 (commit `0f5e152`, PR #152) — Tauri ships native file I/O; no PWA cache path needed.
- **SHELL-1.15-06** 🚫 **`useOfflineCache` reads recents at execution time** — same retirement as SHELL-1.15-05; `useOfflineCache.ts` deleted in MVP-1d (commit `0f5e152`, PR #152).

### KB-044 — App-shell cache

- **SHELL-1.15-07** ✅ **`install` precaches the app shell** — `kb-static-v2` ends up containing `/`, `/manifest.json`, and `/icon.svg`; failures for entries that legitimately 404 in dev (e.g. `/index.html`) don't abort the install. (Covered by `serviceWorker.test.ts`.)
- **SHELL-1.15-08** ✅ **Offline navigation falls back to the cached `/` shell** — when `fetch(navigationRequest)` rejects, the SW returns the cached request, then the cached `/`, then a 504. A successful online navigation also refreshes the cached `/` so the next offline boot serves the freshest shell. (Covered by `serviceWorker.test.ts`.)
- **SHELL-1.15-09** ✅ **`/_next/static/*` is cache-first** — content-hashed bundles are stored on first fetch and read from cache on every subsequent request without touching the network. (Covered by `serviceWorker.test.ts`.)
- **SHELL-1.15-10** 🚫 **DevTools "Offline" reload returns the app, not Chrome's offline page** — KB-044 stop condition; verified manually via Chrome DevTools network throttling.

## 1.16 Keyboard-Reachable Tooltip (KB-036)

> 2026-05-02 — replacement for the native `title` attribute on icon buttons. `<Tooltip label="…">` in `shared/components/Tooltip.tsx` wraps a single child trigger, injects `aria-describedby` pointing at a real `[role="tooltip"]` bubble, and shows it via the `.kb-tooltip` rules in `src/app/styles/tooltip.css` on `:hover` and `:has(:focus-visible)` — no OS delay. Reuses the `.kb-table-toolbar button[data-tooltip]` pattern; disabled triggers suppress the bubble. The button keeps `aria-label` so screen-reader users hear the same string as their accessible name.

- **SHELL-1.16-01** ✅ **Tabbing to an icon button surfaces the tooltip with no OS delay** — keyboard-focusing any button wrapped in `<Tooltip>` (e.g. the diagram toolbar zoom controls) displays its `[role="tooltip"]` bubble immediately; the `:has(:focus-visible)` rule fires the same frame focus moves. Playwright in `e2e/visual_hover_focus.spec.ts` (Tab-walks to the header theme toggle and asserts the bubble's `visibility: visible` + non-zero opacity).
- **SHELL-1.16-02** ✅ **Hover surfaces the same bubble** — moving the pointer over the trigger displays the bubble; moving away hides it. Same DOM node, no delay. Playwright in `e2e/visual_hover_focus.spec.ts` (hover the command-palette trigger; baseline visibility flips from hidden to visible).
- **SHELL-1.16-03** ✅ **Tooltip is wired via `aria-describedby`** — the wrapped trigger gets `aria-describedby="<bubble-id>"`, the bubble carries `id="<bubble-id>" role="tooltip"`, and the bubble text matches the `label` prop. _(unit: `Tooltip.test.tsx`)_
- **SHELL-1.16-04** ✅ **Disabled trigger suppresses the bubble** — when the wrapped `<button disabled>` is in the DOM, `:hover` / `:focus-visible` do not show the bubble (CSS `:has(:disabled)` rule). Playwright in `e2e/visual_hover_focus.spec.ts` (opens a doc so the PaneHeader Discard button is mounted-but-disabled; hovers it and asserts the bubble has `display: none`).
- **SHELL-1.16-05** ✅ **Existing `aria-describedby` on the trigger is preserved** — if the child element already has `aria-describedby="x"`, the wrapper concatenates the new id rather than overwriting it (`aria-describedby="x <bubble-id>"`). _(unit: `Tooltip.test.tsx`)_

## 1.17 Uninitialized Vault Splash (MVP-1c)

> Init-guard added in MVP-1c. When `vaultStatus === "uninitialized"` (a folder is picked but has no `.archdesigner/config.json`), `KnowledgeBaseInner` renders `UninitializedVaultSplash` in place of the explorer + panes so the app interior is blocked until the vault is initialized. See [`src/app/knowledge_base/shared/components/UninitializedVaultSplash.tsx`](../src/app/knowledge_base/shared/components/UninitializedVaultSplash.tsx).

- **SHELL-1.17-01** ✅ **Splash renders when `vaultStatus === "uninitialized"`** — `KnowledgeBaseInner` swaps the explorer + panes for `<UninitializedVaultSplash>` whenever the picked folder has no `.archdesigner/config.json`. _(unit: `knowledgeBase.initGuard.test.tsx`)_
- **SHELL-1.17-02** ✅ **Splash is hidden when `vaultStatus === "ready"`** — when the vault config is present and valid, the splash does not render and the normal app interior is visible. _(unit: `knowledgeBase.initGuard.test.tsx`)_
- **SHELL-1.17-03** ✅ **Initialize button calls `vaultConfigRepo.init`** — clicking the splash's **Initialize Vault** button calls `vaultConfigRepo.init(name)` for the open folder. _(unit: `UninitializedVaultSplash.test.tsx`)_
- **SHELL-1.17-04** ✅ **Splash dismisses on successful init** — after a successful `init`, the host re-evaluates `vaultStatus` and the splash unmounts; the explorer + panes mount in its place. _(unit: `knowledgeBase.initGuard.test.tsx`)_
- **SHELL-1.17-05** ✅ **"Open a different folder" re-runs the picker** — clicking the secondary action calls the bridge picker so the user can choose another folder without initializing the current one. _(unit: `UninitializedVaultSplash.test.tsx`)_
- **SHELL-1.17-06** ✅ **No-vault CTA renders Open Vault button that triggers `fileExplorer.openFolder`** — `KnowledgeBaseInner` renders `<NoVaultCTA>` when `vaultStatus === "no-vault"`; clicking its Open Vault button calls `fileExplorer.openFolder`. Replaces the deleted `FirstRunHero` card (retired in MVP-1e). _(unit: `knowledgeBase.noVault.test.tsx`)_

> Splash gains a third "Initialize with full template" action (MVP-3 Task 9) — see SKILLS-13.5-01..02 in [`test-cases/13-skills.md`](13-skills.md).

## 1.18 Tauri Build / CI (MVP-1d)

> macOS Tauri debug build job added in MVP-1d (`.github/workflows/ci.yml` `tauri-build` job). Runs on `macos-latest`; executes `npm run build` (static export) then `cargo build --manifest-path src-tauri/Cargo.toml` to verify the Rust shell compiles against the front-end bundle on every PR.

- **SHELL-1.18-01** ✅ **Tauri debug bundle builds in CI on macOS-latest** — the `tauri-build` job in `.github/workflows/ci.yml` runs on every PR push and was green on 3 consecutive runs preceding PR #158 merge. _(CI: see handoff "Landed (MVP-4.x, PR #158)" CI block.)_
