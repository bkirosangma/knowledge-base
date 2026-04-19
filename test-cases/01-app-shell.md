# Test Cases — App Shell & Layout

> Mirrors §1 of [Features.md](../Features.md). See [README.md](README.md) for ID scheme and coverage markers.

---

## 1.1 Root Layout

- **SHELL-1.1-01** 🧪 **App mounts without errors** — navigate to `/` → `[data-testid="knowledge-base"]` visible; zero `pageerror`; zero console-level errors (resource-load failures excluded). _(e2e: `e2e/app.spec.ts`)_
- **SHELL-1.1-02** 🧪 **Geist fonts applied** — `<html>` has `--font-geist-sans` and `--font-geist-mono` CSS vars set. _(e2e: `e2e/app.spec.ts`)_
- **SHELL-1.1-03** 🧪 **Full-height flex container** — root wrapper computes `display: flex`, `flex-direction: column`, and height equals viewport. _(e2e: `e2e/app.spec.ts`)_
- **SHELL-1.1-04** 🟡 **Tiptap CSS present** — `globals.css` selectors for `.ProseMirror h1`, `ul`, `ol`, `blockquote`, `code`, `table`, `[data-task-item]`, `[data-wiki-link]`. (Implicitly verified in-browser when any editor mounts; dedicated stylesheet-selector assertion not yet written.)

## 1.2 Header

- **SHELL-1.2-01** 🚫 **Back button navigates home** — Next.js `<Link href="/">` renders; navigation is app-router state. Covered by Playwright in Bucket 20.
- **SHELL-1.2-02** ✅ **Title renders as read-only when clean** — input displays the current title and is not auto-focused.
- **SHELL-1.2-03** 🟡 **Click title to edit** — input is always present; clicking focuses via native click→focus. Caret visibility is a UA concern; verified at the Playwright level.
- **SHELL-1.2-04** ✅ **Enter commits title** — Enter calls `e.currentTarget.blur()` → `onBlur` commits trimmed changed value via `onTitleCommit`.
- **SHELL-1.2-05** ✅ **Escape cancels title edit** — Escape reverts the input value to the pre-focus title (captured in `titleBeforeEdit` ref on focus) and blurs; `onTitleCommit` is not called.
- **SHELL-1.2-06** ✅ **Blur commits title** — blur with a trimmed, changed value calls `onTitleCommit`; blur with empty/whitespace value reverts without committing; blur with unchanged value is a no-op.
- **SHELL-1.2-07** ✅ **80-char cap** — input has `maxLength={80}` attribute.
- **SHELL-1.2-08** 🟡 **Title input auto-widens** — implemented via `titleMeasureRef.scrollWidth` effect; in jsdom `scrollWidth` is always 0, so the computed width isn't observable. Behaviour verified via Playwright in Bucket 20.
- **SHELL-1.2-09** ✅ **Dirty indicator visible** — `isDirty` renders a span with `title="Unsaved changes"`.
- **SHELL-1.2-10** ✅ **Dirty indicator hidden when clean** — `isDirty=false` → the marker is not rendered.
- **SHELL-1.2-11** ✅ **Save button disabled when clean** — `disabled={!hasActiveFile || !isDirty}` on the Save button.
- **SHELL-1.2-12** ✅ **Save button enabled when dirty AND has active file** — conversely, both flags must be true to enable.
- **SHELL-1.2-13** ✅ **Discard button disabled when clean** — same disabled expression as Save.
- **SHELL-1.2-14** 🟡 **Discard opens confirm popover** — Header fires `onDiscard`; the popover is constructed inside `useFileActions` (covered in Bucket 10 / integration).
- **SHELL-1.2-15** 🟡 **Discard confirmed rolls back** — covered in Bucket 10 (`useFileActions.executeDiscard`).
- **SHELL-1.2-16** 🟡 **Discard cancel leaves state** — covered in Bucket 10.
- **SHELL-1.2-17** 🟡 **"Don't ask again" persists** — the checkbox reports via `onDontAskChange` (Bucket 11); the caller writes the flag (`useFileActions.handleDiscard` short-circuit tested in Bucket 10).
- **SHELL-1.2-18** ✅ **Split toggle enters split view** — click on the split button (when `onToggleSplit` is provided) fires the callback; button appears with `title="Split view"` when `isSplit=false`.
- **SHELL-1.2-19** ✅ **Split toggle exits split view** — `isSplit=true` swaps the `title` to `"Exit split view"`; same callback toggles the flag externally.
- **SHELL-1.2-20** 🚫 **`Cmd/Ctrl+S` triggers save** — keyboard shortcut lives in `useKeyboardShortcuts` (Bucket 18 shell integration).
- **SHELL-1.2-21** 🚫 **`Cmd/Ctrl+S` noop when clean** — same; Bucket 18.
- **SHELL-1.2-22** ✅ **Switching files from dirty diagram autosaves previous file** — `handleLoadFile` in `shared/hooks/useFileActions.ts` now flushes the outgoing file's dirty state via `fileExplorer.saveFile` before selecting the new one (skipped when no active file, not dirty, or re-selecting the same file). — e2e/diagramGoldenPath.spec.ts

## 1.3 Footer

- **SHELL-1.3-01** ✅ **Single-view filename** — `isSplit=false` → filename from `focusedEntry.filePath.split("/").pop()` with no `[Left]`/`[Right]` prefix.
- **SHELL-1.3-02** ✅ **Split-view side labels** — `isSplit=true` → prefix `[Left]` or `[Right]` based on `ToolbarContext.focusedPane`.
- **SHELL-1.3-03** ✅ **Diagram stats shown** — when the focused side has `DiagramFooterInfo` in `FooterContext`, footer renders `W×H px`, `N patch(es)`, `Z%` (rounded). "1 patch" singularises correctly.
- **SHELL-1.3-04** ✅ **Document pane omits diagram stats** — no `FooterInfo` in context → stats markup is not rendered.
- **SHELL-1.3-05** 🟡 **Zoom updates live** — the live update path goes through `setLeftInfo`/`setRightInfo` calls from the diagram's zoom hook; round-trip verified in [FooterContext.test.tsx](../src/app/knowledge_base/shell/FooterContext.test.tsx). End-to-end live update test deferred to Bucket 20.
- **SHELL-1.3-06** 🟡 **Patch count updates on content growth** — same path; live assertion deferred to Playwright.
- **SHELL-1.3-07** ✅ **Reset App clears state** — click clears `localStorage` and calls `window.location.reload()`; verified with `window.location` swap stub.
- **SHELL-1.3-08** 🚫 **Reset App confirmation** — current implementation wipes silently. Product decision needed; no confirmation is in place.

Also covered in [ToolbarContext.test.tsx](../src/app/knowledge_base/shell/ToolbarContext.test.tsx): pane-count (1 vs 2), focus propagation, mixed-type active-pane derivation, pane-type fallback to `"diagram"` when left is null.

## 1.4 Pane Manager & Split Pane

- **SHELL-1.4-01** ✅ **Defaults to single pane** — fresh load with no saved layout → only left pane renders.
- **SHELL-1.4-02** ✅ **Enter split clones focus** — from single view, Enter Split → right pane exists but empty; left keeps its file.
- **SHELL-1.4-03** ✅ **Exit split closes unfocused pane** — focus left, Exit Split → right pane closes; left retains file.
- **SHELL-1.4-04** ✅ **Exit split from right focus closes left** — focus right, Exit Split → left closes; right pane becomes the single pane.
- **SHELL-1.4-05** ✅ **`lastClosedPane` restores** — after Exit Split, re-enter split → closed pane's prior file reopens on that side. (Hook captures `lastClosedPane`; restoration wiring lives in `KnowledgeBaseInner`.)
- **SHELL-1.4-06** ✅ **Open file routes to focused pane** — split view, focus right, open file from explorer → file opens in right pane.
- **SHELL-1.4-07** 🟡 **Pane type drives Header controls** — focus diagram pane → Header shows diagram-specific actions; focus doc pane → doc-specific actions. (Covered indirectly via `ToolbarContext.activePaneType` derivation + PaneManager sync tests.)
- **SHELL-1.4-08** ✅ **Focus indicator rendered** — mouse-down in a pane adds 2 px blue border; previously focused pane loses border.
- **SHELL-1.4-09** ✅ **Focus persists across clicks within pane** — mouse-down in left/right pane fires `setFocusedSide`.
- **SHELL-1.4-10** ✅ **Divider drag resizes panes** — drag divider left → left pane narrows, right widens; released ratio sticks.
- **SHELL-1.4-11** ✅ **Divider clamped to 20%–80%** — drag beyond limits → movement clamped; panes never below 20 %.
- **SHELL-1.4-12** ✅ **Divider hover highlight** — `hover:bg-blue-400` class present on divider.
- **SHELL-1.4-13** ✅ **Split ratio persisted** — mouseUp writes ratio to localStorage under `storageKey`.
- **SHELL-1.4-14** 🚫 **Layout restored on directory load** — re-open known folder → previous pane layout is restored. Owned by `KnowledgeBaseInner` + File System Access directory picker; covered by Playwright in Bucket 20.

## 1.5 Contexts (Toolbar / Footer)

- **SHELL-1.5-01** ✅ **`activePaneType` = "diagram"** — single pane shows a diagram → context reports `"diagram"`. (Covered by `ToolbarContext.test.tsx`.)
- **SHELL-1.5-02** ✅ **`activePaneType` = "document"** — single doc pane → `"document"`. (Covered by `ToolbarContext.test.tsx`.)
- **SHELL-1.5-03** ✅ **`activePaneType` = "mixed"** — split view, diagram + doc → derives from focused pane's type. (Covered by `ToolbarContext.test.tsx`.)
- **SHELL-1.5-04** ✅ **`paneCount` reflects view** — single → 1; split → 2. (Covered by `ToolbarContext.test.tsx`.)
- **SHELL-1.5-05** ✅ **`focusedPane` updates on mouse-down** — focus changes to the side that was just clicked.
- **SHELL-1.5-06** ✅ **PaneManager publishes per-side types into ToolbarContext** — left & right types stay independent. (FooterContext per-side coverage lives in `FooterContext.test.tsx`, Bucket 12.)
- **SHELL-1.5-07** ✅ **Footer/toolbar updates when focus switches** — mouse-down on a pane flips `focusedPane` and `activePaneType` in `ToolbarContext`.

## 1.6 Pane Content Chrome

- **SHELL-1.6-01** ✅ **Breadcrumb path** — `filePath` is split on `/` and every segment is rendered; only the last segment gets the `text-slate-700 font-medium` emphasis. Single-segment paths render without chevrons.
- **SHELL-1.6-02** ✅ **Read-Mode toggle icon state** — `readOnly=true` renders `<Lock>`; `readOnly=false` renders `<LockOpen>`. The button's `aria-pressed` mirrors the flag and the accessible name swaps between `"Enter Read Mode"` / `"Exit Read Mode"`.
- **SHELL-1.6-03** 🟡 **Read-Mode toggle disables editing** — click calls `onToggleReadOnly`; the `contenteditable=false` wiring lives inside the Tiptap editor (covered in Bucket 16).
- **SHELL-1.6-04** ✅ **Right-side action slot renders** — `children` prop is rendered after the Read Mode toggle.
- **SHELL-1.6-05** ✅ **PaneTitle edit commits on Enter** — Enter blurs the input, which fires `onTitleChange` with the trimmed value if it differs from the original. Blur with whitespace-only or unchanged text does NOT commit.
- **SHELL-1.6-06** ✅ **PaneTitle edit cancels on Escape** — Escape resets the draft to the current `title` prop and exits edit mode; `onTitleChange` is not called.
- **SHELL-1.6-07** 🚫 **Empty state** — "No file open" placeholder sits in `PaneManager`, not `PaneHeader`/`PaneTitle`; covered in Bucket 18 (shell integration).

## 1.7 Error Surface (Phase 5c)

Shell-level typed-error surface introduced in Phase 5c (2026-04-19). `ShellErrorProvider` holds a single-slot current error; consumers publish via `useShellErrors().reportError(e, context)`; `ShellErrorBanner` renders it; `ShellErrorBoundary` catches uncaught render throws. See [`src/app/knowledge_base/shell/ShellErrorContext.tsx`](../src/app/knowledge_base/shell/ShellErrorContext.tsx) + [`ShellErrorBanner.tsx`](../src/app/knowledge_base/shell/ShellErrorBanner.tsx) + [`ShellErrorBoundary.tsx`](../src/app/knowledge_base/shell/ShellErrorBoundary.tsx).

- **SHELL-1.7-01** ✅ **Provider starts empty** — `useShellErrors().current` is `null` on mount.
- **SHELL-1.7-02** ✅ **`reportError` classifies + publishes** — accepts a raw Error (classifies via `classifyError`) or a pre-built `FileSystemError` (passes through); `current` reflects `{ kind, message, context, at }`.
- **SHELL-1.7-03** ✅ **Single-slot replacement** — a second `reportError` replaces the first (no queue).
- **SHELL-1.7-04** ✅ **Dismiss clears** — `dismiss()` sets `current` back to `null`.
- **SHELL-1.7-05** 🟡 **Banner renders current error** — `ShellErrorBanner` reads `current` and shows `kindLabel(kind)` + `context` + `message` + Dismiss button. Visual-only; the state round-trip is covered by SHELL-1.7-02..04.
- **SHELL-1.7-06** 🟡 **Boundary catches render throws** — `ShellErrorBoundary` React class renders a fallback on uncaught render errors, logs via `classifyError`. No assertion coverage — component is never exercised in the current test suite because no rendered component throws synchronously during normal operation.
- **SHELL-1.7-07** ✅ **`useShellErrors` without provider throws** — guard asserted in `ShellErrorContext.test.tsx`.
