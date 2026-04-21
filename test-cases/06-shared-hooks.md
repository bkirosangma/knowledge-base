# Test Cases — Shared Hooks & Utilities

> Mirrors §6 of [Features.md](../Features.md). See [README.md](README.md) for ID scheme and coverage markers.
>
> Internal shared hooks and utilities in `src/app/knowledge_base/shared/`. Tests are unit-level using Vitest + `@testing-library/react`.

---

## HIST-5 historyPersistence utilities

- **HIST-5.1-01** ✅ **fnv1a: returns an 8-char hex string** — output matches `/^[0-9a-f]{8}$/`.
- **HIST-5.1-02** ✅ **fnv1a: deterministic for the same input** — calling twice with identical string returns the same hash.
- **HIST-5.1-03** ✅ **fnv1a: different inputs produce different hashes** — `fnv1a('abc') !== fnv1a('xyz')`.
- **HIST-5.2-01** ✅ **historyFileName: strips .json extension and prefixes dot** — `diagram.json` → `.diagram.history.json`.
- **HIST-5.2-02** ✅ **historyFileName: strips .md extension and prefixes dot** — `notes.md` → `.notes.history.json`.
- **HIST-5.2-03** ✅ **historyFileName: preserves directory prefix in output path** — `docs/notes.md` → `docs/.notes.history.json`.
- **HIST-5.2-04** ✅ **historyFileName: handles nested directory paths** — `a/b/c.json` → `a/b/.c.history.json`.
- **HIST-5.3-01** ✅ **resolveParentHandle: traverses directory tree and returns parent handle** — `sub/notes.md` → calls `getDirectoryHandle('sub')` and returns the resulting handle.
- **HIST-5.3-02** ✅ **resolveParentHandle: returns root handle when filePath has no directory** — top-level path with no `/` returns the root handle unchanged.
- **HIST-5.4-01** ✅ **readHistoryFile: returns null when history file does not exist** — `getFileHandle` throws `NotFoundError`; function swallows it and returns `null`.
- **HIST-5.4-02** ✅ **readHistoryFile: parses and returns valid HistoryFile JSON** — file containing a valid `HistoryFile<T>` is round-tripped correctly.
- **HIST-5.4-03** ✅ **readHistoryFile: returns null for malformed JSON** — `JSON.parse` throws; function returns `null`.
- **HIST-5.5-01** ✅ **writeHistoryFile: creates and writes serialized HistoryFile JSON** — creates the file handle with `{ create: true }` and writes `JSON.stringify(data)`.
- **HIST-5.5-02** ✅ **writeHistoryFile: silently ignores write errors** — missing intermediate directory throws; function swallows it and resolves without error.

## HIST-6 useHistoryCore

- **HIST-6.1-01** ✅ **Initial state: empty entries and index -1** — `entries` is `[]`, `currentIndex` is `-1`.
- **HIST-6.1-02** ✅ **Initial state: canUndo and canRedo are both false** — nothing to undo or redo before any entry is loaded.
- **HIST-6.2-01** ✅ **initEntries: sets entries array and currentIndex** — after `initEntries([e], 0, 0)`, `entries` has length 1 and `currentIndex` is 0.
- **HIST-6.2-02** ✅ **initEntries: sets savedIndex** — third argument is reflected in `savedIndex`.
- **HIST-6.2-03** ✅ **initEntries: canUndo/canRedo reflect position correctly** — at index 0 of a 1-entry list both are false.
- **HIST-6.2-04** ✅ **initEntries: resets the savedEntryPinned flag** — re-initialising after a pin-triggering overflow clears `savedEntryPinned`.
- **HIST-6.3-01** ✅ **recordAction: appends entry and advances currentIndex** — `entries` grows by 1 and `currentIndex` points to the new entry.
- **HIST-6.3-02** ✅ **recordAction: canUndo becomes true after first record** — `canUndo` flips once there is at least one earlier entry.
- **HIST-6.3-03** ✅ **recordAction: truncates redo branch when recording after undo** — future entries beyond `currentIndex` are discarded before appending.
- **HIST-6.4-01** ✅ **undo: returns previous snapshot and decrements index** — returns the snapshot at `currentIndex - 1` and moves `currentIndex` back.
- **HIST-6.4-02** ✅ **undo: returns null when already at beginning** — no-op when `currentIndex` is at the minimum allowed index.
- **HIST-6.4-03** ✅ **redo: returns next snapshot and increments index** — returns the snapshot at `currentIndex + 1` and advances the index.
- **HIST-6.4-04** ✅ **redo: returns null when already at end** — no-op when `currentIndex` equals `entries.length - 1`.
- **HIST-6.5-01** ✅ **goToEntry: jumps to any valid index and returns its snapshot** — sets `currentIndex` to the given index and returns its snapshot.
- **HIST-6.5-02** ✅ **goToEntry: returns null for out-of-range index** — index ≥ `entries.length` returns null without mutation.
- **HIST-6.5-03** ✅ **goToEntry: returns null for negative index** — negative index returns null without mutation.
- **HIST-6.6-01** ✅ **goToSaved: jumps to savedIndex and returns its snapshot** — sets `currentIndex` to `savedIndex` and returns the saved snapshot.
- **HIST-6.6-02** ✅ **goToSaved: returns null when savedIndex is -1** — before any save, `savedIndex` is `-1` and the call is a no-op.
- **HIST-6.7-01** ✅ **markSaved: updates savedIndex to currentIndex** — `savedIndex` equals `currentIndex` after the call.
- **HIST-6.7-02** ✅ **markSaved: clears the savedEntryPinned flag** — if `savedEntryPinned` was true, it is reset to false by `markSaved`.
- **HIST-6.8-01** ✅ **clear: resets entries to empty and index to -1** — `entries` is `[]` and `currentIndex` is `-1` after `clear()`.
- **HIST-6.8-02** ✅ **clear: resets savedIndex to -1 and clears canUndo/canRedo** — full state reset including all derived flags.
- **HIST-6.9-01** ✅ **onStateChange callback: fires after recordAction** — the optional callback is invoked each time an action is recorded.
- **HIST-6.9-02** ✅ **onStateChange callback: fires after undo** — callback is invoked when `undo()` mutates state.
- **HIST-6.10-01** ✅ **MAX_HISTORY pruning: caps entries at 100 and keeps most recent** — after 106 records, only the latest 100 are kept.
- **HIST-6.10-02** ✅ **MAX_HISTORY pruning: pins saved entry at index 0 when it would be pruned** — `savedEntryPinned` becomes true and `savedIndex` is 0.
- **HIST-6.10-03** ✅ **savedEntryPinned: canUndo is false when currentIndex is 1** — the pinned entry at index 0 acts as the undo floor; `canUndo` is false at the boundary.
- **HIST-6.10-04** ✅ **savedEntryPinned: undo() returns null when currentIndex is 1** — undo cannot move past the pinned saved entry.
- **HIST-6.11-01** ✅ **getLatestState: returns current ref values synchronously** — reads `entries`, `currentIndex`, and `savedIndex` from refs without waiting for a render.

## HIST-7 useHistoryFileSync

- **HIST-7.1-01** ✅ **initHistory with no handle: seeds a "File loaded" entry** — single entry with `description === 'File loaded'` and the file content as snapshot; `savedIndex` is 0.
- **HIST-7.2-01** ✅ **initHistory with matching checksum: restores entries from disk** — `readHistoryFile` returns data whose checksum matches; `currentIndex` and `savedIndex` are preserved.
- **HIST-7.3-01** ✅ **initHistory with mismatched checksum: discards stale history** — stale sidecar is ignored; a fresh "File loaded" entry is seeded.
- **HIST-7.4-01** ✅ **onFileSave: marks the saved position and schedules a debounced write** — `savedIndex` advances to `currentIndex`; `writeHistoryFile` is called after 1000 ms.
- **HIST-7.5-01** ✅ **clearHistory: resets state to empty and cancels pending writes** — `entries` is `[]`, `currentIndex` is `-1`, and no deferred write fires.
- **HIST-7.6-01** ✅ **Debounce write: does not write immediately after recordAction** — `writeHistoryFile` is not called synchronously.
- **HIST-7.6-02** ✅ **Debounce write: writes after 1000 ms following recordAction** — advancing fake timers by 1100 ms triggers exactly one write.
- **HIST-7.6-03** ✅ **Debounce write: does not write when no dirHandle is provided** — without a directory handle, no write is ever scheduled.
- **HIST-7.6-04** ✅ **Debounce write: multiple rapid recordActions coalesce into a single write** — only one call to `writeHistoryFile` after the debounce window settles.
- **HIST-7.7-01** ✅ **File switch: re-init clears prior entries and loads fresh history** — calling `initHistory` a second time with a different path discards the previous session's entries.

## HIST-8 useDocumentHistory

- **HIST-8.1-01** ✅ **onFileSave: flushes pending debounce as "Draft" when content differs** — pending debounce fires immediately as a "Draft" entry; no additional "Saved" entry is added; `savedIndex` advances.
- **HIST-8.1-02** ✅ **onFileSave: does not record a new entry when content matches current snapshot** — if the content hasn't changed since the last entry, `onFileSave` only marks the saved position.
- **HIST-8.2-01** ✅ **onBlockChange: records "Block changed" entry when content differs** — a "Block changed" entry is appended immediately without waiting for the debounce.
- **HIST-8.2-02** ✅ **onBlockChange: is a no-op when content matches current snapshot** — identical content does not append a new entry.
- **HIST-8.2-03** ✅ **onBlockChange: cancels any pending debounce timer** — a block change flushes the debounce so no duplicate "Draft" follows.
- **HIST-8.3-01** ✅ **goToSaved: returns saved snapshot and positions currentIndex at savedIndex** — after edits, `goToSaved` moves back to the last saved entry and returns its content.
- **HIST-8.4-01** ✅ **onContentChange: does not record an entry immediately** — the debounce delay means `entries.length` is unchanged right after the call.
- **HIST-8.4-02** ✅ **onContentChange: records a "Draft" entry after 5 s** — advancing fake timers by 5000 ms appends one "Draft" entry.
- **HIST-8.4-03** ✅ **onContentChange: resets the debounce timer on subsequent calls** — a second call within the window delays the flush; only one "Draft" is recorded.
- **HIST-8.4-04** ✅ **onContentChange: is a no-op when content is identical to current snapshot** — content equal to the current entry's snapshot never schedules a "Draft".

## HIST-9 useDiagramHistory

- **HIST-9.1-01** ✅ **initHistory with no handle: seeds "File loaded" entry with diagram snapshot** — single entry with the parsed diagram object as snapshot; `savedIndex` is 0.
- **HIST-9.1-02** ✅ **initHistory with matching checksum: restores history from disk** — FNV-1a matches sidecar; `currentIndex` and `savedIndex` are restored from file.
- **HIST-9.2-01** ✅ **recordAction: appends entry and advances currentIndex** — new entry is appended with the provided description and snapshot.
- **HIST-9.3-01** ✅ **canUndo/canRedo: both false at single-entry initial state** — nothing before or after the first entry.
- **HIST-9.3-02** ✅ **canUndo/canRedo: canUndo=true, canRedo=false after recording an action** — one entry in the past, none in the future.
- **HIST-9.3-03** ✅ **canUndo/canRedo: canUndo=false, canRedo=true after undoing to the first entry** — at index 0, nothing to undo; the undone entry is available to redo.
- **HIST-9.4-01** ✅ **undo: returns the previous snapshot** — moves `currentIndex` back by 1 and returns the prior entry's snapshot.
- **HIST-9.4-02** ✅ **redo: returns the next snapshot** — moves `currentIndex` forward by 1 and returns the next entry's snapshot.
- **HIST-9.4-03** ✅ **undo: returns null at the first entry** — no-op when already at the beginning of history.
- **HIST-9.5-01** ✅ **goToEntry: navigates to a specific index and returns its snapshot** — `currentIndex` is updated and the snapshot at that index is returned.
- **HIST-9.6-01** ✅ **onSave: is an alias for onFileSave — marks the saved position** — after `onSave`, `savedIndex` equals the index of the entry that was current at call time.
