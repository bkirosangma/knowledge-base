# Test Cases — Shared Hooks & Utilities

## HIST-5 — historyPersistence utilities

| ID | Scenario | Status |
|----|----------|--------|
| HIST-5.1-01 | fnv1a: returns an 8-char hex string | ✅ |
| HIST-5.1-02 | fnv1a: same input produces the same hash | ✅ |
| HIST-5.1-03 | fnv1a: different inputs produce different hashes | ✅ |
| HIST-5.2-01 | historyFileName: strips .json extension and prefixes dot | ✅ |
| HIST-5.2-02 | historyFileName: strips .md extension and prefixes dot | ✅ |
| HIST-5.2-03 | historyFileName: preserves directory prefix in output path | ✅ |
| HIST-5.2-04 | historyFileName: handles nested directory paths | ✅ |
| HIST-5.3-01 | resolveParentHandle: traverses directory tree and returns parent handle | ✅ |
| HIST-5.3-02 | resolveParentHandle: returns root handle when filePath has no directory | ✅ |
| HIST-5.4-01 | readHistoryFile: returns null when history file does not exist | ✅ |
| HIST-5.4-02 | readHistoryFile: parses and returns valid HistoryFile JSON | ✅ |
| HIST-5.4-03 | readHistoryFile: returns null for malformed JSON | ✅ |
| HIST-5.5-01 | writeHistoryFile: creates and writes serialized HistoryFile JSON | ✅ |
| HIST-5.5-02 | writeHistoryFile: silently ignores write errors | ✅ |

## HIST-6 — useHistoryCore

| ID | Scenario | Status |
|----|----------|--------|
| HIST-6.1-01 | initial state: starts with empty entries and index -1 | ✅ |
| HIST-6.1-02 | initial state: canUndo and canRedo are both false | ✅ |
| HIST-6.2-01 | initEntries: sets entries array and currentIndex | ✅ |
| HIST-6.2-02 | initEntries: sets savedIndex | ✅ |
| HIST-6.2-03 | initEntries: canUndo/canRedo reflect position correctly | ✅ |
| HIST-6.2-04 | initEntries: resets the savedEntryPinned flag | ✅ |
| HIST-6.3-01 | recordAction: appends entry and advances currentIndex | ✅ |
| HIST-6.3-02 | recordAction: canUndo becomes true after first record | ✅ |
| HIST-6.3-03 | recordAction: truncates redo branch when recording after undo | ✅ |
| HIST-6.4-01 | undo: returns previous snapshot and decrements index | ✅ |
| HIST-6.4-02 | undo: returns null when already at beginning | ✅ |
| HIST-6.4-03 | redo: returns next snapshot and increments index | ✅ |
| HIST-6.4-04 | redo: returns null when already at end | ✅ |
| HIST-6.5-01 | goToEntry: jumps to any valid index and returns its snapshot | ✅ |
| HIST-6.5-02 | goToEntry: returns null for out-of-range index | ✅ |
| HIST-6.5-03 | goToEntry: returns null for negative index | ✅ |
| HIST-6.6-01 | goToSaved: jumps to savedIndex and returns its snapshot | ✅ |
| HIST-6.6-02 | goToSaved: returns null when savedIndex is -1 | ✅ |
| HIST-6.7-01 | markSaved: updates savedIndex to currentIndex | ✅ |
| HIST-6.7-02 | markSaved: clears the savedEntryPinned flag | ✅ |
| HIST-6.8-01 | clear: resets entries to empty and index to -1 | ✅ |
| HIST-6.8-02 | clear: resets savedIndex to -1 and clears canUndo/canRedo | ✅ |
| HIST-6.9-01 | onStateChange callback: fires after recordAction | ✅ |
| HIST-6.9-02 | onStateChange callback: fires after undo | ✅ |
| HIST-6.10-01 | MAX_HISTORY pruning: caps entries at 100 and keeps most recent | ✅ |
| HIST-6.10-02 | MAX_HISTORY pruning: pins saved entry at index 0 when it would be pruned | ✅ |
| HIST-6.10-03 | savedEntryPinned: canUndo is false when currentIndex is 1 (pinned boundary) | ✅ |
| HIST-6.10-04 | savedEntryPinned: undo() returns null when currentIndex is 1 | ✅ |
| HIST-6.11-01 | getLatestState: returns current ref values synchronously | ✅ |

## HIST-7 — useHistoryFileSync

| ID | Scenario | Status |
|----|----------|--------|
| HIST-7.1-01 | initHistory with no handle: seeds a "File loaded" entry with the file content as snapshot | ✅ |
| HIST-7.2-01 | initHistory with matching checksum: restores entries from disk and preserves currentIndex/savedIndex | ✅ |
| HIST-7.3-01 | initHistory with mismatched checksum: discards stale history and seeds a fresh "File loaded" entry | ✅ |
| HIST-7.4-01 | onFileSave: marks the saved position and schedules a debounced write | ✅ |
| HIST-7.5-01 | clearHistory: resets state to empty and cancels any pending debounced writes | ✅ |
| HIST-7.6-01 | debounce write: does not write immediately after recordAction | ✅ |
| HIST-7.6-02 | debounce write: writes after 1000 ms following recordAction | ✅ |
| HIST-7.6-03 | debounce write: does not write when no dirHandle is provided | ✅ |
| HIST-7.6-04 | debounce write: multiple rapid recordActions coalesce into a single write | ✅ |
| HIST-7.7-01 | file switch: re-init clears prior entries and seeds fresh history for new file | ✅ |

## HIST-8 — useDocumentHistory

| ID | Scenario | Status |
|----|----------|--------|
| HIST-8.1-01 | onFileSave: flushes pending debounce as "Draft" when content differs from current entry, then marks savedIndex — no separate "Saved" entry recorded | ✅ |
| HIST-8.1-02 | onFileSave: does not record a new entry when content matches current snapshot | ✅ |
| HIST-8.2-01 | onBlockChange: records "Block changed" entry when content differs from current entry snapshot | ✅ |
| HIST-8.2-02 | onBlockChange: is a no-op when content matches current entry snapshot | ✅ |
| HIST-8.2-03 | onBlockChange: cancels any pending debounce timer | ✅ |
| HIST-8.3-01 | goToSaved: returns saved snapshot and positions currentIndex at savedIndex | ✅ |
| HIST-8.4-01 | onContentChange: does not record an entry immediately | ✅ |
| HIST-8.4-02 | onContentChange: records a "Draft" entry after 5 s | ✅ |
| HIST-8.4-03 | onContentChange: resets the debounce timer on subsequent calls | ✅ |
| HIST-8.4-04 | onContentChange: is a no-op when content is identical to the current snapshot | ✅ |

## HIST-9 — useDiagramHistory

| ID | Scenario | Status |
|----|----------|--------|
| HIST-9.1-01 | initHistory with no handle: seeds a "File loaded" entry with the diagram snapshot | ✅ |
| HIST-9.1-02 | initHistory with matching checksum: restores history from disk | ✅ |
| HIST-9.2-01 | recordAction: appends entry and advances currentIndex | ✅ |
| HIST-9.3-01 | canUndo/canRedo: both false at single-entry initial state | ✅ |
| HIST-9.3-02 | canUndo/canRedo: canUndo=true, canRedo=false after recording an action | ✅ |
| HIST-9.3-03 | canUndo/canRedo: canUndo=false, canRedo=true after undoing to the first entry | ✅ |
| HIST-9.4-01 | undo: returns the previous snapshot | ✅ |
| HIST-9.4-02 | redo: returns the next snapshot | ✅ |
| HIST-9.4-03 | undo: returns null at the first entry | ✅ |
| HIST-9.5-01 | goToEntry: navigates to a specific index and returns its snapshot | ✅ |
| HIST-9.6-01 | onSave: is an alias for onFileSave — marks the saved position | ✅ |
