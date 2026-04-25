# File Watching — Design Spec

**Date:** 2026-04-25
**Status:** Approved

---

## Overview

Add live file-watching to the knowledge-base app so that changes made to vault files outside the app (e.g. in VS Code, terminal) are picked up automatically and reflected in:

- The **explorer tree** (new/deleted/renamed files appear immediately)
- The **open document or diagram** (content updates in the editor)
- **Closed files** (their `.history.json` sidecars are kept current)

Since the app is browser-only (File System Access API, no Node.js), all watching is done via polling. The existing `scanTree()`, repository layer (`documentRepo`, `diagramRepo`), and history system (`useHistoryFileSync`, `useHistoryCore`) provide the foundation.

---

## Architecture

A `FileWatcherProvider` React context sits just inside the vault-open gate in `knowledgeBase.tsx`. It owns a single 5-second polling interval and exposes a subscriber registry. Three named subscribers register at startup:

```
FileWatcherProvider
├── 5s interval (paused when tab hidden)
├── subscriber: "tree"        → useFileExplorer.rescan() → diff → update explorer
├── subscriber: "content"     → read open file → diff → reload or conflict prompt
└── subscriber: "background"  → iterate all other files → update .history.json sidecars
```

`refresh()` is exposed on the context and fires all subscribers immediately. The existing manual refresh button calls `context.refresh()` instead of just `rescan()`, so it now covers both tree and open-file content in one action.

---

## Context API

```typescript
interface FileWatcherContextValue {
  subscribe: (id: string, fn: () => Promise<void>) => void;
  unsubscribe: (id: string) => void;
  refresh: () => void;
}
```

**Provider internals:**
- Internal `Map<string, () => Promise<void>>` of named subscribers
- One `setInterval` at 5000ms
- On each tick: `Promise.all([...subscribers.values()].map(fn => fn()))`
- Pauses on `document.visibilitychange` (hidden) — resumes and fires immediately on visible
- `refresh()` calls all subscribers outside the interval (manual trigger)

---

## Subscriber 1 — Tree (`"tree"`)

Registered by `useFileExplorer`.

On each tick:
1. Call `rescan()` — re-runs `scanTree()` over the vault directory handle
2. Diff new tree against previous tree
3. Update explorer state (new files appear, deleted ones disappear, renames update)

No toast or history interaction — purely structural.

---

## Subscriber 2 — Open File Content (`"content"`)

Registered by `useDocumentContent` (for `.md` files) or `useDiagramPersistence` (for `.json` diagrams).

On each tick:
1. Read the current file via `documentRepo.read()` / `diagramRepo.read()`
2. Compute `fnv1a(newContent)` — compare to the last-known checksum
3. **If unchanged:** no-op

**If changed and no draft (clean):**
1. `history.recordAction("Reloaded from disk", newSnapshot)`
2. `history.markSaved()` — saved point moves to this entry
3. `markClean(filePath)`
4. Show toast: `"File reloaded from disk"` (auto-dismisses after 3s)

**If changed and dirty (unsaved edits in editor):**
1. Store incoming content in `pendingExternalContent` ref — suppresses re-prompt for same disk state
2. Show conflict banner inside the editor (non-blocking — user can read their edits):
   - Message: `"This file was changed outside the app"`
   - Button **Reload from disk:**
     - `history.recordAction("Reloaded from disk", newSnapshot)` + `history.markSaved()`
     - Discard draft, `markClean(filePath)`
     - Dismiss banner, show toast
   - Button **Keep my edits:**
     - Store current external checksum as `dismissedChecksum`
     - Dismiss banner silently
     - No re-prompt unless the disk file changes *again* (new checksum differs from `dismissedChecksum`)

---

## Subscriber 3 — Background Scanner (`"background"`)

Registered by a new `useBackgroundScanner` hook. Runs for all files in the tree that are **not** currently open.

On each tick:
1. Get full file list from `useFileExplorer`
2. Skip the currently-open file (handled by subscriber 2)
3. For each file that has a `.history.json` sidecar:
   - Read sidecar via `readHistoryFile()` → get stored `checksum`
   - Read current file content from disk
   - Compute `fnv1a(currentContent)` — if matches sidecar checksum → no-op
   - **If different and no draft:**
     - Append `recordAction("Reloaded from disk", diskSnapshot)` to sidecar entries
     - `markSaved()` → update `savedIndex` and `checksum`
     - Write updated sidecar via `writeHistoryFile()`
     - `markClean(filePath)`
     - Collect in `updatedFiles[]`
   - **If different and has draft:**
     - Read draft snapshot: `entries[currentIndex].snapshot` from sidecar
     - Append `recordAction("Unsaved changes (auto-preserved)", draftSnapshot)` — preserves draft as a recoverable history entry
     - Read new disk content
     - Append `recordAction("Reloaded from disk", diskSnapshot)`
     - `markSaved()` → `savedIndex` moves to disk entry, checksum updated
     - Write updated sidecar
     - `markClean(filePath)` — file is now clean against disk; draft lives in history
     - Collect in `updatedFiles[]`
4. After processing all files: if `updatedFiles.length > 0`, show a single batched toast:
   - 1 file: `"File reloaded from disk"`
   - N files: `"N files reloaded from disk"`

When the user later opens a file that had its draft auto-preserved, they land on the disk version. Their unsaved changes sit one undo step above the saved point — fully recoverable via undo.

---

## UI Components

### Toast

- **Location:** Existing `ShellErrorContext` notification layer extended with `info` level, or a new lightweight `useToast` hook if `ShellErrorContext` is error-only
- **Duration:** 3 seconds, auto-dismiss
- **Variants:**
  - `"File reloaded from disk"` — open file or single background file
  - `"N files reloaded from disk"` — batched background files

### Conflict Banner

- **Location:** Inside the editor area (document or diagram view), above the content
- **Trigger:** Open file changes on disk while a draft exists
- **Non-blocking:** User can still read and interact with their edits
- **Buttons:** `Reload from disk` | `Keep my edits`
- **Persistence:** Banner stays until the user makes a choice

---

## History Integration

All history writes use the existing primitives:

| Operation | API |
|-----------|-----|
| Add a snapshot | `history.recordAction(description, snapshot)` |
| Move saved point | `history.markSaved()` |
| Direct sidecar I/O (background) | `readHistoryFile()` / `writeHistoryFile()` |
| Mark file clean | `markClean(filePath)` from `useDrafts` |

Checksum comparison uses `fnv1a()` from `historyPersistence.ts` — consistent with how the history system already detects external changes on file load.

---

## Key Files

| File | Change |
|------|--------|
| `src/app/knowledge_base/shared/context/FileWatcherContext.tsx` | New — provider + context |
| `src/app/knowledge_base/shared/hooks/useBackgroundScanner.ts` | New — background file scanner subscriber |
| `src/app/knowledge_base/shared/hooks/useFileWatcher.ts` | New — consumer hook (`useContext(FileWatcherContext)`) |
| `src/app/knowledge_base/shared/hooks/useDocumentContent.ts` | Add content subscriber registration |
| `src/app/knowledge_base/infrastructure/useDiagramPersistence.ts` | Add content subscriber registration |
| `src/app/knowledge_base/features/explorer/useFileExplorer.ts` | Register tree subscriber, expose `rescan` to context |
| `knowledgeBase.tsx` | Wrap with `FileWatcherProvider`, wire manual refresh to `context.refresh()` |
| `src/app/knowledge_base/shared/components/ConflictBanner.tsx` | New — conflict UI component |
| `src/app/knowledge_base/shared/hooks/useToast.ts` | New (if `ShellErrorContext` is error-only) |

---

## Out of Scope

- Files without a `.history.json` sidecar are not background-scanned (no baseline checksum to diff against)
- No conflict prompt for background files — draft is auto-preserved in history; user decides on next open
- No configurable polling interval (fixed at 5s; can be added later as a vault setting)
- No `File System Observer API` usage (not yet available in browsers)
