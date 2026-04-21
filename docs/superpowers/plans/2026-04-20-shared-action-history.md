# Shared Action History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the diagram-only `useActionHistory` into a four-layer shared history system (`useHistoryCore` → `useHistoryFileSync` → `useDiagramHistory` / `useDocumentHistory`) so both editors share one undo/redo/save/discard UI and pattern.

**Architecture:** A generic `useHistoryCore<T>` owns the pure state machine; `useHistoryFileSync<T>` wraps it with file persistence; `useDiagramHistory` and `useDocumentHistory` are thin domain adapters; `HistoryPanel` moves to `shared/components/` and renders identically for both editors. Document checkpoints fire on file open, explicit save, block change (immediate), and 5 s idle debounce. Tiptap's native History extension is disabled — Cmd+Z / Cmd+Shift+Z route through the shared panel.

**Tech Stack:** TypeScript, React hooks, Vitest + @testing-library/react, Tiptap v3, File System Access API.

---

## File Map

| Action | Path |
|--------|------|
| Create | `src/app/knowledge_base/shared/utils/historyPersistence.ts` |
| Create | `src/app/knowledge_base/shared/utils/historyPersistence.test.ts` |
| Create | `src/app/knowledge_base/shared/hooks/useHistoryCore.ts` |
| Create | `src/app/knowledge_base/shared/hooks/useHistoryCore.test.ts` |
| Create | `src/app/knowledge_base/shared/hooks/useHistoryFileSync.ts` |
| Create | `src/app/knowledge_base/shared/hooks/useHistoryFileSync.test.ts` |
| Create | `src/app/knowledge_base/shared/hooks/useDiagramHistory.ts` |
| Create | `src/app/knowledge_base/shared/hooks/useDiagramHistory.test.ts` |
| Create | `src/app/knowledge_base/shared/components/HistoryPanel.tsx` |
| Create | `src/app/knowledge_base/shared/components/HistoryPanel.test.tsx` |
| Create | `src/app/knowledge_base/shared/hooks/useDocumentHistory.ts` |
| Create | `src/app/knowledge_base/shared/hooks/useDocumentHistory.test.ts` |
| Create | `src/app/knowledge_base/features/document/hooks/useDocumentKeyboardShortcuts.ts` |
| Create | `src/app/knowledge_base/features/document/hooks/useDocumentKeyboardShortcuts.test.ts` |
| Modify | `src/app/knowledge_base/features/document/components/MarkdownEditor.tsx` |
| Modify | `src/app/knowledge_base/features/document/components/MarkdownPane.tsx` |
| Modify | `src/app/knowledge_base/features/document/properties/DocumentProperties.tsx` |
| Modify | `src/app/knowledge_base/features/document/DocumentView.tsx` |
| Modify | `src/app/knowledge_base/features/diagram/DiagramView.tsx` |
| Modify | `src/app/knowledge_base/features/diagram/components/DiagramOverlays.tsx` |
| Modify | `src/app/knowledge_base/features/diagram/properties/PropertiesPanel.tsx` |
| Modify | `src/app/knowledge_base/shared/hooks/useFileActions.ts` |
| Delete | `src/app/knowledge_base/shared/hooks/useActionHistory.ts` |
| Delete | `src/app/knowledge_base/shared/hooks/useActionHistory.test.ts` |
| Delete | `src/app/knowledge_base/features/diagram/components/HistoryPanel.tsx` |
| Delete | `src/app/knowledge_base/features/diagram/components/HistoryPanel.test.tsx` |

---

## Task 1: `historyPersistence.ts` — shared file I/O utilities and types

**Files:**
- Create: `src/app/knowledge_base/shared/utils/historyPersistence.ts`
- Create: `src/app/knowledge_base/shared/utils/historyPersistence.test.ts`

- [ ] **Step 1.1 — Write failing tests for pure utilities**

```ts
// src/app/knowledge_base/shared/utils/historyPersistence.test.ts
import { describe, it, expect } from 'vitest'
import { fnv1a, historyFileName } from './historyPersistence'

describe('fnv1a', () => {
  it('returns an 8-char hex string', () => {
    expect(fnv1a('hello')).toMatch(/^[0-9a-f]{8}$/)
  })
  it('returns the same hash for the same input', () => {
    expect(fnv1a('abc')).toBe(fnv1a('abc'))
  })
  it('returns different hashes for different inputs', () => {
    expect(fnv1a('abc')).not.toBe(fnv1a('xyz'))
  })
})

describe('historyFileName', () => {
  it('strips .json extension', () => {
    expect(historyFileName('diagram.json')).toBe('.diagram.history.json')
  })
  it('strips .md extension', () => {
    expect(historyFileName('notes.md')).toBe('.notes.history.json')
  })
  it('preserves directory prefix', () => {
    expect(historyFileName('docs/notes.md')).toBe('docs/.notes.history.json')
  })
  it('handles nested paths', () => {
    expect(historyFileName('a/b/c.json')).toBe('a/b/.c.history.json')
  })
})
```

- [ ] **Step 1.2 — Run tests to confirm they fail**

```bash
npx vitest run src/app/knowledge_base/shared/utils/historyPersistence.test.ts
```

Expected: `Cannot find module './historyPersistence'`

- [ ] **Step 1.3 — Implement `historyPersistence.ts`**

```ts
// src/app/knowledge_base/shared/utils/historyPersistence.ts

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

export function fnv1a(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function historyFileName(filePath: string): string {
  const parts = filePath.split("/");
  const name = parts.pop()!;
  const dir = parts.join("/");
  const histName = `.${name.replace(/\.(json|md)$/, "")}.history.json`;
  return dir ? `${dir}/${histName}` : histName;
}

export async function resolveParentHandle(
  rootHandle: FileSystemDirectoryHandle,
  filePath: string,
): Promise<FileSystemDirectoryHandle> {
  const parts = filePath.split("/").filter(Boolean);
  parts.pop();
  let current = rootHandle;
  for (const part of parts) {
    current = await current.getDirectoryHandle(part);
  }
  return current;
}

export async function readHistoryFile<T>(
  rootHandle: FileSystemDirectoryHandle,
  filePath: string,
): Promise<HistoryFile<T> | null> {
  try {
    const histPath = historyFileName(filePath);
    const parentHandle = await resolveParentHandle(rootHandle, histPath);
    const fileName = histPath.split("/").pop()!;
    const fileHandle = await parentHandle.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    const text = await file.text();
    return JSON.parse(text) as HistoryFile<T>;
  } catch {
    return null;
  }
}

export async function writeHistoryFile<T>(
  rootHandle: FileSystemDirectoryHandle,
  filePath: string,
  data: HistoryFile<T>,
): Promise<void> {
  try {
    const histPath = historyFileName(filePath);
    const parentHandle = await resolveParentHandle(rootHandle, histPath);
    const fileName = histPath.split("/").pop()!;
    const fileHandle = await parentHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(data));
    await writable.close();
  } catch {
    // Silently ignore write failures
  }
}
```

- [ ] **Step 1.4 — Run tests to confirm they pass**

```bash
npx vitest run src/app/knowledge_base/shared/utils/historyPersistence.test.ts
```

Expected: all 7 tests pass.

- [ ] **Step 1.5 — Commit**

```bash
git add src/app/knowledge_base/shared/utils/historyPersistence.ts \
        src/app/knowledge_base/shared/utils/historyPersistence.test.ts
git commit -m "feat(history): add historyPersistence utilities and HistoryEntry/HistoryFile types"
```

---

## Task 2: `useHistoryCore.ts` — generic state machine

Migrates all state-machine logic out of `useActionHistory.ts`. The existing `useActionHistory.test.ts` tests cover this layer; migrate them to the new file.

**Files:**
- Create: `src/app/knowledge_base/shared/hooks/useHistoryCore.ts`
- Create: `src/app/knowledge_base/shared/hooks/useHistoryCore.test.ts`

- [ ] **Step 2.1 — Write failing tests (migrated from `useActionHistory.test.ts`)**

```ts
// src/app/knowledge_base/shared/hooks/useHistoryCore.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useHistoryCore } from './useHistoryCore'
import type { HistoryEntry } from '../utils/historyPersistence'

function makeSnapshot(label: string) { return { label } as unknown as { label: string } }

type S = { label: string }

function makeEntry(id: number, description: string, snapshot: S): HistoryEntry<S> {
  return { id, description, timestamp: Date.now(), snapshot }
}

describe('useHistoryCore — initial state', () => {
  it('starts empty with index -1', () => {
    const { result } = renderHook(() => useHistoryCore<S>())
    expect(result.current.entries).toHaveLength(0)
    expect(result.current.currentIndex).toBe(-1)
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(false)
  })
})

describe('useHistoryCore — initEntries', () => {
  it('sets entries and currentIndex', () => {
    const { result } = renderHook(() => useHistoryCore<S>())
    const entries = [makeEntry(0, 'File loaded', makeSnapshot('v0'))]
    act(() => { result.current.initEntries(entries, 0, 0) })
    expect(result.current.entries).toHaveLength(1)
    expect(result.current.currentIndex).toBe(0)
    expect(result.current.savedIndex).toBe(0)
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(false)
  })
})

describe('useHistoryCore — recordAction', () => {
  it('appends entry and advances index', () => {
    const { result } = renderHook(() => useHistoryCore<S>())
    act(() => { result.current.initEntries([makeEntry(0, 'init', makeSnapshot('v0'))], 0, 0) })
    act(() => { result.current.recordAction('edit', makeSnapshot('v1')) })
    expect(result.current.entries).toHaveLength(2)
    expect(result.current.currentIndex).toBe(1)
    expect(result.current.canUndo).toBe(true)
    expect(result.current.canRedo).toBe(false)
  })

  it('truncates redo branch when recording after undo', () => {
    const { result } = renderHook(() => useHistoryCore<S>())
    act(() => { result.current.initEntries([makeEntry(0, 'init', makeSnapshot('v0'))], 0, 0) })
    act(() => { result.current.recordAction('A', makeSnapshot('vA')) })
    act(() => { result.current.undo() })
    act(() => { result.current.recordAction('B', makeSnapshot('vB')) })
    expect(result.current.entries).toHaveLength(2)
    expect(result.current.entries[1].description).toBe('B')
  })
})

describe('useHistoryCore — undo / redo', () => {
  it('undo returns previous snapshot', () => {
    const { result } = renderHook(() => useHistoryCore<S>())
    act(() => { result.current.initEntries([makeEntry(0, 'init', makeSnapshot('v0'))], 0, 0) })
    act(() => { result.current.recordAction('edit', makeSnapshot('v1')) })
    let snapshot: S | null = null
    act(() => { snapshot = result.current.undo() })
    expect(snapshot).toEqual(makeSnapshot('v0'))
    expect(result.current.currentIndex).toBe(0)
  })

  it('redo returns next snapshot', () => {
    const { result } = renderHook(() => useHistoryCore<S>())
    act(() => { result.current.initEntries([makeEntry(0, 'init', makeSnapshot('v0'))], 0, 0) })
    act(() => { result.current.recordAction('edit', makeSnapshot('v1')) })
    act(() => { result.current.undo() })
    let snapshot: S | null = null
    act(() => { snapshot = result.current.redo() })
    expect(snapshot).toEqual(makeSnapshot('v1'))
    expect(result.current.currentIndex).toBe(1)
  })

  it('undo returns null at beginning', () => {
    const { result } = renderHook(() => useHistoryCore<S>())
    act(() => { result.current.initEntries([makeEntry(0, 'init', makeSnapshot('v0'))], 0, 0) })
    let snapshot: S | null = makeSnapshot('x')
    act(() => { snapshot = result.current.undo() })
    expect(snapshot).toBeNull()
  })

  it('redo returns null at end', () => {
    const { result } = renderHook(() => useHistoryCore<S>())
    act(() => { result.current.initEntries([makeEntry(0, 'init', makeSnapshot('v0'))], 0, 0) })
    let snapshot: S | null = makeSnapshot('x')
    act(() => { snapshot = result.current.redo() })
    expect(snapshot).toBeNull()
  })
})

describe('useHistoryCore — goToEntry', () => {
  it('jumps to any index and returns that snapshot', () => {
    const { result } = renderHook(() => useHistoryCore<S>())
    act(() => { result.current.initEntries([makeEntry(0, 'init', makeSnapshot('v0'))], 0, 0) })
    act(() => { result.current.recordAction('A', makeSnapshot('vA')) })
    act(() => { result.current.recordAction('B', makeSnapshot('vB')) })
    let snapshot: S | null = null
    act(() => { snapshot = result.current.goToEntry(0) })
    expect(snapshot).toEqual(makeSnapshot('v0'))
    expect(result.current.currentIndex).toBe(0)
  })

  it('returns null for out-of-range index', () => {
    const { result } = renderHook(() => useHistoryCore<S>())
    act(() => { result.current.initEntries([makeEntry(0, 'init', makeSnapshot('v0'))], 0, 0) })
    let snapshot: S | null = makeSnapshot('x')
    act(() => { snapshot = result.current.goToEntry(99) })
    expect(snapshot).toBeNull()
  })
})

describe('useHistoryCore — goToSaved', () => {
  it('jumps to savedIndex and returns its snapshot', () => {
    const { result } = renderHook(() => useHistoryCore<S>())
    act(() => { result.current.initEntries([makeEntry(0, 'init', makeSnapshot('v0'))], 0, 0) })
    act(() => { result.current.recordAction('edit', makeSnapshot('v1')) })
    act(() => { result.current.markSaved() })
    act(() => { result.current.recordAction('unsaved', makeSnapshot('v2')) })
    let snapshot: S | null = null
    act(() => { snapshot = result.current.goToSaved() })
    expect(snapshot).toEqual(makeSnapshot('v1'))
    expect(result.current.currentIndex).toBe(1)
  })
})

describe('useHistoryCore — markSaved', () => {
  it('updates savedIndex to currentIndex', () => {
    const { result } = renderHook(() => useHistoryCore<S>())
    act(() => { result.current.initEntries([makeEntry(0, 'init', makeSnapshot('v0'))], 0, 0) })
    act(() => { result.current.recordAction('edit', makeSnapshot('v1')) })
    act(() => { result.current.markSaved() })
    expect(result.current.savedIndex).toBe(1)
  })
})

describe('useHistoryCore — clear', () => {
  it('resets everything to empty state', () => {
    const { result } = renderHook(() => useHistoryCore<S>())
    act(() => { result.current.initEntries([makeEntry(0, 'init', makeSnapshot('v0'))], 0, 0) })
    act(() => { result.current.recordAction('edit', makeSnapshot('v1')) })
    act(() => { result.current.clear() })
    expect(result.current.entries).toHaveLength(0)
    expect(result.current.currentIndex).toBe(-1)
    expect(result.current.savedIndex).toBe(-1)
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(false)
  })
})

describe('useHistoryCore — onStateChange callback', () => {
  it('fires after recordAction', () => {
    const onStateChange = vi.fn()
    const { result } = renderHook(() => useHistoryCore<S>({ onStateChange }))
    act(() => { result.current.initEntries([makeEntry(0, 'init', makeSnapshot('v0'))], 0, 0) })
    act(() => { result.current.recordAction('edit', makeSnapshot('v1')) })
    expect(onStateChange).toHaveBeenCalled()
  })

  it('fires after undo', () => {
    const onStateChange = vi.fn()
    const { result } = renderHook(() => useHistoryCore<S>({ onStateChange }))
    act(() => { result.current.initEntries([makeEntry(0, 'init', makeSnapshot('v0'))], 0, 0) })
    act(() => { result.current.recordAction('edit', makeSnapshot('v1')) })
    onStateChange.mockClear()
    act(() => { result.current.undo() })
    expect(onStateChange).toHaveBeenCalled()
  })
})

describe('useHistoryCore — MAX_HISTORY pruning', () => {
  it('caps entries at 100 and keeps the most recent', () => {
    const { result } = renderHook(() => useHistoryCore<S>())
    act(() => { result.current.initEntries([makeEntry(0, 'init', makeSnapshot('v0'))], 0, 0) })
    act(() => {
      for (let i = 1; i <= 105; i++) {
        result.current.recordAction(`action ${i}`, makeSnapshot(`v${i}`))
      }
    })
    expect(result.current.entries).toHaveLength(100)
    expect(result.current.entries[99].description).toBe('action 105')
  })

  it('pins the saved entry at index 0 when it would be pruned', () => {
    const { result } = renderHook(() => useHistoryCore<S>())
    act(() => { result.current.initEntries([makeEntry(0, 'init', makeSnapshot('v0'))], 0, 0) })
    act(() => {
      for (let i = 1; i <= 105; i++) {
        result.current.recordAction(`action ${i}`, makeSnapshot(`v${i}`))
      }
    })
    expect(result.current.savedIndex).toBe(0)
    expect(result.current.savedEntryPinned).toBe(true)
  })
})

describe('useHistoryCore — getLatestState', () => {
  it('returns current ref values synchronously', () => {
    const { result } = renderHook(() => useHistoryCore<S>())
    act(() => { result.current.initEntries([makeEntry(0, 'init', makeSnapshot('v0'))], 0, 0) })
    act(() => { result.current.recordAction('edit', makeSnapshot('v1')) })
    const state = result.current.getLatestState()
    expect(state.currentIndex).toBe(1)
    expect(state.savedIndex).toBe(0)
    expect(state.entries).toHaveLength(2)
  })
})
```

- [ ] **Step 2.2 — Run tests to confirm they fail**

```bash
npx vitest run src/app/knowledge_base/shared/hooks/useHistoryCore.test.ts
```

Expected: `Cannot find module './useHistoryCore'`

- [ ] **Step 2.3 — Implement `useHistoryCore.ts`**

```ts
// src/app/knowledge_base/shared/hooks/useHistoryCore.ts
import { useState, useRef, useCallback } from "react";
import type { HistoryEntry } from "../utils/historyPersistence";

export type { HistoryEntry };

const MAX_HISTORY = 100;

export interface HistoryCore<T> {
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
  getLatestState(): { entries: HistoryEntry<T>[]; currentIndex: number; savedIndex: number };
}

export function useHistoryCore<T>(options?: { onStateChange?: () => void }): HistoryCore<T> {
  const entriesRef = useRef<HistoryEntry<T>[]>([]);
  const indexRef = useRef(-1);
  const savedIndexRef = useRef(-1);
  const savedEntryPinnedRef = useRef(false);
  const nextIdRef = useRef(0);
  const onStateChangeRef = useRef(options?.onStateChange);
  onStateChangeRef.current = options?.onStateChange;

  const [, forceRender] = useState(0);
  const tick = useCallback(() => forceRender((n) => n + 1), []);

  const notify = useCallback(() => {
    tick();
    onStateChangeRef.current?.();
  }, [tick]);

  const entries = entriesRef.current;
  const currentIndex = indexRef.current;
  const savedIndex = savedIndexRef.current;
  const savedEntryPinned = savedEntryPinnedRef.current;
  const minUndoIndex = savedEntryPinnedRef.current ? 1 : 0;
  const canUndo = indexRef.current > minUndoIndex;
  const canRedo = indexRef.current < entriesRef.current.length - 1;

  const initEntries = useCallback((
    newEntries: HistoryEntry<T>[],
    newCurrentIndex: number,
    newSavedIndex: number,
  ) => {
    nextIdRef.current = newEntries.length > 0
      ? Math.max(...newEntries.map((e) => e.id)) + 1
      : 0;
    entriesRef.current = newEntries;
    indexRef.current = Math.min(newCurrentIndex, newEntries.length - 1);
    savedIndexRef.current = Math.min(newSavedIndex, newEntries.length - 1);
    savedEntryPinnedRef.current = false;
    tick();
  }, [tick]);

  const recordAction = useCallback((description: string, snapshot: T) => {
    const base = entriesRef.current.slice(0, indexRef.current + 1);
    const entry: HistoryEntry<T> = {
      id: nextIdRef.current++,
      description,
      timestamp: Date.now(),
      snapshot,
    };
    const next = [...base, entry];
    const pruned = Math.max(0, next.length - MAX_HISTORY);
    if (pruned > 0) {
      const savedIdx = savedIndexRef.current;
      if (savedIdx >= 0 && savedIdx < pruned) {
        const savedEntry = next[savedIdx];
        const capped = [savedEntry, ...next.slice(pruned)];
        entriesRef.current = capped;
        indexRef.current = capped.length - 1;
        savedIndexRef.current = 0;
        savedEntryPinnedRef.current = true;
      } else {
        const capped = next.slice(pruned);
        entriesRef.current = capped;
        indexRef.current = capped.length - 1;
        savedIndexRef.current = savedIdx - pruned < 0 ? -1 : savedIdx - pruned;
      }
    } else {
      entriesRef.current = next;
      indexRef.current = next.length - 1;
    }
    notify();
  }, [notify]);

  const undo = useCallback((): T | null => {
    const minIndex = savedEntryPinnedRef.current ? 1 : 0;
    if (indexRef.current <= minIndex) return null;
    indexRef.current -= 1;
    const snapshot = entriesRef.current[indexRef.current]?.snapshot ?? null;
    notify();
    return snapshot;
  }, [notify]);

  const redo = useCallback((): T | null => {
    if (indexRef.current >= entriesRef.current.length - 1) return null;
    indexRef.current += 1;
    const snapshot = entriesRef.current[indexRef.current]?.snapshot ?? null;
    notify();
    return snapshot;
  }, [notify]);

  const goToEntry = useCallback((index: number): T | null => {
    if (index < 0 || index >= entriesRef.current.length) return null;
    indexRef.current = index;
    const snapshot = entriesRef.current[index]?.snapshot ?? null;
    notify();
    return snapshot;
  }, [notify]);

  const goToSaved = useCallback((): T | null => {
    if (savedIndexRef.current < 0 || savedIndexRef.current >= entriesRef.current.length) return null;
    indexRef.current = savedIndexRef.current;
    const snapshot = entriesRef.current[savedIndexRef.current]?.snapshot ?? null;
    notify();
    return snapshot;
  }, [notify]);

  const markSaved = useCallback(() => {
    savedIndexRef.current = indexRef.current;
    savedEntryPinnedRef.current = false;
    notify();
  }, [notify]);

  const clear = useCallback(() => {
    entriesRef.current = [];
    indexRef.current = -1;
    savedIndexRef.current = -1;
    savedEntryPinnedRef.current = false;
    tick();
  }, [tick]);

  const getLatestState = useCallback(() => ({
    entries: entriesRef.current,
    currentIndex: indexRef.current,
    savedIndex: savedIndexRef.current,
  }), []);

  return {
    entries,
    currentIndex,
    savedIndex,
    savedEntryPinned,
    canUndo,
    canRedo,
    initEntries,
    recordAction,
    undo,
    redo,
    goToEntry,
    goToSaved,
    markSaved,
    clear,
    getLatestState,
  };
}
```

- [ ] **Step 2.4 — Run tests to confirm they pass**

```bash
npx vitest run src/app/knowledge_base/shared/hooks/useHistoryCore.test.ts
```

Expected: all tests pass.

- [ ] **Step 2.5 — Commit**

```bash
git add src/app/knowledge_base/shared/hooks/useHistoryCore.ts \
        src/app/knowledge_base/shared/hooks/useHistoryCore.test.ts
git commit -m "feat(history): add useHistoryCore generic state machine"
```

---

## Task 3: `useHistoryFileSync.ts` — file persistence wrapper

**Files:**
- Create: `src/app/knowledge_base/shared/hooks/useHistoryFileSync.ts`
- Create: `src/app/knowledge_base/shared/hooks/useHistoryFileSync.test.ts`

- [ ] **Step 3.1 — Write failing tests**

```ts
// src/app/knowledge_base/shared/hooks/useHistoryFileSync.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useHistoryFileSync } from './useHistoryFileSync'
import * as persistence from '../utils/historyPersistence'
import type { HistoryEntry } from '../utils/historyPersistence'

vi.mock('../utils/historyPersistence', async (importOriginal) => {
  const real = await importOriginal<typeof persistence>()
  return {
    ...real,
    readHistoryFile: vi.fn(),
    writeHistoryFile: vi.fn(),
  }
})

const mockRead = persistence.readHistoryFile as ReturnType<typeof vi.fn>
const mockWrite = persistence.writeHistoryFile as ReturnType<typeof vi.fn>

function makeEntry(id: number, snapshot: string): HistoryEntry<string> {
  return { id, description: 'entry', timestamp: Date.now(), snapshot }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useHistoryFileSync — initHistory with no handle', () => {
  it('seeds a "File loaded" entry', async () => {
    const { result } = renderHook(() => useHistoryFileSync<string>())
    await act(async () => {
      await result.current.initHistory('hello world', 'hello world', null, null)
    })
    expect(result.current.entries).toHaveLength(1)
    expect(result.current.entries[0].description).toBe('File loaded')
    expect(result.current.entries[0].snapshot).toBe('hello world')
    expect(result.current.currentIndex).toBe(0)
    expect(result.current.savedIndex).toBe(0)
  })
})

describe('useHistoryFileSync — initHistory with matching checksum', () => {
  it('restores entries from disk', async () => {
    const fileContent = 'hello'
    const checksum = persistence.fnv1a(fileContent)
    const stored: HistoryEntry<string>[] = [
      makeEntry(0, 'v0'),
      makeEntry(1, 'v1'),
    ]
    mockRead.mockResolvedValue({ checksum, currentIndex: 1, savedIndex: 0, entries: stored })

    const fakeHandle = {} as FileSystemDirectoryHandle
    const { result } = renderHook(() => useHistoryFileSync<string>())
    await act(async () => {
      await result.current.initHistory(fileContent, fileContent, fakeHandle, 'notes.md')
    })
    expect(result.current.entries).toHaveLength(2)
    expect(result.current.currentIndex).toBe(1)
    expect(result.current.savedIndex).toBe(0)
  })
})

describe('useHistoryFileSync — initHistory with mismatched checksum', () => {
  it('discards stale history and seeds fresh entry', async () => {
    mockRead.mockResolvedValue({
      checksum: 'stale',
      currentIndex: 5,
      savedIndex: 3,
      entries: [makeEntry(0, 'old')],
    })
    const fakeHandle = {} as FileSystemDirectoryHandle
    const { result } = renderHook(() => useHistoryFileSync<string>())
    await act(async () => {
      await result.current.initHistory('new content', 'new content', fakeHandle, 'notes.md')
    })
    expect(result.current.entries).toHaveLength(1)
    expect(result.current.entries[0].description).toBe('File loaded')
  })
})

describe('useHistoryFileSync — onFileSave', () => {
  it('marks saved position and schedules a write', async () => {
    const { result } = renderHook(() => useHistoryFileSync<string>())
    const fakeHandle = {} as FileSystemDirectoryHandle
    await act(async () => {
      await result.current.initHistory('v0', 'v0', fakeHandle, 'notes.md')
    })
    act(() => { result.current.recordAction('edit', 'v1') })
    act(() => { result.current.onFileSave('v1') })
    expect(result.current.savedIndex).toBe(1)
    vi.advanceTimersByTime(1100)
    expect(mockWrite).toHaveBeenCalled()
  })
})

describe('useHistoryFileSync — clearHistory', () => {
  it('resets state and cancels pending writes', async () => {
    const { result } = renderHook(() => useHistoryFileSync<string>())
    const fakeHandle = {} as FileSystemDirectoryHandle
    await act(async () => {
      await result.current.initHistory('v0', 'v0', fakeHandle, 'notes.md')
    })
    act(() => { result.current.recordAction('edit', 'v1') })
    act(() => { result.current.clearHistory() })
    vi.advanceTimersByTime(2000)
    expect(mockWrite).not.toHaveBeenCalled()
    expect(result.current.entries).toHaveLength(0)
    expect(result.current.currentIndex).toBe(-1)
  })
})
```

- [ ] **Step 3.2 — Run tests to confirm they fail**

```bash
npx vitest run src/app/knowledge_base/shared/hooks/useHistoryFileSync.test.ts
```

Expected: `Cannot find module './useHistoryFileSync'`

- [ ] **Step 3.3 — Implement `useHistoryFileSync.ts`**

```ts
// src/app/knowledge_base/shared/hooks/useHistoryFileSync.ts
import { useRef, useCallback } from "react";
import { useHistoryCore } from "./useHistoryCore";
import type { HistoryCore } from "./useHistoryCore";
import { fnv1a, readHistoryFile, writeHistoryFile } from "../utils/historyPersistence";
import type { HistoryEntry } from "../utils/historyPersistence";

export type { HistoryEntry };
export type { HistoryCore };

export interface HistoryFileSync<T> extends HistoryCore<T> {
  initHistory(
    fileContent: string,
    initialSnapshot: T,
    dirHandle: FileSystemDirectoryHandle | null,
    filePath: string | null,
  ): Promise<void>;
  onFileSave(fileContent: string): void;
  clearHistory(): void;
}

export function useHistoryFileSync<T>(): HistoryFileSync<T> {
  const dirHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const activeFileRef = useRef<string | null>(null);
  const checksumRef = useRef("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const coreRef = useRef<HistoryCore<T> | null>(null);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const handle = dirHandleRef.current;
      const file = activeFileRef.current;
      const c = coreRef.current;
      if (!handle || !file || !c) return;
      const { entries, currentIndex, savedIndex } = c.getLatestState();
      writeHistoryFile(handle, file, {
        checksum: checksumRef.current,
        currentIndex,
        savedIndex,
        entries,
      });
    }, 1000);
  }, []);

  const core = useHistoryCore<T>({ onStateChange: scheduleSave });
  coreRef.current = core;

  const initHistory = useCallback(async (
    fileContent: string,
    initialSnapshot: T,
    dirHandle: FileSystemDirectoryHandle | null,
    filePath: string | null,
  ) => {
    dirHandleRef.current = dirHandle;
    activeFileRef.current = filePath;
    const checksum = fnv1a(fileContent);
    checksumRef.current = checksum;

    if (!dirHandle || !filePath) {
      const entry: HistoryEntry<T> = {
        id: 0,
        description: "File loaded",
        timestamp: Date.now(),
        snapshot: initialSnapshot,
      };
      core.initEntries([entry], 0, 0);
      return;
    }

    const histFile = await readHistoryFile<T>(dirHandle, filePath);
    if (histFile && histFile.checksum === checksum && histFile.entries.length > 0) {
      core.initEntries(
        histFile.entries,
        Math.min(histFile.currentIndex, histFile.entries.length - 1),
        Math.min(histFile.savedIndex ?? 0, histFile.entries.length - 1),
      );
    } else {
      const entry: HistoryEntry<T> = {
        id: 0,
        description: "File loaded",
        timestamp: Date.now(),
        snapshot: initialSnapshot,
      };
      core.initEntries([entry], 0, 0);
      scheduleSave();
    }
  }, [core, scheduleSave]);

  const onFileSave = useCallback((fileContent: string) => {
    checksumRef.current = fnv1a(fileContent);
    core.markSaved();
  }, [core]);

  const clearHistory = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    dirHandleRef.current = null;
    activeFileRef.current = null;
    checksumRef.current = "";
    core.clear();
  }, [core]);

  return {
    ...core,
    initHistory,
    onFileSave,
    clearHistory,
  };
}
```

- [ ] **Step 3.4 — Run tests to confirm they pass**

```bash
npx vitest run src/app/knowledge_base/shared/hooks/useHistoryFileSync.test.ts
```

Expected: all tests pass.

- [ ] **Step 3.5 — Commit**

```bash
git add src/app/knowledge_base/shared/hooks/useHistoryFileSync.ts \
        src/app/knowledge_base/shared/hooks/useHistoryFileSync.test.ts
git commit -m "feat(history): add useHistoryFileSync persistence wrapper"
```

---

## Task 4: `useDiagramHistory.ts` + migrate all diagram imports

**Files:**
- Create: `src/app/knowledge_base/shared/hooks/useDiagramHistory.ts`
- Create: `src/app/knowledge_base/shared/hooks/useDiagramHistory.test.ts`
- Modify: `src/app/knowledge_base/features/diagram/DiagramView.tsx`
- Modify: `src/app/knowledge_base/features/diagram/components/DiagramOverlays.tsx`
- Modify: `src/app/knowledge_base/features/diagram/properties/PropertiesPanel.tsx`
- Modify: `src/app/knowledge_base/shared/hooks/useFileActions.ts`
- Delete: `src/app/knowledge_base/shared/hooks/useActionHistory.ts`
- Delete: `src/app/knowledge_base/shared/hooks/useActionHistory.test.ts`

- [ ] **Step 4.1 — Write smoke test**

```ts
// src/app/knowledge_base/shared/hooks/useDiagramHistory.test.ts
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDiagramHistory } from './useDiagramHistory'
import type { DiagramSnapshot } from './useDiagramHistory'

vi.mock('../utils/historyPersistence', async (importOriginal) => {
  const real = await importOriginal()
  return { ...real, readHistoryFile: vi.fn().mockResolvedValue(null), writeHistoryFile: vi.fn() }
})

const snap: DiagramSnapshot = {
  title: 'Test',
  layerDefs: [],
  nodes: [],
  connections: [],
  layerManualSizes: {},
  lineCurve: 'bezier',
  flows: [],
}

describe('useDiagramHistory — onSave is an alias for onFileSave', () => {
  it('marks saved and updates checksum', async () => {
    const { result } = renderHook(() => useDiagramHistory())
    await act(async () => {
      await result.current.initHistory(JSON.stringify(snap), snap, null, null)
    })
    act(() => { result.current.recordAction('edit', { ...snap, title: 'Edited' }) })
    act(() => { result.current.onSave(JSON.stringify({ ...snap, title: 'Edited' })) })
    expect(result.current.savedIndex).toBe(1)
  })
})
```

- [ ] **Step 4.2 — Run test to confirm it fails**

```bash
npx vitest run src/app/knowledge_base/shared/hooks/useDiagramHistory.test.ts
```

Expected: `Cannot find module './useDiagramHistory'`

- [ ] **Step 4.3 — Implement `useDiagramHistory.ts`**

```ts
// src/app/knowledge_base/shared/hooks/useDiagramHistory.ts
import { useCallback } from "react";
import { useHistoryFileSync } from "./useHistoryFileSync";
import type { HistoryFileSync } from "./useHistoryFileSync";
import type { LayerDef, Connection, SerializedNodeData, LineCurveAlgorithm, FlowDef } from "../../features/diagram/utils/types";

export type { HistoryEntry } from "../utils/historyPersistence";

export interface DiagramSnapshot {
  title: string;
  layerDefs: LayerDef[];
  nodes: SerializedNodeData[];
  connections: Connection[];
  layerManualSizes: Record<string, { left?: number; width?: number; top?: number; height?: number }>;
  lineCurve: LineCurveAlgorithm;
  flows: FlowDef[];
}

export interface DiagramHistory extends HistoryFileSync<DiagramSnapshot> {
  onSave(diagramJson: string): void;
}

export function useDiagramHistory(): DiagramHistory {
  const sync = useHistoryFileSync<DiagramSnapshot>();

  const onSave = useCallback((diagramJson: string) => {
    sync.onFileSave(diagramJson);
  }, [sync]);

  return { ...sync, onSave };
}
```

- [ ] **Step 4.4 — Run smoke test**

```bash
npx vitest run src/app/knowledge_base/shared/hooks/useDiagramHistory.test.ts
```

Expected: passes.

- [ ] **Step 4.5 — Update imports in `DiagramView.tsx`**

Replace:
```ts
import { useActionHistory } from "../../shared/hooks/useActionHistory";
import type { DiagramSnapshot } from "../../shared/hooks/useActionHistory";
```
With:
```ts
import { useDiagramHistory } from "../../shared/hooks/useDiagramHistory";
import type { DiagramSnapshot } from "../../shared/hooks/useDiagramHistory";
```

Replace all occurrences of `useActionHistory()` with `useDiagramHistory()` in the file body.

- [ ] **Step 4.6 — Update imports in `DiagramOverlays.tsx`**

Replace:
```ts
import type { useActionHistory } from "../../../shared/hooks/useActionHistory";
```
With:
```ts
import type { useDiagramHistory } from "../../../shared/hooks/useDiagramHistory";
```

In the props interface, replace:
```ts
history: ReturnType<typeof useActionHistory>;
```
With:
```ts
history: ReturnType<typeof useDiagramHistory>;
```

- [ ] **Step 4.7 — Update imports in `PropertiesPanel.tsx`**

Replace:
```ts
import type { HistoryEntry } from "../../../shared/hooks/useActionHistory";
```
With:
```ts
import type { HistoryEntry } from "../../../shared/hooks/useDiagramHistory";
```

- [ ] **Step 4.8 — Update imports in `useFileActions.ts`**

Replace:
```ts
import type { DiagramSnapshot } from "./useActionHistory";
```
With:
```ts
import type { DiagramSnapshot } from "./useDiagramHistory";
```

- [ ] **Step 4.9 — Delete old files**

```bash
rm src/app/knowledge_base/shared/hooks/useActionHistory.ts
rm src/app/knowledge_base/shared/hooks/useActionHistory.test.ts
```

- [ ] **Step 4.10 — Run full test suite to confirm nothing broke**

```bash
npm run test:run
```

Expected: same pass count as before (all diagram tests still pass).

- [ ] **Step 4.11 — Commit**

```bash
git add -A
git commit -m "feat(history): add useDiagramHistory, migrate all useActionHistory imports, delete old hook"
```

---

## Task 5: Move `HistoryPanel` to `shared/components/`

**Files:**
- Create: `src/app/knowledge_base/shared/components/HistoryPanel.tsx`
- Create: `src/app/knowledge_base/shared/components/HistoryPanel.test.tsx`
- Modify: `src/app/knowledge_base/features/diagram/properties/PropertiesPanel.tsx`
- Delete: `src/app/knowledge_base/features/diagram/components/HistoryPanel.tsx`
- Delete: `src/app/knowledge_base/features/diagram/components/HistoryPanel.test.tsx`

- [ ] **Step 5.1 — Copy `HistoryPanel.tsx` to `shared/components/` with updated import**

Create `src/app/knowledge_base/shared/components/HistoryPanel.tsx` with the same content as the diagram's `HistoryPanel.tsx`, but change the import and the `entries` prop type:

```ts
// src/app/knowledge_base/shared/components/HistoryPanel.tsx
"use client";

import { useRef, useEffect } from "react";
import { Undo2, Redo2, ChevronDown, ChevronRight } from "lucide-react";
import type { HistoryEntry } from "../utils/historyPersistence";

interface HistoryPanelProps {
  entries: HistoryEntry<unknown>[];
  currentIndex: number;
  savedIndex: number;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onGoToEntry: (index: number) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  readOnly?: boolean;
}

function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 5_000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export default function HistoryPanel({
  entries,
  currentIndex,
  savedIndex,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onGoToEntry,
  collapsed,
  onToggleCollapse,
  readOnly,
}: HistoryPanelProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!listRef.current || collapsed) return;
    const item = listRef.current.querySelector(`[data-index="${currentIndex}"]`);
    if (item) item.scrollIntoView({ block: "nearest" });
  }, [currentIndex, collapsed]);

  return (
    <div className="flex flex-col flex-shrink-0 border-t border-slate-200 bg-white">
      <button
        onClick={onToggleCollapse}
        className="flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 transition-colors flex-shrink-0"
      >
        <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
          History
        </span>
        {entries.length > 1 && (
          <span className="text-[10px] text-slate-400 font-medium">
            {currentIndex + 1}/{entries.length}
          </span>
        )}
        {collapsed ? (
          <ChevronRight size={14} className="ml-auto text-slate-400" />
        ) : (
          <ChevronDown size={14} className="ml-auto text-slate-400" />
        )}
      </button>

      {!collapsed && (
        <>
          <div className="flex items-center gap-1 px-3 pb-1.5 flex-shrink-0">
            <button
              onClick={onUndo}
              disabled={!canUndo || readOnly}
              className="p-1 rounded hover:bg-slate-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Undo (Cmd+Z)"
            >
              <Undo2 size={14} className="text-slate-600" />
            </button>
            <button
              onClick={onRedo}
              disabled={!canRedo || readOnly}
              className="p-1 rounded hover:bg-slate-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Redo (Cmd+Shift+Z)"
            >
              <Redo2 size={14} className="text-slate-600" />
            </button>
          </div>

          <div ref={listRef} className="overflow-y-auto flex-shrink-0 max-h-[200px]">
            {entries.length === 0 ? (
              <div className="px-3 py-3 text-xs text-slate-400 text-center">No history yet</div>
            ) : (
              [...entries].reverse().map((entry, revIdx) => {
                const idx = entries.length - 1 - revIdx;
                const isCurrent = idx === currentIndex;
                const isFuture = idx > currentIndex;
                const isSaved = idx === savedIndex;

                return (
                  <button
                    key={entry.id}
                    data-index={idx}
                    onClick={() => onGoToEntry(idx)}
                    disabled={readOnly}
                    className={`w-full text-left px-3 py-1.5 flex items-center gap-2 text-xs transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                      isSaved ? "border-l-2 border-green-400" : "border-l-2 border-transparent"
                    } ${
                      isCurrent
                        ? "bg-blue-50 text-blue-700"
                        : isFuture
                          ? "text-slate-300 hover:bg-slate-50"
                          : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex-1 truncate">{entry.description}</div>
                    {isSaved && (
                      <span className="text-[9px] font-semibold text-green-600 bg-green-50 px-1 rounded flex-shrink-0">
                        saved
                      </span>
                    )}
                    <div className={`text-[10px] flex-shrink-0 ${isCurrent ? "text-blue-400" : "text-slate-300"}`}>
                      {relativeTime(entry.timestamp)}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 5.2 — Copy test to `shared/components/` with updated import paths**

Create `src/app/knowledge_base/shared/components/HistoryPanel.test.tsx` by copying `src/app/knowledge_base/features/diagram/components/HistoryPanel.test.tsx` and changing:
```ts
import HistoryPanel from './HistoryPanel'
import type { HistoryEntry } from '../../../shared/hooks/useActionHistory'
```
to:
```ts
import HistoryPanel from './HistoryPanel'
import type { HistoryEntry } from '../utils/historyPersistence'
```

Also add one test to confirm the panel works with `string`-snapshot entries:

```ts
describe('HistoryPanel works with string snapshots', () => {
  it('renders entries with string snapshots without error', () => {
    const entries: HistoryEntry<string>[] = [
      { id: 0, description: 'File loaded', timestamp: Date.now(), snapshot: 'content v0' },
      { id: 1, description: 'Draft', timestamp: Date.now(), snapshot: 'content v1' },
    ]
    render(
      <HistoryPanel
        {...baseProps({ entries: entries as HistoryEntry<unknown>[], currentIndex: 1, savedIndex: 0 })}
      />
    )
    expect(screen.getByText('File loaded')).toBeInTheDocument()
    expect(screen.getByText('Draft')).toBeInTheDocument()
  })
})
```

- [ ] **Step 5.3 — Update `PropertiesPanel.tsx` to import from `shared/components/`**

Replace:
```ts
import HistoryPanel from "../components/HistoryPanel";
```
With:
```ts
import HistoryPanel from "../../../shared/components/HistoryPanel";
```

- [ ] **Step 5.4 — Delete old diagram `HistoryPanel` files**

```bash
rm src/app/knowledge_base/features/diagram/components/HistoryPanel.tsx
rm src/app/knowledge_base/features/diagram/components/HistoryPanel.test.tsx
```

- [ ] **Step 5.5 — Run tests**

```bash
npx vitest run src/app/knowledge_base/shared/components/HistoryPanel.test.tsx
npm run test:run
```

Expected: all pass.

- [ ] **Step 5.6 — Commit**

```bash
git add -A
git commit -m "feat(history): move HistoryPanel to shared/components, generify entry type"
```

---

## Task 6: `useDocumentHistory.ts` — document adapter with checkpoint triggers

**Files:**
- Create: `src/app/knowledge_base/shared/hooks/useDocumentHistory.ts`
- Create: `src/app/knowledge_base/shared/hooks/useDocumentHistory.test.ts`

- [ ] **Step 6.1 — Write failing tests**

```ts
// src/app/knowledge_base/shared/hooks/useDocumentHistory.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDocumentHistory } from './useDocumentHistory'

vi.mock('../utils/historyPersistence', async (importOriginal) => {
  const real = await importOriginal()
  return { ...real, readHistoryFile: vi.fn().mockResolvedValue(null), writeHistoryFile: vi.fn() }
})

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('useDocumentHistory — initHistory', () => {
  it('seeds a "File loaded" entry with the file content as snapshot', async () => {
    const { result } = renderHook(() => useDocumentHistory())
    await act(async () => {
      await result.current.initHistory('# Hello', null, null)
    })
    expect(result.current.entries).toHaveLength(1)
    expect(result.current.entries[0].description).toBe('File loaded')
    expect(result.current.entries[0].snapshot).toBe('# Hello')
  })
})

describe('useDocumentHistory — onContentChange debounce', () => {
  it('does not record immediately', async () => {
    const { result } = renderHook(() => useDocumentHistory())
    await act(async () => { await result.current.initHistory('v0', null, null) })
    act(() => { result.current.onContentChange('v1') })
    expect(result.current.entries).toHaveLength(1)
  })

  it('records a "Draft" entry after 5 s', async () => {
    const { result } = renderHook(() => useDocumentHistory())
    await act(async () => { await result.current.initHistory('v0', null, null) })
    act(() => { result.current.onContentChange('v1') })
    act(() => { vi.advanceTimersByTime(5000) })
    expect(result.current.entries).toHaveLength(2)
    expect(result.current.entries[1].description).toBe('Draft')
    expect(result.current.entries[1].snapshot).toBe('v1')
  })

  it('resets the debounce timer on subsequent calls', async () => {
    const { result } = renderHook(() => useDocumentHistory())
    await act(async () => { await result.current.initHistory('v0', null, null) })
    act(() => { result.current.onContentChange('v1') })
    act(() => { vi.advanceTimersByTime(3000) })
    act(() => { result.current.onContentChange('v2') })
    act(() => { vi.advanceTimersByTime(3000) })
    expect(result.current.entries).toHaveLength(1)
    act(() => { vi.advanceTimersByTime(2001) })
    expect(result.current.entries).toHaveLength(2)
    expect(result.current.entries[1].snapshot).toBe('v2')
  })
})

describe('useDocumentHistory — onBlockChange', () => {
  it('records a "Block changed" entry immediately', async () => {
    const { result } = renderHook(() => useDocumentHistory())
    await act(async () => { await result.current.initHistory('v0', null, null) })
    act(() => { result.current.onBlockChange('v1') })
    expect(result.current.entries).toHaveLength(2)
    expect(result.current.entries[1].description).toBe('Block changed')
    expect(result.current.entries[1].snapshot).toBe('v1')
  })

  it('cancels any pending debounce timer', async () => {
    const { result } = renderHook(() => useDocumentHistory())
    await act(async () => { await result.current.initHistory('v0', null, null) })
    act(() => { result.current.onContentChange('v1') })
    act(() => { result.current.onBlockChange('v2') })
    act(() => { vi.advanceTimersByTime(6000) })
    expect(result.current.entries).toHaveLength(2)
    expect(result.current.entries[1].description).toBe('Block changed')
  })
})

describe('useDocumentHistory — onFileSave', () => {
  it('records a "Saved" entry and marks savedIndex', async () => {
    const { result } = renderHook(() => useDocumentHistory())
    await act(async () => { await result.current.initHistory('v0', null, null) })
    act(() => { result.current.onContentChange('v1') })
    act(() => { result.current.onFileSave('v1') })
    expect(result.current.entries).toHaveLength(2)
    expect(result.current.entries[1].description).toBe('Saved')
    expect(result.current.savedIndex).toBe(1)
  })
})
```

- [ ] **Step 6.2 — Run tests to confirm they fail**

```bash
npx vitest run src/app/knowledge_base/shared/hooks/useDocumentHistory.test.ts
```

Expected: `Cannot find module './useDocumentHistory'`

- [ ] **Step 6.3 — Implement `useDocumentHistory.ts`**

```ts
// src/app/knowledge_base/shared/hooks/useDocumentHistory.ts
import { useRef, useCallback } from "react";
import { useHistoryFileSync } from "./useHistoryFileSync";
import type { HistoryFileSync } from "./useHistoryFileSync";

const DEBOUNCE_MS = 5_000;

export interface DocumentHistory extends Omit<HistoryFileSync<string>, 'initHistory' | 'onFileSave'> {
  initHistory(
    fileContent: string,
    dirHandle: FileSystemDirectoryHandle | null,
    filePath: string | null,
  ): Promise<void>;
  onContentChange(content: string): void;
  onBlockChange(content: string): void;
  onFileSave(content: string): void;
}

export function useDocumentHistory(): DocumentHistory {
  const sync = useHistoryFileSync<string>();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const initHistory = useCallback(async (
    fileContent: string,
    dirHandle: FileSystemDirectoryHandle | null,
    filePath: string | null,
  ) => {
    await sync.initHistory(fileContent, fileContent, dirHandle, filePath);
  }, [sync]);

  const onContentChange = useCallback((content: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      sync.recordAction("Draft", content);
    }, DEBOUNCE_MS);
  }, [sync]);

  const onBlockChange = useCallback((content: string) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    sync.recordAction("Block changed", content);
  }, [sync]);

  const onFileSave = useCallback((content: string) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    sync.recordAction("Saved", content);
    sync.onFileSave(content);
  }, [sync]);

  return {
    ...sync,
    initHistory,
    onContentChange,
    onBlockChange,
    onFileSave,
  };
}
```

- [ ] **Step 6.4 — Run tests**

```bash
npx vitest run src/app/knowledge_base/shared/hooks/useDocumentHistory.test.ts
```

Expected: all pass.

- [ ] **Step 6.5 — Commit**

```bash
git add src/app/knowledge_base/shared/hooks/useDocumentHistory.ts \
        src/app/knowledge_base/shared/hooks/useDocumentHistory.test.ts
git commit -m "feat(history): add useDocumentHistory with coarse checkpoint triggers"
```

---

## Task 7: `useDocumentKeyboardShortcuts.ts` — Cmd+Z / Cmd+Shift+Z for documents

**Files:**
- Create: `src/app/knowledge_base/features/document/hooks/useDocumentKeyboardShortcuts.ts`
- Create: `src/app/knowledge_base/features/document/hooks/useDocumentKeyboardShortcuts.test.ts`

- [ ] **Step 7.1 — Write failing tests**

```ts
// src/app/knowledge_base/features/document/hooks/useDocumentKeyboardShortcuts.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useDocumentKeyboardShortcuts } from './useDocumentKeyboardShortcuts'

function fireKey(key: string, metaKey = true, shiftKey = false) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, metaKey, ctrlKey: false, shiftKey, bubbles: true }))
}

function fireKeyCtrl(key: string, shiftKey = false) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, metaKey: false, ctrlKey: true, shiftKey, bubbles: true }))
}

describe('useDocumentKeyboardShortcuts', () => {
  let onUndo: ReturnType<typeof vi.fn>
  let onRedo: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onUndo = vi.fn()
    onRedo = vi.fn()
  })

  it('calls onUndo on Cmd+Z', () => {
    renderHook(() => useDocumentKeyboardShortcuts({ onUndo, onRedo, readOnly: false }))
    fireKey('z')
    expect(onUndo).toHaveBeenCalledTimes(1)
    expect(onRedo).not.toHaveBeenCalled()
  })

  it('calls onRedo on Cmd+Shift+Z', () => {
    renderHook(() => useDocumentKeyboardShortcuts({ onUndo, onRedo, readOnly: false }))
    fireKey('z', true, true)
    expect(onRedo).toHaveBeenCalledTimes(1)
    expect(onUndo).not.toHaveBeenCalled()
  })

  it('calls onUndo on Ctrl+Z (non-Mac)', () => {
    renderHook(() => useDocumentKeyboardShortcuts({ onUndo, onRedo, readOnly: false }))
    fireKeyCtrl('z')
    expect(onUndo).toHaveBeenCalledTimes(1)
  })

  it('does nothing when readOnly is true', () => {
    renderHook(() => useDocumentKeyboardShortcuts({ onUndo, onRedo, readOnly: true }))
    fireKey('z')
    fireKey('z', true, true)
    expect(onUndo).not.toHaveBeenCalled()
    expect(onRedo).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 7.2 — Run tests to confirm they fail**

```bash
npx vitest run src/app/knowledge_base/features/document/hooks/useDocumentKeyboardShortcuts.test.ts
```

Expected: `Cannot find module './useDocumentKeyboardShortcuts'`

- [ ] **Step 7.3 — Implement hook**

```ts
// src/app/knowledge_base/features/document/hooks/useDocumentKeyboardShortcuts.ts
import { useEffect, useRef } from "react";

interface Options {
  onUndo: () => void;
  onRedo: () => void;
  readOnly: boolean;
}

export function useDocumentKeyboardShortcuts({ onUndo, onRedo, readOnly }: Options): void {
  const onUndoRef = useRef(onUndo);
  const onRedoRef = useRef(onRedo);
  const readOnlyRef = useRef(readOnly);
  onUndoRef.current = onUndo;
  onRedoRef.current = onRedo;
  readOnlyRef.current = readOnly;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (readOnlyRef.current) return;
      if (!(e.metaKey || e.ctrlKey) || e.key !== "z") return;
      e.preventDefault();
      if (e.shiftKey) {
        onRedoRef.current();
      } else {
        onUndoRef.current();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}
```

- [ ] **Step 7.4 — Run tests**

```bash
npx vitest run src/app/knowledge_base/features/document/hooks/useDocumentKeyboardShortcuts.test.ts
```

Expected: all pass.

- [ ] **Step 7.5 — Commit**

```bash
git add src/app/knowledge_base/features/document/hooks/useDocumentKeyboardShortcuts.ts \
        src/app/knowledge_base/features/document/hooks/useDocumentKeyboardShortcuts.test.ts
git commit -m "feat(history): add useDocumentKeyboardShortcuts for Cmd+Z/Cmd+Shift+Z"
```

---

## Task 8: Disable Tiptap native undo + add `onBlockChange` to `MarkdownEditor`

**Files:**
- Modify: `src/app/knowledge_base/features/document/components/MarkdownEditor.tsx`

- [ ] **Step 8.1 — Disable StarterKit's history extension**

In `MarkdownEditor.tsx`, in the `StarterKit.configure({...})` call, add `history: false`:

```ts
StarterKit.configure({
  history: false,           // ← add this line
  heading: { levels: [1, 2, 3, 4, 5, 6] },
  codeBlock: false,
  link: false,
  listItem: false,
}),
```

- [ ] **Step 8.2 — Add `onBlockChange` prop**

Add `onBlockChange?: (content: string) => void` to the `MarkdownEditorProps` interface and function signature:

```ts
interface MarkdownEditorProps {
  content: string;
  onChange?: (markdown: string) => void;
  onBlockChange?: (content: string) => void;   // ← add
  onNavigateLink?: (path: string, section?: string) => void;
  onCreateDocument?: (path: string) => void;
  existingDocPaths?: Set<string>;
  allDocPaths?: string[];
  currentDocDir?: string;
  readOnly?: boolean;
  rightSidebar?: React.ReactNode;
}
```

Add it to the function signature destructuring:
```ts
export default function MarkdownEditor({
  content,
  onChange,
  onBlockChange,          // ← add
  onNavigateLink,
  // ...
```

- [ ] **Step 8.3 — Add stable ref for `onBlockChange` and block-tracking ref**

After the existing `onChangeRef`:

```ts
const onBlockChangeRef = useRef(onBlockChange);
useEffect(() => { onBlockChangeRef.current = onBlockChange; }, [onBlockChange]);
const prevBlockStartRef = useRef(-1);
```

- [ ] **Step 8.4 — Add `onSelectionUpdate` to the `useEditor` config**

Inside the `useEditor({...})` object, after the `onTransaction` handler, add:

```ts
onSelectionUpdate: ({ editor: ed }) => {
  if (!onBlockChangeRef.current) return;
  const { $anchor } = ed.state.selection;
  const blockStart = $anchor.start($anchor.depth);
  if (blockStart !== prevBlockStartRef.current) {
    prevBlockStartRef.current = blockStart;
    const md = htmlToMarkdown(ed.getHTML());
    onBlockChangeRef.current(md);
  }
},
```

- [ ] **Step 8.5 — Run existing MarkdownEditor tests**

```bash
npx vitest run src/app/knowledge_base/features/document/components/MarkdownEditor.test.ts
```

Expected: all existing tests still pass (no regressions from disabling history).

- [ ] **Step 8.6 — Commit**

```bash
git add src/app/knowledge_base/features/document/components/MarkdownEditor.tsx
git commit -m "feat(history): disable Tiptap native undo, add onBlockChange to MarkdownEditor"
```

---

## Task 9: Wire `DocumentView`, `DocumentProperties`, and `MarkdownPane`

**Files:**
- Modify: `src/app/knowledge_base/features/document/DocumentView.tsx`
- Modify: `src/app/knowledge_base/features/document/properties/DocumentProperties.tsx`
- Modify: `src/app/knowledge_base/features/document/components/MarkdownPane.tsx`

- [ ] **Step 9.1 — Add history props to `DocumentProperties`**

Add imports and new prop to `DocumentProperties.tsx`:

```ts
import HistoryPanel from "../../../shared/components/HistoryPanel";
import type { HistoryEntry } from "../../../shared/utils/historyPersistence";

interface HistoryPanelBridge {
  entries: HistoryEntry<unknown>[];
  currentIndex: number;
  savedIndex: number;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onGoToEntry: (index: number) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

interface DocumentPropertiesProps {
  filePath: string | null;
  content: string;
  outbound: { target: string; section?: string }[] | null;
  backlinks: { sourcePath: string; section?: string }[];
  onNavigateLink?: (path: string) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  history?: HistoryPanelBridge | null;    // ← add
  readOnly?: boolean;                      // ← add
}
```

Add destructuring:
```ts
export default function DocumentProperties({
  filePath,
  content,
  outbound,
  backlinks,
  onNavigateLink,
  collapsed,
  onToggleCollapse,
  history,       // ← add
  readOnly,      // ← add
}: DocumentPropertiesProps) {
```

At the bottom of the outer container `<div>`, before the closing `</div>`, add after the `flex-1 overflow-y-auto` div:

```tsx
{history && (
  <HistoryPanel
    entries={history.entries}
    currentIndex={history.currentIndex}
    savedIndex={history.savedIndex}
    canUndo={history.canUndo}
    canRedo={history.canRedo}
    onUndo={history.onUndo}
    onRedo={history.onRedo}
    onGoToEntry={history.onGoToEntry}
    collapsed={history.collapsed}
    onToggleCollapse={history.onToggleCollapse}
    readOnly={readOnly}
  />
)}
```

- [ ] **Step 9.2 — Add `onBlockChange` and `onSave`/`onDiscard` pass-through to `MarkdownPane`**

In `MarkdownPane.tsx`, add `onBlockChange` to the props interface and pass it through to `MarkdownEditor`:

```ts
interface MarkdownPaneProps {
  filePath: string | null;
  content: string;
  title: string;
  onChange?: (markdown: string) => void;
  onBlockChange?: (content: string) => void;   // ← add
  onNavigateLink?: (path: string, section?: string) => void;
  onCreateDocument?: (path: string) => void;
  isDirty?: boolean;
  onSave?: () => void;
  onDiscard?: (e: React.MouseEvent) => void;
  existingDocPaths?: Set<string>;
  allDocPaths?: string[];
  backlinks?: { sourcePath: string; section?: string }[];
  onNavigateBacklink?: (sourcePath: string) => void;
  rightSidebar?: React.ReactNode;
}
```

Add to destructuring and pass to `MarkdownEditor`:
```tsx
<MarkdownEditor
  content={content}
  onChange={onChange}
  onBlockChange={onBlockChange}   // ← add
  // ... rest unchanged
/>
```

- [ ] **Step 9.3 — Wire `useDocumentHistory` in `DocumentView`**

At the top of `DocumentView.tsx`, add imports:

```ts
import { useDocumentHistory } from "../../shared/hooks/useDocumentHistory";
import { useDocumentKeyboardShortcuts } from "./hooks/useDocumentKeyboardShortcuts";
import { useState, useCallback } from "react";
```

Inside the `DocumentView` component body, after the `useDocumentContent` call, add:

```ts
const history = useDocumentHistory();
const [historyCollapsed, setHistoryCollapsed] = useState(false);
```

Update `handleContentChange` — wrap `updateContent` to also call `history.onContentChange`:

```ts
const handleContentChange = useCallback((markdown: string) => {
  updateContent(markdown);
  history.onContentChange(markdown);
}, [updateContent, history]);
```

When the file changes, re-initialize history. Add a `useEffect` after the existing `indexedOnOpenRef` effect:

```ts
useEffect(() => {
  if (!filePath) return;
  (async () => {
    const dh = dirHandleRef.current;
    // Read raw file content for checksum — use empty string if unavailable
    // (initHistory falls back to a fresh entry when no handle is provided)
    const rawContent = content; // current content after load
    await history.initHistory(rawContent, dh, filePath);
  })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [filePath]);
```

Wire keyboard shortcuts:

```ts
useDocumentKeyboardShortcuts({
  onUndo: useCallback(() => {
    const s = history.undo();
    if (s !== null) updateContent(s);
  }, [history, updateContent]),
  onRedo: useCallback(() => {
    const s = history.redo();
    if (s !== null) updateContent(s);
  }, [history, updateContent]),
  readOnly: false,
});
```

Build the `historyBridge` to pass to `DocumentProperties`:

```ts
const historyBridge = {
  entries: history.entries as import("../../shared/utils/historyPersistence").HistoryEntry<unknown>[],
  currentIndex: history.currentIndex,
  savedIndex: history.savedIndex,
  canUndo: history.canUndo,
  canRedo: history.canRedo,
  onUndo: () => { const s = history.undo(); if (s !== null) updateContent(s); },
  onRedo: () => { const s = history.redo(); if (s !== null) updateContent(s); },
  onGoToEntry: (i: number) => { const s = history.goToEntry(i); if (s !== null) updateContent(s); },
  collapsed: historyCollapsed,
  onToggleCollapse: () => setHistoryCollapsed((c) => !c),
};
```

Update the `MarkdownPane` JSX to pass `onChange={handleContentChange}`, `onBlockChange={history.onBlockChange}`, and update the `rightSidebar` prop to pass `history` and `readOnly` to `DocumentProperties`:

```tsx
<MarkdownPane
  filePath={filePath}
  content={content}
  title={derivedTitle}
  isDirty={dirty}
  onSave={save}
  onDiscard={discard}
  onChange={handleContentChange}
  onBlockChange={history.onBlockChange}
  onNavigateLink={onNavigateLink}
  onCreateDocument={onCreateDocument}
  existingDocPaths={existingDocPaths}
  allDocPaths={allDocPaths}
  backlinks={backlinks}
  onNavigateBacklink={onNavigateLink}
  rightSidebar={
    <DocumentProperties
      filePath={filePath}
      content={content}
      outbound={outboundLinks}
      backlinks={backlinks}
      onNavigateLink={(path) => onNavigateLink?.(path)}
      collapsed={propertiesCollapsed}
      onToggleCollapse={toggleProperties}
      history={historyBridge}
    />
  }
/>
```

Also integrate `onFileSave` — wrap the existing `save` to notify history after saving:

```ts
const handleSave = useCallback(async () => {
  await save();
  history.onFileSave(content);
}, [save, history, content]);
```

Pass `onSave={handleSave}` to `MarkdownPane` (replacing `onSave={save}`).

- [ ] **Step 9.4 — Run full test suite**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 9.5 — Run TypeScript type check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 9.6 — Commit**

```bash
git add src/app/knowledge_base/features/document/DocumentView.tsx \
        src/app/knowledge_base/features/document/properties/DocumentProperties.tsx \
        src/app/knowledge_base/features/document/components/MarkdownPane.tsx
git commit -m "feat(history): wire useDocumentHistory into DocumentView and DocumentProperties"
```

---

## Self-Review Against Spec

| Spec requirement | Task |
|-----------------|------|
| `historyPersistence.ts` with `fnv1a`, file helpers, `HistoryEntry<T>`, `HistoryFile<T>` | Task 1 |
| `useHistoryCore<T>` — pure state machine, `onStateChange`, `getLatestState` | Task 2 |
| `useHistoryFileSync<T>` — persistence wrapper, no snapshot type knowledge | Task 3 |
| `useDiagramHistory` — thin adapter, `onSave` alias, old files deleted | Task 4 |
| `HistoryPanel` moved to `shared/components/`, `HistoryEntry<unknown>[]` | Task 5 |
| `useDocumentHistory` — file load, draft debounce, block change, save triggers | Task 6 |
| `useDocumentKeyboardShortcuts` — Cmd+Z / Cmd+Shift+Z | Task 7 |
| Tiptap History extension disabled, `onBlockChange` added | Task 8 |
| `DocumentProperties` shows `HistoryPanel`, `DocumentView` wired end-to-end | Task 9 |
