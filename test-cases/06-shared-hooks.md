# Test Cases — Shared Hooks & Utilities

## HIST-6 — useHistoryCore

| ID | Scenario | Status |
|----|----------|--------|
| HIST-6.1-01 | initial state: starts with empty entries and index -1 | ✅ |
| HIST-6.1-02 | initial state: canUndo and canRedo are both false | ✅ |
| HIST-6.2-01 | initEntries: sets entries array and currentIndex | ✅ |
| HIST-6.2-02 | initEntries: sets savedIndex | ✅ |
| HIST-6.2-03 | initEntries: canUndo/canRedo reflect position correctly | ✅ |
| HIST-6.3-01 | recordAction: appends entry and advances currentIndex | ✅ |
| HIST-6.3-02 | recordAction: canUndo becomes true after first record | ✅ |
| HIST-6.3-03 | recordAction: truncates redo branch when recording after undo | ✅ |
| HIST-6.4-01 | undo: returns previous snapshot and decrements index | ✅ |
| HIST-6.4-02 | undo: returns null when already at beginning | ✅ |
| HIST-6.4-03 | redo: returns next snapshot and increments index | ✅ |
| HIST-6.4-04 | redo: returns null when already at end | ✅ |
| HIST-6.5-01 | goToEntry: jumps to any valid index and returns its snapshot | ✅ |
| HIST-6.5-02 | goToEntry: returns null for out-of-range index | ✅ |
| HIST-6.6-01 | goToSaved: jumps to savedIndex and returns its snapshot | ✅ |
| HIST-6.7-01 | markSaved: updates savedIndex to currentIndex | ✅ |
| HIST-6.8-01 | clear: resets entries to empty and index to -1 | ✅ |
| HIST-6.8-02 | clear: resets savedIndex to -1 and clears canUndo/canRedo | ✅ |
| HIST-6.9-01 | onStateChange callback: fires after recordAction | ✅ |
| HIST-6.9-02 | onStateChange callback: fires after undo | ✅ |
| HIST-6.10-01 | MAX_HISTORY pruning: caps entries at 100 and keeps most recent | ✅ |
| HIST-6.10-02 | MAX_HISTORY pruning: pins saved entry at index 0 when it would be pruned | ✅ |
| HIST-6.11-01 | getLatestState: returns current ref values synchronously | ✅ |

## HIST-7 — useHistoryFileSync

| ID | Scenario | Status |
|----|----------|--------|
| HIST-7.1-01 | initHistory with no handle: seeds a "File loaded" entry with the file content as snapshot | ✅ |
| HIST-7.2-01 | initHistory with matching checksum: restores entries from disk and preserves currentIndex/savedIndex | ✅ |
| HIST-7.3-01 | initHistory with mismatched checksum: discards stale history and seeds a fresh "File loaded" entry | ✅ |
| HIST-7.4-01 | onFileSave: marks the saved position and schedules a debounced write | ✅ |
| HIST-7.5-01 | clearHistory: resets state to empty and cancels any pending debounced writes | ✅ |

## HIST-8 — useDocumentHistory

| ID | Scenario | Status |
|----|----------|--------|
| HIST-8.1-01 | onFileSave: flushes pending debounce as "Draft" when content differs from current entry, then marks savedIndex — no separate "Saved" entry recorded | ✅ |
| HIST-8.1-02 | onFileSave: does not record a new entry when content matches current snapshot | ✅ |
| HIST-8.2-01 | onBlockChange: records "Block changed" entry when content differs from current entry snapshot | ❌ |
| HIST-8.2-02 | onBlockChange: is a no-op when content matches current entry snapshot | ❌ |
| HIST-8.3-01 | goToSaved: returns saved snapshot and positions currentIndex at savedIndex | ✅ |
