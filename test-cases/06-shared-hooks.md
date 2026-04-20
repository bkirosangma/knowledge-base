# Test Cases — Shared Hooks & Utilities

> Mirrors §6 of [Features.md](../Features.md). See [README.md](README.md) for ID scheme and coverage markers.
>
> These are internal hooks exported from `src/app/knowledge_base/shared/hooks/`. Tests here are unit-level (with `@testing-library/react` and `renderHook`).

---

## 6.1 `useActionHistory`

- **HOOK-6.1-01** ✅ **`initHistory` loads sidecar** — `initHistory(diagramJson, snapshot, handle, filePath)` restores entries, `currentIndex`, and `savedIndex` from the sidecar when the FNV-1a checksum matches. Verified via FS mock returning prepared `HistoryFile` JSON.
- **HOOK-6.1-02** ✅ **`initHistory` with no handle** — creates a single `"File loaded"` entry at `index 0`, `savedIndex = 0`; no throw.
- **HOOK-6.1-03** ✅ **`onSave` commits snapshot position** — after `onSave`, `savedIndex` equals the current index; the internal checksum ref is updated from the new JSON.
- **HOOK-6.1-04** ✅ **`onSave` writes to disk** — `onSave` schedules a debounced disk write (1000 ms); advancing fake timers by 1000 ms triggers `writeHistoryFile` with updated `checksum`, `savedIndex`, `currentIndex`, and `entries`. Verified via writable FS mock.
- **HOOK-6.1-05** ✅ **Max history cap** — cap is **101** when the saved entry is pinned (MAX_HISTORY=100 recent + 1 pinned savedEntry at index 0). Intentional: `savedEntryPinnedRef` explicitly tracks this case, so the +1 is by design.
- **HOOK-6.1-06** ✅ **`goToSaved` returns last saved snapshot** — jumps `currentIndex` to `savedIndex` and returns that entry's snapshot; returns `null` when `savedIndex < 0` or out of range.
- **HOOK-6.1-07** ✅ **FNV-1a checksum match** — when `initHistory` is called with JSON whose FNV-1a matches the sidecar's stored checksum and there are entries, history is restored. Verified via FS mock with matching checksum.
- **HOOK-6.1-08** ✅ **FNV-1a checksum mismatch** — different JSON checksum triggers a fresh-start path (new `"File loaded"` entry); stale sidecar entries are discarded. Verified via FS mock with hardcoded wrong checksum.
- **HOOK-6.1-09** ✅ **Sidecar filename convention** — `foo.json` → `.foo.history.json` (hidden, dot-prefixed, `.json` extension stripped from the basename before concatenation). For `folder/foo.json` → `folder/.foo.history.json`. Verified by capturing `getFileHandle` calls during `initHistory`.
- **HOOK-6.1-10** ✅ **History survives rename** — `renameFile` in `useFileExplorer` calls `renameSidecar(parentHandle, oldName, newName)` after the main content rename, moving `.old.history.json` → `.new.history.json`. No-op when no sidecar exists. Verified in [useFileExplorer.helpers.test.ts](../src/app/knowledge_base/shared/hooks/useFileExplorer.helpers.test.ts).
- **HOOK-6.1-11** ✅ **Fresh-start `savedIndex=0` does NOT block undo** — `savedEntryPinned` is `false` after `initHistory`; undo can reach index 0 normally. The block only activates when pruning sets the flag.
- **HOOK-6.1-12** ✅ **Pruning pins saved entry → undo blocked at index 1** — when recording past MAX_HISTORY=100 forces the saved entry to index 0, `savedEntryPinned` becomes `true` and undo stops at index 1.
- **HOOK-6.1-13** ✅ **`onSave` clears `savedEntryPinned`** — after saving at the current tip, the flag is reset to `false` and undo can walk back to index 0.

Also covered in [useActionHistory.test.ts](../src/app/knowledge_base/shared/hooks/useActionHistory.test.ts): `recordAction` append + redo-branch truncation, `undo`/`redo` blocked only when `savedEntryPinned=true`, `goToEntry` in/out of bounds, `clearHistory` resets every ref.

## 6.2 `useFileActions`

- **HOOK-6.2-01** ✅ **`handleLoadFile` loads from disk** — orchestrates `selectFile → applyDiagramToState → initHistory` in order. Early-returns when `selectFile` returns null.
- **HOOK-6.2-02** ✅ **`handleLoadFile` with draft** — when `selectFile` reports `hasDraft: true`, the draft data is applied to the editor and the disk JSON is routed to `applyDiagramToState` as `snapshotSource` (so the saved-position reference matches disk, not draft).
- **HOOK-6.2-03** ✅ **`handleLoadFile` initialises history** — calls `history.initHistory(diskJson, snapshot, dirHandle, fileName)`.
- **HOOK-6.2-04** ✅ **`handleSave` writes to disk** — routes to `fileExplorer.saveFile` with the full diagram tuple. No-op when `!isDirty` or `!activeFile`.
- **HOOK-6.2-05** ✅ **`handleSave` updates load-snapshot + history (draft clearing happens inside `saveFile`)** — on success, `setLoadSnapshot` captures the new saved state and `history.onSave(JSON.stringify(...))` bumps `savedIndex`.
- **HOOK-6.2-06** ✅ **`handleSave` commits history** — same as 6.2-05: `history.onSave` is invoked with the saved JSON.
- **HOOK-6.2-07** ✅ **`handleDeleteFile` shows confirmation** — dispatches `setConfirmAction({ type: "delete-file", path, x, y })`; does NOT delete until `handleConfirmAction` fires.
- **HOOK-6.2-08** ✅ **`executeDeleteFile` removes from disk + state** — `handleConfirmAction({type:"delete-file"})` calls `fileExplorer.deleteFile`; when the deleted path was the active file, state is reset to `loadDefaults` via `applyDiagramToState`.
- **HOOK-6.2-09** ✅ **`handleRenameFile` propagates wiki-links** — `useFileActions.handleRenameFile` forwards to `fileExplorer.renameFile` (FS rename only). The full wiki-link chain (index update + backlink rewrite) is in `propagateRename` (`fileExplorerHelpers.ts`), called by `handleRenameFileWithLinks` in `knowledgeBase.tsx`; covers both `.md` and `.json`. Core logic covered by `propagateRename` tests in `useFileExplorer.helpers.test.ts`; end-to-end wiring is integration-level
- **HOOK-6.2-10** ✅ **`handleDuplicateFile`** — forwards to `duplicateFile` and applies the returned duplicate's data; no-op when `duplicateFile` returns null.
- **HOOK-6.2-11** ✅ **`handleMoveItem` propagates wiki-links** — `handleMoveItemWithLinks` in `knowledgeBase.tsx` captures the tree snapshot before the FS move, then calls `propagateMoveLinks` (`fileExplorerHelpers.ts`); folder moves iterate all descendants via `collectFilePaths`, per-file errors are swallowed. Core logic covered by `propagateMoveLinks` tests in `useFileExplorer.helpers.test.ts`; end-to-end wiring is integration-level
- **HOOK-6.2-12** ✅ **Save failure does not clear dirty** — when `saveFile` returns `false`, `setLoadSnapshot` and `history.onSave` are skipped; caller's dirty state is untouched.

## 6.3 `useEditableState`

- **HOOK-6.3-01** ✅ **`setEditing(true)` enters edit mode; draft carries the current value** — the hook exposes `setEditing` (not `startEditing`); draft was already seeded by a `useEffect([value])`.
- **HOOK-6.3-02** ✅ **`cancel` clears editing + draft (to value) + error** — restores the original `value` into `draft`, flips `editing` false, clears `error`.
- **HOOK-6.3-03** ✅ **`showError` sets `error: true`; editing stays true** — also internally calls `inputRef.current?.focus` so the caller's `<input>` regains focus.
- **HOOK-6.3-04** ✅ **`finishEditing` commits — flips `editing` false + clears error** — the hook does NOT set `draft` itself on finish; the caller is responsible for updating the external `value`.
- **HOOK-6.3-05** ✅ **External value change auto-resets** — when `value` prop changes, the `useEffect([value])` resets `draft = value`, `editing = false`, `error = false`.
- **HOOK-6.3-06** ✅ **External change during editing — behaviour lock** — `useEffect([value])` fires unconditionally; an in-flight draft is overwritten and editing is reset when the parent prop changes. Covered in `useEditableState.test.ts`.
- **HOOK-6.3-07** ✅ **`inputRef.current?.focus` called on edit-enter** — test attaches a real DOM `<input>` to the exposed ref, triggers `setEditing(true)`, and asserts `focus` was called. Covered in `useEditableState.test.ts`.

## 6.4 `useSyncRef`

- **HOOK-6.4-01** ✅ **Ref mirrors value** — `useSyncRef(x)` → `ref.current === x` immediately on mount.
- **HOOK-6.4-02** ✅ **Ref updates across renders** — every render assigns `ref.current = value` synchronously during render (not inside an effect), so the new value is observable on the same tick as the re-render.
- **HOOK-6.4-03** ✅ **Same ref identity across renders** — `useRef(value)` returns the same ref object on every render.
- **HOOK-6.4-04** ✅ **Works with non-primitive values** — arrays, objects, null, undefined all round-trip.

## 6.5 `useFileExplorer`

> Covered predominantly in [02-file-system.md §2.1](02-file-system.md); this section holds low-level unit cases.

- **HOOK-6.5-01** ✅ **`isSupported` false branch** — `supported=false`, `acquirePickerHandle` and `restoreSavedHandle` return `null` immediately when `showDirectoryPicker` is absent (jsdom default). Verified in [useDirectoryHandle.test.ts](../src/app/knowledge_base/shared/hooks/useDirectoryHandle.test.ts).
- **HOOK-6.5-02** ✅ **`isSupported` true branch** — `supported=true` when `showDirectoryPicker` is present; `acquirePickerHandle` calls the native picker, returns handle+scopeId on success and null on AbortError; `restoreSavedHandle` loads from IDB and re-requests permission. Verified in [useDirectoryHandle.test.ts](../src/app/knowledge_base/shared/hooks/useDirectoryHandle.test.ts).
- **HOOK-6.5-03** ✅ **IDB helpers** — `saveDirHandle`/`loadDirHandle`/`clearDirHandle` are exported from `idbHandles.ts` and fully covered (round-trip, null-when-empty, clear-then-save, migration, error-swallowing) under PERSIST-7.2-03..08 in [idbHandles.test.ts](../src/app/knowledge_base/shared/utils/idbHandles.test.ts).
- **HOOK-6.5-04** ✅ **`openIDB` creates object store** — verified under PERSIST-7.2-06 in [idbHandles.test.ts](../src/app/knowledge_base/shared/utils/idbHandles.test.ts): first open creates the `handles` store; subsequent opens are idempotent.
- **HOOK-6.5-05** ✅ **Draft saving** — `saveDraft` / `loadDraft` / `clearDraft` / `listDrafts` covered in [persistence.test.ts](../src/app/knowledge_base/shared/utils/persistence.test.ts); scope isolation verified there.
- **HOOK-6.5-06** ✅ **Path resolution** — `getSubdirectoryHandle(root, "a/b")` walks into `a/b` (create=false) or creates missing segments when `create=true`; empty segments are filtered; `writeTextFile` auto-creates intermediate directories for nested paths (same traversal logic as `resolveParentHandle`).

Also covered in [useFileExplorer.helpers.test.ts](../src/app/knowledge_base/shared/hooks/useFileExplorer.helpers.test.ts): `readTextFile` round-trip (non-empty + empty files), `writeTextFile` at root / nested / overwrite.
- **HOOK-6.5-07** ❌ **`createDocument`** — `createDocument(parentPath)` generates a unique `.md` filename via `uniqueName`, writes an empty file, rescans the tree, and returns the new path; returns `null` when no directory handle is open.

## 6.6 Document Hooks (`useDocuments`, `useLinkIndex`, `useDocumentContent`)

> Covered in [04-document.md §4.10 and §4.11](04-document.md). No separate unit-only cases here unless a utility is added that does not tie to the editor.
