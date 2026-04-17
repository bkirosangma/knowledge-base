# Test Cases — File System & Vault

> Mirrors §2 of [Features.md](../Features.md). See [README.md](README.md) for ID scheme and coverage markers.

---

## 2.1 Folder Picker

- **FS-2.1-01** 🧪 **`showDirectoryPicker` selection flow** — native dialog is bypassed in Playwright by an in-browser `page.addInitScript` that installs a mock `window.showDirectoryPicker` pointing at a seeded in-memory vault. `e2e/goldenPath.spec.ts` drives the full open-folder → explorer-populates sequence. _(Real production uses the native dialog; the mock proves the code path downstream of the picker works.)_
- **FS-2.1-02** 🚫 **`<input webkitdirectory>` fallback** — browser-specific UA fallback; requires Chromium or Firefox feature-detection. Playwright territory (Bucket 25).
- **FS-2.1-03** ✅ **Directory handle persisted to IndexedDB** — covered by PERSIST-7.2-03 in `idbHandles.test.ts` (`saveDirHandle(handle, scopeId)` writes both to the `handles` store in the `knowledge-base` DB).
- **FS-2.1-04** ✅ **Handle restored on reload** — covered by PERSIST-7.2-07 in `idbHandles.test.ts` (save → load round-trip returns the same handle + scope id).
- **FS-2.1-05** ✅ **Scope ID is 8 hex chars** — `idbHandles.test.ts` ("mints a fresh scope id…" asserts `/^[0-9a-f]{8}$/i`).
- **FS-2.1-06** ✅ **Scope isolation** — covered by PERSIST-7.1-03 in `persistence.test.ts` ("scope switch isolates diagrams (no cross-read)").
- **FS-2.1-07** ✅ **`scopedKey` prefixes base key** — covered by PERSIST-7.1-01/02 in `persistence.test.ts` + dedicated tests in `directoryScope.test.ts`.
- **FS-2.1-08** 🧪 **Tree scan returns sorted file list** — `e2e/goldenPath.spec.ts` seeds `alpha.md` / `beta.md` / `flow.json` and asserts all three appear in the explorer.
- **FS-2.1-09** 🟡 **History sidecars skipped.** The `.*.history.json` filter lives inside the module-private tree-builder; user-visible effect verified incidentally in e2e (no sidecar shows up even with history entries).
- **FS-2.1-10** 🟡 **Nested folders traversed.** Recursive walk runs in the private tree-builder; e2e exercises nested files via the fsMock seed format but folders render collapsed by default.
- **FS-2.1-11** 🧪 **Tree entries carry metadata** — e2e folder-open test confirms each entry has a display name and is clickable (routing to the right pane requires `handle` + `fileType` metadata to be set).
- **FS-2.1-12** 🚫 **Revoked handle re-prompts.** Requires real browser permission semantics — Playwright (Bucket 25).

## 2.2 Vault Configuration

- **FS-2.2-01** ✅ **`initVault` creates config** — creates `.archdesigner/` (via `getDirectoryHandle(…, {create:true})`) then writes `config.json` pretty-printed (2-space indent) with `version: "1.0"`, the given `name`, and ISO `created`/`lastOpened` timestamps.
- **FS-2.2-02** ✅ **`readVaultConfig` returns parsed config** — after `initVault`, reads the same `VaultConfig` shape back.
- **FS-2.2-03** ✅ **`readVaultConfig` returns null for non-vault** — `.archdesigner/` missing OR present but without `config.json` → returns `null` without throwing.
- **FS-2.2-04** ✅ **`readVaultConfig` returns null on malformed JSON** — `JSON.parse` error is swallowed and `null` returned.
- **FS-2.2-05** ✅ **`updateVaultLastOpened` touches timestamp** — rewrites `config.json` with a fresh ISO `lastOpened`; `version`, `name`, `created` survive unchanged. When config is missing the function resolves silently (no-op).
- **FS-2.2-06** ✅ **`isVaultDirectory` type guard** — returns `true` when `config !== null && config.version != null`; returns `false` for `null`, and for configs missing the `version` field.

## 2.3 File Explorer Panel

### 2.3.a Sidebar chrome
- **FS-2.3-01** 🟡 **Collapsed width** — `collapsed=true` hides the content area; the narrow strip still holds the collapse toggle. Exact `36 px` width is a styling detail only observable in a real browser (Playwright → Bucket 20).
- **FS-2.3-02** 🟡 **Expanded width** — `collapsed=false` renders the full sidebar (directory header, filter pills, tree). Exact width is styling; Playwright-level.
- **FS-2.3-03** 🚫 **Collapse state persisted** — persistence is the caller's job (via `KnowledgeBase` + localStorage). Covered in Bucket 18.

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
- **FS-2.3-16** 🚫 **Sort prefs persisted** — persistence is the caller's job (KnowledgeBase → localStorage). Covered in Bucket 18.

### 2.3.d Filtering
- **FS-2.3-17** ✅ **Filter "all"** — both `.md` and `.json` visible.
- **FS-2.3-18** ✅ **Filter "diagrams"** — only `.json` visible; folders that contain no `.json` descendants are omitted.
- **FS-2.3-19** ✅ **Filter "documents"** — only `.md` visible; same folder-collapse rule.
- **FS-2.3-20** 🚫 **Filter persists per scope** — persistence is the caller's job; covered in Bucket 18.

### 2.3.e Create / Rename / Delete / Duplicate / Move
- **FS-2.3-21** 🟡 **Create file via context menu** — verified: the `New Architecture` button on the directory header calls `onCreateFile('')`. Context-menu entry routes to the same callback.
- **FS-2.3-22** 🚫 **Create file default name** — name generation (`untitled.json`, `uniqueName` helper) lives inside `useFileExplorer`; not observable from the panel component.
- **FS-2.3-23** 🚫 **Create file unique-name fallback** — `uniqueName` helper in `useFileExplorer`; deferred to Bucket 19/20.
- **FS-2.3-24** ✅ **Create folder** — `New Folder` button on the directory header calls `onCreateFolder('')`.
- **FS-2.3-25..29** 🚫 **Rename file + wiki-link + link-index side effects** — orchestrated by `useFileExplorer.renameFile`; deferred to Bucket 19.
- **FS-2.3-30..34** 🚫 **Delete file confirmation + cascades** — popover + link-index cleanup handled outside this component; covered in Bucket 10 (`useFileActions.executeDeleteFile`) and Bucket 19.
- **FS-2.3-35** 🚫 **Duplicate file** — `useFileExplorer.duplicateFile`; deferred to Bucket 19.
- **FS-2.3-36/37** 🚫 **Move file / history sidecar** — `useFileExplorer.moveItem`; deferred to Bucket 19.
- **FS-2.3-38** ✅ **Refresh button** — click on the spinner icon calls `onRefresh`; `isLoading` triggers the `animate-spin` class.

### 2.3.f Drag-and-drop feedback
- **FS-2.3-39** 🟡 **`dragOverPath` highlights target** — implementation uses a local state `dragOverPath` driven by `onDragEnter/Leave/Over`. jsdom's DataTransfer mocking is brittle; deferred to Playwright.

### 2.3.g Context menu
- **FS-2.3-40/41** 🟡 **Right-click menus** — implementation wires `onContextMenu` to `setContextMenu`; menu rendering is visible in the DOM but fine-grained action assertions (Rename, Delete, Duplicate, Move entries) are left for Playwright due to coordinate/viewport positioning concerns.
- **FS-2.3-42** 🟡 **Escape closes menu** — same wiring as ConfirmPopover; deferred with 40/41.
- **FS-2.3-43** 🟡 **Click outside closes menu** — same.

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
- **FS-2.5-05** ✅ **Selecting a doc attaches** — clicking a row calls `onAttach(path)` then `onClose()` in that order.
- **FS-2.5-06** ✅ **Create-new button prompts** — toggles to an input field with autofocus; Enter or clicking `Create` invokes `onCreate(path)` + `onClose()`.
- **FS-2.5-07** ✅ **Create-new normalises extension** — path without `.md` auto-appends `.md` before calling `onCreate`; path already ending in `.md` passes through unchanged.
- **FS-2.5-08** ✅ **Cancel closes without attach** — backdrop click, X button, and the close button all call `onClose`. Escape in the create input reverts to the toggle (does NOT call `onClose` or `onCreate`). Empty/whitespace create names are rejected (no `onCreate`/`onClose`).
