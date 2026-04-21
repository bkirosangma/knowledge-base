# Shared Action History Design

**Date:** 2026-04-20  
**Status:** Approved

## Overview

Refactor the diagram-only `useActionHistory` into a reusable history system shared by both the diagram and document editors. All undo, redo, discard, and save interactions become standard across the project. Document history uses coarse checkpoints (not keystroke-level). Cmd+Z / Cmd+Shift+Z work identically in both editors.

---

## Layer Architecture

```
shared/utils/historyPersistence.ts   — fnv1a, file read/write helpers
shared/hooks/useHistoryCore.ts       — generic state machine, accepts onStateChange cb
shared/hooks/useHistoryFileSync.ts   — core + file persistence (init, checksum, debounced write)
shared/hooks/useDiagramHistory.ts    — useHistoryFileSync<DiagramSnapshot>
shared/hooks/useDocumentHistory.ts   — useHistoryFileSync<string> + checkpoint triggers
shared/components/HistoryPanel.tsx   — moved from diagram/components/
features/document/hooks/useDocumentKeyboardShortcuts.ts  — Cmd+Z / Cmd+Shift+Z for docs
```

Each layer has exactly one reason to change (SRP). Layers depend on abstractions, not concrete snapshot types (DIP).

---

## Layer 1 — `shared/utils/historyPersistence.ts`

Pure file I/O utilities. No React. No snapshot types.

**Exports:**
- `fnv1a(str: string): string` — fast non-cryptographic checksum
- `historyFileName(filePath: string): string` — derives `.foo.history.json` from `foo.json` / `foo.md`
- `resolveParentHandle(rootHandle, filePath): Promise<FileSystemDirectoryHandle>`
- `readHistoryFile<T>(rootHandle, filePath): Promise<HistoryFile<T> | null>`
- `writeHistoryFile<T>(rootHandle, filePath, data: HistoryFile<T>): Promise<void>`

**Types** (defined here, imported by all layers above):
```ts
export interface HistoryEntry<T> {
  id: number;
  description: string;
  timestamp: number;
  snapshot: T;
}

export interface HistoryFile<T> {
  checksum: string;
  currentIndex: number;
  savedIndex: number;
  entries: HistoryEntry<T>[];
}
```

---

## Layer 2 — `shared/hooks/useHistoryCore.ts`

Pure state machine. No file I/O. No knowledge of `T`'s shape.

**Note:** `HistoryEntry<T>` is defined in `historyPersistence.ts` and re-exported from here so diagram/document code imports types from one place.

**Hook signature:**
```ts
function useHistoryCore<T>(options?: {
  onStateChange?: () => void;
}): HistoryCore<T>
```

**`HistoryCore<T>` interface:**
```ts
interface HistoryCore<T> {
  entries: HistoryEntry<T>[];
  currentIndex: number;
  savedIndex: number;
  savedEntryPinned: boolean;
  canUndo: boolean;
  canRedo: boolean;
  recordAction(description: string, snapshot: T): void;
  undo(): T | null;
  redo(): T | null;
  goToEntry(index: number): T | null;
  goToSaved(): T | null;
  initEntries(entries: HistoryEntry<T>[], currentIndex: number, savedIndex: number): void;
  markSaved(): void;
  clear(): void;
}
```

`onStateChange` is called after every mutation (`recordAction`, `undo`, `redo`, `goToEntry`, `markSaved`). Adapters use this to schedule debounced disk writes without the core knowing about persistence.

---

## Layer 3 — `shared/hooks/useHistoryFileSync.ts`

Wraps `useHistoryCore<T>` and adds file persistence. Shared by both adapters — **no duplication**.

**Adds on top of `HistoryCore<T>`:**
- `dirHandleRef`, `activeFileRef`, `checksumRef`, `saveTimerRef` — internal refs
- `initHistory(fileContent, initialSnapshot, dirHandle, filePath)` — reads history file from disk, validates checksum against `fileContent`, calls `core.initEntries` on match, otherwise seeds a fresh "File loaded" entry
- `onFileSave(fileContent)` — updates checksum, calls `core.markSaved()`, schedules write
- `clearHistory()` — cancels pending timer, calls `core.clear()`, resets all refs

**Hook signature:**
```ts
function useHistoryFileSync<T>(): HistoryFileSync<T>

type HistoryFileSync<T> = HistoryCore<T> & {
  initHistory(fileContent: string, initialSnapshot: T, dirHandle: FileSystemDirectoryHandle | null, filePath: string | null): Promise<void>;
  onFileSave(fileContent: string): void;
  clearHistory(): void;
}
```

---

## Layer 4a — `shared/hooks/useDiagramHistory.ts`

Thin adapter. Wraps `useHistoryFileSync<DiagramSnapshot>` and re-exports with the naming that existing diagram call sites expect.

```ts
function useDiagramHistory(): DiagramHistory

type DiagramHistory = HistoryFileSync<DiagramSnapshot> & {
  onSave(diagramJson: string): void;  // alias for onFileSave
}
```

**Migration:** All references to `useActionHistory` → `useDiagramHistory`. `DiagramSnapshot` and `HistoryEntry` types are re-exported from this module so diagram code imports from one place.

---

## Layer 4b — `shared/hooks/useDocumentHistory.ts`

Wraps `useHistoryFileSync<string>` and adds document-specific checkpoint triggers.

**Checkpoint triggers:**
| Trigger | Description label | Debounce |
|---------|------------------|----------|
| File opened | `"File loaded"` | immediate |
| Explicit save | `"Saved"` | immediate |
| Block changed (cursor moves to different block) | `"Block changed"` | immediate (cancels pending debounce) |
| Typing pause | `"Draft"` | 5s idle |

**Additional exports:**
```ts
function useDocumentHistory(): DocumentHistory

interface DocumentHistory extends HistoryFileSync<string> {
  onBlockChange(content: string): void;   // immediate checkpoint, cancel debounce
  onContentChange(content: string): void; // resets debounce timer
}
```

Undo/redo returns the raw `string` snapshot. Callers pass it to `updateContent(snapshot)`.

---

## Layer 5 — `shared/components/HistoryPanel.tsx`

**Moved from** `features/diagram/components/HistoryPanel.tsx` → `shared/components/HistoryPanel.tsx`.

Only type change: `entries: HistoryEntry<unknown>[]`. The panel reads only `.id`, `.description`, `.timestamp` — never `.snapshot`. All existing tests remain valid with a path update.

---

## Document Editor Integration

### Disabling Tiptap native undo

In `MarkdownEditor.tsx`, filter the History extension out:

```ts
extensions: baseExtensions.filter(e => e.name !== 'history')
```

Cmd+Z no longer triggers keystroke-level undo inside the editor.

### `useDocumentKeyboardShortcuts` (new)

Lives at `features/document/hooks/useDocumentKeyboardShortcuts.ts`. Mirrors `useKeyboardShortcuts` in the diagram feature.

```ts
function useDocumentKeyboardShortcuts(options: {
  onUndo: () => void;
  onRedo: () => void;
  readOnly: boolean;
}): void
```

Attaches a `keydown` listener to `window`:
- `Cmd+Z` (no shift) → `onUndo()`
- `Cmd+Shift+Z` → `onRedo()`

Skips if `readOnly` is true.

### `DocumentView` wiring

```ts
const history = useDocumentHistory();

// Keyboard shortcuts
useDocumentKeyboardShortcuts({
  onUndo: () => { const s = history.undo(); if (s !== null) updateContent(s); },
  onRedo: () => { const s = history.redo(); if (s !== null) updateContent(s); },
  readOnly,
});
```

### `DocumentProperties` receives history

`HistoryPanel` is rendered inside `DocumentProperties` (right sidebar), same position as in the diagram's `PropertiesPanel`. `DocumentView` passes the `history` object down.

### `MarkdownEditor` emits block-change events

`MarkdownEditor` receives an `onBlockChange` prop. The Tiptap `onSelectionUpdate` callback checks whether the cursor's `$anchor.parent` node changed and fires `onBlockChange(editor.getText())` if so.

---

## Renamed / Moved Files

| From | To |
|------|----|
| `shared/hooks/useActionHistory.ts` | `shared/hooks/useHistoryCore.ts` + `useHistoryFileSync.ts` + `useDiagramHistory.ts` |
| `features/diagram/components/HistoryPanel.tsx` | `shared/components/HistoryPanel.tsx` |
| `shared/hooks/useActionHistory.test.ts` | `shared/hooks/useDiagramHistory.test.ts` (+ new tests for core and file sync) |
| `features/diagram/components/HistoryPanel.test.tsx` | `shared/components/HistoryPanel.test.tsx` |

---

## Test Strategy

- **`useHistoryCore`** — unit tests for all state transitions: record, undo, redo, goTo, prune at MAX_HISTORY, pinned saved entry, `onStateChange` callback firing
- **`useHistoryFileSync`** — integration tests with a fake `FileSystemDirectoryHandle`: init with matching checksum, init with mismatched checksum, `onFileSave` updates checksum, debounced write fires
- **`useDiagramHistory`** — thin smoke test confirming `onSave` alias works; bulk of logic covered by layers below
- **`useDocumentHistory`** — unit tests for checkpoint trigger rules: block change cancels debounce, idle fires after 5s, explicit save records "Saved" entry
- **`HistoryPanel`** — existing tests pass with updated import path; add a test with `string`-snapshot entries to confirm no snapshot type assumption

---

## What Does Not Change

- `DiagramSnapshot` type definition (stays in diagram feature or re-exported from `useDiagramHistory`)
- `DiagramView` save/discard/undo call sites — just updated import paths
- `PropertiesPanel` HistoryPanel wiring — just updated import path
- Document `dirty`/`save`/`discard` pattern in `useDocumentContent` — `useDocumentHistory` complements it, does not replace it
