# Features

A catalogue of every user-facing capability and internal sub-system in the Knowledge Base app, derived from the source at `src/app/knowledge_base/`. Organised as top-level features → sub-features, each with a one-to-two-line description. Used as the scope reference for test case design.

> **⚠️ Maintenance contract.** This file is the source of truth for the app's feature surface. It **must** be updated in the same change set as any code change that adds, removes, renames, or enhances a feature or sub-feature. See `CLAUDE.md` → _Features.md — Source of Truth for Features_ for the full rules.
>
> **Test coverage** for every section below lives in [`test-cases/`](test-cases/README.md), one file per top-level feature bucket. Every feature/sub-feature has a stable case ID (`DIAG-3.8-01`, `DOC-4.3-07`, …). Tests should reference those IDs; adding/removing/enhancing a feature means updating the matching test-cases file in the same change.

> Legend: `✅` = observable user behaviour worth test coverage. `⚙️` = internal subsystem that underpins user features (test indirectly or via unit). `?` = inferred from neighbouring code; verify before asserting.

---

## 1. App Shell & Layout

Top-level chrome that hosts every other feature.

### 1.1 Root Layout
- ✅ **Global shell** (`src/app/layout.tsx`) — Geist font variables, antialiased full-height flex container, Tailwind CSS 4 base.
- ✅ **Home route** (`src/app/page.tsx`) — client-side entry rendering `<KnowledgeBase />` with `data-testid="knowledge-base"` root.
- ⚙️ **Global stylesheet** (`src/app/globals.css`) — Tiptap/ProseMirror styling for headings, lists, tables, blockquotes, task-list checkboxes, code blocks, wiki-link cursor.

### 1.2 Header
`src/app/knowledge_base/shared/components/Header.tsx`
- ✅ **Split-view toggle** — enters / exits split pane mode; shows active state. Title editing, dirty dot, Save, and Discard live inside each pane's `PaneHeader` row (folded from the old `PaneTitle` strip on 2026-04-26 / SHELL-1.12).
- ✅ **`Cmd/Ctrl+S` shortcut** — saves the focused pane (handler lives in `knowledgeBase.tsx`).
- ✅ **⌘K trigger chip** — centered search-commands button in the header (3-column grid keeps it centred regardless of side content); clicking it opens the Command Palette. 220 px wide, muted placeholder text + `⌘K` badge.
- ✅ **Dirty-stack indicator** — small amber pill ("N unsaved") rendered to the left of the ⌘K chip when one or more files have unsaved edits. `data-testid="dirty-stack-indicator"`. Tooltip lists every dirty file path. Reads `fileExplorer.dirtyFiles` from the shell. Hidden when no files are dirty.
- ✅ **Theme toggle** — sun/moon icon button right of the ⌘K chip (32 × 32, `aria-label="Toggle theme"`, `aria-pressed={theme === "dark"}`, `data-testid="theme-toggle"`). Clicking flips light/dark; persists via `vaultConfig.theme`. Phase 3 PR 1 (SHELL-1.13, 2026-04-26).

### 1.13 Theme & Design Tokens (Phase 3 PR 1)
`src/app/globals.css`, `src/app/knowledge_base/shared/hooks/useTheme.ts`
- ✅ **CSS token layer** — `:root` defines surface / ink / accent / status / focus tokens for the light theme; `[data-theme="dark"]` re-binds the same names to a dark slate + emerald palette. `@theme inline { --color-…: var(--…); }` exposes the tokens as Tailwind utilities (`text-ink`, `bg-surface`, `border-line`, etc.) that flip automatically when the root attribute changes. Locked type scale (`--text-xs..4xl`) overrides Tailwind defaults so font sizes can't drift across the app.
- ⚙️ **`useTheme` hook** (`shared/hooks/useTheme.ts`) — owns the resolved theme + setter. Tolerates a missing `RepositoryProvider` (pre-folder-pick) by falling back to OS `prefers-color-scheme`. After the vault repo mounts, `useEffect` reads `vaultConfig.theme`; if absent, OS pref wins. `setTheme` writes `{ theme }` via the new `vaultConfigRepo.update` patch helper.
- ✅ **`data-theme` attribute on shell root** — `KnowledgeBaseInner` renders the `<div data-testid="knowledge-base">` inside a `ThemedShell` render-prop wrapper that lives below `RepositoryProvider`, so `useTheme` runs inside the repository context and can read/write vault config without lifting providers.
- ✅ **`view.toggle-theme` palette command + ⌘⇧L global handler** — registered via `useRegisterCommands` inside `ThemedShell`; the raw keydown listener applies the same input/contenteditable guard used by ⌘K, ⌘., and ⌘F. Group: View. Title: "Toggle Light / Dark Theme".
- ✅ **Visible focus ring** — global `*:focus-visible { box-shadow: 0 0 0 2px var(--focus); }` rule in `globals.css`. The ring colour follows the active theme (`--focus` re-binds in dark mode).
- ⚙️ **`vaultConfig.theme` schema field** — optional `"light" | "dark"` in `VaultConfig`; absent on first-mount means "use OS pref". `updateVaultConfig(rootHandle, patch)` does an atomic read-merge-write through `FileSystemError`-classified paths (single dir + file handle acquisition mirrors `updateVaultLastOpened` so concurrent patches can't interleave and drop one update); `VaultConfigRepository.update(patch)` exposes it.
- ⚙️ **Dark-mode token coverage (PR 1 scope)** — Phase 3 PR 1 ships token surface chrome (shell, header/footer) AND key visited surfaces: `ExplorerPanel` (Recents header, file rows, context menu), `TreeNodeRow` (every tree row + hover-button icons), and the `DiagramView` toolbar (`features/diagram/DiagramView.tsx` lines ~1073-1140 + `features/diagram/utils/toolbarClass.ts` for the Live/Labels pill helper). Active-row `bg-blue-50` is re-bound to a translucent accent fill via a `[data-theme="dark"] .bg-blue-50` rule in `globals.css` so existing call-sites flip without per-component changes. Remaining components — Properties panel, full diagram canvas internals (nodes / edges / minimap / region chrome), condition popovers — migrate progressively in future PRs.

### 1.13.1 A11y Sweep (Phase 3 PR 1)
- ✅ **Icon-only button labels** — `ExplorerHeader` (More actions, New Diagram/Document/Folder, Refresh, Sort), `ExplorerPanel` (Explorer collapse, Clear search), `TreeNodeRow.HoverBtn` (rename / delete / dup), `MarkdownToolbar.TBtn` shared helper (mirrors `title` into `aria-label` + `aria-pressed`), `DiagramView` toolbar (Live, Labels, Minimap, Zoom in/out/reset wrapped in a `role="group" aria-label="Zoom controls"`), and `Footer` Reset App now expose accessible names. Buttons with visible text content (filter pills, WYSIWYG/Raw mode toggle) keep the text as the accessible name and only add `aria-pressed` for state.

### 1.14 Mobile Shell (Phase 3 PR 3)
`src/app/knowledge_base/shell/MobileShell.tsx`, `shell/BottomNav.tsx`, `shared/hooks/useViewport.ts`
- ⚙️ **`useViewport` hook** — SSR-safe viewport detector. Returns `{ isMobile: false }` on the server / first paint; an effect reads `window.matchMedia("(max-width: 900px)")` after mount and tracks subsequent breakpoint flips with cleanup on unmount. The 900 px breakpoint is exported as `MOBILE_BREAKPOINT_PX` for ad-hoc media-query references.
- ✅ **MobileShell layout** — replaces the desktop split-pane shell when `isMobile` is true. Composition: thin Header strip (file name + dirty pill + ⌘K trigger + theme toggle) + active tab content + `BottomNav`. Active tab state lives inside MobileShell; defaults to "files" when no file is open, otherwise "read".
- ✅ **Tab content routing** — Files tab renders `<ExplorerPanel>` full-screen (opening a file flips active tab to "read"); Read tab renders the focused pane via the host's `renderPane` (or an empty state with a "Pick a file" CTA when nothing is open); Graph tab renders `<GraphView>` with the same vault tree + link index. Clicking a node in Graph also flips to "read".
- ✅ **`BottomNav` component** — fixed-bottom 3-tab grid (Files / Read / Graph) using FolderOpen / BookOpen / Network icons. Each tab is ≥44 px tall, exposes `aria-label` + `aria-pressed`, and has a stable `data-testid="bottom-nav-{tab}"` for tests. Active tab uses `text-accent`; inactive uses `text-mute`.
- ✅ **Mobile responsive CSS** — `@media (max-width: 900px)` block in `globals.css` adds `overscroll-behavior: none` to html/body (kills iOS Safari's bounce so the bottom nav stays anchored) and `touch-action: none` on `.kb-diagram-viewport` (cedes gesture handling to `useTouchCanvas`).

### 1.15 PWA — Manifest, Service Worker, Offline Cache (Phase 3 PR 3)
`public/manifest.json`, `public/sw.js`, `public/icon.svg`, `shell/ServiceWorkerRegister.tsx`, `shared/hooks/useOfflineCache.ts`
- ✅ **Web app manifest** — `public/manifest.json` declares name "Knowledge Base", short_name "KB", display "standalone", theme_color `#047857` (emerald-700, matching `--accent`), and references `/icon.svg` for any size. SVG icon is Lighthouse-acceptable so we avoid shipping per-resolution PNGs.
- ✅ **Manifest reference in layout** — `src/app/layout.tsx` `metadata.manifest = "/manifest.json"`. Next 16 requires `themeColor` on the `viewport` export (not `metadata`), so we expose both: `metadata` carries the manifest + icons, `viewport` carries `themeColor`.
- ⚙️ **Service worker (`/sw.js`)** — hand-rolled (next-pwa is not Next-16 compatible). Pre-caches manifest + icon on install; serves `/__kb-cache/*` from the `kb-files-v1` cache (vault-content cache populated by `useOfflineCache`); falls back network-first → cache for everything else. Activate hook drops old static caches but preserves the file cache.
- ⚙️ **`ServiceWorkerRegister` component** — renders inside `KnowledgeBaseInner`. Calls `navigator.serviceWorker.register("/sw.js")` only when `process.env.NODE_ENV === "production"` so dev mode / Turbopack HMR isn't intercepted.
- ⚙️ **`useOfflineCache` hook** — polls the last 10 paths from `localStorage["kb-recents"]` (re-read each tick — closure does NOT capture, see PR-3 review notes), reads each via `DocumentRepository` / `DiagramRepository`, and writes to the `kb-files-v1` Cache Storage bucket keyed by `/__kb-cache/<path>`. Triggers: initial mount, `visibilitychange → hidden`, 30 s heartbeat while visible. Best-effort — read or write errors are swallowed.

### 1.11 Command Registry & Palette
`src/app/knowledge_base/shared/context/CommandRegistry.tsx`, `shared/components/CommandPalette.tsx`
- ⚙️ **CommandRegistryContext** — typed command registry context. Commands are keyed by `id` and stored in a `useRef` map; registration is additive (multiple callers mount simultaneously). Exposes `useRegisterCommands(commands)` (mounts/unmounts cleanup) and `useCommandRegistry()` (palette open state + live command list). Falls back to no-op stubs when used outside the provider so unit tests don't require wrapping.
- ✅ **Command Palette** — modal overlay triggered by `⌘K` (global keydown guard skips inputs/textareas/contenteditable). Full-screen semi-transparent backdrop, centered 560px panel, rounded-lg shadow-xl. Search input autofocused on open. Results grouped by `group` with muted uppercase headers. Each row: title left, shortcut badge right. Keyboard nav: ↑/↓ move active row, Enter executes + closes, Escape closes. Case-insensitive substring filter. Commands hidden when their `when()` guard returns false. Backdrop click closes.
- ✅ **Registered diagram commands** — `diagram.toggle-read-only` ("Toggle Read / Edit Mode", `E / ⌘⇧R`) and `diagram.delete-selected` ("Delete Selected", `⌫`, gated on `selectionRef.current != null`) registered via `useRegisterCommands` inside `useKeyboardShortcuts` (diagram hook). Auto-unregistered when the diagram pane unmounts.
- ✅ **Registered document commands** — `document.toggle-read-only` ("Toggle Read / Edit Mode", `E / ⌘⇧R`) registered inside `useDocumentKeyboardShortcuts`. Auto-unregistered when the document pane unmounts.
- ✅ **Registered shell commands** — `view.open-graph` ("Open Graph View", `⌘⇧G`) registered in `KnowledgeBaseInner`; opens the virtual graph pane (replaces the focused pane with the `__graph__` sentinel). Phase 3 PR 2 (2026-04-26).

### 1.3 Footer
`src/app/knowledge_base/shell/Footer.tsx`
- ✅ **Active-file badge** — shows filename with side label (Left/Right) when in split view.
- ✅ **Diagram stats** — world dimensions (`W x H px`), patch count, current zoom %.
- ✅ **Reset App button** — clears localStorage and reloads the window (destructive — confirm path worth testing).

### 1.4 Pane Manager & Split Pane
`src/app/knowledge_base/shell/PaneManager.tsx`, `shared/components/SplitPane.tsx`
- ✅ **Single / split layout** — single pane by default; Split toggle opens right pane.
- ✅ **Independent pane state** — each pane holds its own `filePath` and `fileType` (diagram or document).
- ✅ **Focus tracking** — `focusedSide` highlights the active pane (2 px blue border) on mouse-down.
- ✅ **`openFile()` routes to focused pane** — opening a file while split routes it to whichever pane has focus.
- ✅ **`exitSplit` remembers `lastClosedPane`** — the closed side can be restored later.
- ✅ **Draggable divider** — 20%–80% bounds, hover highlight, split ratio persisted to localStorage per `storageKey`.
- ✅ **Layout restore on directory load** — reopens previous pane layout when re-opening a known folder.

### 1.5 Contexts
- ⚙️ **ToolbarContext** (`shell/ToolbarContext.tsx`) — publishes `activePaneType` (`diagram | document | mixed`), `focusedPane`, `paneCount`. Consumed by the Footer for pane-aware status text; the Header no longer reads it after the 2026-04-19 strip-down.
- ⚙️ **FooterContext** (`shell/FooterContext.tsx`) — per-side diagram info (world size, patches, zoom) feeding the Footer.
- ⚙️ **ToastContext** (`shell/ToastContext.tsx`) — lightweight info-level toast system. `ToastProvider` exposes `showToast(message, duration?)` via `useToast()`; renders a single timed `role="status"` banner (auto-dismisses after 3 s by default, replaces any previous toast). Separate from `ShellErrorContext` which handles actionable file-system errors.
- ⚙️ **FileWatcherContext** (`shared/context/FileWatcherContext.tsx`) — 5s polling interval with named subscriber registry; `refresh()` fires all subscribers immediately; pauses when tab is hidden.

### 1.6 Pane Content Chrome
- ✅ **PaneHeader** (`shared/components/PaneHeader.tsx`) — single chrome strip per pane combining: breadcrumb path, inline title (`<h1>` that turns into an `<input>` on click for diagram panes; static `<h1>` reflecting the debounced first H1 for document panes), dirty dot + Save / Discard buttons (when `onSave` / `onDiscard` are wired), Read-Mode lock toggle (amber/prominent pill with Lock icon in read mode; subtle slate "Edit" pill in edit mode; aria-label always "Enter/Exit Read Mode"), reading-time pill (read mode only), right-side action slot. `hideTitleControls` prop dissolves the title input + Save/Discard while keeping breadcrumb + Read pill (used by Focus Mode). Phase 2 PR 2 (SHELL-1.12, 2026-04-26) folded the former `PaneTitle` row into this header so the per-pane chrome stack drops from 5 strips (Header / Breadcrumb / Title / Toolbar / Content) to 4 (Header / Breadcrumb-with-title / Toolbar / Content).
- ✅ **Empty state** — "No file open" placeholder when both panes are null.
- ✅ **ConflictBanner** (`shared/components/ConflictBanner.tsx`) — disk-conflict UI shown when a file changes externally while the user has unsaved edits. Renders a `role="alert"` banner with two actions: "Reload from disk" (discard local edits, reload from FS) and "Keep my edits" (dismiss the conflict and stay with local content). Wired into document and diagram panes by their respective file-watcher hooks.

---

## 2. File System & Vault Management

### 2.1 Folder Picker
`shared/hooks/useFileExplorer.ts`, `shared/hooks/fileExplorerHelpers.ts`, `shared/hooks/useDrafts.ts`, `shared/hooks/useDirectoryHandle.ts`, `shared/utils/directoryScope.ts`, `types/file-system.d.ts`. Phase 1.5 (2026-04-18) moved pure helpers into `fileExplorerHelpers.ts`. Phase 1.5b (2026-04-18) then extracted two focused sub-hooks: `useDrafts` (dirtyFiles Set + refreshDrafts / removeDraft / markDirty) and `useDirectoryHandle` (directoryName state + dirHandleRef + acquirePickerHandle / restoreSavedHandle / clearSavedHandle), encapsulating IndexedDB handle persistence + localStorage scope-id bookkeeping. useFileExplorer.ts: 675 → 517 lines (composition root that still owns the tree / activeFile / CRUD ops).
- ✅ **Open folder via File System Access API** — `showDirectoryPicker`; fallback to `<input webkitdirectory>` when API unavailable.
- ✅ **Directory-handle persistence** — handle stored in IndexedDB (`knowledge-base` DB, `handles` store) keyed by 8-char scope ID so the vault survives reloads.
- ⚙️ **Directory scoping** — all localStorage keys namespaced per folder via `scopedKey(base)` so multiple vaults do not collide.
- ⚙️ **Tree scan** — recursive walk collecting `.json` (diagrams), `.md` (documents), and `.svg` (SVG drawings); skips `.*.history.json` sidecars; returns sorted `TreeNode[]`.

### 2.2 Vault Configuration
`features/document/utils/vaultConfig.ts` — low-level FS helpers. Phase 3a (2026-04-18) wrapped these behind the `VaultConfigRepository` interface (`domain/repositories.ts`) with a File System Access API implementation at `infrastructure/vaultConfigRepo.ts`; the shell calls `createVaultConfigRepository(rootHandle).read/init/touchLastOpened` instead of the utility functions directly. The same phase introduced `LinkIndexRepository` + `infrastructure/linkIndexRepo.ts` (consumed by `useLinkIndex`). Phase 3b (2026-04-19) added `DocumentRepository` + `DiagramRepository` interfaces + impls (`infrastructure/documentRepo.ts`, `infrastructure/diagramRepo.ts`); `useDocumentContent` and `useDocuments` route `.md` I/O through the document repo. Phase 3c (2026-04-19) migrated `useFileExplorer`'s `selectFile` / `saveFile` / `createFile` / `discardFile` to `createDiagramRepository`, so every `.json` load + save in the primary code paths now goes through the abstraction. Phase 3d (2026-04-19) closed out the layer by consolidating the duplicated in-memory FS mock used across five test files into `shared/testUtils/fsMock.ts` (−152 lines net; `fileTree.test.ts` keeps its unified `children`-Map shape). Phase 3e (2026-04-19) shipped the previously-deferred `RepositoryContext` at `shell/RepositoryContext.tsx`: `RepositoryProvider` is mounted inside `KnowledgeBaseInner`'s return below the `useFileExplorer()` call and memoizes all four repos against a reactive `rootHandle` (state companion to `dirHandleRef`, added to `useDirectoryHandle`), plus a `StubRepositoryProvider` for tests. The layering rule is: consumers **below** the provider use `useRepositories()` (today: `useDocumentContent` routes every `.md` read/write through `repos.document`); consumers **at or above** the provider — `useFileExplorer` (handle owner), `useDocuments` / `useLinkIndex` (peers of the provider in the same component), and the vault-init `useEffect` in `knowledgeBase.tsx` — keep inline `createXRepository(rootHandle)` because React hooks' ordering prevents them from reading a context that is mounted in their own return JSX. The test-seam pay-off is realised in `useDocumentContent.test.ts`: three new seam cases exercise the hook against `StubRepositoryProvider` with pure `vi.fn()` repos, no `MockDir` tree involved.
- ⚙️ **`initVault`** — creates `.archdesigner/config.json` with version, name, `created`, `lastOpened`.
- ⚙️ **`readVaultConfig`** — returns parsed config or `null` if the folder is not a vault. Phase 5b (2026-04-19) added a full-shape guard (`version` / `name` / `created` / `lastOpened` all string) at the I/O boundary so a parseable-but-incomplete `config.json` also returns `null` instead of a cast-but-unvalidated object. `isDiagramData` (the matching guard at `DiagramRepository.read`) was strengthened in the same phase to require `title: string` plus well-typed optional `lineCurve` / `flows` / `documents` / `layerManualSizes`. Phase 5c (2026-04-19) shipped the previously-deferred typed error surface. `domain/errors.ts` defines `FileSystemError` with kinds `not-found` / `malformed` / `permission` / `quota-exceeded` / `unknown`, plus `classifyError` that narrows a thrown `unknown` into the taxonomy. Every repository read + write now **throws** a classified `FileSystemError` on any failure (the previous "return null on any error" contract is gone because it hid data-loss bugs — most critically, a failing `.md` load used to hand an empty editor to the user, who could then type + save over their real file). Consumers opt into the common "absent file is not an error" ergonomic via the domain helper `readOrNull(fn)`; actionable kinds (permission / malformed / quota / unknown) are surfaced via the new `shell/ShellErrorContext` (`reportError` + one banner at the top of viewport + a React `ShellErrorBoundary` for render-time throws). Each consumer — `useDocumentContent`, `useDiagramPersistence` (draft autosave), every write path in `useFileExplorer`, the vault-init `useEffect` in `knowledgeBase.tsx`, and the three `linkManager` mutations called from the shell — now try/catch and `reportError` instead of silently returning null/false. Data-loss regressions pinned in `useDocumentContent.test.ts` (DOC-4.11-07/08/09) and `persistence.test.ts` (PERSIST-7.1-14). The design spec also called for schema validation at `DocumentRepository.load`; that step is N/A because `.md` files are plain text with no structured shape (the codebase does not parse YAML front-matter or any other structured envelope), so `DocumentRepository.read` intentionally returns the raw string unchanged.
- ⚙️ **`updateVaultLastOpened`** — touches `lastOpened` on open.
- ⚙️ **`isVaultDirectory`** — type guard on the `version` field.

### 2.3 File Explorer Panel
`shared/components/explorer/ExplorerPanel.tsx` — composition root that delegates to `TreeNodeRow.tsx` (recursive file/folder row renderer), `ExplorerHeader.tsx` (directory header + root drop target + ⋮ dot menu with Sort submenu + filter toggles), and `explorerTreeUtils.ts` (`sortTreeNodes` / `filterTreeNodes` pure helpers). Phase 1.4 (2026-04-18) reduced ExplorerPanel.tsx from 770 to 513 lines.
- ✅ **Collapsible sidebar** — toggles between 36 px (icon-only) and 260 px (full) with animation.
- ✅ **Tree rendering** — nested folders with chevrons, file icons by type (JSON/diagram vs text/doc), highlight on currently-open file.
- ✅ **Sorting** — three fields (name, created, modified), two directions (asc/desc), three groupings (folders-first, files-first, mixed); preferences persisted to localStorage; recursive on nested folders.
- ✅ **Filtering** — "All / Diagrams / Documents" radio; only matching files visible.
- ✅ **Right-click context menu** — Create (file, document, folder, SVG), Rename, Delete, Duplicate, Move. Folder rows also show hover buttons for New File, New Document, New Folder, and New SVG.
- ✅ **Create file / folder / SVG** — dialog prompts; unique-name fallback (`untitled.json`, `untitled-1.json`, `untitled.svg`, `untitled-1.svg`, …); type routed by extension. `useFileExplorer` exports `createFile`, `createDocument`, `createSVG`, and `createFolder`.
- ✅ **Rename** — inline edit with trimmed validation; **wiki-link-aware** — updates `[[…]]` references in other documents and the link index.
- ✅ **Delete** — confirmation popover; wiki-link-aware removal from the link index.
- ✅ **Duplicate** — clones with a new unique name.
- ✅ **Move** — context-menu / drag into a target folder.
- ✅ **Refresh** — button calls `FileWatcherContext.refresh()`, which fires all named subscribers (including the "tree" subscriber that rescans the directory tree) in addition to any future document/diagram watchers.
- ✅ **Drag-over feedback** — `dragOverPath` state highlights the target folder.
- ✅ **Dirty file indicator** — visual mark on files with unsaved changes.
- ✅ **Explorer search** — text input at the top of the panel (`data-testid="explorer-search"`, placeholder "Search files… ⌘F") filters the file tree live; non-matching files are hidden; when the query matches, a flat list of matching paths replaces the nested tree. Clear button (✕) empties the query. `shared/components/explorer/ExplorerPanel.tsx`.
- ✅ **⌘F shortcut** — global `keydown` handler in `knowledgeBase.tsx`; when focus is not in an input/textarea/contenteditable, prevents default and focuses the explorer search input (expands the sidebar first if collapsed). Also registered as a "Go to file…" command in the Command Palette (⌘K) under the Navigation group. `shared/hooks/useRecentFiles.ts`.
- ✅ **Recents group** — collapsible "Recents" section above the file tree showing the last 10 opened files (most recent first), deduplicated by path, persisted to `localStorage` under `kb-recents`. Collapse state resets to open on reload. Hidden when empty. `shared/hooks/useRecentFiles.ts`, `knowledgeBase.tsx`.
- ✅ **Unsaved changes group** — "Unsaved changes" section (no collapse) showing all currently-dirty files; hidden when clean. Clicking an entry opens the file. `shared/components/explorer/ExplorerPanel.tsx`.

### 2.4 Confirmation Popover
`shared/components/explorer/ConfirmPopover.tsx`
- ✅ **Mouse-anchored popover** — positions near the click; clamps to the viewport.
- ✅ **Confirm / Cancel** — red / blue button variants per severity.
- ✅ **Escape / outside-click dismisses.**
- ✅ **"Don't ask me again"** — checkbox persists the choice (used by Discard).

### 2.5 Document Picker
`shared/components/DocumentPicker.tsx`
- ✅ **Attach-to-entity modal** — attaches Markdown docs to diagram entities (root, node, connection, flow, type). `'flow'` entity type now fully wired with UI.
- ✅ **Search filter** — input filters the list.
- ✅ **Hide already-attached** — excludes docs already on the entity.
- ✅ **Create-new-document shortcut** — prompts for a `.md` path and creates it inline.

---

## 3. Diagram Editor

Root: `src/app/knowledge_base/features/diagram/`. Top-level is `DiagramView.tsx` — a composition root that delegates to `components/DiagramOverlays.tsx` (properties panel + minimap + modals + context menus), `components/DiagramNodeLayer.tsx` (Element / ConditionElement rendering + ghost previews for single/multi drag), `components/DiagramLinesOverlay.tsx` (DataLine SVG + ghost-line during endpoint drag), `components/DiagramLabelEditor.tsx` (inline node/layer/line label editor), and `components/AutoArrangeDropdown.tsx`, backed by state hooks `hooks/useDiagramLayoutState.ts` (toolbar toggles + localStorage-persisted properties-collapsed flag) and `shared/hooks/useReadOnlyState.ts` (per-file Read Mode — shared with DocumentView). Phases 1.1 + 1.1b (2026-04-18) reduced DiagramView from 1692 to 1282 lines. Phase 4a (2026-04-19) applied ISP to the `DiagramBridge` interface published by DiagramView: it now decomposes into `HeaderBridge` (title + save/discard + dirty surface consumed by the Header) and `ExplorerBridge` (file-ops + confirm-popover surface consumed by the explorer tree and rename/delete wrappers); `DiagramBridge` itself is a type alias `HeaderBridge & ExplorerBridge`, so the full-bridge consumer in `knowledgeBase.tsx` compiles unchanged while future consumers can depend on only the slice they need. The design spec's third slice (`FooterBridge`) was initially skipped on the claim that no footer-shaped DiagramView → shell flow existed; a 2026-04-19 follow-up caught the miss — `DiagramView.tsx:701` does push a typed payload into `FooterContext` — and the type was renamed `DiagramFooterBridge` (with `FooterBridge` as the per-pane union alias) so the vocabulary matches its Header/Explorer peers. The footer slice is plumbed through React context rather than the `onDiagramBridge` callback because `useFooterContext` is reachable from any pane without threading a ref back up to `knowledgeBase.tsx`; the ISP intent is identical — consumers depend on the narrowest slice they use.

### 3.1 Data Model (`types.ts`)
- ⚙️ **NodeData** — decomposed (Phase 4b, 2026-04-19) into four slice types joined by intersection: `NodeIdentity` (id, label, sub?, type?, layer), `NodeGeometry` (x, y, w, rotation?), `NodeAppearance` (icon component, borderColor?, bgColor?, textColor?), and `NodeShape` — a discriminated union where the rect variant (`{ shape?: 'rect' }`) disallows condition fields and the condition variant (`{ shape: 'condition' }`) requires both `conditionOutCount: number` and `conditionSize: 1|2|3|4|5`. `NodeData` itself is the aggregate `NodeIdentity & NodeGeometry & NodeAppearance & NodeShape`, so existing call sites keep compiling while utilities (e.g. `getNodeDims`) can accept the narrowest slice they actually read. Condition-node defaults are materialised at the I/O boundary by `deserializeNodes` (`conditionOutCount ?? 2`, `conditionSize ?? 1`); `SerializedNodeData` keeps those fields optional so old vaults still load.
- ⚙️ **LayerDef** — id, title, bg/border/text colours, contains nodes by node.layerId.
- ⚙️ **Connection** — id, `from`/`to` node ids, `fromAnchor`/`toAnchor`, colour, label, label position, `biDirectional`, `connectionType` (`synchronous | asynchronous`), `flowDuration`, optional waypoints.
- ⚙️ **FlowDef** — id, name, optional category, `connectionIds[]`.
- ⚙️ **Selection union** — `node | multi-node | layer | multi-layer | line | multi-line | flow`.
- ⚙️ **LineCurveAlgorithm** — `orthogonal | bezier | straight`.

### 3.2 Canvas & Viewport
`components/Canvas.tsx`, `hooks/useZoom.ts`, `hooks/useCanvasCoords.ts`, `hooks/useCanvasEffects.ts`, `hooks/useCanvasInteraction.ts`, `hooks/useViewportPersistence.ts`
- ✅ **Patched infinite canvas** — 800 × 800 px patches grow/shrink dynamically (`fitToContent`) to wrap content.
- ✅ **Zoom & pinch-zoom** — live zoom ref propagated to the minimap.
- ✅ **Auto-fit on load / reset** — zoom-to-content on first open.
- ✅ **Viewport persistence** — zoom and scroll (translate X/Y) persisted per diagram to localStorage; restored on reload.
- ⚙️ **Client → world coord transform** — via scroll offset and zoom, with 2000 px viewport padding guard.
- ✅ **Canvas click deselects** — resets selection to null.

### 3.3 Minimap
`components/Minimap.tsx`
- ✅ **200 px-wide overview** — shows layers, nodes, and the current viewport rect at aspect-preserving scale.
- ✅ **Draggable viewport rect** — panning the rect scrolls the canvas.
- ✅ **Scroll sync** — listens to canvas scroll and updates in real time.

### 3.4 Icon Registry
`utils/iconRegistry.ts`
- ⚙️ **41 Lucide icons registered** — Activity, Archive, BarChart, Bell, Box, Cable, Cloud, CloudCog, Code, Cog, Container, Cpu, Database, DatabaseZap, FileCode, Fingerprint, Folder, GitBranch, Globe, HardDrive, Key, Laptop, Layers, Lock, Mail, Monitor, Network, Plug, Radio, Router, Server, ServerCog, Shield, ShieldCheck, Smartphone, Tablet, Terminal, User, Users, Wifi, Zap. (README quotes "50+" — actual count is 41.)
- ⚙️ **Name ↔ icon mapping** — `getIcon`, `getIconName`, `getIconNames` for serialization.

### 3.5 Nodes (Rectangle Elements)
`components/Element.tsx`, `hooks/useNodeDrag.ts`, `hooks/useLabelEditing.ts`
- ✅ **Rectangle node** — label, sublabel, icon, custom colours, optional rotation.
- ✅ **Single-node drag** — grid snap, collision avoidance vs sibling nodes and layer boundaries.
- ✅ **Multi-node drag** — group moves together with bounding-box collision checking.
- ✅ **Label editing** — double-click to rename.
- ✅ **Default width** — `DEFAULT_NODE_WIDTH = 210` on create.

### 3.6 Condition Nodes
`components/ConditionElement.tsx`, `utils/conditionGeometry.ts`
- ✅ **Diamond/condition shape** — `shape === 'condition'`; configurable `size` (1–5) and `exits` (1–5).
- ⚙️ **Special anchors** — single `cond-in`, multiple `cond-out-0..N` on each exit.
- ⚙️ **Tailored path/scale geometry** — `getConditionPath`, `getConditionDimensions`, `getConditionScale`, `getConditionAnchors`, etc. (God node: `getConditionAnchors` — 5 edges.)

### 3.7 Layers
`components/Layer.tsx`, `utils/layerBounds.ts`, `hooks/useLayerDrag.ts`, `hooks/useLayerResize.ts`
- ✅ **Layer containers** — hold nodes; custom title, bg/border/text colours.
- ✅ **Auto bounds** — computed from child nodes + `LAYER_PADDING = 25` + `LAYER_TITLE_OFFSET = 20`.
- ✅ **Manual size overrides** — user-set width/height stored per-layer.
- ✅ **Layer drag** — all contained nodes move with it; enforces `LAYER_GAP = 10` between layers.
- ✅ **Layer resize** — drag edges; contained nodes shift to avoid overlap.
- ✅ **New-layer default** — `DEFAULT_LAYER_WIDTH = 400`, `DEFAULT_LAYER_HEIGHT = 200`.
- ⚙️ **Level model** (`utils/levelModel.ts`) — assigns `(level, base)` per node so collisions only trigger at the same level; condition nodes spanning layers get demoted to canvas level.

### 3.8 Connections (Lines)
`components/DataLine.tsx`, `utils/pathRouter.ts`, `utils/orthogonalRouter.ts`, `utils/geometry.ts`, `utils/anchors.ts`
- ✅ **Three routing algorithms** — `orthogonal` (obstacle-avoiding with rounded corners), `bezier` (cubic with anchor-direction tangents), `straight`. Dispatched via a Strategy registry (`routerRegistry` in `utils/pathRouter.ts`) — adding a new algorithm is a registry entry, not a `switch` edit (Phase 2, 2026-04-18).
- ✅ **9-point anchor set per rect** — top/bottom/left/right × three positions each; plus condition-specific anchors.
- ✅ **Label** — text, colour, `labelPosition` (0–1 along the path).
- ✅ **Bidirectional toggle** and **sync / async connection type**.
- ✅ **Waypoints** — custom kinks along the path (editable via segment drag).
- ⚙️ **`routeBetween`**, **`computeOrthogonalPath`**, **`pathIntersectsAny`**, **`segmentIntersectsAny`** — top god nodes driving routing.

### 3.9 Connection Interaction
`hooks/useEndpointDrag.ts`, `hooks/useSegmentDrag.ts`, `hooks/useAnchorConnections.ts`, `components/AnchorPopupMenu.tsx`, `utils/connectionConstraints.ts`
- ✅ **Endpoint drag** — 150 ms click-hold to grab; endpoint snaps to nearest anchor within radius or free-floats.
- ✅ **Connection constraints** — validates permissible reconnects (no self-loops, condition rules).
- ✅ **Flow-break check on reconnect** — simulates new topology and warns if it breaks a flow.
- ✅ **Segment drag** — reshape the path by dragging segments / waypoints; commits to history.
- ✅ **Anchor popup menu** — hover on a node shows anchors for connect/edit.
- ✅ **Persistent edge handles** — when a node is selected (and not in read-only mode), four blue 8 px dots appear at the N/E/S/W edge midpoints. `components/DiagramNodeLayer.tsx` (`EdgeHandles`), `hooks/useDragToConnect.ts`.
  - `data-testid="edge-handle-{nodeId}-{n|e|s|w}"` for testability.
- ✅ **Drag-to-connect from edge handle** — mousedown on an edge handle starts a dashed blue preview line (`isDashed` flag in `CreatingLine`); dropping on a node creates a connection; dropping on empty canvas opens the existing `AnchorPopupMenu` radial menu at the drop point (`onEmptyDrop` callback in `useLineDrag`). `hooks/useDragToConnect.ts`, `hooks/useLineDrag.ts`.
- ✅ **Canvas Quick Inspector** — a floating pill toolbar that appears 16 px above the selected node's bounding box in viewport space whenever exactly one node is selected and the diagram is not in read-only mode. Provides 6 actions: colour-scheme picker (6 swatches + native "Other…" picker, applies full fill/border/text scheme), inline label edit (pencil), start-connection drag from the east edge (reuses `useDragToConnect`), duplicate node (+30 px offset), and delete. Hidden on drag, hidden in read mode, and hidden when no node or multiple nodes are selected. `components/QuickInspector.tsx`, wired in `DiagramView.tsx`.
  - `data-testid="quick-inspector"` on the toolbar root.

### 3.10 Flows (Named Connection Sequences)
`utils/flowUtils.ts`, `components/FlowBreakWarningModal.tsx`, `components/FlowDots.tsx`, `properties/FlowProperties.tsx`, `hooks/useFlowManagement.ts`
- ✅ **Create flow from multi-line selection** — `Cmd/Ctrl+G`; requires contiguous connections (share nodes).
- ✅ **Flow dots** — animated dots along the path signal membership / animation.
- ✅ **Flow-break warnings** — modal lists flows that would break before deleting / reconnecting.
- ⚙️ **Algorithms** — `isContiguous`, `orderConnections`, `findBrokenFlows`, `findBrokenFlowsByReconnect`.
- ✅ **Edit name, category, membership; delete flow.**
- ✅ **Categorised grouping** — flows with `category` grouped under that category in the panel; otherwise flat.
- ✅ **Flow start/end highlighting** — when a flow is active (selected or hovered), source nodes (appear as `from` but never as `to`) glow green and sink nodes (appear as `to` but never as `from`) glow red; multiple sources and sinks are all highlighted; connection labels outside the flow are hidden. Implemented in `DiagramView.tsx` (`flowOrderData` memo), `components/DiagramNodeLayer.tsx`, `components/Element.tsx`, `components/ConditionElement.tsx`.
- ✅ **Document attachment** — attach existing docs to a flow from FlowProperties; create & attach a new blank doc (with optional "Edit now" to open in pane); detach with optional cascade delete that strips wiki-links from referencing docs and shows a deduplicated reference list before confirming. `features/diagram/properties/FlowProperties.tsx`, `features/diagram/components/CreateAttachDocModal.tsx`, `features/diagram/components/DetachDocModal.tsx`

### 3.11 Selection
`hooks/useSelectionRect.ts`, `hooks/useKeyboardShortcuts.ts`, `utils/selectionUtils.ts`
- ✅ **Click-select** — single node / layer / line / flow.
- ✅ **`Ctrl/Cmd+click`** — toggle add to multi-selection.
- ✅ **Rubber-band rectangle** — drag on canvas to select intersecting nodes / layers / lines.
- ✅ **< 25 px tap threshold** — disambiguates click vs accidental drag.

### 3.12 Context Menu
`components/ContextMenu.tsx`, `hooks/useContextMenuActions.ts`
- ✅ **On canvas** — Add Element, Add Layer.
- ✅ **On layer** — Add Element (inside layer), Delete Layer.
- ✅ **On element** — Delete Element.
- ⚙️ **Add Element** — collision avoidance, layer auto-assignment, grid snap, selection update.
- ⚙️ **Add Layer** — non-overlapping placement, unique id.

### 3.13 Properties Panel
`properties/PropertiesPanel.tsx` and siblings
- ✅ **Collapsible, tabbed by selection type** — falls back to Architecture when nothing is selected.
- ✅ **Respects read-only** — disables editors when the pane is locked.
- ✅ **NodeProperties** — label, sublabel, icon picker, type classifier, layer assignment, custom colours, rotation, (condition) exit count / size, incoming/outgoing connections, via-condition paths, member flows, backlinks, document attachment.
- ✅ **LayerProperties** — title, colours, child count, manual-size override toggle.
- ✅ **LineProperties** — label, colour, curve algorithm, bidirectional, connection type, flow duration, source/dest anchors.
- ✅ **FlowProperties** — name, category, member connections, delete, document attachment (attach existing, create & attach, detach with optional cascade delete); all attach/detach operations are recorded in the action history and are undoable/redoable.
- ✅ **DiagramProperties** (root) — diagram title, default line algorithm, Layers list, Elements list, Types tree with "Select All" per type, Flows panel with category grouping, document backlinks.
- ✅ **DocumentsSection** — clickable list of docs linked to the selection; opens in the other pane.

### 3.14 Keyboard Shortcuts
`hooks/useKeyboardShortcuts.ts`
- ✅ `Escape` — deselect and close context menu.
- ✅ `Delete` / `Backspace` — delete selection (prompts on flow break).
- ✅ `Cmd/Ctrl+G` — create flow from multi-line selection.
- ✅ `Cmd/Ctrl+Z` / `Cmd/Ctrl+Shift+Z` — undo / redo.
- ✅ `E` — toggle read-only mode (alias for `Cmd/Ctrl+Shift+R`; disabled when focus is in an input/textarea/contenteditable).
- ✅ `Cmd/Ctrl+Shift+R` — toggle read-only mode.
- ✅ **Disabled inside inputs / contenteditable.**

### 3.15 Auto-Arrange / Grid / Collision
- ✅ **Auto-arrange** (`utils/autoArrange.ts`) — Sugiyama-style hierarchical layout with topological sort, rank assignment, 2-pass barycenter ordering; 180 px rank spacing, 40 px node spacing; TB / LR directions. Dispatched via a Strategy registry (`layoutRegistry` / `computeLayout`) — three entries: `hierarchical-tb`, `hierarchical-lr`, `force` (Phase 2, 2026-04-18).
- ⚙️ **ID factory** (`utils/idFactory.ts`) — `createElementId`, `createLayerId`, `createConditionId`. Centralises the `el-<ts>-<rand>` / `ly-<ts>-<rand>` scheme so collision resistance or prefix changes are one-file edits (Phase 2, 2026-04-18).
- ✅ **Grid snap** (`utils/gridSnap.ts`) — snap during drag; **has an existing unit test** (`utils/gridSnap.test.ts`).
- ⚙️ **Collision utilities** (`utils/collisionUtils.ts`) — `clampNodePosition`, `clampMultiNodeDelta`, `findNonOverlappingLayerPosition`, `clampElementToAvoidLayerCollision`, `clampToAvoidOverlap`, `clampLayerDelta`.

### 3.16 Undo / Redo
`hooks/useDragEndRecorder.ts`; shared layer: `shared/hooks/useHistoryCore.ts`, `shared/hooks/useHistoryFileSync.ts`, `shared/hooks/useDiagramHistory.ts`, `shared/hooks/useDocumentHistory.ts`, `shared/utils/historyPersistence.ts`
- ⚙️ **`useHistoryCore`** (`shared/hooks/useHistoryCore.ts`) — generic undo/redo state machine: `recordAction`, `undo`, `redo`, `goToEntry`, `goToSaved`, `markSaved`, `initEntries`, `clear`, `getLatestState`. MAX_HISTORY=100; when the saved entry would be pruned it is pinned at index 0 (`savedEntryPinned=true`) and undo is blocked at index 1.
- ⚙️ **`useHistoryFileSync`** (`shared/hooks/useHistoryFileSync.ts`) — wraps `useHistoryCore`; adds `initHistory` (loads sidecar on open), `onFileSave` (FNV-1a checksum + 1 s debounced write), and `clearHistory`. Used by both diagram and document history adapters.
- ⚙️ **`useDiagramHistory`** (`shared/hooks/useDiagramHistory.ts`) — thin adapter over `useHistoryFileSync<DiagramSnapshot>`; exposes `onSave` alias. Snapshots: title + layers + nodes + connections + lineCurve + flows.
- ⚙️ **`useDocumentHistory`** (`shared/hooks/useDocumentHistory.ts`) — adapter over `useHistoryFileSync<string>`; adds `onContentChange` (5 s debounced record) and `onBlockChange` (immediate record) for Tiptap paragraph-level granularity.
- ⚙️ **`historyPersistence`** (`shared/utils/historyPersistence.ts`) — FS utilities: `fnv1a`, `historyFileName`, `resolveParentHandle`, `readHistoryFile`, `writeHistoryFile`; all FS ops silent-fail.
- ✅ **Sidecar file** — `.<filename>.history.json` next to the file; max 100 entries, FNV-1a checksum for disk-change detection.
- ✅ **`goToSaved()`** — revert to last saved snapshot.
- ✅ **HistoryPanel** (`shared/components/HistoryPanel.tsx`) — collapsible UI list of history entries with click-to-revert; `relativeTime()` bucketing (just now / Xs ago / Xm ago / Xh ago / Xd ago); entries rendered newest-first.

### 3.17 Read-Only Mode
- ✅ **Default read-only on open** — diagram files open in read mode by default (`shared/hooks/useReadOnlyState` defaults to `readOnly: true` when no localStorage preference exists for the file, and when `activeFile` is null). The user must explicitly switch to edit mode; that choice is persisted per file under `diagram-read-only:<filename>` in localStorage so subsequent opens honour the preference. Newly created files bypass this default by pre-seeding `diagram-read-only:<path>=false` in localStorage immediately after creation.
- ✅ **Pane-level toggle** — via PaneHeader lock icon (`E` key) and `Cmd/Ctrl+Shift+R`. PaneHeader pill shows amber background with Lock icon when in read mode; subtle slate when editing.
- ✅ **First-keystroke toast** — the first time the user presses any printable key while in read mode (excluding modifiers and `E`), a toast "Press E to edit" appears once per session.
- ✅ **Disables drag / delete / edit / property panel inputs.**

### 3.18 Document Integration
- ✅ **DocInfoBadge** (`components/DocInfoBadge.tsx`) — small badge on elements with attached documents.
- ✅ **Attach / detach docs per entity** — persisted in the diagram JSON under `documents`.
- ✅ **Backlinks surfaced in properties.**

### 3.19 Persistence
`hooks/useDiagramPersistence.ts`, `shared/utils/persistence.ts`
- ✅ **Disk save** — serializes nodes (icon refs → names), connections, layers, flows, manual layer sizes, measured node sizes.
- ✅ **Drafts in localStorage** — autosaved on edit; applied on next load until the real file is saved.
- ⚙️ **Colour migration** — legacy Tailwind class names migrated to hex on load.
- ⚙️ **`loadDefaults`, `serializeNodes`, `deserializeNodes`, `saveDraft`, `listDrafts`, `clearDraft`, `loadDiagramFromData`.**

### 3.20 Doc Preview Modal
`diagram/components/DocPreviewModal.tsx`
- ✅ **DocPreviewModal** — universal read-only document preview triggered by clicking any attached doc or wiki-link backlink in any entity panel. Blurs the diagram canvas (`blur-sm pointer-events-none`) and disables interactions while open. Header shows filename, "Read only" chip, optional entity name badge, "Open in pane" button, and close ✕. Body renders document content via `markdownToHtml()` in `.markdown-editor .ProseMirror` — pixel-identical to the doc pane. Rendered via `ReactDOM.createPortal` at `document.body`, unaffected by ancestor `filter`/`transform`. Closes on Escape or backdrop click. HTML output sanitized with a DOM-based sanitizer before render.

### 3.21 Diagram File Watcher
`features/diagram/hooks/useDiagramFileWatcher.ts`
- ⚙️ **`useDiagramFileWatcher`** — subscribes to the `"content:diagram"` polling tick; compares `diskChecksumRef` to the current on-disk checksum every 5 s. If the file changed and the diagram is clean, silently reloads (records a "Reloaded from disk" history entry, moves the saved point, shows a toast). If the file changed and the diagram is dirty, sets `conflictSnapshot` so `DiagramView` can show a `ConflictBanner`; `handleKeepEdits` suppresses re-prompting for the same disk version via `dismissedChecksumRef`. Exposes `conflictSnapshot`, `handleReloadFromDisk`, and `handleKeepEdits`. Wired into `DiagramView` via `ConflictBanner`.

### 3.24 Touch Canvas (Mobile Read-Only) (Phase 3 PR 3)
`features/diagram/hooks/useTouchCanvas.ts`, mounted inside `DiagramView.tsx` when `readOnly && isMobile`.
- ✅ **Two-finger pan + pinch-zoom** — two-finger touchmove translates `canvasRef.scrollLeft`/`scrollTop` by the midpoint delta and scales zoom via `setZoomTo(pinchStartZoom × distanceRatio)`. Bounds and snapping are inherited from `useZoom`.
- ✅ **Single-tap node selection** — tap inside ≤200 ms and ≤8 px movement dispatches a synthetic `MouseEvent("click")` on the touched element so the existing node-selection handlers fire. The hook walks ancestors looking for `data-testid="node-{id}"` to identify the touched node.
- ✅ **Long-press → backlinks** — 500 ms hold without movement >8 px on a node element fires `onLongPress(nodeId)`. The DiagramView wires this to `setSelection({ type: "node", id })` so the Properties panel surfaces backlinks.
- ✅ **Single-finger non-action** — single-finger touchmove is NOT preventDefault'd, so the browser is free to scroll documents naturally; one-finger panning is intentionally NOT supported on the diagram canvas.
- ⚙️ **Read-only / mobile guard** — the hook is a no-op when `enabled` is false; DiagramView passes `readOnly && isMobile` so edit mode keeps existing mouse handlers untouched and desktop never picks up the touch listeners.

---

## 4. Document Editor

Root: `src/app/knowledge_base/features/document/`. Top-level is `DocumentView.tsx`.

### 4.1 Editor Orchestration
- ✅ **DocumentView** — pane + properties sidebar + link manager; manages focus, navigation, doc creation. Owns `readOnly` state (lifted from MarkdownPane) and passes it to `useDocumentKeyboardShortcuts`, `DocumentProperties`, and `MarkdownPane`. Initialises document history (`useDocumentHistory.initHistory`) only after `useDocumentContent` confirms the file's content is loaded (`loadedPath === filePath`), preventing stale-content history init on file switch.
- ✅ **MarkdownPane** — pane wrapper with header, title, backlinks dropdown, read-only toggle. `readOnly`/`onToggleReadOnly` are controlled props (owner: `DocumentView`); the component no longer manages its own `readOnly` state.
- ✅ **MarkdownEditor** — Tiptap editor with WYSIWYG/Raw toggle, formatting toolbar, **200 ms debounced** HTML → markdown serialisation on keystroke (flushed on blur/unmount). Composes four focused pieces: `MarkdownToolbar.tsx` (toolbar JSX + rawBlock active-state), `TablePicker.tsx` (8×8 table-size grid popover), `ToolbarButton.tsx` (shared TBtn/Sep primitives), and `../extensions/rawSyntaxEngine.ts` (editor-coupled raw-syntax helpers: toggleRawSyntax / getActiveRawFormats / toggleRawBlockType / forceExitRawBlock). The `markdownReveal` Tiptap Extension (Typora-style live-reveal rawBlock) is split across four sibling files: `markdownReveal.ts` (Extension + RawBlock node + keybindings + `addProseMirrorPlugins`), `markdownRevealConversion.ts` (rich ↔ raw block converters + rawBlockToRichNodes cache), `markdownRevealDecorations.ts` (SYNTAX_PATTERNS + buildSyntaxDecorations), and `markdownRevealTransactions.ts` (locators + transaction mutators that back the `appendTransaction` body: findRawBlock, findConvertibleBlockAtCursor, maybeSyncRawBlockType, maybeForceExitRawList, restoreRawToRich, convertRichToRaw). Phases 1.2 → 1.3b (2026-04-18) reduced MarkdownEditor.tsx from 1018 to 366 lines and markdownReveal.ts from 1005 to 410.

### 4.2 Tiptap Extensions
Built on Tiptap v3 with StarterKit. Enabled child marks/nodes: headings H1–H6, paragraphs, bullet / ordered / task lists, blockquotes, inline bold / italic / strike / code, horizontal rule, hard break. Plus:
- ✅ **Tables** (`@tiptap/extension-table` + row / cell / header).
- ✅ **Task lists** (`@tiptap/extension-task-list`, `task-item`).
- ✅ **Images** (`@tiptap/extension-image`, wrapped by `vaultImage.ts`). Paste or drag-drop an image → writes to `<vault>/.attachments/<sha256-12>.ext` via `AttachmentRepository` (SHA-256 hash dedup; skip if exists) → inserts `![](.attachments/<hash>.ext)` at cursor. The canonical `.attachments/...` path stays in the markdown; at render time a NodeView reads the file via the repo and assigns a `blob:` URL to the actual `<img>.src` (also stamps `data-vault-src` on the element for traceability). FS errors reported via `ShellErrorContext`. `.attachments/` hidden from explorer via the existing dot-folder filter in `fileTree.ts`.
- ✅ **Links** (`@tiptap/extension-link`).
- ✅ **Placeholder** (`@tiptap/extension-placeholder`).
- ✅ **Code block with syntax highlighting** (`@tiptap/extension-code-block-lowlight` + `lowlight`).
- ✅ **Suggestion** (`@tiptap/suggestion`) — underpins wiki-link autocomplete.

### 4.3 Custom Extensions
`features/document/extensions/`
- ✅ **WikiLink** (`wikiLink.tsx`) — atomic `[[path#section|display]]` inline node. Blue pill when resolved, red when not found; doc vs diagram icon per target type. Live nodeView mirrors `data-wiki-link` / `data-wiki-section` attributes onto the DOM (matching the parsed-HTML output) so e2e tests + delegated listeners can target wiki-links by selector. Emits `onHover` / `onHoverEnd` for the hover-preview state machine in §4.16.
- ✅ **WikiLink autocomplete** — typing `[[` opens a **folder-at-a-time picker** (`FolderPicker.tsx`) starting at the current document's directory; click a subfolder to drill in, back arrow to go up, click a file to insert. Typing any character after `[[` switches to the existing flat substring-filtered list (arrow-key navigation, Enter selects).
- ✅ **FolderPicker** (`components/FolderPicker.tsx`) — reusable folder-browser component; shows one directory level at a time with up-navigation. Used by both the `[[` suggestion popup and the Link Editor Popover browse button.
- ✅ **WikiLink inline edit** — selecting the node lets single keys append to the display text; Backspace/Delete trim; Escape reverts.
- ✅ **Click behaviour** — in edit mode selects, in read mode navigates (creates the target if unresolved).
- ✅ **Multi-candidate path resolution** — current-dir `.md` → current-dir `.json` → as-written → root-level `.md` / `.json`.
- ✅ **ImagePasteHandler** (`imagePasteHandler.ts`) — ProseMirror plugin that intercepts paste and drop of `image/*` items. Hashes bytes via `crypto.subtle.digest('SHA-256')` (first 12 hex chars); writes to `.attachments/` via `AttachmentRepository`; inserts image node at cursor. Shows a small upload chip near the editor while write is in flight (files >100 KB). Errors thrown by the repo are forwarded to `ShellErrorContext` via the `onImageError` callback.
- ✅ **VaultImage** (`vaultImage.ts`) — extends `@tiptap/extension-image` with a NodeView that resolves canonical `.attachments/<hash>.<ext>` srcs to `blob:` URLs at render time (the relative path is unfetchable from the page origin). Reads the file via `AttachmentRepository.read()`, calls `URL.createObjectURL`, and assigns the blob URL to `<img>.src`; the canonical path is stamped on `data-vault-src` so markdown serialization round-trips unchanged. Revokes blob URLs on src change / node destroy. External (`http(s):`, `data:`, `blob:`) srcs bypass the resolver.
- ✅ **CodeBlockWithCopy** (`codeBlockCopy.tsx`) — code block with a hover "Copy" button; clipboard API with `execCommand` fallback.
- ✅ **TableNoNest** (`tableNoNest.ts`) — blocks `insertTable` when the cursor is already inside a table (GFM cannot represent nested tables).
- ✅ **MarkdownReveal** (`markdownReveal.ts`) — Typora-style live reveal. RawBlock node + decorations that wrap `**bold**`, `*italic*`, `~~strike~~`, `` `code` `` in `<strong>/<em>/<s>/<code>` as you type. Cursor entering a paragraph/heading/blockquote converts it to rawBlock; exiting re-parses via markdown-it. 64-entry LRU cache keyed on normalised markdown. Smart Enter (list-item splitting) and Backspace (merge with previous block's rightmost textblock).
- ⚙️ **MarkdownSerializer** (`markdownSerializer.ts`) — `htmlToMarkdown`, `markdownToHtml`. Preserves GFM pipe tables (with escaped `|`), task-list markers, wiki-links, link marks, blockquotes, fenced code with language, raw-block markers.

### 4.4 Formatting Toolbar (WYSIWYG only)
- ✅ **Mode toggle** — WYSIWYG ↔ raw textarea.
- ✅ **Undo / Redo** — with disabled states.
- ✅ **Headings H1–H6** — active state reflects current level.
- ✅ **Inline marks** — bold, italic, strike, inline code (falls back to raw-syntax toggling inside rawBlocks).
- ✅ **Block formats** — bullet list, ordered list, task list, blockquote, code block.
- ✅ **Insert** — horizontal rule, link (smart empty-insert), table picker (8×8 Excel-style grid, click inserts, disabled when already inside a table).

### 4.5 Table Floating Toolbar
`components/TableFloatingToolbar.tsx`
- ✅ **Auto-appear** — when cursor is in a table or mouse hovers one (200 ms hide delay on exit).
- ✅ **Positioning** — fixed above the table; hides when the table scrolls out of view.
- ✅ **Actions** — add row above/below, delete row, add column left/right, delete column, toggle header row, toggle header column, delete table.
- ✅ **Hover-only mode** — chrome visible but buttons disabled until the cursor is inside; hovering + click snaps the cursor into the last-hovered cell first.

### 4.6 Link Editor Popover
`components/LinkEditorPopover.tsx`
- ✅ **Two modes** — plain link mark (edit href + text) and wiki-link node (edit path + section + display).
- ✅ **Smart positioning** — below target by default, above if no room, clamped horizontally.
- ✅ **Path autocomplete** — native `<datalist>` backed by `allDocPaths` (wiki-link mode); additionally a **Browse button** (folder icon) opens an inline `FolderPicker` panel for point-and-click path selection.
- ✅ **Commit on Enter / blur**, **Escape reverts**.
- ✅ **Display-text smartness** — renaming keeps custom display unless it matched the old default.
- ✅ **Unlink** — removes the mark/node or deletes empty link text.

### 4.7 Wiki-Link Utilities
`utils/wikiLinkParser.ts`
- ⚙️ **`parseWikiLinks(markdown)`** — regex extraction of all `[[…]]`.
- ⚙️ **`resolveWikiLinkPath(linkPath, currentDir)`** — Obsidian-style: `/` prefix → vault root; relative paths normalise `..` / `.`; appends `.md` if no extension. Phase 5a (2026-04-19) clamps `..` beyond the vault root (dropped rather than emitted as a literal `..` segment) so the resolver can never produce a path that escapes the vault.
- ⚙️ **`updateWikiLinkPaths(markdown, oldPath, newPath)`** — bulk rename propagation; preserves section anchors and custom display text.
- ⚙️ **`stripWikiLinksForPath(markdown, deletedDocPath)`** — removes all `[[…]]` wiki-links pointing to a deleted document path; strips plain, aliased (`[[path|alias]]`), and section-anchored (`[[path#section]]`) forms. `features/document/utils/wikiLinkParser.ts`

### 4.8 Document Properties
`properties/DocumentProperties.tsx`
- ✅ **Stats** — word count, character count, estimated reading time (÷200 wpm).
- ✅ **Outbound links** — clickable list (path + optional section).
- ✅ **Backlinks** — clickable list of documents that reference this one.
- ✅ **Collapsible** — state persisted to localStorage; 36 px narrow when collapsed.

### 4.9 Link Index
`hooks/useLinkIndex.ts`
- ⚙️ **Index file** — `.archdesigner/_links.json`: `{ updatedAt, documents: { path → { outboundLinks, sectionLinks } }, backlinks: { path → { linkedFrom: [{ sourcePath, section? }] } } }`.
- ⚙️ **Incremental updates** — `updateDocumentLinks`, `removeDocumentFromIndex`, `renameDocumentInIndex`.
- ⚙️ **Backlink query** — `getBacklinksFor(docPath)`.
- ⚙️ **Full rebuild** — `fullRebuild(rootHandle, allDocPaths)` scans every `.md` + `.json` doc and writes a fresh `_links.json`. Triggered automatically once per vault open after the file tree is hydrated (so backlinks for never-opened files appear immediately) and manually via the Graph view's Refresh button.
- ⚙️ **Graphify cross-ref emission** — calls `emitCrossReferences` after each update.

### 4.10 Document Persistence
`hooks/useDocumentContent.ts`, `hooks/useDocuments.ts`, `components/DraftRestoreBanner.tsx`
- ✅ **Per-pane content & dirty state.**
- ✅ **Auto-save on file switch** — saves the previous doc before loading the new one.
- ✅ **`loadedPath` signal** — set to `filePath` once a load succeeds (or immediately for null/no-repo cases); consumers compare `loadedPath === filePath` to confirm content is fresh for the current file before acting on it.
- ✅ **Ref-backed `save()` / `dirty` / `filePath` / `content` bridge** — lets parent read latest without re-rendering per keystroke.
- ✅ **Autosaved drafts (KB-002, 2026-04-27)** — every dirty content change debounces 500 ms and persists `{ kind: "document", content, savedAt }` to `localStorage` under the per-vault `scopedKey('knowledge-base-draft:')` namespace. On mount, `useDocumentContent` compares the stored draft to the on-disk content; if they differ the draft is restored as the live (dirty) state and `DraftRestoreBanner` surfaces "Restored unsaved changes from <relative time>." with `[Discard] [Keep]` actions. `save()` and `discard()` clear the draft; switching files auto-saves the previous doc and clears its draft. A shell-level `beforeunload` guard in `knowledgeBase.tsx` raises the browser's "leave site?" dialog whenever any open file (doc or diagram) is dirty.
- ✅ **`createDocument`, `attachDocument`, `detachDocument`, `removeDocument`, `getDocumentsForEntity`, `hasDocuments`.**
- ⚙️ **`collectDocPaths`, `existingDocPaths`.**

### 4.11 Read-Only Mode (Doc)
- ✅ **Editor locked** — toolbar hidden, table toolbar disabled, link popover disabled, wiki-link click navigates instead of selecting.
- ✅ **Default read-only on open** — document files open in read mode by default (`useReadOnlyState` with prefix `"document-read-only"` defaults to `readOnly: true` when no localStorage preference exists, matching diagram behaviour). The user must explicitly switch to edit mode; that choice is persisted per file under `document-read-only:<filePath>` in localStorage so subsequent opens honour the preference. Newly created documents bypass this default by pre-seeding `document-read-only:<path>=false` in localStorage immediately after creation.
- ✅ **First-keystroke toast** — the first time the user presses any printable key while in read mode (excluding modifiers and `E`), a toast "Press E to edit" appears once per session.

### 4.12 Document Keyboard Shortcuts
`features/document/hooks/useDocumentKeyboardShortcuts.ts`
- ⚙️ **`useDocumentKeyboardShortcuts`** — window-level `keydown` listener; `E` (no modifier) → toggle read/edit mode (guarded: no-op when focus is inside contenteditable/input); `Cmd/Ctrl+Shift+R` → toggle read/edit mode; `Cmd/Ctrl+Z` → `onUndo`; `Cmd/Ctrl+Shift+Z` → `onRedo` (undo/redo no-op when `readOnly=true`). Stale-closure-safe via refs.

### 4.13 Document File Watcher
`features/document/hooks/useDocumentFileWatcher.ts`
- ⚙️ **`useDocumentFileWatcher`** — subscribes to the `"content:doc"` polling tick; compares `diskChecksumRef` to the current on-disk checksum every 5 s. If the file changed and the document is clean, silently reloads (records a "Reloaded from disk" history entry, moves the saved point, shows a toast). If the file changed and the document is dirty, exposes `conflictContent` so `DocumentView` can show a `ConflictBanner`; `handleKeepEdits` suppresses re-prompting for the same disk version via `dismissedChecksumRef`.

### 4.14 Editorial Read Mode
`features/document/components/MarkdownPane.tsx`, `features/document/components/MarkdownEditor.tsx`, `features/document/components/ReadingTOC.tsx`, `features/document/components/ReadingProgress.tsx`, `shared/components/PaneHeader.tsx`, `src/app/globals.css`
- ✅ **Editorial typography in read mode** — when `readOnly` is true, the `<EditorContent>` wrapper gains the `editorial` class. CSS in `globals.css` (`.markdown-editor.editorial .ProseMirror …`) switches the surface to a serif stack (`Source Serif 4` → `Charter` → `Georgia`), 18px / 1.7 line-height, `max-width: 70ch` centred. Headings scale to 32 / 26 / 21 px; blockquotes become italic pull-quotes (4px accent border); links use emerald-700; code blocks expose `data-language` as a small uppercase kicker via `::before`. Edit-mode CSS is untouched.
- ✅ **Reading-time pill** — `PaneHeader` renders a small `<X> min read` pill next to the Read button when `readOnly` is true and reading meta is non-empty. Estimate = `Math.max(1, Math.round(wordCount / 200))`. Word count is derived from `editor.view.dom.textContent` in `MarkdownEditor` and lifted to `MarkdownPane` via `onReadingMetaChange`.
- ✅ **Sticky right-rail TOC** — `ReadingTOC.tsx` renders a 224px right-rail nav populated with H1/H2/H3 entries (indented 0/16/32 px). Visibility gated on `readOnly && tocOpen && headings.length >= 3 && viewport >= 1100px`. Each entry click smooth-scrolls the editor scroll container. An `IntersectionObserver` provides scrollspy — the closest-to-top heading is highlighted in `text-amber-700`. Heading IDs are stamped onto live DOM nodes by `extractReadingMeta` in `MarkdownEditor` and re-extracted on every Tiptap `onUpdate`.
- ✅ **Reading progress bar** — `ReadingProgress.tsx` is a 2px amber-600 bar mounted just below `PaneHeader` in read mode only. Reads `scrollTop / (scrollHeight − clientHeight)` of the editor scroll container via passive scroll + ResizeObserver. Resets to 0% on `filePath` change.
- ✅ **Toggle TOC (⌘⇧O)** — registered in the command palette as `document.toggle-toc` with a `when: () => readOnly` guard so it only appears in read mode. A direct `keydown` handler in `MarkdownPane` provides the shortcut, with the standard input/textarea/contenteditable bypass.

### 4.15 Focus Mode (⌘.)
`knowledgeBase.tsx`, `features/document/DocumentView.tsx`, `features/document/components/MarkdownPane.tsx`
- ✅ **Toggle Focus Mode** — shell-level `focusMode` boolean. When on: explorer container collapses to 0px width with its right border removed, the global `Footer` is unmounted, `MarkdownPane`'s editor toolbar is hidden, `PaneHeader`'s title input + Save / Discard dissolve via `hideTitleControls` (breadcrumb + Read pill stay), and `DocumentView` swaps the properties sidebar slot for `null`. Off restores the prior `explorerCollapsed` value via `focusRestoreRef`. Header bar at the top of `knowledgeBase.tsx` stays visible by design — only document chrome dissolves.
- ✅ **Keyboard shortcut + palette** — registered as `view.toggle-focus-mode` (group `View`, shortcut `⌘.`). A raw `keydown` handler in `knowledgeBase.tsx` mirrors `⌘K`/`⌘F`'s input/textarea/contenteditable guard so the shortcut never fires while typing.

### 4.16 Wiki-Link Hover Preview
`features/document/components/WikiLinkHoverCard.tsx`, `features/document/extensions/wikiLink.tsx`, `features/document/components/MarkdownEditor.tsx`
- ✅ **Hover preview card** — hovering a `[[wiki-link]]` for 200 ms opens a 300 px floating card anchored below the link via `getBoundingClientRect()`. Card shows the target's first heading (or filename), a ~200-character plain-text excerpt, and a footer with backlink count + file size. White background, `rounded-lg` + `shadow-lg` + `border-slate-200`, rendered via `createPortal` to `document.body`.
- ✅ **Hover state machine** — `WikiLinkOptions.onHover` / `onHoverEnd` callbacks fired by the nodeView's `mouseenter` / `mouseleave` listeners; the host (`MarkdownEditor`) owns the 200 ms `setTimeout` open delay and a 60 ms overshoot tolerance before dismissing. Rapid hops between links cancel the prior pending timer; the card stays open while the cursor is over either the link or the card.
- ✅ **Broken-link suppression** — the nodeView resolves the target via the existing multi-candidate path resolution and passes `resolvedPath: null` for unresolved links so the hover state machine never opens the card. Red unresolved pills remain interactive (click-to-create) but do not preview.
- ✅ **Scroll dismissal** — any `scroll` event on the editor scroll container or the window force-closes the card. Re-anchoring on scroll is intentionally not implemented — the simpler dismiss-on-scroll is the user-expected pattern for transient hover UI.

### 4.17 Inline Backlinks Rail
`features/document/components/BacklinksRail.tsx`, `features/document/components/MarkdownPane.tsx`, `features/document/components/MarkdownEditor.tsx`
- ✅ **Inline rail** — a `<section data-testid="backlinks-rail">` rendered in the editor scroll container below `<EditorContent>` (via the new `belowContent` slot on `MarkdownEditor`), so it scrolls with the document instead of being fixed chrome. Visible in both read and edit modes — it is treated as content, not pane chrome.
- ✅ **Header** — "Backlinks · N references" in `text-slate-500` uppercase tracking-wider; the rail is hidden entirely when there are zero backlinks.
- ✅ **Context snippets** — each entry shows the source filename + a 2-line `line-clamp-2` plain-text snippet sliced ±80 chars around the first `[[currentFile]]` occurrence in the source markdown (resolved via `resolveWikiLinkPath` against the source's directory). Source is fetched on demand through `useRepositories().document.read()` with `readOrNull`; un-readable sources fall back to a "(source unavailable)" placeholder.
- ✅ **Click to navigate** — entries call the existing `onNavigateBacklink` handler; clicking opens the source document in the same pane.
- ✅ **Properties-panel backlinks coexist** — the existing `DocumentProperties` backlinks list is intentionally retained in this PR; a future cleanup removes the duplicate.

---

## 4.18 SVG Editor
`features/svgEditor/SVGEditorView.tsx`, `features/svgEditor/components/SVGCanvas.tsx`, `features/svgEditor/components/SVGToolbar.tsx`, `features/svgEditor/hooks/useSVGPersistence.ts`, `infrastructure/svgRepo.ts`
- ✅ **SVG editor pane** — `SVGEditorView` opens `.svg` files in a dedicated pane. Routing: clicking a `.svg` file in the explorer calls `panes.openFile(path, "svgEditor")`. Creating a new SVG via the explorer context menu or folder hover button creates the file and immediately opens the editor pane.
- ✅ **Toolbar** — `SVGToolbar` renders six drawing-tool buttons (Select, Rectangle, Ellipse, Line, Path, Text), Undo/Redo, and Zoom In / Zoom Out / Fit. Active tool is highlighted.
- ✅ **Canvas** — `SVGCanvas` mounts a `<div>` into which `@svgedit/svgcanvas` renders an SVG DOM tree; exposed via a `SVGCanvasHandle` ref with `setMode`, `undo`, `redo`, `zoomIn`, `zoomOut`, `zoomFit`, `getSvgString`, and `setSvgString`. KB-006 (2026-04-28) replaced the canvas's own `document.getElementById` lookups (`svg-editor-bg`, `path_stretch_line`, finished-path id) with `containerRef.current?.querySelector(...)` calls, scoped to each canvas's mount point — a `data-bg-rect` attribute now identifies the background rect per instance, with a one-shot migration in `setSvgString` that adds the attribute to legacy `id="svg-editor-bg"` rects on load. Without this scoping, opening two SVGs in split panes would resolve every bg-rect lookup to the first match in document order, so a `setBackground` call from one pane mutated the other pane's rect, fired its `MutationObserver`, and corrupted the unrelated file via the autosave pipeline.
- ✅ **Persistence** — `useSVGPersistence` routes every read/write through `Repositories.svg` (`SVGRepository` interface in `domain/repositories.ts`, `infrastructure/svgRepo.ts` impl). KB-005 (2026-04-27) closed the silent-failure hole: load, save, discard, and the 200 ms debounced autosave now `try/catch` + `reportError` via `ShellErrorContext`. `isDirty` flips to `false` only on a successful write; failures leave the dirty marker on so the user can retry. Pending debounced writes are flushed on activeFile switch, component unmount, `window.blur`, `pagehide`, and `visibilitychange === "hidden"` so a user closing the pane or tab shortly after the last edit still ends up with the final state on disk. `@svgedit/svgcanvas` 7.x omits a `changed` emission on select-mode translate (event.js:646), so dragging an existing shape needs a different signal. We wrap `canvas.addCommandToHistory` — the canonical chokepoint every meaningful change flows through (42 call sites, including the move case) — and fire `onChanged` after the original. A `MutationObserver` on the `#svgcontent` shape layer is kept as belt-and-braces, re-attached after every `setSvgString` (which detaches the old node and creates a fresh one at svg-exec.js:401-407). Both are gated by a `suppressMutationsRef` flag during programmatic `setSvgString` rebuilds so the load itself doesn't masquerade as a user edit.
- ✅ **Pane chrome** — `PaneHeader` shows the filename (without `.svg` extension) as title and Save/Discard buttons when `isDirty=true`.
- ✅ **Shell bridge** — `SVGEditorBridge` (`{ isDirty, title, onSave, onDiscard }`) is pushed to `knowledgeBase.tsx` via `onSVGEditorBridge`; Cmd+S in the shell calls `svgEditorBridgeRef.current?.onSave()` when the active pane is `"svgEditor"`.

---

## 5. Cross-Cutting Link & Graph Layer

### 5.1 Link Index — see §4.9.

### 5.2 Graphify Bridge
`shared/utils/graphifyBridge.ts`
- ⚙️ **`emitCrossReferences`** — writes `.archdesigner/cross-references.json` after doc saves; records document→document and document→diagram edges for the external graphify knowledge graph. Best-effort (errors swallowed and logged).

### 5.3 Wiki-Link-Aware File Ops
- ✅ **Rename propagation** — renaming `foo.md` rewrites `[[foo]]` references in every other document and updates the link index.
- ✅ **Delete propagation** — deleting a document removes it from the backlink index.

### 5.4 Vault Graph View (Phase 3 PR 2)
`features/graph/GraphView.tsx`, `components/GraphCanvas.tsx`, `components/GraphFilters.tsx`, `hooks/useGraphData.ts`
- ✅ **Virtual graph pane** — `PaneType` extended to `"diagram" | "document" | "graph"`; the graph pane uses the sentinel filePath `"__graph__"` (no on-disk file). Opened via `view.open-graph` palette command or ⌘⇧G global shortcut.
- ✅ **Force-directed layout** — `react-force-graph-2d`, lazy-loaded via `next/dynamic({ ssr: false })` so the dependency stays out of document/diagram bundles.
- ✅ **Nodes** — every `.md` and `.json` file in the vault tree (orphans included). Color: emerald-700 (`var(--accent)`) for documents, slate-500 (`var(--mute)`) for diagrams. Tokens re-read on theme flips so dark mode keeps the right contrast.
- ✅ **Edges** — wiki-link references derived from `linkIndex.documents[*].outboundLinks + sectionLinks`, deduplicated per (source, target) pair. Color: `var(--line)`.
- ✅ **Node click → opens in opposite pane** — graph stays mounted (single pane → split with target on right; split with graph focused → flip focus then open). Replacement of the graph by the click is never possible.
- ✅ **Filters** — `GraphFilters` left rail (folder multi-select, file-type checkboxes, orphans-only toggle).
- ✅ **Layout cache** — `vaultConfig.graph.layout` (Record<filePath, {x,y}>) persists post-simulation positions. `onEngineStop` debounces (500 ms) before write; cached layout merges into nodes on next mount.
- ✅ **Layout-restore tolerance** — `__graph__` sentinel bypasses the tree-validity check in pane-layout restore so the graph survives reloads.
- ✅ **Accessible debug list** — hidden `<ul data-testid="graph-debug-list">` mirrors visible nodes; gives Playwright a clickable surface and screen-readers a fallback list.

### 5.5 Graphify Knowledge Graph View
`features/graph/GraphifyView.tsx`, `components/GraphifyCanvas.tsx`, `graphifyColors.ts`, `graphifyPhysics.ts`, `hooks/useRawGraphify.ts`

Reads the `graphify-out/graph.json` produced by the external `graphify` CLI and renders it as an interactive force-directed knowledge graph in its own pane (virtual entry `fileType: "graphify"`).

- ✅ **Virtual pane entry** — opened via `view.open-graphify` palette command (⌘⇧K); replaces the focused pane; uses sentinel filePath `"__graphify__"`. Lazy-loaded canvas avoids pulling `react-force-graph-2d` into the main bundle.
- ✅ **Data loading** — `useRawGraphify` reads `graphify-out/graph.json` (and optionally `GRAPH_REPORT.md` for LLM-generated community names) using the vault's `FileSystemDirectoryHandle`. Reports four statuses: `idle`, `loading`, `loaded`, `missing`, `error`.
- ✅ **Community-colored nodes** — golden-angle hue spacing (`index × 137.508°`) assigns a distinct HSL color per community; `CommunityInfo` carries id, name, count, and color. Node size scales with degree (hub nodes rendered larger via `nodeVal = degree`).
- ✅ **Relation-typed edges** — seven named relation types (`references`, `calls`, `implements`, `conceptually_related_to`, `semantically_similar_to`, `shares_data_with`, `rationale_for`) each get a distinct color; an edge-type legend is rendered as a canvas overlay (bottom-right).
- ✅ **Hyperedges** — `RawHyperedge` groups (N nodes) are rendered as padded convex-hull polygons with dashed strokes; a regular-polygon d3 force (`createHyperedgeForce`) nudges member nodes toward equal-sided polygon shapes.
- ✅ **Physics tuning panel** — gear icon overlay (top-right) exposes five d3-force sliders: Link distance, Link strength, Repel force, Center force, Hyperedge force. Settings persisted to `vaultConfig.graphifyPhysics` and restored on next vault open. "Reset defaults" button snaps all values back.
- ✅ **Per-node gravity** — replaces d3's `forceCenter` with a custom per-node gravity force (`createGravityForce`) so disconnected subgraphs don't drift symmetrically apart under repulsion.
- ✅ **Pinch-to-zoom & two-finger pan** — touch and trackpad wheel events intercepted in the capture phase before d3-zoom to provide native-feeling zoom-to-cursor and pan gestures.
- ✅ **Sidebar** — 256 px right panel containing: Node info (label, source file link, community badge, neighbor list), Community legend (click to highlight all community nodes), Hyperedge list (click to highlight hull members).
- ✅ **Community & hyperedge selection** — clicking a community or hyperedge row pans the canvas to the centroid of those nodes; selection highlights them (others dimmed via `visibleNodeIds`). Clicking the community badge in Node info also highlights the community.
- ✅ **Canvas hull click** — clicking inside a hyperedge's rendered hull selects it (ray-casting point-in-polygon on the padded hull); background click always deselects the active node even when inside a hull.
- ✅ **Node search** — search input in the toolbar; results appear as an absolute-positioned dropdown (does not shift the canvas). Escape clears search.
- ✅ **File/folder node filter** — Filter button in the toolbar opens a dropdown panel with a collapsible file tree (explorer-style, folder expand/collapse). Two modes: *Include + neighbors* (show matched nodes plus their direct link neighbors), *Exclude* (hide matched nodes). Tree-search input shows a flat filtered list when non-empty. Active filter count shown on the button badge. Settings do not persist.
- ✅ **Node click → opens in other pane** — clicking a node opens its `source_file` in the opposite pane (graph pane stays mounted).
- ✅ **Theme-aware color scheme** — dark theme: slate-900 canvas, HSL 68%-lightness pastels, dark glass overlays. Light theme: slate-100 canvas, HSL 40%-lightness saturated tones, frosted-white glass overlays, -600/-700 edge colors. Community and node colors re-derived instantly via `useMemo` when the global theme toggles (no vault reload). Theme change detected via `MutationObserver` on `[data-theme]`.
- ✅ **Accessible debug list** — hidden `<ul data-testid="graphify-debug-list">` mirrors all nodes; each `<button>` has `aria-label="Select {label}"`.

### 5.6 Unlinked Mentions (Phase 3 PR 2)
`features/document/components/UnlinkedMentions.tsx`, `features/document/utils/unlinkedMentions.ts`
- ✅ **Detector** — tokenizes the document body (after stripping `[[...]]` blocks), matches tokens (length ≥ 4, lowercase) against vault basenames, excludes a stoplist of common English words and the doc's own basename. Caps at 50 hits. Sorted by count desc then alphabetical.
- ✅ **Properties-panel section** — mounts in `DocumentProperties` below Backlinks; lists token, count, target basename, and a per-row "Convert all" button.
- ✅ **Convert all** — `convertMention` mask-and-replaces the markdown body (case-insensitive, word-boundary, skips occurrences already inside `[[...]]`); routed through `updateContent + history.onContentChange + bumpToken` so dirty + save + undo plumbing all fire normally.

---

## 6. Shared Hooks & Utilities

### 6.1 Shared History — see §3.16.
`useHistoryCore`, `useHistoryFileSync`, `useDiagramHistory`, `useDocumentHistory`, `historyPersistence` — all in `shared/hooks/` or `shared/utils/`.
### 6.2 `useFileActions`
- ⚙️ **High-level file ops** — load, save, create, delete, rename, duplicate, move; bridges file-system calls to diagram state; integrates history init on load and commit on save.
### 6.3 `useEditableState`
- ⚙️ **Inline-edit state machine** — editing flag, draft value, error message; auto-resets on external value change; `inputRef` auto-focus helper.
### 6.4 `useSyncRef`
- ⚙️ **Always-fresh ref** — avoids stale-closure boilerplate in event handlers.

---

## 7. Persistence Surface (Where State Lives)

| Storage | Contents |
|---|---|
| **localStorage** (per-scope) | Explorer sort prefs, filter, collapse state; split ratio; pane layout; "Don't ask me again" flags; diagram drafts; per-diagram viewport; doc-properties collapse state. |
| **IndexedDB** (`knowledge-base` / `handles`) | File System Access API directory handle (+ scope ID). |
| **Disk (vault)** | `*.json` diagrams, `*.md` documents, `.<name>.history.json` sidecars, `.archdesigner/config.json`, `.archdesigner/_links.json`, `.archdesigner/cross-references.json`. |

---

## 8. Vault Search (KB-010)

`features/search/`. Prose spec: [`test-cases/08-search.md`](test-cases/08-search.md). Lands across PRs 10a → 10c.

### 8.1 Tokenizer
`features/search/tokenizer.ts`
- ⚙️ **Tokenizer** (10a) — Lowercases, strips Markdown punctuation, drops <2-char tokens, preserves unicode word characters; emits `{ token, position }` so callers can build snippets.

### 8.2 Inverted index
`features/search/VaultIndex.ts`
- ⚙️ **Index shape** (10a) — `Map<token, Posting[]>` keyed by token; postings track `{ path, kind: "doc" | "diagram", field: "body" | "title" | "label" | "flow", positions }`. Prefix matching on the last query token via linear key scan (200-doc vault stays well under the latency budget).
- ⚙️ **Query semantics** (10a) — AND-of-tokens with prefix on the last token; results carry per-field hits and a ±40-char snippet around the first body match (or first non-body match as fallback).

### 8.3 Worker
`features/search/vaultIndex.worker.ts`, `vaultIndex.workerHandler.ts`
- ⚙️ **Worker shell + handler** (10a) — `vaultIndex.worker.ts` is a thin shell; the testable logic lives in `vaultIndex.workerHandler.ts` (message protocol: `ADD_DOC` / `REMOVE` / `QUERY` / `CLEAR`, response `RESULTS` / `ERROR`).
- ⚙️ **Worker client** (10b) — `searchWorkerClient.ts` exposes a small interface so `useVaultSearch` can be unit-tested with an in-process client backed by the real handler; production uses `createRealWorkerClient()` (a Web Worker via `new Worker(new URL(...))`).

### 8.4 Performance
- ✅ **Median query latency < 50 ms on a 200-doc fixture** (10a) — asserted in `VaultIndex.test.ts`.
- 🧪 **No long main-thread blocks during search activity** (10c) — asserted in `e2e/vaultSearch.spec.ts` via `PerformanceObserver({ entryTypes: ['longtask'] })`.

### 8.5 Command palette — vault search mode
`shared/components/CommandPalette.tsx`
- ✅ **Default mode is vault search** (10c) — typing plain text routes to the worker; `>` prefix selects command mode (existing UX). Empty input shows a hint. Race-by-cleanup ensures stale results never overwrite the latest.

### 8.6 SearchPanel
`features/search/SearchPanel.tsx`, `features/search/applyChipFilters.ts`
- ✅ **Dedicated pane** (10c) — virtual pane mounted via `SEARCH_SENTINEL`; opened by the `view.open-search` command and ⌘⇧F shortcut. Renders an input + result list with kind chip + snippet.
- ✅ **Filter chips** — kind (Documents / Diagrams, mutually exclusive), field (body / title / label / flow, multi-select), and folder (distinct top-level folders derived from the raw result set). Chips apply post-query via `applyChipFilters` so the worker is never re-fired on chip toggle, and chip types compose by intersection.
- ✅ **Distinct empty-state copy** — the empty-state element carries `data-state` (`idle` / `no-results` / `filtered-out`) so the three cases are unambiguous to both screen readers and tests.

### 8.7 Diagram-side hits
`features/diagram/DiagramView.tsx`, `infrastructure/searchStream.ts`, `shell/PaneManager.tsx`
- ✅ **Centre + select on click** (10c) — clicking a result whose path is a `.json` diagram threads `PaneEntry.searchTarget = { nodeId }` through `panes.openFile`. `DiagramView` consumes it once on mount: `setSelection({ type: "node", id })` + `scrollToRect(...)` reusing `useCanvasEffects.scrollToRect`. Node ID resolved by `searchStream.findFirstNodeMatching` (one diagram re-read on click). The intent is single-fire by `${filePath}::${nodeId}` key and is intentionally stripped at the `SavedPaneEntry` boundary so it does not survive reload.

### 8.8 Incremental indexing
`features/search/useVaultSearch.ts`, `infrastructure/searchStream.ts`
- ⚙️ **Hook owns worker lifecycle** (10b) — `useVaultSearch` multiplexes `QUERY`/`RESULTS` by id, drains pending promises on terminate so callers never hang.
- ⚙️ **Save-signal wiring** (10b) — direct addDoc on doc Cmd+S, diagram `onAfterDiagramSaved`, rename/delete, and new-file creation; bulk index fires once per vault open and clears on vault swap. FileWatcher polling integration is deferred — the 1 s budget is met by the in-app save path alone.

---

## 9. Test & Verification Infrastructure

### 9.1 Unit (Vitest)
- ✅ **`vitest` + `@vitest/ui` + `@vitest/coverage-v8`** configured (`vitest.config.ts`, `tsconfig.test.json`).
- ✅ **jsdom** environment via `src/test/setup.ts` + `@testing-library/react` + `@testing-library/user-event` + `@testing-library/jest-dom`.
- ✅ **Existing test**: `features/diagram/utils/gridSnap.test.ts`.
- **Scripts**: `npm test`, `npm run test:run`, `npm run test:ui`, `npm run coverage`.

### 9.2 End-to-End (Playwright)
- ✅ **`@playwright/test`** configured (`playwright.config.ts`).
- ✅ **`PLAYWRIGHT_BASE_URL` env-var override** — when set, Playwright targets that URL and skips the built-in `npm run dev` webServer (useful for re-using an already-running local dev server).
- ✅ **`e2e/app.spec.ts`** — pre-folder shell smoke suite: app mounts with zero errors; Geist font CSS vars present (SHELL-1.1-02); root container is a full-height flex column (SHELL-1.1-03); "No file open" empty state and "Open Folder" button render; Header title defaults to "Untitled".
- ✅ **`e2e/fixtures/fsMock.ts`** — in-browser File System Access mock installed via `page.addInitScript`. Exposes `window.__kbMockFS` with `seed(files)` / `read(path)` / `reset()` helpers so tests can pre-populate an in-memory vault and read back the app's writes without any native dialog.
- ✅ **`e2e/goldenPath.spec.ts`** — folder-open → explorer-populates → click-file → pane-renders-content flows for both `.md` (MarkdownPane) and `.json` (DiagramView); pane-swap; "No file open" empty-state disappears; Save button disabled for clean docs.
- ✅ **`e2e/fsMockSanity.spec.ts`** — mock-FS contract tests (addInitScript installs `showDirectoryPicker`, seed+`values()` round-trip, root-level file tree renders).
- ✅ **`e2e/diagramGoldenPath.spec.ts`** — full diagram editor golden path: open `.json` vault, canvas renders, node selection/drag, Delete key removes node, properties panel collapse/persist (file-switch autosave is `test.skip`-ped pending SHELL-1.2-22 implementation); uses `fsMock.ts` in-memory FS.
- ✅ **`e2e/documentGoldenPath.spec.ts`** — full document editor golden path: open `.md` vault, WYSIWYG content renders, `[[wiki-link]]` pill visible, Raw toggle round-trip, Cmd+S saves, dirty-flag cleared, file-switch autosave.
- **Scripts**: `npm run test:e2e`, `npm run test:e2e:ui`.

### 9.3 Tooling Hooks
- ⚙️ **Build**: `next build` — Next.js 16 / React 19.
- ⚙️ **Lint**: `eslint` with `eslint-config-next`.
- ⚙️ **Type check**: strict TS 5 (`tsconfig.json`, `tsconfig.test.json`).

### 9.4 Continuous Integration
- ⚙️ **GitHub Actions CI** (`.github/workflows/ci.yml`) — gates every PR into `main` and every push to `main` on unit tests (`npm run test:run`), e2e tests (`npm run test:e2e`), and build (`npm run build`). Uses Node version from `.nvmrc`, caches npm, installs Chromium for Playwright, uploads the HTML report as an artifact on failure. Lint is intentionally not gated (pre-existing lint errors deferred to Phase 1).

---

## 10. External Contracts (for reference in test design)

- **File System Access API** — `showDirectoryPicker`, `FileSystemDirectoryHandle`, `FileSystemFileHandle`, `FileSystemWritableFileStream` (typings in `types/file-system.d.ts`). Only supported in Chromium-family browsers.
- **Vault layout** — top-level `*.json` diagrams, `*.md` documents, hidden `.archdesigner/` config dir, `.<name>.history.json` sidecars, optional nested folders.
- **Wiki-link grammar** — `[[path]]`, `[[path#section]]`, `[[path#section|display]]`, `[[path|display]]`.

---

## 11. Notable Items Worth Prioritising for Tests

1. **Grid snap** — already has a unit test; extend to round-trip.
2. **Markdown round-trip** (`htmlToMarkdown` ∘ `markdownToHtml`) — tables, task lists, wiki-links, code fences, blockquotes.
3. **Wiki-link path resolution** — `resolveWikiLinkPath` across relative, absolute, extension-less, and root-fallback cases.
4. **Wiki-link rename propagation** — `updateWikiLinkPaths` preserves section anchors and custom display.
5. **Orthogonal routing** — `routeBetween`, `pathIntersectsAny`, `segmentIntersectsAny` (god nodes; cover rects in the way, corner cases).
6. **Flow contiguity** — `isContiguous`, `orderConnections`, `findBrokenFlows`, `findBrokenFlowsByReconnect`.
7. **Collision clamps** — `clampNodePosition`, `clampMultiNodeDelta`, `findNonOverlappingLayerPosition`.
8. **Level model** — `computeLevelMap` correctly demotes cross-layer condition nodes.
9. **Serialize / deserialize** — `serializeNodes` / `deserializeNodes` round-trip, legacy Tailwind colour migration.
10. **Directory-scoped localStorage** — `scopedKey` behaviour when two vaults mounted in sequence.
11. **Link index** — full rebuild idempotency, backlink reverse mapping, rename propagation.
12. **Playwright smoke** — already exists; extend with folder-picker stub + basic diagram-create / doc-create flow (mindful of Preview-MCP's File System Access limit — see `MEMORY.md`).
