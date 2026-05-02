# Guitar Tabs — Foundation Implementation Plan (TAB-001 → TAB-003)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the substrate for the Guitar Tabs feature — domain interfaces, the new "tab" pane type with stub view, and the FSA-backed `TabRepository` — so subsequent tickets (`TAB-004` viewer, `TAB-005` playback, etc.) can plug straight into existing wiring.

**Architecture:** Follow the project's existing `domain/`-`infrastructure/`-`shell/`-`features/` boundary. Add a new `TabEngine` interface in `domain/`, mirror `DocumentRepository`'s exact pattern for `TabRepository`, extend the `Repositories` DI bag, and wire `.alphatex` into `PaneType` + `handleSelectFile` with a stub `TabView` placeholder that TAB-004 will replace.

**Tech Stack:** TypeScript, React, Vitest (JSDOM), File System Access API. Adds `@coderline/alphatab@^1.8.2` as a dependency (consumed only in TAB-004; no runtime usage in this plan).

**Spec:** [`docs/superpowers/specs/2026-05-02-guitar-tabs-design.md`](../specs/2026-05-02-guitar-tabs-design.md).

**Out of scope for this plan:**
- `AlphaTabEngine` runtime implementation (TAB-004).
- `TabView` rendering, toolbar, properties panel (TAB-004 → TAB-007).
- `test-cases/11-tabs.md` (lands BEFORE TAB-004, per the spec's working-agreements check — not a foundation deliverable).
- File-watcher / offline-cache extension to `.alphatex` (deferred to TAB-004 alongside the consumer).
- `.gp` import (TAB-006).
- **Palette command stubs** (mentioned in the spec's TAB-002 line — "Create new guitar tab", "Import Guitar Pro file…"). Punted to TAB-004 where there's a real `TabView` to land on after a "create" succeeds; "Import Guitar Pro" is explicitly TAB-006. Adding empty palette entries in this slice would be cosmetic churn.

---

## File Structure

After this plan lands:

```
src/app/knowledge_base/
  domain/
    tabEngine.ts                 ← NEW (interfaces + types only)
    repositories.ts              ← MODIFIED (+ TabRepository interface)
  infrastructure/
    tabRepo.ts                   ← NEW (FSA implementation, mirrors documentRepo)
  features/tab/
    TabViewStub.tsx              ← NEW (placeholder; TAB-004 replaces with real TabView)
  shell/
    ToolbarContext.tsx           ← MODIFIED (+ "tab" in PaneType union)
    RepositoryContext.tsx        ← MODIFIED (+ tab in Repositories + provider)
  knowledgeBase.tsx              ← MODIFIED (handleSelectFile + renderPane for "tab")
package.json                     ← MODIFIED (+ @coderline/alphatab dep)
```

Each task below produces a self-contained, independently shippable change.

---

## Task 1: TAB-001 — Domain interfaces (`tabEngine.ts`)

**Files:**
- Create: `src/app/knowledge_base/domain/tabEngine.ts`
- Test: (none — pure type module; verified by `tsc --noEmit`)

- [ ] **Step 1: Create `tabEngine.ts` with the full interface set**

Write this file verbatim. It is a literal copy of the spec's "TabEngine interface (domain)" section, cleaned for direct compilation (no JSX, no impl, no leftover spec narration).

```ts
// src/app/knowledge_base/domain/tabEngine.ts
/**
 * Domain-layer interfaces for guitar-tab rendering and editing engines.
 *
 * The `TabEngine` interface lets consumers (`TabView`, hooks) depend on a
 * contract rather than a concrete renderer; the AlphaTab implementation
 * lives in `infrastructure/alphaTabEngine.ts` (TAB-004) and a future
 * `VexFlowToneEngine` or `CustomJsonEngine` slots in without touching
 * consumers.
 *
 * Source of truth: docs/superpowers/specs/2026-05-02-guitar-tabs-design.md
 */

export interface TabEngine {
  /**
   * Mount a renderer into a host DOM element. Returns a Session that
   * controls a single open tab. Implementations may load assets
   * (worker, SoundFont) lazily on first mount.
   */
  mount(container: HTMLElement, opts: MountOpts): Promise<TabSession>;
}

export interface MountOpts {
  initialSource: TabSource;
  readOnly: boolean;
}

export interface TabSession {
  // Lifecycle
  load(source: TabSource): Promise<TabMetadata>;
  render(opts?: RenderOpts): void;
  dispose(): void;

  // Playback
  play(): void;
  pause(): void;
  stop(): void;
  seek(beat: number): void;
  setTempoFactor(factor: number): void;          // 0.25..2.0
  setLoop(range: BeatRange | null): void;
  setMute(trackId: string, muted: boolean): void;
  setSolo(trackId: string, solo: boolean): void;

  // Events
  on(event: TabEvent, handler: TabEventHandler): Unsubscribe;

  /** Optional capability — engines without an editor throw on call. */
  applyEdit?(op: TabEditOp): TabMetadata;
}

export interface RenderOpts {
  /** Force a re-layout (e.g. after a container resize). */
  reflow?: boolean;
}

export interface BeatRange {
  start: number;
  end: number;
}

export type TabSource =
  | { kind: "alphatex"; text: string }
  | { kind: "gp"; bytes: Uint8Array }
  | { kind: "json"; data: TabDocument };

export type TabEvent =
  | "ready"
  | "loaded"
  | "tick"
  | "played"
  | "paused"
  | "error";

export type TabEventHandler = (payload: TabEventPayload) => void;
export type Unsubscribe = () => void;

export type TabEventPayload =
  | { event: "ready" }
  | { event: "loaded"; metadata: TabMetadata }
  | { event: "tick"; beat: number }
  | { event: "played" }
  | { event: "paused" }
  | { event: "error"; error: Error };

export type TabEditOp =
  | { type: "set-fret"; beat: number; string: number; fret: number | null }
  | { type: "set-duration"; beat: number; duration: NoteDuration }
  | { type: "add-technique"; beat: number; string: number; technique: Technique }
  | { type: "remove-technique"; beat: number; string: number; technique: Technique }
  | { type: "set-tempo"; beat: number; bpm: number }
  | { type: "set-section"; beat: number; name: string | null }
  | { type: "add-bar"; afterBeat: number }
  | { type: "remove-bar"; beat: number }
  | { type: "set-track-tuning"; trackId: string; tuning: string[] }
  | { type: "set-track-capo"; trackId: string; fret: number };

export interface TabMetadata {
  title: string;
  artist?: string;
  subtitle?: string;
  tempo: number;
  key?: string;
  timeSignature: { numerator: number; denominator: number };
  capo: number;
  /** Scientific pitch low → high (e.g. ["E2", "A2", "D3", "G3", "B3", "E4"]). */
  tuning: string[];
  tracks: { id: string; name: string; instrument: string }[];
  sections: { name: string; startBeat: number }[];
  totalBeats: number;
  durationSeconds: number;
}

/**
 * Reserved for the `TabSource.kind = "json"` future custom format. Empty
 * surface for now — kept so the interface compiles without a bare type ref.
 */
export interface TabDocument {
  version: 1;
}

export type Technique =
  | "hammer-on" | "pull-off" | "bend" | "slide" | "tie"
  | "ghost"     | "vibrato"  | "let-ring" | "palm-mute"
  | "tremolo"   | "tap"      | "harmonic";

export type NoteDuration = 1 | 2 | 4 | 8 | 16 | 32 | 64;
```

- [ ] **Step 2: Run typecheck to verify it compiles**

Run: `npm run typecheck`
Expected: exit 0, no errors. (No file imports `tabEngine.ts` yet, but the module itself must parse cleanly.)

- [ ] **Step 3: Commit**

```bash
git add src/app/knowledge_base/domain/tabEngine.ts
git commit -m "feat(tabs): add TabEngine domain interface (TAB-001)"
```

---

## Task 2: TAB-001 — Add `TabRepository` to `domain/repositories.ts`

**Files:**
- Modify: `src/app/knowledge_base/domain/repositories.ts` (append a new interface block)
- Test: (none — pure type module)

- [ ] **Step 1: Append `TabRepository` interface to `repositories.ts`**

Add this block to the END of `src/app/knowledge_base/domain/repositories.ts` (after the existing `SVGRepository` block, preserving the file's existing module-level docstring):

```ts
/**
 * Abstraction over a guitar-tab file (`.alphatex`). Mirrors
 * `DocumentRepository` exactly — raw text in, raw text out — so the
 * existing draft / conflict / save plumbing reuses unchanged. Kept as
 * its own contract so the TabView pane and the AlphaTab engine can
 * grow tab-specific behaviour later (e.g. format detection for `.gp`
 * imports) without leaking through the document path.
 *
 * Source: docs/superpowers/specs/2026-05-02-guitar-tabs-design.md
 */
export interface TabRepository {
  /** Read the tab's raw alphaTex text. Throws `FileSystemError` on any
   *  failure. */
  read(tabPath: string): Promise<string>;
  /** Overwrite the tab's content. Creates parent dirs + file as needed.
   *  Throws on failure. */
  write(tabPath: string, content: string): Promise<void>;
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/app/knowledge_base/domain/repositories.ts
git commit -m "feat(tabs): add TabRepository interface (TAB-001)"
```

---

## Task 3: TAB-001 — Add `@coderline/alphatab` dependency

**Files:**
- Modify: `package.json`, `package-lock.json`
- Test: (smoke install)

This adds the dependency without using it. Concrete imports land in TAB-004; pinning now lets later tickets focus on engine wiring rather than dependency churn.

- [ ] **Step 1: Verify the latest stable version**

Run: `npm view @coderline/alphatab version`
Expected: `1.8.2` (or newer — the plan was authored against 1.8.2; if the registry returns a newer 1.x, prefer it; if 2.x, stop and consult the spec's open question #1 before proceeding).

- [ ] **Step 2: Install pinned to the caret**

Run: `npm install --save @coderline/alphatab@^1.8.2`
Expected: `package.json` `"dependencies"` now contains `"@coderline/alphatab": "^1.8.2"`; `package-lock.json` updated; postinstall runs `patch-package` cleanly.

- [ ] **Step 3: Run install hygiene checks**

Run in parallel:
- `npm run typecheck` — exit 0.
- `npm run lint` — exit 0 (no rule should trigger; we haven't imported anything).
- `npm run test:run` — full suite passes (existing 942 tests).

If `npm install` produces a lockfile diff that CI rejects (per `feedback_worktree_nvm_baseline.md`), abort and re-run after `nvm use` to match the project's `.nvmrc`.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(tabs): pin @coderline/alphatab dependency (TAB-001)"
```

---

## Task 4: TAB-002 — Add `"tab"` to the `PaneType` union

**Files:**
- Modify: `src/app/knowledge_base/shell/ToolbarContext.tsx:6`
- Test: existing `ToolbarContext.test.tsx` already exercises the union — verify it still passes; no new test needed for a string-literal addition.

- [ ] **Step 1: Add `"tab"` to the union**

In `src/app/knowledge_base/shell/ToolbarContext.tsx` line 6, change:

```ts
export type PaneType = "diagram" | "document" | "graph" | "graphify" | "search" | "svgEditor";
```

to:

```ts
export type PaneType = "diagram" | "document" | "graph" | "graphify" | "search" | "svgEditor" | "tab";
```

- [ ] **Step 2: Verify typecheck still passes**

Run: `npm run typecheck`
Expected: exit 0. (TS adding a string-literal member is purely additive; no exhaustive switches break — the existing `activePaneType` fallback in `ToolbarContext.tsx:51-53` defaults to `"diagram"`, which already absorbs unknown panes.)

- [ ] **Step 3: Run existing ToolbarContext tests**

Run: `npm run test:run -- ToolbarContext`
Expected: all existing cases pass (no regression from the new union member).

- [ ] **Step 4: Commit**

```bash
git add src/app/knowledge_base/shell/ToolbarContext.tsx
git commit -m "feat(tabs): add \"tab\" to PaneType union (TAB-002)"
```

---

## Task 5: TAB-002 — Create `TabViewStub` placeholder component

**Files:**
- Create: `src/app/knowledge_base/features/tab/TabViewStub.tsx`
- Test: `src/app/knowledge_base/features/tab/TabViewStub.test.tsx`

The stub renders a deterministic placeholder so the routing wiring in Task 6 has a real component to mount. TAB-004 replaces this file with the real `TabView`.

- [ ] **Step 1: Write the failing test**

Create `src/app/knowledge_base/features/tab/TabViewStub.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TabViewStub } from "./TabViewStub";

describe("TabViewStub", () => {
  it("renders the placeholder with the file path", () => {
    render(<TabViewStub filePath="songs/intro.alphatex" />);
    expect(screen.getByTestId("tab-view-stub")).toBeInTheDocument();
    expect(screen.getByText(/songs\/intro\.alphatex/)).toBeInTheDocument();
  });

  it("renders a 'coming soon' message that names TAB-004", () => {
    render(<TabViewStub filePath="x.alphatex" />);
    expect(screen.getByText(/TAB-004/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- TabViewStub`
Expected: FAIL — `Cannot find module './TabViewStub'`.

- [ ] **Step 3: Create the stub component**

Create `src/app/knowledge_base/features/tab/TabViewStub.tsx`:

```tsx
"use client";

import type { ReactElement } from "react";

/**
 * Placeholder for the guitar-tab pane. Wired into `handleSelectFile` and
 * the renderPane branch in `knowledgeBase.tsx` so `.alphatex` files open
 * a "tab" pane today; TAB-004 replaces this with the real `TabView`
 * that mounts an `AlphaTabEngine` and renders the score.
 */
export function TabViewStub({ filePath }: { filePath: string }): ReactElement {
  return (
    <div
      data-testid="tab-view-stub"
      className="flex h-full w-full items-center justify-center bg-surface text-mute"
    >
      <div className="text-center">
        <p className="text-sm font-medium">Guitar tab viewer coming in TAB-004</p>
        <p className="mt-1 text-xs">{filePath}</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- TabViewStub`
Expected: PASS, both cases.

- [ ] **Step 5: Commit**

```bash
git add src/app/knowledge_base/features/tab/TabViewStub.tsx src/app/knowledge_base/features/tab/TabViewStub.test.tsx
git commit -m "feat(tabs): add TabViewStub placeholder component (TAB-002)"
```

---

## Task 6: TAB-002 — Route `.alphatex` to the `"tab"` pane in `handleSelectFile`

**Files:**
- Modify: `src/app/knowledge_base/knowledgeBase.tsx` (around line 353 — `handleSelectFile`)

- [ ] **Step 1: Locate `handleSelectFile` and add the `.alphatex` branch**

Open `src/app/knowledge_base/knowledgeBase.tsx`. Find the `handleSelectFile` callback (around line 353). It currently reads:

```tsx
const handleSelectFile = useCallback((path: string) => {
  if (path.endsWith(".md")) {
    handleOpenDocument(path);
  } else if (path.endsWith(".svg")) {
    panes.openFile(path, "svgEditor");
  } else {
    panes.openFile(path, "diagram");
  }
}, [handleOpenDocument, panes]);
```

Replace with:

```tsx
const handleSelectFile = useCallback((path: string) => {
  if (path.endsWith(".md")) {
    handleOpenDocument(path);
  } else if (path.endsWith(".svg")) {
    panes.openFile(path, "svgEditor");
  } else if (path.endsWith(".alphatex")) {
    panes.openFile(path, "tab");
  } else {
    panes.openFile(path, "diagram");
  }
}, [handleOpenDocument, panes]);
```

The `.alphatex` branch goes BEFORE the `else` so the catch-all keeps absorbing unrecognised extensions into `"diagram"` (existing behaviour).

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: exit 0. (No change yet to `renderPane` — that's the next step. The typecheck passes because `"tab"` is a valid `PaneType` after Task 4.)

- [ ] **Step 3: (Defer test until renderPane wired in Task 7)**

Routing alone isn't observable yet — the pane opens but renders nothing because no `renderPane` branch handles it. Hold the integration test for the next task.

- [ ] **Step 4: Commit**

```bash
git add src/app/knowledge_base/knowledgeBase.tsx
git commit -m "feat(tabs): route .alphatex files to tab pane (TAB-002)"
```

---

## Task 7: TAB-002 — Render `TabViewStub` for `"tab"` panes in `knowledgeBase.tsx`

**Files:**
- Modify: `src/app/knowledge_base/knowledgeBase.tsx` (the `renderPane` callback / inline JSX that branches on `entry.fileType`)
- Test: extend an existing pane-routing integration test, OR create a new one. We'll create a focused `knowledgeBase.tabRouting.test.tsx` to keep scope tight.

- [ ] **Step 1: Locate the `renderPane` callback and confirm its shape**

In `src/app/knowledge_base/knowledgeBase.tsx`, the `renderPane` callback starts at line 838 and is an early-returning `if (entry.fileType === "...") { return <View .../> }` chain in this order:
1. `"search"` → `<SearchPanel>`
2. `"graphify"` → `<GraphifyView>`
3. `"graph"` → `<GraphView>`
4. `"diagram"` → `<DiagramView>`
5. `"svgEditor"` → `<SVGEditorView>`
6. **(default fallback, no `if`)** → `<DocumentView>`

The new `"tab"` branch goes BETWEEN the `svgEditor` branch and the default `DocumentView` fallback. The `useCallback` dependency array at the bottom of `renderPane` does NOT need a new entry — `renderTabPaneEntry` is a module-level pure function (no hook deps), and `entry.filePath` is already in the callback's argument scope.

Run: `grep -n "fileType ===\|renderPane" src/app/knowledge_base/knowledgeBase.tsx | head -10`
Expected: shows the renderPane callback at line 838 and the five `fileType ===` checks listed above.

- [ ] **Step 2: Write the failing routing test**

Create `src/app/knowledge_base/knowledgeBase.tabRouting.test.tsx`:

```tsx
/**
 * Verifies that selecting a `.alphatex` file from the explorer opens a
 * `"tab"` pane that renders `TabViewStub`. Foundation-level: TAB-004
 * replaces the stub with the real TabView.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TabViewStub } from "./features/tab/TabViewStub";

// Bare-shape test that exercises the renderPane mapping logic in
// isolation — full KnowledgeBase mount is too heavyweight here. We
// extract the mapping once it ships in Task 7 and assert it here.
import { renderTabPaneEntry } from "./knowledgeBase.tabRouting.helper";

describe("tab pane routing", () => {
  it("renders TabViewStub for entries with fileType=\"tab\"", () => {
    render(
      renderTabPaneEntry({
        filePath: "songs/intro.alphatex",
        fileType: "tab",
      }),
    );
    expect(screen.getByTestId("tab-view-stub")).toBeInTheDocument();
    expect(screen.getByText(/songs\/intro\.alphatex/)).toBeInTheDocument();
  });

  it("does not throw for unknown fileType (returns null)", () => {
    expect(
      renderTabPaneEntry({
        filePath: "x",
        // @ts-expect-error — testing the null-fallback branch
        fileType: "unknown-pane-type",
      }),
    ).toBeNull();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test:run -- tabRouting`
Expected: FAIL — `Cannot find module './knowledgeBase.tabRouting.helper'`.

- [ ] **Step 4: Create the small helper that the test imports**

Create `src/app/knowledge_base/knowledgeBase.tabRouting.helper.tsx` (note `.tsx` — the file emits JSX):

```tsx
import type { ReactElement } from "react";
import type { PaneEntry } from "./shell/PaneManager";
import { TabViewStub } from "./features/tab/TabViewStub";

/**
 * Pure, dependency-free renderer for the `"tab"` PaneType — extracted so
 * unit tests can assert routing without mounting the full
 * `<KnowledgeBase>` shell. The renderPane callback in `knowledgeBase.tsx`
 * delegates to this for `entry.fileType === "tab"`.
 */
export function renderTabPaneEntry(entry: PaneEntry): ReactElement | null {
  if (entry.fileType === "tab") {
    return <TabViewStub filePath={entry.filePath} />;
  }
  return null;
}
```

The test imports `./knowledgeBase.tabRouting.helper` (extension is implicit in TypeScript module resolution).

- [ ] **Step 5: Re-run the test**

Run: `npm run test:run -- tabRouting`
Expected: PASS, both cases.

- [ ] **Step 6: Wire the helper into `knowledgeBase.tsx`'s `renderPane`**

(a) Add the import alongside the other intra-feature imports near the top of `src/app/knowledge_base/knowledgeBase.tsx` (group it with `./features/...` imports — the file already has imports for `./features/diagram/...`, `./features/graph/...`, etc.):

```tsx
import { renderTabPaneEntry } from "./knowledgeBase.tabRouting.helper";
```

(b) In the `renderPane` callback, locate the `svgEditor` branch (it's the last `if`, immediately before the unguarded `return <DocumentView ... />` fallback). It currently ends like this:

```tsx
    if (entry.fileType === "svgEditor") {
      return (
        <SVGEditorView
          focused={focused}
          side={side}
          activeFile={entry.filePath}
          onSVGEditorBridge={handleSVGEditorBridge}
        />
      );
    }

    return (
      <DocumentView
        focused={focused}
        ...
      />
    );
```

Insert the new branch BETWEEN the closing `}` of the `svgEditor` block and the `return ( <DocumentView ...`:

```tsx
    if (entry.fileType === "svgEditor") {
      return (
        <SVGEditorView
          focused={focused}
          side={side}
          activeFile={entry.filePath}
          onSVGEditorBridge={handleSVGEditorBridge}
        />
      );
    }

    if (entry.fileType === "tab") {
      return renderTabPaneEntry(entry);
    }

    return (
      <DocumentView
        focused={focused}
        ...
      />
    );
```

`renderTabPaneEntry` is a module-level pure function, so `useCallback`'s dependency array (the trailing `[fileExplorer, docManager, ...]` after the `renderPane` body) does NOT need an update.

- [ ] **Step 7: Verify build + full test suite**

Run in parallel:
- `npm run typecheck`
- `npm run test:run`
- `npm run lint`

Expected: all exit 0; the new tab-routing tests pass; no regression in the existing 942 tests.

- [ ] **Step 8: Manual smoke (optional but recommended)**

Run: `npm run dev` and open the app. Drop an empty file named `test.alphatex` into a vault; click it in the explorer. Confirm the placeholder renders ("Guitar tab viewer coming in TAB-004" + the path). This is the M0 user-visible signal that routing works.

Per `feedback_preview_verification_limits.md`, treat passing build + clean console as the verification ceiling if the preview can't drive the FSA picker.

- [ ] **Step 9: Commit**

```bash
git add src/app/knowledge_base/knowledgeBase.tsx \
        src/app/knowledge_base/knowledgeBase.tabRouting.helper.tsx \
        src/app/knowledge_base/knowledgeBase.tabRouting.test.tsx
git commit -m "feat(tabs): render TabViewStub for tab panes (TAB-002)"
```

---

## Task 8: TAB-003 — Implement `createTabRepository` (FSA-backed)

**Files:**
- Create: `src/app/knowledge_base/infrastructure/tabRepo.ts`
- Test: `src/app/knowledge_base/infrastructure/tabRepo.test.ts`

The implementation is a near-line-for-line clone of `createDocumentRepository` (raw text in, raw text out, throws `FileSystemError`). Keeping it as a separate file — rather than collapsing both into a generic text-file repo — preserves the boundary the spec calls out (tabs may grow type-specific behaviour later).

- [ ] **Step 1: Write the failing test**

Create `src/app/knowledge_base/infrastructure/tabRepo.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { createTabRepository } from "./tabRepo";
import { FileSystemError } from "../domain/errors";

// Minimal FileSystemDirectoryHandle stub. Mirrors the shape used in other
// FSA-touching unit tests (see `useFileExplorer.helpers.test.ts`).
function makeHandle(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  const fileHandle = (path: string) => ({
    kind: "file" as const,
    name: path.split("/").pop() ?? path,
    async getFile() {
      const text = store.get(path);
      if (text === undefined) {
        const e = new Error("not here") as Error & { name: string };
        e.name = "NotFoundError";
        throw e;
      }
      return { text: async () => text } as unknown as File;
    },
    async createWritable() {
      return {
        async write(content: string) { store.set(path, content); },
        async close() {},
      } as unknown as FileSystemWritableFileStream;
    },
  });
  const dirHandle: FileSystemDirectoryHandle = {
    kind: "directory",
    name: "root",
    async getFileHandle(name: string) {
      return fileHandle(name);
    },
    async getDirectoryHandle() {
      return dirHandle;
    },
  } as unknown as FileSystemDirectoryHandle;
  return { dirHandle, store };
}

describe("createTabRepository", () => {
  let dirHandle: FileSystemDirectoryHandle;
  let store: Map<string, string>;

  beforeEach(() => {
    const made = makeHandle({ "song.alphatex": "\\title \"hi\"\n." });
    dirHandle = made.dirHandle;
    store = made.store;
  });

  it("read returns raw alphaTex text", async () => {
    const repo = createTabRepository(dirHandle);
    await expect(repo.read("song.alphatex")).resolves.toBe("\\title \"hi\"\n.");
  });

  it("read throws FileSystemError(\"not-found\") for missing files", async () => {
    const repo = createTabRepository(dirHandle);
    await expect(repo.read("missing.alphatex")).rejects.toMatchObject({
      name: "FileSystemError",
      kind: "not-found",
    });
  });

  it("write persists the content (creates / overwrites)", async () => {
    const repo = createTabRepository(dirHandle);
    await repo.write("song.alphatex", "\\title \"new\"\n.");
    expect(store.get("song.alphatex")).toBe("\\title \"new\"\n.");
  });

  it("write surfaces FSA failures as FileSystemError", async () => {
    const repo = createTabRepository({
      ...dirHandle,
      async getFileHandle() {
        const e = new Error("denied") as Error & { name: string };
        e.name = "NotAllowedError";
        throw e;
      },
    } as unknown as FileSystemDirectoryHandle);

    await expect(repo.write("locked.alphatex", "x")).rejects.toBeInstanceOf(FileSystemError);
    await expect(repo.write("locked.alphatex", "x")).rejects.toMatchObject({
      kind: "permission",
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- tabRepo`
Expected: FAIL — `Cannot find module './tabRepo'`.

- [ ] **Step 3: Create the implementation**

Create `src/app/knowledge_base/infrastructure/tabRepo.ts`:

```ts
/**
 * File System Access API implementation of `TabRepository`. Reads and
 * writes raw alphaTex text at a vault-relative path. Mirrors
 * `createDocumentRepository` exactly — kept as its own module so tabs
 * can grow type-specific behaviour later (e.g. `.gp` import pre-flight)
 * without leaking through the document path.
 */

import type { TabRepository } from "../domain/repositories";
import {
  readTextFile,
  writeTextFile,
} from "../shared/hooks/fileExplorerHelpers";
import { classifyError } from "../domain/errors";

export function createTabRepository(
  rootHandle: FileSystemDirectoryHandle,
): TabRepository {
  return {
    async read(tabPath: string) {
      try {
        const parts = tabPath.split("/");
        let dirHandle = rootHandle;
        for (const part of parts.slice(0, -1)) {
          dirHandle = await dirHandle.getDirectoryHandle(part);
        }
        const fileHandle = await dirHandle.getFileHandle(parts[parts.length - 1]);
        return await readTextFile(fileHandle);
      } catch (e) {
        throw classifyError(e);
      }
    },

    async write(tabPath: string, content: string) {
      try {
        await writeTextFile(rootHandle, tabPath, content);
      } catch (e) {
        throw classifyError(e);
      }
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- tabRepo`
Expected: PASS, all four cases.

- [ ] **Step 5: Run the full suite**

Run: `npm run test:run`
Expected: all 942 + 4 new = 946 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/knowledge_base/infrastructure/tabRepo.ts \
        src/app/knowledge_base/infrastructure/tabRepo.test.ts
git commit -m "feat(tabs): add FSA-backed TabRepository (TAB-003)"
```

---

## Task 9: TAB-003 — Wire `TabRepository` into `RepositoryContext`

**Files:**
- Modify: `src/app/knowledge_base/shell/RepositoryContext.tsx`
- Test: extend the existing `RepositoryProvider` mounting (existing tests already verify the bag shape — we add one assertion).

- [ ] **Step 1: Write the failing test**

Find the existing test that exercises `RepositoryProvider` (search): `grep -rn "RepositoryProvider\|StubRepositoryProvider" src --include="*.test.*" | head -10`.

If a `RepositoryContext.test.tsx` exists, add this case to it. Otherwise create `src/app/knowledge_base/shell/RepositoryContext.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { RepositoryProvider, useRepositories } from "./RepositoryContext";

describe("RepositoryProvider", () => {
  it("provides a TabRepository when a rootHandle is mounted", () => {
    const fakeHandle = {
      kind: "directory",
      name: "vault",
      async getDirectoryHandle() { return fakeHandle; },
      async getFileHandle() { throw new Error("not used"); },
    } as unknown as FileSystemDirectoryHandle;

    const { result } = renderHook(() => useRepositories(), {
      wrapper: ({ children }) => (
        <RepositoryProvider rootHandle={fakeHandle}>
          {children}
        </RepositoryProvider>
      ),
    });
    expect(result.current.tab).not.toBeNull();
    expect(typeof result.current.tab?.read).toBe("function");
    expect(typeof result.current.tab?.write).toBe("function");
  });

  it("provides null repos when no rootHandle is mounted", () => {
    const { result } = renderHook(() => useRepositories(), {
      wrapper: ({ children }) => (
        <RepositoryProvider rootHandle={null}>
          {children}
        </RepositoryProvider>
      ),
    });
    expect(result.current.tab).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- RepositoryContext`
Expected: FAIL — `Property 'tab' does not exist on type 'Repositories'`, OR runtime `result.current.tab` is `undefined`.

- [ ] **Step 3: Extend `Repositories` and the provider**

In `src/app/knowledge_base/shell/RepositoryContext.tsx`:

(a) Add the type import at the top alongside the existing repo type imports:

```ts
import type {
  AttachmentRepository,
  DiagramRepository,
  DocumentRepository,
  LinkIndexRepository,
  SVGRepository,
  TabRepository,
  VaultConfigRepository,
} from "../domain/repositories";
```

(b) Add the value import alongside the existing factories:

```ts
import { createTabRepository } from "../infrastructure/tabRepo";
```

(c) Extend the `Repositories` interface:

```ts
export interface Repositories {
  attachment: AttachmentRepository | null;
  diagram: DiagramRepository | null;
  document: DocumentRepository | null;
  linkIndex: LinkIndexRepository | null;
  svg: SVGRepository | null;
  tab: TabRepository | null;
  vaultConfig: VaultConfigRepository | null;
}
```

(d) Extend `EMPTY_REPOS`:

```ts
const EMPTY_REPOS: Repositories = {
  attachment: null,
  diagram: null,
  document: null,
  linkIndex: null,
  svg: null,
  tab: null,
  vaultConfig: null,
};
```

(e) Extend the provider's `useMemo` body:

```ts
return {
  attachment: createAttachmentRepository(rootHandle),
  diagram: createDiagramRepository(rootHandle),
  document: createDocumentRepository(rootHandle),
  linkIndex: createLinkIndexRepository(rootHandle),
  svg: createSVGRepository(rootHandle),
  tab: createTabRepository(rootHandle),
  vaultConfig: createVaultConfigRepository(rootHandle),
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- RepositoryContext`
Expected: PASS, both cases.

- [ ] **Step 5: Update the one existing `Repositories` literal that TS will reject**

`grep` already located the only test fixture passing a typed literal (rather than the `as unknown as Repositories` escape hatch):

`src/app/knowledge_base/features/document/DocumentView.discard.test.tsx` around line 97 has:

```tsx
value={{ attachment: null, document: docRepo, diagram: null, linkIndex: null, svg: null, vaultConfig: null }}
```

Add `tab: null` to that literal so it satisfies the new `Repositories` interface:

```tsx
value={{ attachment: null, document: docRepo, diagram: null, linkIndex: null, svg: null, tab: null, vaultConfig: null }}
```

(The `GraphView.test.tsx` `stubRepos()` factory uses `as unknown as Repositories` to bypass typechecking — that one stays as-is.)

- [ ] **Step 6: Run the full suite + typecheck**

Run in parallel:
- `npm run test:run`
- `npm run typecheck`
- `npm run lint`

Expected: all exit 0. If any other Repositories literal trips TS, the error message names the file + missing `tab` field — add `tab: null` and rerun.

- [ ] **Step 7: Commit**

```bash
git add src/app/knowledge_base/shell/RepositoryContext.tsx \
        src/app/knowledge_base/shell/RepositoryContext.test.tsx \
        src/app/knowledge_base/features/document/DocumentView.discard.test.tsx
git commit -m "feat(tabs): inject TabRepository through RepositoryContext (TAB-003)"
```

---

## Task 10: Update `Features.md` and gate the foundation

**Files:**
- Modify: `Features.md` (add a new section noting tabs are routed but not yet implemented)
- (No `test-cases/11-tabs.md` yet — that lands BEFORE TAB-004 per the spec's working-agreements check.)

- [ ] **Step 1: Add a Features.md placeholder for tabs**

Add the new section as `## 11. Guitar Tabs` between §10 First-Run and the operational sections (Test Infrastructure / External Contracts / Notable Items, which renumber to §12-§14 to keep the user-facing feature numbering contiguous).

Add a new section:

```markdown
## 11. Guitar Tabs

Vault-native guitar tablature (`.alphatex`) — viewer in M1 (TAB-004), editor in M2 (TAB-008+). See [`docs/superpowers/specs/2026-05-02-guitar-tabs-design.md`](docs/superpowers/specs/2026-05-02-guitar-tabs-design.md).

### 11.1 Foundation (TAB-001 → TAB-003)
- ⚙️ **`TabEngine` domain interface** (`src/app/knowledge_base/domain/tabEngine.ts`) — engine-agnostic contract for mount/load/playback/edit; `AlphaTabEngine` implementation lands in TAB-004.
- ⚙️ **`TabRepository`** (`src/app/knowledge_base/infrastructure/tabRepo.ts`) — FSA-backed read/write of `.alphatex` text; provided through `RepositoryContext`.
- ⚙️ **`"tab"` PaneType + routing** (`src/app/knowledge_base/shell/ToolbarContext.tsx`, `knowledgeBase.tsx:handleSelectFile`) — `.alphatex` files open a tab pane that currently renders `TabViewStub`.
- ? **Real `TabView` + playback chrome** — pending TAB-004/TAB-005.
```

- [ ] **Step 2: Verify Features.md still parses**

Run: `npm run typecheck` (Features.md isn't typechecked, but typecheck catching nothing related is the no-op confirmation). Manually grep: `grep -c '^## ' Features.md` should be one greater than before. Open the file in a Markdown preview or just `git diff Features.md` to confirm the new section reads correctly.

- [ ] **Step 3: Final hygiene**

Run in parallel:
- `npm run typecheck`
- `npm run lint`
- `npm run test:run`

Expected: all exit 0; net new test count = 4 (`TabViewStub` × 2, `tabRouting` × 2, `tabRepo` × 4, `RepositoryContext` × 2 = 10 — adjust the snapshot in your head if the existing `RepositoryContext.test.tsx` was already there). No e2e changes in this plan.

Per the `superpowers:verification-before-completion` skill, capture the actual test counts in the commit message body.

- [ ] **Step 4: Commit**

```bash
git add Features.md
git commit -m "docs: register Guitar Tabs feature foundation in Features.md"
```

---

## Wrap-up

After Task 10 lands, the foundation slice is complete:
- A `.alphatex` file in the explorer routes to a "tab" pane that renders the placeholder.
- The `TabRepository` is reachable from any consumer via `useRepositories().tab`.
- The `TabEngine` interface compiles and is ready for an `AlphaTabEngine` implementation.

**Prerequisites for the next plan (TAB-004 viewer):**
1. Land `test-cases/11-tabs.md` first (working-agreements check).
2. Decide the SoundFont host (`public/` vs CDN) — open question #2 in the spec.
3. Decide whether the watcher (`useBackgroundScanner.ts`) and offline cache (`useOfflineCache.ts`) extend to `.alphatex` simultaneously with TAB-004 or fold into TAB-005.

**Branch:** Stay on `plan/guitar-tabs` for this slice — open one PR per task or one PR for the whole foundation slice depending on review preference. Per `project_branch_protection.md`, direct push to `main` is blocked; open a PR via `gh pr create` when ready to merge.

---

_End of foundation plan. Editor (M2) plans land after M1 ships and we have user signal._
