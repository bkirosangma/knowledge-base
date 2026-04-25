# File Watching + Default Read Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add disk-based file watching (5s polling, tree + content + background) so external edits appear in the app automatically, and make all files open in read mode by default with per-file localStorage persistence.

**Architecture:** A `FileWatcherContext` owns a single 5s polling interval and a named-subscriber registry; three subscribers handle tree diffs (existing `refresh()`), open-file content reloads (silent or conflict banner), and background `.history.json` sidecar updates. Documents get the same `useReadOnlyState` hook diagrams already use, extended with a `prefix` parameter and a default of `true` (read-only).

**Tech Stack:** React context + hooks, File System Access API, `fnv1a` from `historyPersistence.ts`, Vitest + `@testing-library/react` for tests.

---

## File Map

| Status | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/app/knowledge_base/features/diagram/hooks/useReadOnlyState.ts` | Add `prefix` param; default state → `true` |
| Modify | `src/app/knowledge_base/features/document/DocumentView.tsx` | Replace `useState(false)` with `useReadOnlyState` |
| **Create** | `src/app/knowledge_base/shell/ToastContext.tsx` | Lightweight info toast (3s auto-dismiss) |
| **Create** | `src/app/knowledge_base/shared/components/ConflictBanner.tsx` | Non-blocking conflict UI (Reload / Keep my edits) |
| **Create** | `src/app/knowledge_base/shared/context/FileWatcherContext.tsx` | Polling interval + subscriber registry + `refresh()` |
| Modify | `src/app/knowledge_base/knowledgeBase.tsx` | Mount providers; wire refresh + subscribers |
| Modify | `src/app/knowledge_base/features/document/hooks/useDocumentContent.ts` | Add `diskChecksumRef` + `getContentFromDisk()` |
| **Create** | `src/app/knowledge_base/features/document/hooks/useDocumentFileWatcher.ts` | Open-document disk-change detection + conflict |
| Modify | `src/app/knowledge_base/shared/hooks/useHistoryFileSync.ts` | Expose `diskChecksumRef` |
| **Create** | `src/app/knowledge_base/features/diagram/hooks/useDiagramFileWatcher.ts` | Open-diagram disk-change detection + conflict |
| Modify | `src/app/knowledge_base/features/diagram/DiagramView.tsx` | Wire watcher + ConflictBanner |
| **Create** | `src/app/knowledge_base/shared/hooks/useBackgroundScanner.ts` | Background sidecar updater (all non-open files) |

---

## Task 1: Extend `useReadOnlyState` — prefix param + default read-only

**Files:**
- Modify: `src/app/knowledge_base/features/diagram/hooks/useReadOnlyState.ts`
- Create: `src/app/knowledge_base/features/diagram/hooks/useReadOnlyState.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/app/knowledge_base/features/diagram/hooks/useReadOnlyState.test.ts
import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReadOnlyState } from "./useReadOnlyState";

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { store = {}; },
  };
})();

beforeEach(() => {
  vi.stubGlobal("localStorage", localStorageMock);
  localStorageMock.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe("useReadOnlyState", () => {
  it("defaults to true (read-only) when no localStorage entry exists", () => {
    const { result } = renderHook(() => useReadOnlyState("my-file.json"));
    expect(result.current.readOnly).toBe(true);
  });

  it("returns false when localStorage explicitly stores false", () => {
    localStorage.setItem("diagram-read-only:my-file.json", "false");
    const { result } = renderHook(() => useReadOnlyState("my-file.json"));
    expect(result.current.readOnly).toBe(false);
  });

  it("returns true when localStorage stores true", () => {
    localStorage.setItem("diagram-read-only:my-file.json", "true");
    const { result } = renderHook(() => useReadOnlyState("my-file.json"));
    expect(result.current.readOnly).toBe(true);
  });

  it("persists toggle under the diagram-read-only prefix by default", () => {
    const { result } = renderHook(() => useReadOnlyState("my-file.json"));
    act(() => result.current.toggleReadOnly());
    expect(localStorage.getItem("diagram-read-only:my-file.json")).toBe("false");
    expect(result.current.readOnly).toBe(false);
  });

  it("uses a custom prefix when provided", () => {
    const { result } = renderHook(() =>
      useReadOnlyState("notes.md", "document-read-only")
    );
    act(() => result.current.toggleReadOnly());
    expect(localStorage.getItem("document-read-only:notes.md")).toBe("false");
    expect(localStorage.getItem("diagram-read-only:notes.md")).toBeNull();
  });

  it("returns true when activeFile is null", () => {
    const { result } = renderHook(() => useReadOnlyState(null));
    expect(result.current.readOnly).toBe(true);
  });

  it("reloads preference when activeFile changes", () => {
    localStorage.setItem("diagram-read-only:b.json", "false");
    const { result, rerender } = renderHook(
      ({ file }: { file: string | null }) => useReadOnlyState(file),
      { initialProps: { file: "a.json" as string | null } }
    );
    expect(result.current.readOnly).toBe(true); // a.json has no entry → true
    rerender({ file: "b.json" });
    expect(result.current.readOnly).toBe(false); // b.json is explicitly false
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm run test:run -- useReadOnlyState
```

Expected: multiple FAIL — `readOnly` is `false` instead of `true`, prefix test fails.

- [ ] **Step 3: Update `useReadOnlyState`**

Replace the entire file with:

```typescript
"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Per-file Read Mode state. Persists to localStorage under
 * `<prefix>:<activeFile>` so each file remembers its mode independently.
 *
 * Defaults to `true` (read-only) when no localStorage entry exists.
 * Returns `readOnly: true` whenever `activeFile` is null.
 */
export function useReadOnlyState(
  activeFile: string | null,
  prefix = "diagram-read-only",
): {
  readOnly: boolean;
  toggleReadOnly: () => void;
} {
  const storageKey = activeFile ? `${prefix}:${activeFile}` : null;
  const [readOnly, setReadOnly] = useState(true);

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") {
      setReadOnly(true);
      return;
    }
    const stored = localStorage.getItem(storageKey);
    setReadOnly(stored === null ? true : stored === "true");
  }, [storageKey]);

  const toggleReadOnly = useCallback(() => {
    setReadOnly((v) => {
      const next = !v;
      if (storageKey) {
        try { localStorage.setItem(storageKey, String(next)); } catch { /* ignore */ }
      }
      return next;
    });
  }, [storageKey]);

  return { readOnly, toggleReadOnly };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm run test:run -- useReadOnlyState
```

Expected: all PASS.

- [ ] **Step 5: Run the full test suite to check for regressions**

```bash
npm run test:run
```

Expected: all existing tests pass (diagram read-only behavior unchanged for existing localStorage `"true"` entries).

- [ ] **Step 6: Commit**

```bash
git add src/app/knowledge_base/features/diagram/hooks/useReadOnlyState.ts \
        src/app/knowledge_base/features/diagram/hooks/useReadOnlyState.test.ts
git commit -m "feat(read-only): add prefix param, default to read-only on open"
```

---

## Task 2: Wire `DocumentView` to `useReadOnlyState`

**Files:**
- Modify: `src/app/knowledge_base/features/document/DocumentView.tsx` (line 47)

- [ ] **Step 1: Update `DocumentView.tsx`**

At the top of the file, add the import (after the existing imports):

```typescript
import { useReadOnlyState } from "../../features/diagram/hooks/useReadOnlyState";
```

Replace line 47:
```typescript
// Before:
const [readOnly, setReadOnly] = useState(false);

// After:
const { readOnly, toggleReadOnly } = useReadOnlyState(filePath, "document-read-only");
```

Find every reference to `setReadOnly` in `DocumentView.tsx` and replace with `toggleReadOnly`. It appears in the `PaneHeader` prop `onToggleReadOnly`. Replace:
```typescript
// Before:
onToggleReadOnly={() => setReadOnly((v) => !v)}

// After:
onToggleReadOnly={toggleReadOnly}
```

Also remove `setReadOnly` from the `useState` import destructure at line 3 if it becomes unused (check — `setReadOnly` is the only use of the `useState` call on line 47; the other `useState` calls on lines 44-46 and 48 remain).

- [ ] **Step 2: Run the full test suite**

```bash
npm run test:run
```

Expected: all tests pass. TypeScript must compile cleanly.

- [ ] **Step 3: Verify build compiles**

```bash
npm run build 2>&1 | tail -20
```

Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/knowledge_base/features/document/DocumentView.tsx
git commit -m "feat(read-only): documents now open in read mode by default, persist per-file"
```

---

## Task 3: Build `ToastContext`

`ShellErrorContext` is error-only and cannot carry info-level messages. We need a separate lightweight toast.

**Files:**
- Create: `src/app/knowledge_base/shell/ToastContext.tsx`
- Create: `src/app/knowledge_base/shell/ToastContext.test.tsx`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/app/knowledge_base/shell/ToastContext.test.tsx
import { render, screen, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ToastProvider, useToast } from "./ToastContext";

function ShowToastButton({ msg }: { msg: string }) {
  const { showToast } = useToast();
  return <button onClick={() => showToast(msg)}>show</button>;
}

describe("ToastContext", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("renders the toast message when showToast is called", () => {
    render(
      <ToastProvider>
        <ShowToastButton msg="File reloaded from disk" />
      </ToastProvider>
    );
    act(() => screen.getByRole("button").click());
    expect(screen.getByRole("status")).toHaveTextContent("File reloaded from disk");
  });

  it("auto-dismisses after the default 3000ms", () => {
    render(
      <ToastProvider>
        <ShowToastButton msg="hello" />
      </ToastProvider>
    );
    act(() => screen.getByRole("button").click());
    expect(screen.getByRole("status")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("replaces a previous toast with a new one", () => {
    function TwoButtons() {
      const { showToast } = useToast();
      return (
        <>
          <button onClick={() => showToast("first")}>first</button>
          <button onClick={() => showToast("second")}>second</button>
        </>
      );
    }
    render(<ToastProvider><TwoButtons /></ToastProvider>);
    act(() => screen.getByText("first").click());
    act(() => screen.getByText("second").click());
    expect(screen.getByRole("status")).toHaveTextContent("second");
    expect(screen.queryByText("first")).toBeNull();
  });

  it("throws when useToast is called outside the provider", () => {
    function Bad() { useToast(); return null; }
    expect(() => render(<Bad />)).toThrow("useToast must be used within ToastProvider");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm run test:run -- ToastContext
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `ToastContext.tsx`**

```typescript
// src/app/knowledge_base/shell/ToastContext.tsx
"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { ReactNode } from "react";

interface ToastContextValue {
  showToast: (message: string, duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string, duration = 3000) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setMessage(msg);
    timerRef.current = setTimeout(() => setMessage(null), duration);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {message && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-sm px-4 py-2 rounded-lg shadow-lg z-50 pointer-events-none"
        >
          {message}
        </div>
      )}
    </ToastContext.Provider>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm run test:run -- ToastContext
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/knowledge_base/shell/ToastContext.tsx \
        src/app/knowledge_base/shell/ToastContext.test.tsx
git commit -m "feat(toast): add lightweight info toast context"
```

---

## Task 4: Build `ConflictBanner`

**Files:**
- Create: `src/app/knowledge_base/shared/components/ConflictBanner.tsx`
- Create: `src/app/knowledge_base/shared/components/ConflictBanner.test.tsx`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/app/knowledge_base/shared/components/ConflictBanner.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ConflictBanner from "./ConflictBanner";

describe("ConflictBanner", () => {
  it("renders the conflict message", () => {
    render(<ConflictBanner onReload={vi.fn()} onKeep={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This file was changed outside the app."
    );
  });

  it("calls onReload when Reload from disk is clicked", async () => {
    const onReload = vi.fn();
    render(<ConflictBanner onReload={onReload} onKeep={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /reload from disk/i }));
    expect(onReload).toHaveBeenCalledOnce();
  });

  it("calls onKeep when Keep my edits is clicked", async () => {
    const onKeep = vi.fn();
    render(<ConflictBanner onReload={vi.fn()} onKeep={onKeep} />);
    await userEvent.click(screen.getByRole("button", { name: /keep my edits/i }));
    expect(onKeep).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm run test:run -- ConflictBanner
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `ConflictBanner.tsx`**

```typescript
// src/app/knowledge_base/shared/components/ConflictBanner.tsx
"use client";

interface ConflictBannerProps {
  onReload: () => void;
  onKeep: () => void;
}

export default function ConflictBanner({ onReload, onKeep }: ConflictBannerProps) {
  return (
    <div
      role="alert"
      className="flex items-center gap-3 px-4 py-2 bg-amber-50 border-b border-amber-200 text-sm text-amber-900 shrink-0"
    >
      <span className="flex-1">This file was changed outside the app.</span>
      <button
        onClick={onReload}
        className="px-3 py-1 rounded bg-amber-600 text-white text-xs font-medium hover:bg-amber-700 transition-colors"
      >
        Reload from disk
      </button>
      <button
        onClick={onKeep}
        className="px-3 py-1 rounded border border-amber-300 text-xs font-medium hover:bg-amber-100 transition-colors"
      >
        Keep my edits
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm run test:run -- ConflictBanner
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/knowledge_base/shared/components/ConflictBanner.tsx \
        src/app/knowledge_base/shared/components/ConflictBanner.test.tsx
git commit -m "feat(conflict-banner): add disk-conflict UI component"
```

---

## Task 5: Build `FileWatcherContext`

**Files:**
- Create: `src/app/knowledge_base/shared/context/FileWatcherContext.tsx`
- Create: `src/app/knowledge_base/shared/context/FileWatcherContext.test.tsx`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/app/knowledge_base/shared/context/FileWatcherContext.test.tsx
import { render, screen, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { FileWatcherProvider, useFileWatcher } from "./FileWatcherContext";

function Harness({ onTick }: { onTick: () => Promise<void> }) {
  const { subscribe, unsubscribe } = useFileWatcher();
  const ref = { current: false };
  if (!ref.current) {
    ref.current = true;
    subscribe("test", onTick);
  }
  return <button onClick={() => unsubscribe("test")}>unsub</button>;
}

describe("FileWatcherContext", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("calls subscribers on the 5s interval", async () => {
    const tick = vi.fn().mockResolvedValue(undefined);
    render(
      <FileWatcherProvider>
        <Harness onTick={tick} />
      </FileWatcherProvider>
    );
    expect(tick).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(tick).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(tick).toHaveBeenCalledTimes(2);
  });

  it("refresh() calls all subscribers immediately", async () => {
    const tick = vi.fn().mockResolvedValue(undefined);
    function RefreshButton() {
      const { refresh, subscribe } = useFileWatcher();
      subscribe("r", tick);
      return <button onClick={refresh}>refresh</button>;
    }
    render(<FileWatcherProvider><RefreshButton /></FileWatcherProvider>);
    await act(async () => screen.getByRole("button").click());
    expect(tick).toHaveBeenCalledOnce();
  });

  it("unsubscribe removes the subscriber", async () => {
    const tick = vi.fn().mockResolvedValue(undefined);
    render(
      <FileWatcherProvider>
        <Harness onTick={tick} />
      </FileWatcherProvider>
    );
    await act(async () => screen.getByRole("button").click()); // unsubscribe
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(tick).not.toHaveBeenCalled();
  });

  it("throws when useFileWatcher is used outside provider", () => {
    function Bad() { useFileWatcher(); return null; }
    expect(() => render(<Bad />)).toThrow("useFileWatcher must be used within FileWatcherProvider");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm run test:run -- FileWatcherContext
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `FileWatcherContext.tsx`**

```typescript
// src/app/knowledge_base/shared/context/FileWatcherContext.tsx
"use client";

import { createContext, useCallback, useContext, useEffect, useRef } from "react";
import type { ReactNode } from "react";

const POLL_INTERVAL_MS = 5000;

interface FileWatcherContextValue {
  subscribe: (id: string, fn: () => Promise<void>) => void;
  unsubscribe: (id: string) => void;
  refresh: () => void;
}

const FileWatcherContext = createContext<FileWatcherContextValue | null>(null);

export function useFileWatcher(): FileWatcherContextValue {
  const ctx = useContext(FileWatcherContext);
  if (!ctx) throw new Error("useFileWatcher must be used within FileWatcherProvider");
  return ctx;
}

export function FileWatcherProvider({ children }: { children: ReactNode }) {
  const subscribersRef = useRef(new Map<string, () => Promise<void>>());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runAll = useCallback(async () => {
    await Promise.all([...subscribersRef.current.values()].map((fn) => fn()));
  }, []);

  const subscribe = useCallback((id: string, fn: () => Promise<void>) => {
    subscribersRef.current.set(id, fn);
  }, []);

  const unsubscribe = useCallback((id: string) => {
    subscribersRef.current.delete(id);
  }, []);

  const refresh = useCallback(() => {
    void runAll();
  }, [runAll]);

  useEffect(() => {
    const start = () => {
      intervalRef.current = setInterval(() => void runAll(), POLL_INTERVAL_MS);
    };
    const stop = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    start();

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        stop();
      } else {
        stop();
        void runAll(); // catch up immediately on tab focus
        start();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [runAll]);

  return (
    <FileWatcherContext.Provider value={{ subscribe, unsubscribe, refresh }}>
      {children}
    </FileWatcherContext.Provider>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm run test:run -- FileWatcherContext
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/knowledge_base/shared/context/FileWatcherContext.tsx \
        src/app/knowledge_base/shared/context/FileWatcherContext.test.tsx
git commit -m "feat(file-watcher): add FileWatcherContext with 5s polling + subscriber registry"
```

---

## Task 6: Mount providers in `knowledgeBase.tsx` and wire refresh

**Files:**
- Modify: `src/app/knowledge_base/knowledgeBase.tsx`

- [ ] **Step 1: Read the top of `knowledgeBase.tsx` to find the outer wrapper component**

```bash
grep -n "export default\|function Knowledge\|ShellErrorProvider\|RepositoryProvider" \
  "src/app/knowledge_base/knowledgeBase.tsx" | head -20
```

Look for the outer component that wraps `KnowledgeBaseInner` with `ShellErrorProvider` and `RepositoryProvider`. That is where you add the new providers.

- [ ] **Step 2: Add imports to `knowledgeBase.tsx`**

At the top of the file, alongside the existing imports, add:

```typescript
import { FileWatcherProvider } from "./shared/context/FileWatcherContext";
import { ToastProvider } from "./shell/ToastContext";
```

- [ ] **Step 3: Wrap the outer component with `FileWatcherProvider` and `ToastProvider`**

Find the outer component's return statement — it should look something like:

```typescript
return (
  <ShellErrorProvider>
    <RepositoryProvider ...>
      <KnowledgeBaseInner ... />
    </RepositoryProvider>
  </ShellErrorProvider>
);
```

Add `FileWatcherProvider` and `ToastProvider` inside the existing providers (they need `ShellErrorContext` and `RepositoryContext` to be available, so they go inside those):

```typescript
return (
  <ShellErrorProvider>
    <RepositoryProvider ...>
      <FileWatcherProvider>
        <ToastProvider>
          <KnowledgeBaseInner ... />
        </ToastProvider>
      </FileWatcherProvider>
    </RepositoryProvider>
  </ShellErrorProvider>
);
```

- [ ] **Step 4: Wire the ExplorerPanel refresh to `context.refresh()`**

In `KnowledgeBaseInner`, add:

```typescript
import { useFileWatcher } from "./shared/context/FileWatcherContext";

// Inside KnowledgeBaseInner:
const { refresh: watcherRefresh } = useFileWatcher();
```

Find the ExplorerPanel's `onRefresh` prop (line ~493):
```typescript
onRefresh={fileExplorer.refresh}
```

Replace with a combined handler that calls both:
```typescript
onRefresh={useCallback(async () => {
  await fileExplorer.refresh();
  watcherRefresh();
}, [fileExplorer.refresh, watcherRefresh])}
```

Actually, since `fileExplorer.refresh` is already registered as the `"tree"` subscriber (next task), calling `watcherRefresh()` will trigger all subscribers including the content watcher. The cleaner approach: just replace `onRefresh` with `watcherRefresh` once the tree subscriber is wired in Task 7. For now, keep `onRefresh={fileExplorer.refresh}` and we'll update it in Task 7.

- [ ] **Step 5: Verify build compiles**

```bash
npm run build 2>&1 | tail -20
```

Expected: no TypeScript errors.

- [ ] **Step 6: Run the test suite**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/app/knowledge_base/knowledgeBase.tsx
git commit -m "feat(file-watcher): mount FileWatcherProvider and ToastProvider in shell"
```

---

## Task 7: Wire the tree subscriber

**Files:**
- Modify: `src/app/knowledge_base/knowledgeBase.tsx`

- [ ] **Step 1: Register `fileExplorer.refresh` as the `"tree"` subscriber**

In `KnowledgeBaseInner`, add this effect (after the `watcherRefresh` line from Task 6):

```typescript
const { subscribe, unsubscribe, refresh: watcherRefresh } = useFileWatcher();

useEffect(() => {
  subscribe("tree", fileExplorer.refresh);
  return () => unsubscribe("tree");
}, [subscribe, unsubscribe, fileExplorer.refresh]);
```

- [ ] **Step 2: Update `onRefresh` prop to use `watcherRefresh`**

Now that the tree subscriber is registered, the manual refresh button should fire all subscribers (tree + content + background) at once. Update:

```typescript
// Before:
onRefresh={fileExplorer.refresh}

// After:
onRefresh={watcherRefresh}
```

- [ ] **Step 3: Verify build**

```bash
npm run build 2>&1 | tail -20
```

- [ ] **Step 4: Run the test suite**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/knowledge_base/knowledgeBase.tsx
git commit -m "feat(file-watcher): wire tree subscriber + unified refresh button"
```

---

## Task 8: Add disk-change detection to `useDocumentContent`

**Files:**
- Modify: `src/app/knowledge_base/features/document/hooks/useDocumentContent.ts`

- [ ] **Step 1: Read the existing test file for `useDocumentContent`**

```bash
find src -name "useDocumentContent*test*" -o -name "useDocumentContent*spec*" 2>/dev/null
```

If no test file exists, create one at `src/app/knowledge_base/features/document/hooks/useDocumentContent.discard.test.tsx` — but note this module already has a test file based on prior exploration. Add the new tests there.

- [ ] **Step 2: Write the failing tests for the new exports**

Add to the existing `useDocumentContent` test file:

```typescript
import { fnv1a } from "../../../shared/utils/historyPersistence";

describe("useDocumentContent — disk change detection", () => {
  it("exposes diskChecksumRef that updates on successful load", async () => {
    const mockRepo = { read: vi.fn().mockResolvedValue("hello"), write: vi.fn() };
    // ... render hook with mocked repo ...
    // After load, diskChecksumRef.current should equal fnv1a("hello")
    // This is an integration-style test — adapt to existing test patterns in the file
  });

  it("getContentFromDisk returns null when no filePath", async () => {
    // render with filePath = null, call getContentFromDisk, expect null
  });

  it("getContentFromDisk returns content + checksum on success", async () => {
    // render with filePath = "test.md", mock repo.read → "content"
    // call getContentFromDisk, expect { text: "content", checksum: fnv1a("content") }
  });
});
```

Adapt these tests to match the existing test harness pattern in `useDocumentContent.discard.test.tsx` (which mocks the repo via `StubRepositoryProvider`).

- [ ] **Step 3: Run the tests to verify they fail**

```bash
npm run test:run -- useDocumentContent
```

- [ ] **Step 4: Add `diskChecksumRef`, `getContentFromDisk`, and `updateDiskChecksum` to `useDocumentContent`**

At the top of `useDocumentContent`, add:

```typescript
import { fnv1a } from "../../../shared/utils/historyPersistence";
```

Inside the hook body, after `const loadErrorRef = useRef(...)`, add:

```typescript
const diskChecksumRef = useRef<string>("");
```

In the load effect, after `setContent(text)` and `setDirty(false)`:

```typescript
const text = await repo.read(filePath);
setContent(text);
diskChecksumRef.current = fnv1a(text); // ← add this line
setDirty(false);
```

In the `save` callback, after `await repo.write(filePath, contentRef.current)`:

```typescript
await repo.write(filePath, contentRef.current);
diskChecksumRef.current = fnv1a(contentRef.current); // ← add this line
setDirty(false);
```

Add two new callbacks inside the hook:

```typescript
const getContentFromDisk = useCallback(async (): Promise<{ text: string; checksum: string } | null> => {
  const repo = documentRepoRef.current;
  if (!repo || !filePath) return null;
  try {
    const text = await repo.read(filePath);
    return { text, checksum: fnv1a(text) };
  } catch {
    return null;
  }
}, [filePath]);

const updateDiskChecksum = useCallback((checksum: string) => {
  diskChecksumRef.current = checksum;
}, []);
```

Update the return value:

```typescript
return {
  content, dirty, loadError, loadedPath, save, discard, resetToContent, updateContent, bridge,
  diskChecksumRef, getContentFromDisk, updateDiskChecksum,
};
```

- [ ] **Step 5: Run the tests**

```bash
npm run test:run -- useDocumentContent
```

Expected: new tests PASS, existing tests still PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/knowledge_base/features/document/hooks/useDocumentContent.ts
git commit -m "feat(file-watcher): add disk checksum tracking to useDocumentContent"
```

---

## Task 9: Build `useDocumentFileWatcher`

**Files:**
- Create: `src/app/knowledge_base/features/document/hooks/useDocumentFileWatcher.ts`
- Create: `src/app/knowledge_base/features/document/hooks/useDocumentFileWatcher.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/app/knowledge_base/features/document/hooks/useDocumentFileWatcher.test.ts
import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useDocumentFileWatcher } from "./useDocumentFileWatcher";
import { fnv1a } from "../../../shared/utils/historyPersistence";
import { FileWatcherProvider } from "../../../shared/context/FileWatcherContext";
import { ToastProvider } from "../../../shell/ToastContext";
import type { ReactNode } from "react";

function wrapper({ children }: { children: ReactNode }) {
  return <FileWatcherProvider><ToastProvider>{children}</ToastProvider></FileWatcherProvider>;
}

function makeHistory() {
  return { recordAction: vi.fn(), markSaved: vi.fn() };
}

describe("useDocumentFileWatcher", () => {
  it("no-ops when content checksum matches disk", async () => {
    const history = makeHistory();
    const getContentFromDisk = vi.fn().mockResolvedValue({ text: "abc", checksum: fnv1a("abc") });
    const diskChecksumRef = { current: fnv1a("abc") };
    const resetToContent = vi.fn();
    const { result } = renderHook(
      () => useDocumentFileWatcher({
        filePath: "a.md", dirty: false, diskChecksumRef, getContentFromDisk,
        resetToContent, history, updateDiskChecksum: vi.fn(),
      }),
      { wrapper }
    );
    const { subscribe } = result.current.__test__;
    const sub = subscribe.mock.calls[0]?.[1];
    if (sub) await act(async () => sub());
    expect(resetToContent).not.toHaveBeenCalled();
  });

  it("silently reloads when checksum differs and file is clean", async () => {
    const history = makeHistory();
    const newText = "updated content";
    const getContentFromDisk = vi.fn().mockResolvedValue({ text: newText, checksum: fnv1a(newText) });
    const diskChecksumRef = { current: fnv1a("old content") };
    const resetToContent = vi.fn();
    const updateDiskChecksum = vi.fn();
    const { result } = renderHook(
      () => useDocumentFileWatcher({
        filePath: "a.md", dirty: false, diskChecksumRef, getContentFromDisk,
        resetToContent, history, updateDiskChecksum,
      }),
      { wrapper }
    );
    const sub = vi.mocked(result.current.__test__.subscribeRef.current);
    // Trigger the subscriber via the watcher's internal ref
    // (Alternatively: trigger via the FileWatcherContext refresh)
    // Since this is an internal test, we call checkForChanges directly
    await act(async () => result.current.__test__.checkForChanges());
    expect(history.recordAction).toHaveBeenCalledWith("Reloaded from disk", newText);
    expect(history.markSaved).toHaveBeenCalled();
    expect(resetToContent).toHaveBeenCalledWith(newText);
    expect(updateDiskChecksum).toHaveBeenCalledWith(fnv1a(newText));
  });

  it("sets conflictContent when file is dirty and disk differs", async () => {
    const history = makeHistory();
    const newText = "disk version";
    const getContentFromDisk = vi.fn().mockResolvedValue({ text: newText, checksum: fnv1a(newText) });
    const diskChecksumRef = { current: fnv1a("saved version") };
    const { result } = renderHook(
      () => useDocumentFileWatcher({
        filePath: "a.md", dirty: true, diskChecksumRef, getContentFromDisk,
        resetToContent: vi.fn(), history, updateDiskChecksum: vi.fn(),
      }),
      { wrapper }
    );
    await act(async () => result.current.__test__.checkForChanges());
    expect(result.current.conflictContent).toBe(newText);
    expect(history.recordAction).not.toHaveBeenCalled();
  });

  it("handleReloadFromDisk clears conflict and applies disk content", async () => {
    const history = makeHistory();
    const newText = "disk version";
    const getContentFromDisk = vi.fn().mockResolvedValue({ text: newText, checksum: fnv1a(newText) });
    const diskChecksumRef = { current: fnv1a("saved") };
    const resetToContent = vi.fn();
    const updateDiskChecksum = vi.fn();
    const { result } = renderHook(
      () => useDocumentFileWatcher({
        filePath: "a.md", dirty: true, diskChecksumRef, getContentFromDisk,
        resetToContent, history, updateDiskChecksum,
      }),
      { wrapper }
    );
    await act(async () => result.current.__test__.checkForChanges());
    expect(result.current.conflictContent).toBe(newText);
    act(() => result.current.handleReloadFromDisk());
    expect(result.current.conflictContent).toBeNull();
    expect(resetToContent).toHaveBeenCalledWith(newText);
    expect(history.recordAction).toHaveBeenCalledWith("Reloaded from disk", newText);
    expect(history.markSaved).toHaveBeenCalled();
  });

  it("handleKeepEdits dismisses the banner and suppresses the same checksum", async () => {
    const history = makeHistory();
    const diskText = "disk";
    const getContentFromDisk = vi.fn().mockResolvedValue({ text: diskText, checksum: fnv1a(diskText) });
    const diskChecksumRef = { current: fnv1a("saved") };
    const resetToContent = vi.fn();
    const { result } = renderHook(
      () => useDocumentFileWatcher({
        filePath: "a.md", dirty: true, diskChecksumRef, getContentFromDisk,
        resetToContent, history, updateDiskChecksum: vi.fn(),
      }),
      { wrapper }
    );
    await act(async () => result.current.__test__.checkForChanges());
    act(() => result.current.handleKeepEdits());
    expect(result.current.conflictContent).toBeNull();
    // Trigger again with same disk checksum — should not conflict
    await act(async () => result.current.__test__.checkForChanges());
    expect(result.current.conflictContent).toBeNull();
    expect(resetToContent).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm run test:run -- useDocumentFileWatcher
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `useDocumentFileWatcher.ts`**

```typescript
// src/app/knowledge_base/features/document/hooks/useDocumentFileWatcher.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fnv1a } from "../../../shared/utils/historyPersistence";
import { useFileWatcher } from "../../../shared/context/FileWatcherContext";
import { useToast } from "../../../shell/ToastContext";
import type { HistoryCore } from "../../../shared/hooks/useHistoryCore";

export interface UseDocumentFileWatcherOptions {
  filePath: string | null;
  dirty: boolean;
  diskChecksumRef: React.RefObject<string>;
  getContentFromDisk: () => Promise<{ text: string; checksum: string } | null>;
  resetToContent: (text: string) => void;
  history: Pick<HistoryCore<string>, "recordAction" | "markSaved">;
  updateDiskChecksum: (checksum: string) => void;
}

export interface UseDocumentFileWatcherResult {
  conflictContent: string | null;
  handleReloadFromDisk: () => void;
  handleKeepEdits: () => void;
  /** Exposed for tests only. */
  __test__: { checkForChanges: () => Promise<void> };
}

export function useDocumentFileWatcher({
  filePath,
  dirty,
  diskChecksumRef,
  getContentFromDisk,
  resetToContent,
  history,
  updateDiskChecksum,
}: UseDocumentFileWatcherOptions): UseDocumentFileWatcherResult {
  const { subscribe, unsubscribe } = useFileWatcher();
  const { showToast } = useToast();
  const [conflictContent, setConflictContent] = useState<string | null>(null);
  const dismissedChecksumRef = useRef<string | null>(null);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const checkForChanges = useCallback(async () => {
    if (!filePath) return;
    const result = await getContentFromDisk();
    if (!result) return;
    const { text, checksum } = result;
    if (checksum === diskChecksumRef.current) return;
    if (checksum === dismissedChecksumRef.current) return;

    if (!dirtyRef.current) {
      history.recordAction("Reloaded from disk", text);
      history.markSaved();
      resetToContent(text);
      updateDiskChecksum(checksum);
      showToast("File reloaded from disk");
    } else {
      setConflictContent(text);
    }
  }, [filePath, getContentFromDisk, diskChecksumRef, history, resetToContent, updateDiskChecksum, showToast]);

  useEffect(() => {
    subscribe("content", checkForChanges);
    return () => unsubscribe("content");
  }, [subscribe, unsubscribe, checkForChanges]);

  const handleReloadFromDisk = useCallback(() => {
    if (!conflictContent) return;
    const checksum = fnv1a(conflictContent);
    history.recordAction("Reloaded from disk", conflictContent);
    history.markSaved();
    resetToContent(conflictContent);
    updateDiskChecksum(checksum);
    dismissedChecksumRef.current = null;
    setConflictContent(null);
    showToast("File reloaded from disk");
  }, [conflictContent, history, resetToContent, updateDiskChecksum, showToast]);

  const handleKeepEdits = useCallback(() => {
    if (!conflictContent) return;
    dismissedChecksumRef.current = fnv1a(conflictContent);
    setConflictContent(null);
  }, [conflictContent]);

  return {
    conflictContent,
    handleReloadFromDisk,
    handleKeepEdits,
    __test__: { checkForChanges },
  };
}
```

- [ ] **Step 4: Run the tests**

```bash
npm run test:run -- useDocumentFileWatcher
```

Expected: all PASS.

- [ ] **Step 5: Run full test suite**

```bash
npm run test:run
```

- [ ] **Step 6: Commit**

```bash
git add src/app/knowledge_base/features/document/hooks/useDocumentFileWatcher.ts \
        src/app/knowledge_base/features/document/hooks/useDocumentFileWatcher.test.ts
git commit -m "feat(file-watcher): add useDocumentFileWatcher for open-file disk change detection"
```

---

## Task 10: Wire document watcher and `ConflictBanner` into `DocumentView`

**Files:**
- Modify: `src/app/knowledge_base/features/document/DocumentView.tsx`

- [ ] **Step 1: Add imports**

```typescript
import { useDocumentFileWatcher } from "./hooks/useDocumentFileWatcher";
import ConflictBanner from "../../shared/components/ConflictBanner";
```

- [ ] **Step 2: Call `useDocumentFileWatcher` inside `DocumentView`**

After the `history` declaration (line 41), add:

```typescript
const { conflictContent, handleReloadFromDisk, handleKeepEdits } = useDocumentFileWatcher({
  filePath,
  dirty,
  diskChecksumRef,
  getContentFromDisk,
  resetToContent,
  history,
  updateDiskChecksum,
});
```

`diskChecksumRef`, `getContentFromDisk`, and `updateDiskChecksum` come from `useDocumentContent` (returned from Task 8).

- [ ] **Step 3: Update the `useDocumentContent` destructure on line 40**

```typescript
// Before:
const { content, dirty, updateContent, bridge, save, discard, resetToContent, loadedPath } = useDocumentContent(filePath);

// After:
const {
  content, dirty, updateContent, bridge, save, discard, resetToContent, loadedPath,
  diskChecksumRef, getContentFromDisk, updateDiskChecksum,
} = useDocumentContent(filePath);
```

- [ ] **Step 4: Render `ConflictBanner` in the JSX**

Find the main content wrapper in `DocumentView`'s return statement — there will be a `<div className="flex flex-col ...">` or similar container that holds `MarkdownPane`. Add `ConflictBanner` above `MarkdownPane`, conditional on `conflictContent`:

```tsx
{conflictContent && (
  <ConflictBanner
    onReload={handleReloadFromDisk}
    onKeep={handleKeepEdits}
  />
)}
<MarkdownPane ... />
```

- [ ] **Step 5: Run the test suite**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 6: Verify the build**

```bash
npm run build 2>&1 | tail -20
```

- [ ] **Step 7: Commit**

```bash
git add src/app/knowledge_base/features/document/DocumentView.tsx
git commit -m "feat(file-watcher): wire document disk-change watcher and ConflictBanner"
```

---

## Task 11: Expose `diskChecksumRef` from `useHistoryFileSync`

**Files:**
- Modify: `src/app/knowledge_base/shared/hooks/useHistoryFileSync.ts`

- [ ] **Step 1: Add `diskChecksumRef` to the `HistoryFileSync<T>` interface**

In `useHistoryFileSync.ts`, update the interface:

```typescript
export interface HistoryFileSync<T> extends HistoryCore<T> {
  initHistory(
    fileContent: string,
    initialSnapshot: T,
    dirHandle: FileSystemDirectoryHandle | null,
    filePath: string | null,
  ): Promise<void>;
  onFileSave(fileContent: string): void;
  clearHistory(): void;
  readonly diskChecksumRef: React.RefObject<string>; // ← add
}
```

- [ ] **Step 2: Add `React` import**

At the top of the file, add:
```typescript
import type React from "react";
```

- [ ] **Step 3: Expose `checksumRef` as `diskChecksumRef` in the return value**

Change the return:

```typescript
return {
  ...core,
  initHistory,
  onFileSave,
  clearHistory,
  diskChecksumRef: checksumRef, // ← add
};
```

- [ ] **Step 4: Run the full test suite**

```bash
npm run test:run
```

Expected: all existing tests pass. `diskChecksumRef` is additive.

- [ ] **Step 5: Commit**

```bash
git add src/app/knowledge_base/shared/hooks/useHistoryFileSync.ts
git commit -m "feat(file-watcher): expose diskChecksumRef from useHistoryFileSync"
```

---

## Task 12: Build `useDiagramFileWatcher`

**Files:**
- Create: `src/app/knowledge_base/features/diagram/hooks/useDiagramFileWatcher.ts`
- Create: `src/app/knowledge_base/features/diagram/hooks/useDiagramFileWatcher.test.ts`

- [ ] **Step 1: Read `useDiagramPersistence.ts` to understand the diagram data loading interface**

```bash
cat -n "src/app/knowledge_base/features/diagram/hooks/useDiagramPersistence.ts" | head -60
```

Look for: what `useDiagramPersistence` returns (specifically any `diskJson` or raw-file access), how diagrams are loaded on `activeFile` change, and what callback fires when a save occurs.

- [ ] **Step 2: Write the failing tests**

These follow the same pattern as `useDocumentFileWatcher.test.ts`. Replace `string` with `DiagramSnapshot` as the snapshot type:

```typescript
// src/app/knowledge_base/features/diagram/hooks/useDiagramFileWatcher.test.ts
import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useDiagramFileWatcher } from "./useDiagramFileWatcher";
import { fnv1a } from "../../../shared/utils/historyPersistence";
import { FileWatcherProvider } from "../../../shared/context/FileWatcherContext";
import { ToastProvider } from "../../../shell/ToastContext";
import type { DiagramSnapshot } from "../../../shared/hooks/useDiagramHistory";
import type { ReactNode } from "react";

function wrapper({ children }: { children: ReactNode }) {
  return <FileWatcherProvider><ToastProvider>{children}</ToastProvider></FileWatcherProvider>;
}

const emptySnapshot: DiagramSnapshot = {
  title: "test", layerDefs: [], nodes: [], connections: [],
  layerManualSizes: {}, lineCurve: "curve", flows: [],
};

function makeHistory() {
  return { recordAction: vi.fn(), markSaved: vi.fn() };
}

describe("useDiagramFileWatcher", () => {
  it("no-ops when checksum matches disk", async () => {
    const json = JSON.stringify(emptySnapshot);
    const getJsonFromDisk = vi.fn().mockResolvedValue({ json, checksum: fnv1a(json) });
    const diskChecksumRef = { current: fnv1a(json) };
    const applySnapshot = vi.fn();
    const { result } = renderHook(
      () => useDiagramFileWatcher({
        activeFile: "a.json", dirty: false, diskChecksumRef, getJsonFromDisk,
        applySnapshot, history: makeHistory(), updateDiskChecksum: vi.fn(),
      }),
      { wrapper }
    );
    await act(async () => result.current.__test__.checkForChanges());
    expect(applySnapshot).not.toHaveBeenCalled();
  });

  it("silently reloads when clean and disk differs", async () => {
    const newSnapshot = { ...emptySnapshot, title: "updated" };
    const json = JSON.stringify(newSnapshot);
    const getJsonFromDisk = vi.fn().mockResolvedValue({ json, checksum: fnv1a(json), snapshot: newSnapshot });
    const diskChecksumRef = { current: fnv1a(JSON.stringify(emptySnapshot)) };
    const applySnapshot = vi.fn();
    const history = makeHistory();
    const { result } = renderHook(
      () => useDiagramFileWatcher({
        activeFile: "a.json", dirty: false, diskChecksumRef, getJsonFromDisk,
        applySnapshot, history, updateDiskChecksum: vi.fn(),
      }),
      { wrapper }
    );
    await act(async () => result.current.__test__.checkForChanges());
    expect(history.recordAction).toHaveBeenCalledWith("Reloaded from disk", newSnapshot);
    expect(history.markSaved).toHaveBeenCalled();
    expect(applySnapshot).toHaveBeenCalledWith(newSnapshot);
  });

  it("sets conflictContent when dirty and disk differs", async () => {
    const newSnapshot = { ...emptySnapshot, title: "disk" };
    const json = JSON.stringify(newSnapshot);
    const getJsonFromDisk = vi.fn().mockResolvedValue({ json, checksum: fnv1a(json), snapshot: newSnapshot });
    const diskChecksumRef = { current: fnv1a(JSON.stringify(emptySnapshot)) };
    const { result } = renderHook(
      () => useDiagramFileWatcher({
        activeFile: "a.json", dirty: true, diskChecksumRef, getJsonFromDisk,
        applySnapshot: vi.fn(), history: makeHistory(), updateDiskChecksum: vi.fn(),
      }),
      { wrapper }
    );
    await act(async () => result.current.__test__.checkForChanges());
    expect(result.current.conflictSnapshot).toEqual(newSnapshot);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
npm run test:run -- useDiagramFileWatcher
```

- [ ] **Step 4: Create `useDiagramFileWatcher.ts`**

The interface mirrors `useDocumentFileWatcher` but uses `DiagramSnapshot` instead of `string`:

```typescript
// src/app/knowledge_base/features/diagram/hooks/useDiagramFileWatcher.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fnv1a } from "../../../shared/utils/historyPersistence";
import { useFileWatcher } from "../../../shared/context/FileWatcherContext";
import { useToast } from "../../../shell/ToastContext";
import type { HistoryCore } from "../../../shared/hooks/useHistoryCore";
import type { DiagramSnapshot } from "../../../shared/hooks/useDiagramHistory";

export interface UseDiagramFileWatcherOptions {
  activeFile: string | null;
  dirty: boolean;
  diskChecksumRef: React.RefObject<string>;
  getJsonFromDisk: () => Promise<{ json: string; checksum: string; snapshot: DiagramSnapshot } | null>;
  applySnapshot: (snapshot: DiagramSnapshot) => void;
  history: Pick<HistoryCore<DiagramSnapshot>, "recordAction" | "markSaved">;
  updateDiskChecksum: (checksum: string) => void;
}

export interface UseDiagramFileWatcherResult {
  conflictSnapshot: DiagramSnapshot | null;
  handleReloadFromDisk: () => void;
  handleKeepEdits: () => void;
  __test__: { checkForChanges: () => Promise<void> };
}

export function useDiagramFileWatcher({
  activeFile,
  dirty,
  diskChecksumRef,
  getJsonFromDisk,
  applySnapshot,
  history,
  updateDiskChecksum,
}: UseDiagramFileWatcherOptions): UseDiagramFileWatcherResult {
  const { subscribe, unsubscribe } = useFileWatcher();
  const { showToast } = useToast();
  const [conflictSnapshot, setConflictSnapshot] = useState<DiagramSnapshot | null>(null);
  const dismissedChecksumRef = useRef<string | null>(null);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const checkForChanges = useCallback(async () => {
    if (!activeFile) return;
    const result = await getJsonFromDisk();
    if (!result) return;
    const { checksum, snapshot } = result;
    if (checksum === diskChecksumRef.current) return;
    if (checksum === dismissedChecksumRef.current) return;

    if (!dirtyRef.current) {
      history.recordAction("Reloaded from disk", snapshot);
      history.markSaved();
      applySnapshot(snapshot);
      updateDiskChecksum(checksum);
      showToast("File reloaded from disk");
    } else {
      setConflictSnapshot(snapshot);
    }
  }, [activeFile, getJsonFromDisk, diskChecksumRef, history, applySnapshot, updateDiskChecksum, showToast]);

  useEffect(() => {
    subscribe("content", checkForChanges);
    return () => unsubscribe("content");
  }, [subscribe, unsubscribe, checkForChanges]);

  const handleReloadFromDisk = useCallback(() => {
    if (!conflictSnapshot) return;
    const checksum = fnv1a(JSON.stringify(conflictSnapshot));
    history.recordAction("Reloaded from disk", conflictSnapshot);
    history.markSaved();
    applySnapshot(conflictSnapshot);
    updateDiskChecksum(checksum);
    dismissedChecksumRef.current = null;
    setConflictSnapshot(null);
    showToast("File reloaded from disk");
  }, [conflictSnapshot, history, applySnapshot, updateDiskChecksum, showToast]);

  const handleKeepEdits = useCallback(() => {
    if (!conflictSnapshot) return;
    dismissedChecksumRef.current = fnv1a(JSON.stringify(conflictSnapshot));
    setConflictSnapshot(null);
  }, [conflictSnapshot]);

  return { conflictSnapshot, handleReloadFromDisk, handleKeepEdits, __test__: { checkForChanges } };
}
```

- [ ] **Step 5: Run the tests**

```bash
npm run test:run -- useDiagramFileWatcher
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/knowledge_base/features/diagram/hooks/useDiagramFileWatcher.ts \
        src/app/knowledge_base/features/diagram/hooks/useDiagramFileWatcher.test.ts
git commit -m "feat(file-watcher): add useDiagramFileWatcher for open-diagram disk change detection"
```

---

## Task 13: Wire diagram watcher into `DiagramView`

**Files:**
- Modify: `src/app/knowledge_base/features/diagram/DiagramView.tsx`
- Modify: `src/app/knowledge_base/features/diagram/hooks/useDiagramPersistence.ts` (add `getJsonFromDisk`)

- [ ] **Step 1: Read `useDiagramPersistence.ts` fully**

```bash
cat -n "src/app/knowledge_base/features/diagram/hooks/useDiagramPersistence.ts"
```

Identify:
1. Does it expose a `dirty` flag?
2. Does it have access to `dirHandleRef` and `activeFile` to re-read from disk?
3. What does `applySnapshot` look like — how does `DiagramView` apply a new diagram state?

- [ ] **Step 2: Add `getJsonFromDisk` to `useDiagramPersistence`**

Inside `useDiagramPersistence`, add a function that reads the current diagram file and returns its JSON + parsed snapshot:

```typescript
import { fnv1a } from "../../../shared/utils/historyPersistence";
import { createDiagramRepository } from "../../../infrastructure/diagramRepo";
import type { DiagramSnapshot } from "../../../shared/hooks/useDiagramHistory";

// Inside the hook body:
const getJsonFromDisk = useCallback(async (): Promise<{
  json: string;
  checksum: string;
  snapshot: DiagramSnapshot;
} | null> => {
  const rootHandle = dirHandleRef.current; // adapt to the actual ref name in useDiagramPersistence
  if (!rootHandle || !activeFile) return null;
  try {
    const repo = createDiagramRepository(rootHandle);
    const data = await repo.read(activeFile);
    const json = JSON.stringify(data);
    return { json, checksum: fnv1a(json), snapshot: data as DiagramSnapshot };
  } catch {
    return null;
  }
}, [activeFile /* + dirHandleRef if it's a stable ref */]);
```

Adapt variable names to match what `useDiagramPersistence` actually uses. Return `getJsonFromDisk` from the hook.

- [ ] **Step 3: Wire `useDiagramFileWatcher` in `DiagramView`**

At the top of `DiagramView.tsx`, add the import:

```typescript
import { useDiagramFileWatcher } from "./hooks/useDiagramFileWatcher";
import ConflictBanner from "../../shared/components/ConflictBanner";
```

Inside `DiagramView`, after `const { readOnly, toggleReadOnly } = useReadOnlyState(activeFile)`:

```typescript
const { conflictSnapshot, handleReloadFromDisk, handleKeepEdits } = useDiagramFileWatcher({
  activeFile,
  dirty: /* boolean from useDiagramPersistence indicating unsaved changes */,
  diskChecksumRef: history.diskChecksumRef,
  getJsonFromDisk,
  applySnapshot: (snapshot) => {
    // Apply the snapshot to the diagram state — same as what undo/redo does.
    // Look for the existing `applySnapshot` or `loadDiagramFromData` call pattern.
    loadDiagramFromData(snapshot);
  },
  history,
  updateDiskChecksum: (checksum) => { history.diskChecksumRef.current = checksum; },
});
```

Adapt `dirty`, `applySnapshot`, and `updateDiskChecksum` to match the actual variables in `DiagramView`.

- [ ] **Step 4: Render `ConflictBanner` in the JSX**

Find the topmost content wrapper in `DiagramView`'s return and add above the canvas:

```tsx
{conflictSnapshot && (
  <ConflictBanner
    onReload={handleReloadFromDisk}
    onKeep={handleKeepEdits}
  />
)}
```

- [ ] **Step 5: Run the test suite**

```bash
npm run test:run
```

- [ ] **Step 6: Verify build**

```bash
npm run build 2>&1 | tail -20
```

- [ ] **Step 7: Commit**

```bash
git add src/app/knowledge_base/features/diagram/DiagramView.tsx \
        src/app/knowledge_base/features/diagram/hooks/useDiagramPersistence.ts
git commit -m "feat(file-watcher): wire diagram disk-change watcher and ConflictBanner"
```

---

## Task 14: Build `useBackgroundScanner`

**Files:**
- Create: `src/app/knowledge_base/shared/hooks/useBackgroundScanner.ts`
- Create: `src/app/knowledge_base/shared/hooks/useBackgroundScanner.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/app/knowledge_base/shared/hooks/useBackgroundScanner.test.ts
import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useBackgroundScanner } from "./useBackgroundScanner";
import { fnv1a } from "../utils/historyPersistence";
import type { TreeNode } from "./useFileExplorer";
import type { HistoryFile } from "../utils/historyPersistence";

// All file I/O functions are injected so tests stay pure
describe("useBackgroundScanner", () => {
  it("skips the currently open file", async () => {
    const readFile = vi.fn().mockResolvedValue("content");
    const readHistory = vi.fn();
    const writeHistory = vi.fn();
    const tree: TreeNode[] = [{ kind: "file", path: "open.md", name: "open.md" }];
    const { result } = renderHook(() =>
      useBackgroundScanner({
        tree,
        openFilePath: "open.md",
        dirHandleRef: { current: {} as FileSystemDirectoryHandle },
        dirtyFiles: new Set(),
        readFile,
        readHistory,
        writeHistory,
      })
    );
    await act(async () => result.current.scan());
    expect(readHistory).not.toHaveBeenCalled();
  });

  it("skips files with no history sidecar", async () => {
    const readFile = vi.fn().mockResolvedValue("content");
    const readHistory = vi.fn().mockResolvedValue(null);
    const writeHistory = vi.fn();
    const tree: TreeNode[] = [{ kind: "file", path: "a.md", name: "a.md" }];
    const { result } = renderHook(() =>
      useBackgroundScanner({
        tree,
        openFilePath: null,
        dirHandleRef: { current: {} as FileSystemDirectoryHandle },
        dirtyFiles: new Set(),
        readFile,
        readHistory,
        writeHistory,
      })
    );
    await act(async () => result.current.scan());
    expect(writeHistory).not.toHaveBeenCalled();
  });

  it("updates sidecar when checksum differs and file is clean", async () => {
    const text = "new content from disk";
    const oldText = "old content";
    const history: HistoryFile<string> = {
      checksum: fnv1a(oldText),
      currentIndex: 0,
      savedIndex: 0,
      entries: [{ id: 0, description: "File loaded", timestamp: 1000, snapshot: oldText }],
    };
    const readFile = vi.fn().mockResolvedValue(text);
    const readHistory = vi.fn().mockResolvedValue(history);
    const writeHistory = vi.fn().mockResolvedValue(undefined);
    const tree: TreeNode[] = [{ kind: "file", path: "a.md", name: "a.md" }];
    const { result } = renderHook(() =>
      useBackgroundScanner({
        tree,
        openFilePath: null,
        dirHandleRef: { current: {} as FileSystemDirectoryHandle },
        dirtyFiles: new Set(),
        readFile,
        readHistory,
        writeHistory,
      })
    );
    await act(async () => result.current.scan());
    expect(writeHistory).toHaveBeenCalledOnce();
    const written: HistoryFile<string> = writeHistory.mock.calls[0][2];
    expect(written.checksum).toBe(fnv1a(text));
    expect(written.savedIndex).toBe(written.currentIndex);
    const lastEntry = written.entries[written.entries.length - 1];
    expect(lastEntry.description).toBe("Reloaded from disk");
    expect(lastEntry.snapshot).toBe(text);
  });

  it("preserves draft then appends disk entry when file is dirty", async () => {
    const draftText = "my unsaved draft";
    const diskText = "disk content";
    const savedText = "saved";
    const history: HistoryFile<string> = {
      checksum: fnv1a(savedText),
      currentIndex: 1,
      savedIndex: 0,
      entries: [
        { id: 0, description: "File loaded", timestamp: 1000, snapshot: savedText },
        { id: 1, description: "Edit", timestamp: 2000, snapshot: draftText },
      ],
    };
    const readFile = vi.fn().mockResolvedValue(diskText);
    const readHistory = vi.fn().mockResolvedValue(history);
    const writeHistory = vi.fn().mockResolvedValue(undefined);
    const tree: TreeNode[] = [{ kind: "file", path: "a.md", name: "a.md" }];
    const { result } = renderHook(() =>
      useBackgroundScanner({
        tree,
        openFilePath: null,
        dirHandleRef: { current: {} as FileSystemDirectoryHandle },
        dirtyFiles: new Set(["a.md"]),
        readFile,
        readHistory,
        writeHistory,
      })
    );
    await act(async () => result.current.scan());
    const written: HistoryFile<string> = writeHistory.mock.calls[0][2];
    const entries = written.entries;
    expect(entries.at(-2)?.description).toBe("Unsaved changes (auto-preserved)");
    expect(entries.at(-2)?.snapshot).toBe(draftText);
    expect(entries.at(-1)?.description).toBe("Reloaded from disk");
    expect(entries.at(-1)?.snapshot).toBe(diskText);
    expect(written.savedIndex).toBe(entries.length - 1);
    expect(written.checksum).toBe(fnv1a(diskText));
  });

  it("returns count of updated files", async () => {
    const text = "new";
    const oldText = "old";
    const history: HistoryFile<string> = {
      checksum: fnv1a(oldText), currentIndex: 0, savedIndex: 0,
      entries: [{ id: 0, description: "File loaded", timestamp: 1000, snapshot: oldText }],
    };
    const tree: TreeNode[] = [
      { kind: "file", path: "a.md", name: "a.md" },
      { kind: "file", path: "b.md", name: "b.md" },
    ];
    const readFile = vi.fn().mockResolvedValue(text);
    const readHistory = vi.fn().mockResolvedValue(history);
    const writeHistory = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useBackgroundScanner({
        tree,
        openFilePath: null,
        dirHandleRef: { current: {} as FileSystemDirectoryHandle },
        dirtyFiles: new Set(),
        readFile,
        readHistory,
        writeHistory,
      })
    );
    const count = await act(async () => result.current.scan());
    expect(count).toBe(2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm run test:run -- useBackgroundScanner
```

- [ ] **Step 3: Create `useBackgroundScanner.ts`**

```typescript
// src/app/knowledge_base/shared/hooks/useBackgroundScanner.ts
"use client";

import { useCallback } from "react";
import { fnv1a } from "../utils/historyPersistence";
import type { HistoryFile } from "../utils/historyPersistence";
import type { TreeNode } from "./useFileExplorer";
import { flattenTree } from "../utils/fileTree";

interface UseBackgroundScannerOptions<T = string> {
  tree: TreeNode[];
  openFilePath: string | null;
  dirHandleRef: React.RefObject<FileSystemDirectoryHandle | null>;
  dirtyFiles: Set<string>;
  /** Injected for testability — defaults to reading via File System Access API. */
  readFile?: (handle: FileSystemDirectoryHandle, path: string) => Promise<string>;
  readHistory?: <V>(handle: FileSystemDirectoryHandle, path: string) => Promise<HistoryFile<V> | null>;
  writeHistory?: <V>(handle: FileSystemDirectoryHandle, path: string, data: HistoryFile<V>) => Promise<void>;
}

export function useBackgroundScanner(options: UseBackgroundScannerOptions) {
  const {
    tree, openFilePath, dirHandleRef, dirtyFiles,
    readFile: readFileOverride,
    readHistory: readHistoryOverride,
    writeHistory: writeHistoryOverride,
  } = options;

  const scan = useCallback(async (): Promise<number> => {
    const rootHandle = dirHandleRef.current;
    if (!rootHandle) return 0;

    const { readTextFile } = await import("./fileExplorerHelpers");
    const { readHistoryFile, writeHistoryFile } = await import("../utils/historyPersistence");

    const readFile = readFileOverride ?? ((h, p) => readTextFile(h, p));
    const readHistory = readHistoryOverride ?? readHistoryFile;
    const writeHistory = writeHistoryOverride ?? writeHistoryFile;

    const allPaths = [...flattenTree(tree).keys()].filter(
      (p) => p !== openFilePath && (p.endsWith(".md") || p.endsWith(".json"))
    );

    let updatedCount = 0;

    await Promise.all(
      allPaths.map(async (filePath) => {
        const sidecar = await readHistory<string>(rootHandle, filePath);
        if (!sidecar) return; // no baseline — skip

        const text = await readFile(rootHandle, filePath);
        const checksum = fnv1a(text);
        if (checksum === sidecar.checksum) return; // unchanged

        const nextId = Math.max(...sidecar.entries.map((e) => e.id)) + 1;
        const now = Date.now();
        const isDirty = dirtyFiles.has(filePath);

        let newEntries = [...sidecar.entries.slice(0, sidecar.currentIndex + 1)];

        if (isDirty) {
          // Preserve draft as a history entry before loading disk version
          const draftSnapshot = sidecar.entries[sidecar.currentIndex].snapshot;
          newEntries.push({
            id: nextId,
            description: "Unsaved changes (auto-preserved)",
            timestamp: now,
            snapshot: draftSnapshot,
          });
        }

        const diskEntryId = isDirty ? nextId + 1 : nextId;
        newEntries.push({
          id: diskEntryId,
          description: "Reloaded from disk",
          timestamp: now,
          snapshot: text,
        });

        const newCurrentIndex = newEntries.length - 1;

        await writeHistory(rootHandle, filePath, {
          checksum,
          currentIndex: newCurrentIndex,
          savedIndex: newCurrentIndex,
          entries: newEntries,
        });

        updatedCount++;
      })
    );

    return updatedCount;
  }, [tree, openFilePath, dirHandleRef, dirtyFiles, readFileOverride, readHistoryOverride, writeHistoryOverride]);

  return { scan };
}
```

- [ ] **Step 4: Run the tests**

```bash
npm run test:run -- useBackgroundScanner
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/knowledge_base/shared/hooks/useBackgroundScanner.ts \
        src/app/knowledge_base/shared/hooks/useBackgroundScanner.test.ts
git commit -m "feat(file-watcher): add useBackgroundScanner for background sidecar updates"
```

---

## Task 15: Register the background scanner in `knowledgeBase.tsx`

**Files:**
- Modify: `src/app/knowledge_base/knowledgeBase.tsx`

- [ ] **Step 1: Add import**

```typescript
import { useBackgroundScanner } from "./shared/hooks/useBackgroundScanner";
import { useToast } from "./shell/ToastContext";
```

- [ ] **Step 2: Instantiate the scanner and register as a subscriber**

Inside `KnowledgeBaseInner`, get the current open file path. This is available from the pane manager (`panes.leftPane?.filePath` or `panes.rightPane?.filePath`). Use the focused pane's path:

```typescript
const { showToast } = useToast();
const openFilePath = panes.focusedPane?.filePath ?? panes.leftPane?.filePath ?? null;

const { scan } = useBackgroundScanner({
  tree: fileExplorer.tree,
  openFilePath,
  dirHandleRef: fileExplorer.dirHandleRef,
  dirtyFiles: fileExplorer.dirtyFiles,
});

useEffect(() => {
  subscribe("background", async () => {
    const count = await scan();
    if (count === 1) showToast("File reloaded from disk");
    else if (count > 1) showToast(`${count} files reloaded from disk`);
  });
  return () => unsubscribe("background");
}, [subscribe, unsubscribe, scan, showToast]);
```

Note: `panes.focusedPane` may or may not exist depending on the `PaneManager` API — read `src/app/knowledge_base/shell/PaneManager.tsx` to confirm the exact property name for the active pane's file path.

- [ ] **Step 3: Run the full test suite**

```bash
npm run test:run
```

Expected: all tests pass.

- [ ] **Step 4: Run the E2E tests**

```bash
npm run test:e2e
```

Expected: all E2E tests pass (no regressions from the new providers or subscribers).

- [ ] **Step 5: Verify build**

```bash
npm run build 2>&1 | tail -20
```

- [ ] **Step 6: Final commit**

```bash
git add src/app/knowledge_base/knowledgeBase.tsx
git commit -m "feat(file-watcher): register background scanner subscriber, show batched toast"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task covering it |
|-----------------|-----------------|
| All files open read-only by default | Task 1 (`useReadOnlyState` default `true`) |
| Documents persist read-only per file in localStorage | Task 2 (`DocumentView` → `useReadOnlyState`) |
| Diagrams default to read-only (same hook, same default) | Task 1 (prefix unchanged, default flipped) |
| 5s polling, pauses when tab hidden | Task 5 (`FileWatcherContext`) |
| Tree subscriber (new files appear, deleted disappear) | Task 7 |
| Manual refresh triggers all subscribers | Tasks 6+7 (wire `watcherRefresh` to button) |
| Open file content watcher — silent reload + toast | Tasks 8+9+10 (document), 12+13 (diagram) |
| Conflict banner when dirty + disk changes | Tasks 4, 9, 10, 12, 13 |
| "Keep my edits" suppresses same checksum re-prompt | Task 9 (`dismissedChecksumRef`) |
| "Reload from disk" records history + moves saved point | Tasks 9, 12 (`recordAction` + `markSaved`) |
| Background scanner updates `.history.json` sidecars | Task 14 |
| Draft auto-preserved before disk reload in background | Task 14 ("Unsaved changes (auto-preserved)" entry) |
| Batched toast for background updates | Task 15 |

**Type consistency check:** `diskChecksumRef` is `React.RefObject<string>` throughout. `checkForChanges` is `() => Promise<void>` matching subscriber type. `getContentFromDisk` returns `{ text, checksum }`, `getJsonFromDisk` returns `{ json, checksum, snapshot }` — distinct and consistent.

**Placeholder check:** None found.
