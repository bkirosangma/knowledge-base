# Test Cases — File System & Vault

> Mirrors §2 of [Features.md](../Features.md). See [README.md](README.md) for ID scheme and coverage markers.

---

## 2.1 Folder Picker

- **FS-2.1-01** ✅ **`showDirectoryPicker` selection flow** — native dialog is bypassed in Playwright by an in-browser `page.addInitScript` that installs a mock `window.showDirectoryPicker` pointing at a seeded in-memory vault. `e2e/goldenPath.spec.ts` drives the full open-folder → explorer-populates sequence. _(Real production uses the native dialog; the mock proves the code path downstream of the picker works.)_
- **FS-2.1-02** ❌ **`<input webkitdirectory>` fallback** — browser-specific UA fallback; requires Chromium or Firefox feature-detection. Playwright territory
- **FS-2.1-03** ✅ **Directory handle persisted to IndexedDB** — covered by PERSIST-7.2-03 in `idbHandles.test.ts` (`saveDirHandle(handle, scopeId)` writes both to the `handles` store in the `knowledge-base` DB).
- **FS-2.1-04** ✅ **Handle restored on reload** — covered by PERSIST-7.2-07 in `idbHandles.test.ts` (save → load round-trip returns the same handle + scope id).
- **FS-2.1-05** ✅ **Scope ID is 8 hex chars** — `idbHandles.test.ts` ("mints a fresh scope id…" asserts `/^[0-9a-f]{8}$/i`).
- **FS-2.1-06** ✅ **Scope isolation** — covered by PERSIST-7.1-03 in `persistence.test.ts` ("scope switch isolates diagrams (no cross-read)").
- **FS-2.1-07** ✅ **`scopedKey` prefixes base key** — covered by PERSIST-7.1-01/02 in `persistence.test.ts` + dedicated tests in `directoryScope.test.ts`.
- **FS-2.1-08** ✅ **Tree scan returns sorted file list** — `fileTree.test.ts` asserts only `.md` / `.json` pass the filter, folders precede files, each group is alphabetical. Also verified end-to-end in `e2e/goldenPath.spec.ts`.
- **FS-2.1-09** ✅ **History sidecars skipped** — `fileTree.test.ts` covers `.<name>.history.json` exclusion and confirms `history.md` / `my-history.json` ARE included (only the hidden `.<name>.history.json` pattern is filtered).
- **FS-2.1-10** ✅ **Nested folders traversed** — `fileTree.test.ts` exercises multi-level paths (`notes/sub/deep.md`), asserts relative path construction, and covers folder `lastModified` = max of children.
- **FS-2.1-11** ✅ **Tree entries carry metadata** — `fileTree.test.ts` asserts every file carries `name` + `path` + `type` + `fileType` + `handle` + `lastModified`; folders carry `dirHandle` + `children`.
- **FS-2.1-12** 🚫 **Revoked handle re-prompts.** Requires real browser permission semantics — Playwright
- **FS-2.1-13** ✅ **Dot-prefixed folders hidden** — `scanTree` skips folders whose name starts with `.` (`.archdesigner`, `.claude`); they do not appear in the tree. _(fileTree.test.ts)_
- **FS-2.1-14** ✅ **`memory` folder hidden** — `scanTree` skips the `memory` folder by name; its contents never appear in the tree. _(fileTree.test.ts)_
- **FS-2.1-15** ✅ **System files hidden** — `CLAUDE.md`, `MEMORY.md`, and `AGENTS.md` are excluded from the tree regardless of location; other `.md` files in the same directory are unaffected. _(fileTree.test.ts)_

## 2.2 Vault Configuration

- **FS-2.2-01** ✅ **`initVault` creates config** — creates `.archdesigner/` (via `getDirectoryHandle(…, {create:true})`) then writes `config.json` pretty-printed (2-space indent) with `version: "1.0"`, the given `name`, and ISO `created`/`lastOpened` timestamps.
- **FS-2.2-02** ✅ **`readVaultConfig` returns parsed config** — after `initVault`, reads the same `VaultConfig` shape back.
- **FS-2.2-03** ✅ **`readVaultConfig` returns null for non-vault** — `.archdesigner/` missing OR present but without `config.json` → returns `null` without throwing.
- **FS-2.2-04** ✅ **`readVaultConfig` returns null on malformed JSON** — `JSON.parse` error is swallowed and `null` returned.
- **FS-2.2-05** ✅ **`updateVaultLastOpened` touches timestamp** — rewrites `config.json` with a fresh ISO `lastOpened`; `version`, `name`, `created` survive unchanged. When config is missing the function resolves silently (no-op).
- **FS-2.2-06** ✅ **`isVaultDirectory` type guard** — returns `true` when `config !== null && config.version != null`; returns `false` for `null`, and for configs missing the `version` field.
- **FS-2.2-07** ✅ **`readVaultConfig` rejects partial shapes (Phase 5b, 2026-04-19)** — `JSON.parse` may succeed on `{ version: '1.0', name: 'v' }` but the shape is incomplete; the I/O-boundary guard returns `null` instead of handing a cast-but-unvalidated object to callers.

## 2.3 File Explorer Panel

### 2.3.a Sidebar chrome
- **FS-2.3-01** 🟡 **Collapsed width** — `collapsed=true` hides the content area; the narrow strip still holds the collapse toggle. Exact `36 px` width is a styling detail only observable in a real browser (Playwright-level).
- **FS-2.3-02** 🟡 **Expanded width** — `collapsed=false` renders the full sidebar (directory header, filter pills, tree). Exact width is styling; Playwright-level.
- **FS-2.3-03** 🚫 **Collapse state persisted** — persistence is the caller's job (via `KnowledgeBase` + localStorage). Feature gap: not yet persisted to localStorage.

### 2.3.b Tree rendering
- **FS-2.3-04** ✅ **Chevron rotates on expand** — clicking a folder flips it between `<ChevronRight>` (collapsed) and `<ChevronDown>` (expanded); children are rendered only while expanded.
- **FS-2.3-05** ✅ **Folder collapse hides children** — second click removes the expanded child rows.
- **FS-2.3-06** ✅ **File icon by type** — `.json` row shows a `text-blue-500` SVG (FileJson); `.md` row shows a `text-emerald-500` SVG (FileText).
- **FS-2.3-07** ✅ **Current-file highlight** — `leftPaneFile === path` adds `bg-blue-50 text-blue-600`; `rightPaneFile === path` adds `bg-green-50 text-green-600`; both set → `bg-gradient-to-r from-blue-50 to-green-50`.
- **FS-2.3-08** ✅ **Dirty marker on unsaved files** — files in `dirtyFiles` set render with `font-semibold`.

### 2.3.c Sorting
- **FS-2.3-09** ✅ **Sort by name asc** — with `folders-first` grouping, folders sort first then files; both `localeCompare` ascending.
- **FS-2.3-10** ✅ **Sort by name desc** — reverses both folders and files within each group.
- **FS-2.3-11** ✅ **Sort by modified desc** — uses `lastModified` timestamp (newest first).
- **FS-2.3-12** 🟡 **Sort by created** — same timestamp as "modified" (File API doesn't expose `createdTime`). Behaviour-locked: "created" reuses `lastModified` by design.
- **FS-2.3-13** ✅ **Grouping: folders-first** — folders cluster above files.
- **FS-2.3-14** ✅ **Grouping: files-first** — files cluster above folders.
- **FS-2.3-15** ✅ **Grouping: mixed** — files and folders interleaved by the sort field only.
- **FS-2.3-16** 🚫 **Sort prefs persisted** — persistence is the caller's job (KnowledgeBase → localStorage). Feature gap: not yet persisted to localStorage.

### 2.3.d Filtering
- **FS-2.3-17** ✅ **Filter "all"** — both `.md` and `.json` visible.
- **FS-2.3-18** ✅ **Filter "diagrams"** — only `.json` visible; folders that contain no `.json` descendants are omitted.
- **FS-2.3-19** ✅ **Filter "documents"** — only `.md` visible; same folder-collapse rule.
- **FS-2.3-20** 🚫 **Filter persists per scope** — persistence is the caller's job

### 2.3.e Create / Rename / Delete / Duplicate / Move
- **FS-2.3-21** ✅ **Create diagram via header button** — the `New Diagram` button on the directory header calls `onCreateFile('')`. _(ExplorerPanel.test.tsx)_
- **FS-2.3-22** ✅ **Create file default name** — `createFile("")` produces `untitled.json` at root; `createFile("sub")` produces `sub/untitled.json`. _(useFileExplorer.operations.test.tsx)_
- **FS-2.3-23** ✅ **Create file unique-name fallback** — when `untitled.json` already exists, `createFile` generates `untitled-1.json`. _(useFileExplorer.operations.test.tsx)_
- **FS-2.3-24** ✅ **Create folder** — `New Folder` button on the directory header calls `onCreateFolder('')`.
- **FS-2.3-25** ✅ **Rename file creates new file** — `renameFile("old.json","new.json")` writes content to `new.json`. _(useFileExplorer.operations.test.tsx)_
- **FS-2.3-26** ✅ **Rename file removes original** — `old.json` is deleted after rename. _(useFileExplorer.operations.test.tsx)_
- **FS-2.3-27** ✅ **Rename file returns new path** — resolves to the new full path. _(useFileExplorer.operations.test.tsx)_
- **FS-2.3-28** ✅ **Rename file no-op on identical name** — returns old path, no FS changes. _(useFileExplorer.operations.test.tsx)_
- **FS-2.3-29** ✅ **Rename file renames sidecar** — `.old.history.json` is renamed to `.renamed.history.json`. _(useFileExplorer.operations.test.tsx)_
- **FS-2.3-30** ✅ **Delete file returns false when no handle** — guard before any FS access. _(useFileExplorer.operations.test.tsx)_
- **FS-2.3-31** ✅ **Delete file removes from FS** — `deleteFile("bye.json")` removes the entry and returns `true`. _(useFileExplorer.operations.test.tsx)_
- **FS-2.3-32** ✅ **Delete file clears activeFile when active** — `activeFile` becomes `null` if the deleted path was active. _(useFileExplorer.operations.test.tsx)_
- **FS-2.3-33** ✅ **Delete file leaves other activeFile intact** — deleting a non-active file does not change `activeFile`. _(useFileExplorer.operations.test.tsx)_
- **FS-2.3-34** ✅ **Delete file resolves nested paths** — `deleteFile("sub/nested.json")` removes from subdirectory. _(useFileExplorer.operations.test.tsx)_
- **FS-2.3-35** ✅ **Duplicate file** — `duplicateFile("arch.json")` creates `arch-copy.json` with same content; returns null when no handle. _(useFileExplorer.operations.test.tsx)_
- **FS-2.3-36** ✅ **Move file to target folder** — file appears at new path, is gone from old path. _(useFileExplorer.operations.test.tsx)_
- **FS-2.3-37** ✅ **Move file returns null for self-move** — `moveItem(path, path)` returns null without FS changes. _(useFileExplorer.operations.test.tsx)_
- **FS-2.3-38** ✅ **Refresh button** — click on the spinner icon calls `onRefresh`; `isLoading` triggers the `animate-spin` class.

### 2.3.f Drag-and-drop feedback
- **FS-2.3-39** 🟡 **`dragOverPath` highlights target** — implementation uses a local state `dragOverPath` driven by `onDragEnter/Leave/Over`. jsdom's DataTransfer mocking is brittle; deferred to Playwright.

### 2.3.g Context menu
- **FS-2.3-40/41** 🟡 **Right-click menus** — implementation wires `onContextMenu` to `setContextMenu`; menu rendering is visible in the DOM but fine-grained action assertions (Rename, Delete, Duplicate, Move entries) are left for Playwright due to coordinate/viewport positioning concerns.
- **FS-2.3-42** 🟡 **Escape closes menu** — same wiring as ConfirmPopover; deferred with 40/41.
- **FS-2.3-43** 🟡 **Click outside closes menu** — same.
- **FS-2.3-44** ✅ **New Document button calls `onCreateDocument`** — `New Document` header button calls `onCreateDocument('')`; when a folder is selected it calls with the folder path. _(ExplorerPanel.test.tsx)_
- **FS-2.3-45** ❌ **Folder context menu "New ▸" submenu** — hover-triggered submenu with Diagram / Document / Folder entries; requires real mouse hover positioning — Playwright
- **FS-2.3-46** ✅ **Clicking a folder selects it** — folder row gets `bg-blue-50 text-blue-700` highlight after click; second click on same folder deselects it. _(ExplorerPanel.test.tsx)_
- **FS-2.3-47** ✅ **Header create buttons use selected folder as parent** — when `selectedFolderPath` is set, New Diagram / Document / Folder buttons pass that path instead of `''`. _(ExplorerPanel.test.tsx)_
- **FS-2.3-48** ✅ **Header breadcrumb when folder selected** — header shows `vault / folderName` text when a folder is selected; reverts to just vault name when deselected. _(ExplorerPanel.test.tsx)_
- **FS-2.3-49** ❌ **Right-click empty tree area opens root context menu** — requires real mouse coordinates and contextmenu event on non-node targets; Playwright
- **FS-2.3-50** 🚫 **Native context menu suppressed** — `preventDefault` on contextmenu across the whole tree; browser-level behavior, not testable in jsdom.

## 2.4 Confirmation Popover

- **FS-2.4-01** ✅ **Mouse-anchored positioning** — `position: {x, y}` prop is applied as `left`/`top` inline styles on the root.
- **FS-2.4-02** 🟡 **Clamps into viewport** — clamp logic runs on mount via `getBoundingClientRect` and clamps within `[8, innerWidth/height − 8 − rect]`. In jsdom `getBoundingClientRect` returns zeroes, so the clamp is exercised but cannot be directly asserted without layout. Integration test deferred.
- **FS-2.4-03** ✅ **Escape dismisses** — `window` keydown listener (capture phase) calls `onCancel` on `Escape`; other keys do not.
- **FS-2.4-04** ✅ **Outside click dismisses** — `mousedown` on targets outside the popover calls `onCancel`; clicks inside are ignored.
- **FS-2.4-05** ✅ **Confirm runs callback** — Confirm button click invokes `onConfirm` exactly once.
- **FS-2.4-06** ✅ **Cancel runs callback** — Cancel button click invokes `onCancel` exactly once.
- **FS-2.4-07** ✅ **Red variant for destructive** — `confirmColor="red"` (default) applies `bg-red-600 hover:bg-red-700` to the Confirm button.
- **FS-2.4-08** ✅ **Blue variant for neutral** — `confirmColor="blue"` applies `bg-blue-600 hover:bg-blue-700`.
- **FS-2.4-09** 🟡 **"Don't ask me again" checkbox persists** — the checkbox renders when `showDontAsk=true` and reports via `onDontAskChange(bool)`; the caller is responsible for writing the `knowledge-base-skip-*-confirm` key to localStorage. Verified: checkbox toggles & callback fires. Persistence-side assertion is part of the file-ops integration (see `useFileActions` discard-skip test).
- **FS-2.4-10** ✅ **Message prop renders** — `message` prop is rendered verbatim as the popover body.

## 2.5 Document Picker

- **FS-2.5-01** ✅ **Opens as modal** — root is `fixed inset-0 z-50` with `bg-black/30` backdrop and the card inside; clicking the backdrop calls `onClose`, clicking the card does not (stopPropagation).
- **FS-2.5-02** ✅ **Lists vault documents** — every path in `allDocPaths` that is not in `attachedPaths` is rendered as a clickable row.
- **FS-2.5-03** ✅ **Already-attached docs excluded** — `attachedPaths` membership hides the entry from the list.
- **FS-2.5-04** ✅ **Search filters list** — case-insensitive substring filter on the path (e.g. "app" matches both `apple.md` and `Application.md`); empty search restores the full list.
- **FS-2.5-05** ✅ **Selecting a doc attaches** — clicking a row calls `onAttach(path)` then `onClose` in that order.
- **FS-2.5-06** ✅ **Create-new button prompts** — toggles to an input field with autofocus; Enter or clicking `Create` invokes `onCreate(path)` + `onClose`.
- **FS-2.5-07** ✅ **Create-new normalises extension** — path without `.md` auto-appends `.md` before calling `onCreate`; path already ending in `.md` passes through unchanged.
- **FS-2.5-08** ✅ **Cancel closes without attach** — backdrop click, X button, and the close button all call `onClose`. Escape in the create input reverts to the toggle (does NOT call `onClose` or `onCreate`). Empty/whitespace create names are rejected (no `onCreate`/`onClose`).

## 2.6 Boundary Error Surface (Phase 5c)

Typed error layer at the repository boundary introduced in Phase 5c (2026-04-19). Every repo read + write throws a classified `FileSystemError`; consumers use the `readOrNull` helper or try/catch + `reportError`. See [`src/app/knowledge_base/domain/errors.ts`](../src/app/knowledge_base/domain/errors.ts) + [`repositoryHelpers.ts`](../src/app/knowledge_base/domain/repositoryHelpers.ts).

- **FS-2.6-01** ✅ **`FileSystemError` carries `kind` + `message` + optional `cause`** — subclass of `Error`, idiomatic `instanceof` works.
- **FS-2.6-02** ✅ **`classifyError` maps `NotFoundError` → `not-found`** — and preserves the original throw as `cause`.
- **FS-2.6-03** ✅ **`classifyError` maps `NotAllowedError` / `SecurityError` → `permission`**.
- **FS-2.6-04** ✅ **`classifyError` maps `QuotaExceededError` → `quota-exceeded`**.
- **FS-2.6-05** ✅ **`classifyError` falls through to `unknown`** — non-DOMException errors and non-Error throws wrap with kind `unknown`.
- **FS-2.6-06** ✅ **`readOrNull` returns null on `not-found`** — only; value on success, re-throw otherwise.
- **FS-2.6-07** ✅ **`readOrNull` classifies + re-throws other kinds** — raw DOMException-like throws classified first so callers always receive a `FileSystemError`, never a raw DOMException.

## 2.7 Explorer Search (UX Phase 1)

Search input at the top of the ExplorerPanel for live file filtering. `data-testid="explorer-search"` on the input. ⌘F global shortcut focuses it.

- **EXPL-2.7-01** 🧪 **Typing in search filters the file list** — entering a query shows only files whose path (case-insensitive) includes the query; non-matching files disappear. Nested paths (e.g. `notes/deep.md`) are discoverable by partial name. _(e2e: `e2e/explorerSearch.spec.ts`)_
- **EXPL-2.7-02** 🧪 **Clearing the search restores the full tree** — clicking the ✕ clear button empties the query and the normal folder tree reappears. _(e2e: `e2e/explorerSearch.spec.ts`)_
- **EXPL-2.7-03** ❌ **⌘F focuses the explorer search input** — when focus is not already in an input/textarea/contenteditable, ⌘F prevents default browser find and focuses `[data-testid="explorer-search"]`. _(Playwright)_
- **EXPL-2.7-04** ❌ **⌘F does not steal from active inputs** — when focus is inside an editor or input, ⌘F is a no-op (browser find bar may open normally). _(Playwright)_
- **EXPL-2.7-05** ❌ **"Go to file…" command in palette** — the command palette (⌘K) lists a "Go to file…" entry in the Navigation group with shortcut ⌘F; running it focuses the explorer search. _(Playwright)_

## 2.8 Explorer Recents (UX Phase 1)

Collapsible "Recents" group above the file tree showing the last 10 opened files. Persisted to localStorage under `kb-recents`.

- **EXPL-2.8-01** 🧪 **Opening a file adds it to Recents** — clicking a file in the explorer causes it to appear in the Recents group. _(e2e: `e2e/explorerSearch.spec.ts`)_
- **EXPL-2.8-02** 🧪 **Recents shows most recent first** — after opening alpha then beta, beta appears above alpha in the Recents list. _(e2e: `e2e/explorerSearch.spec.ts`)_
- **EXPL-2.8-03** ❌ **Recents deduplicates by path** — opening the same file twice results in only one entry in Recents. _(Playwright)_
- **EXPL-2.8-04** ❌ **Recents capped at 10 entries** — after opening 11 distinct files, the 11th-oldest is dropped from the list. _(Playwright)_
- **EXPL-2.8-05** ❌ **Recents persists across page reload** — localStorage `kb-recents` is read on mount; entries survive a hard refresh. _(Playwright)_
- **EXPL-2.8-06** ❌ **Recents group hidden when empty** — on first load with no localStorage entry, the Recents header does not render. _(Playwright)_
- **EXPL-2.8-07** ❌ **Recents collapse toggle hides entries** — clicking the Recents header arrow collapses the list; clicking again expands it. _(Playwright)_

## 2.9 Explorer Unsaved Group (UX Phase 1)

"Unsaved changes" group showing files with in-memory drafts (dirty state). Always visible when non-empty; no collapse.

- **EXPL-2.9-01** 🧪 **Unsaved group shows dirty files** — after making an edit in a diagram, the file appears in the "Unsaved changes" group. _(e2e: `e2e/explorerSearch.spec.ts`)_
- **EXPL-2.9-02** ❌ **Unsaved group hidden when clean** — when no files are dirty, the "Unsaved changes" header does not render. _(Playwright)_
- **EXPL-2.9-03** ❌ **Clicking an Unsaved entry opens the file** — clicking a path in the Unsaved group routes to that file in the editor. _(Playwright)_
