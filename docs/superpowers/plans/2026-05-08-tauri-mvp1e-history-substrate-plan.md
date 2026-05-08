# MVP-1e: History Substrate Retirement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire the last FSA-shaped persistence path in the app. Port `historyPersistence.ts` (the per-document undo-history sidecars) from `FileSystemDirectoryHandle` reads/writes to Tauri's `vault_read_text`/`vault_write_text` IPC, drop `dirHandleRef` plumbing across consumers, and remove the FSA-only `FirstRunHero`/`seedSampleVault` onboarding (covered by MVP-1c's `UninitializedVaultSplash` + Header `VaultSwitcher`).

**Architecture:** The undo-history sidecars (`.<filename>.history.json`) are still read on file open (`useHistoryFileSync.ts:73`) and written on a 1 s debounce after every undo entry, plus rewritten by the background scanner when files change out-of-band. The MVP-1d cleanup deleted every other FSA path; this MVP retires the last one. Sidecar I/O moves to `tauriBridge.readText` / `writeText` — paths are POSIX-relative, the vault root is already set via `vault_set_root` at boot, so the API simplifies from `(rootHandle, filePath)` to `(filePath)`. The migration-fallback path (`historyFileNameLegacy`) is preserved verbatim, just rerouted through Tauri.

**Tech Stack:** Tauri 2 (`@tauri-apps/api/core` `invoke`), TypeScript, React, Vitest, `tauriBridge` (already shipped in MVP-1a — exposes `readText` / `writeText`).

---

## Decisions baked into this plan

Three substrate options were considered for the sidecar I/O. Option 1 is the default; the plan reflects it. Options 2/3 are documented here so a future revision can revisit if user preferences change.

- **Option 1 (chosen) — Port FSA → Tauri.** Mirrors the MVP-1a per-repo pattern. Preserves user undo across restarts. Lowest UX risk; fewest surprises; mirrors precedent the user has approved 4 times across MVP-1a/1b/1c/1d.
- **Option 2 — Drop persistence, in-memory only.** Undo dies on app restart. UX regression. Only viable if the user explicitly opts in; not chosen here because `readHistoryFile` has real cold-start consumers (`useHistoryFileSync.ts:73`, `useBackgroundScanner.ts:80`).
- **Option 3 — Hybrid (in-memory primary, opportunistic write-back).** Adds complexity for unclear benefit. Not recommended.

The `FirstRunHero` + `seedSampleVault` retirement is a **separate decision** in the same MVP. Two sub-options:

- **Sub-option A (chosen) — Delete.** MVP-1c's `UninitializedVaultSplash` already covers vaults that need `vaultConfig.init`, and the Header `VaultSwitcher` covers the "Open Vault" path. The `noVaultOpen` empty-state rendered by `KnowledgeBaseInner` is reachable only after a deliberate `clearLastPath()`; replacing the FirstRunHero card with a single "Open Vault" CTA covers it. Drops 178 lines + tests, removes the only remaining `seedSampleVault` consumer of FSA, and cleans up `useFileExplorer.openFolderWithSeed` + `seed` callback shim.
- **Sub-option B — Redesign for Tauri.** Port `seedSampleVault` to use `tauriBridge.writeText` / `writeJson`. Keep `FirstRunHero`, rewire `onOpenWithSeed` to receive `vaultPath`. Higher effort, preserves the sample-vault onboarding. Not chosen — the user has exercised the Header switcher in production for two MVPs and has not asked for the seed flow back.

---

## File map (what changes)

**Modify:**
- `src/app/knowledge_base/shared/utils/historyPersistence.ts` — drop FSA reads/writes, route through `tauriBridge`. API simplifies from `(rootHandle, filePath)` → `(filePath)`. `resolveParentHandle` deleted entirely.
- `src/app/knowledge_base/shared/utils/historyPersistence.test.ts` — rewrite tests against a mocked `tauriBridge`.
- `src/app/knowledge_base/shared/hooks/useHistoryFileSync.ts` — drop `dirHandleRef` ref, drop `dirHandle` parameter from `initHistory`, scheduler uses path-only writes.
- `src/app/knowledge_base/shared/hooks/useHistoryFileSync.test.ts` — adjust to new signature.
- `src/app/knowledge_base/shared/hooks/useDocumentHistory.ts` — `initHistory` signature drops `dirHandle`.
- `src/app/knowledge_base/shared/hooks/useDocumentHistory.test.ts` — adjust to new signature.
- `src/app/knowledge_base/features/document/DocumentView.tsx:190` — drop the `null` dirHandle arg.
- `src/app/knowledge_base/shared/hooks/useFileActions.ts:118-126` — drop `fileExplorer.dirHandleRef.current` arg from `initHistory`; update the `initHistory` typedef in the file (line 20).
- `src/app/knowledge_base/shared/hooks/useFileActions.test.ts` — drop the dirHandle expectation if asserted.
- `src/app/knowledge_base/shared/hooks/useBackgroundScanner.ts` — drop `dirHandleRef` option, drop `readFile` FSA-path branch, route reads/writes through path-only `readHistoryFile` / `writeHistoryFile` and `tauriBridge.readText` for live file content.
- `src/app/knowledge_base/shared/hooks/useBackgroundScanner.test.ts` — adapt to the path-only API; drop FSA mocks.
- `src/app/knowledge_base/knowledgeBase.tsx:290-294` — drop `dirHandleRef` argument to `useBackgroundScanner`.
- `src/app/knowledge_base/knowledgeBase.tsx:1378-1383` — replace `<FirstRunHero ... />` with a simple "Open Vault" CTA component (or inline Tailwind block) that calls `fileExplorer.openFolder()`.
- `src/app/knowledge_base/knowledgeBase.tsx:6` — remove `import FirstRunHero` line.
- `src/app/knowledge_base/shared/hooks/useFileExplorer.ts:660-663,700` — delete `dirHandleRef` stub; remove from return object.
- `src/app/knowledge_base/shared/hooks/useFileExplorer.ts` — delete `openFolderWithSeed` and the `seed` parameter on `openFolder` (search for `seedSampleVault`-shaped callbacks).
- `src/app/knowledge_base/shared/hooks/fileExplorerHelpers.ts` — delete any remaining FSA-only helpers (`readTextFile(handle)`-shaped functions).

**Delete:**
- `src/app/knowledge_base/shared/components/FirstRunHero.tsx`
- `src/app/knowledge_base/shared/components/FirstRunHero.test.tsx` (if present)
- `src/app/knowledge_base/shared/components/seedSampleVault.ts`
- `src/app/knowledge_base/shared/components/seedSampleVault.test.ts`

**Touch (Features.md / test-cases):**
- `Features.md` — update §1.5 (Contexts) / §2.x history-substrate bullet to drop FSA wording. Remove FirstRunHero / seedSampleVault bullet if present. Add a single line under §0 noting the FSA layer is fully retired.
- `test-cases/06-shared-hooks.md` — flip status markers for affected HIST-5.x cases; deprecate FirstRunHero cases as 🚫 (out of scope: removed).
- `test-cases/01-app-shell.md` — note the no-vault empty state now uses a simple CTA, not FirstRunHero.

---

## Bootstrap

```bash
cd "/Users/kiro/My Projects/knowledge-base"
git checkout feat/tauri-mvp1e-history-substrate
git log --oneline -5    # confirm branch is at main's tip
nvm use                  # match .nvmrc before npm
npm ci
npm run typecheck && npm run lint && npm run test:run
```

Expected baseline: typecheck/lint pass with the same warnings as `main`'s tip; full Vitest suite green.

---

## Task 0: Plan-seed commit

**Files:**
- Modify: `docs/superpowers/handoffs/2026-05-07-tauri-claude-integration.md`
- Create: `docs/superpowers/plans/2026-05-08-tauri-mvp1e-history-substrate-plan.md` (this file)

- [ ] **Step 1: Verify the handoff doc and plan are staged on the branch**

```bash
git status
git diff --stat HEAD
```

Expected: `2026-05-07-tauri-claude-integration.md` modified; `2026-05-08-tauri-mvp1e-history-substrate-plan.md` new file.

- [ ] **Step 2: Commit plan + handoff together**

```bash
git add docs/superpowers/handoffs/2026-05-07-tauri-claude-integration.md docs/superpowers/plans/2026-05-08-tauri-mvp1e-history-substrate-plan.md
git commit -m "docs(plan): MVP-1e history substrate retirement plan + handoff updates"
```

---

## Task 1: Port `historyPersistence.ts` to Tauri (test-first)

**Files:**
- Modify: `src/app/knowledge_base/shared/utils/historyPersistence.ts`
- Test: `src/app/knowledge_base/shared/utils/historyPersistence.test.ts`

The new API:

```ts
export async function readHistoryFile<T>(filePath: string): Promise<HistoryFile<T> | null>;
export async function writeHistoryFile<T>(filePath: string, data: HistoryFile<T>): Promise<void>;
```

`fnv1a`, `historyFileName`, and the `HistoryEntry` / `HistoryFile` interfaces stay byte-identical. `resolveParentHandle` deleted.

- [ ] **Step 1: Write the failing test (rewrite the suite against tauriBridge)**

Replace `src/app/knowledge_base/shared/utils/historyPersistence.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../infrastructure/tauriBridge", () => ({
  tauriBridge: {
    readText: vi.fn(),
    writeText: vi.fn(),
  },
}));

import { tauriBridge } from "../../infrastructure/tauriBridge";
import {
  fnv1a,
  historyFileName,
  readHistoryFile,
  writeHistoryFile,
} from "./historyPersistence";
import type { HistoryFile } from "./historyPersistence";

const readText = tauriBridge.readText as unknown as ReturnType<typeof vi.fn>;
const writeText = tauriBridge.writeText as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  readText.mockReset();
  writeText.mockReset();
});

describe("fnv1a", () => {
  it("returns 8-character hex", () => {
    expect(fnv1a("hello")).toMatch(/^[0-9a-f]{8}$/);
  });
  it("is deterministic", () => {
    expect(fnv1a("abc")).toBe(fnv1a("abc"));
  });
  it("differs across inputs", () => {
    expect(fnv1a("abc")).not.toBe(fnv1a("xyz"));
  });
});

describe("historyFileName", () => {
  it("prepends a dot and appends .history.json", () => {
    expect(historyFileName("diagram.json")).toBe(".diagram.json.history.json");
    expect(historyFileName("notes.md")).toBe(".notes.md.history.json");
  });
  it("preserves directory prefix", () => {
    expect(historyFileName("docs/notes.md")).toBe("docs/.notes.md.history.json");
    expect(historyFileName("a/b/c.json")).toBe("a/b/.c.json.history.json");
  });
});

describe("HIST-5.4: readHistoryFile", () => {
  it("returns null when sidecar is missing (both new and legacy)", async () => {
    readText.mockRejectedValue(new Error("NotFound"));
    const result = await readHistoryFile("notes.md");
    expect(result).toBeNull();
    expect(readText).toHaveBeenCalledWith(".notes.md.history.json");
    // Also tried the legacy fallback name
    expect(readText).toHaveBeenCalledWith(".notes.history.json");
  });

  it("parses the new sidecar name", async () => {
    const data: HistoryFile<string> = {
      checksum: "abc",
      currentIndex: 0,
      savedIndex: 0,
      entries: [{ id: 0, description: "loaded", timestamp: 1, snapshot: "x" }],
    };
    readText.mockResolvedValueOnce(JSON.stringify(data));
    const result = await readHistoryFile<string>("notes.md");
    expect(result).toEqual(data);
    expect(readText).toHaveBeenCalledWith(".notes.md.history.json");
  });

  it("falls back to legacy name when new name is missing", async () => {
    const data: HistoryFile<string> = {
      checksum: "abc",
      currentIndex: 0,
      savedIndex: 0,
      entries: [{ id: 0, description: "loaded", timestamp: 1, snapshot: "y" }],
    };
    readText
      .mockRejectedValueOnce(new Error("NotFound"))
      .mockResolvedValueOnce(JSON.stringify(data));
    const result = await readHistoryFile<string>("notes.md");
    expect(result).toEqual(data);
    expect(readText).toHaveBeenNthCalledWith(1, ".notes.md.history.json");
    expect(readText).toHaveBeenNthCalledWith(2, ".notes.history.json");
  });

  it("returns null when JSON is malformed", async () => {
    readText.mockResolvedValueOnce("not json");
    const result = await readHistoryFile("notes.md");
    expect(result).toBeNull();
  });
});

describe("HIST-5.5: writeHistoryFile", () => {
  it("writes serialized JSON to the new sidecar path", async () => {
    writeText.mockResolvedValue(undefined);
    const data: HistoryFile<string> = {
      checksum: "abc",
      currentIndex: 0,
      savedIndex: 0,
      entries: [{ id: 0, description: "loaded", timestamp: 1, snapshot: "x" }],
    };
    await writeHistoryFile("notes.md", data);
    expect(writeText).toHaveBeenCalledWith(".notes.md.history.json", JSON.stringify(data));
  });

  it("swallows write errors silently", async () => {
    writeText.mockRejectedValue(new Error("Denied"));
    await expect(
      writeHistoryFile("notes.md", {
        checksum: "abc",
        currentIndex: 0,
        savedIndex: 0,
        entries: [],
      }),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the new tests — expect failures (old API surface still exported)**

```bash
npm run test:run -- src/app/knowledge_base/shared/utils/historyPersistence.test.ts
```

Expected: FAIL — `readHistoryFile` / `writeHistoryFile` still take the FSA `rootHandle` first arg.

- [ ] **Step 3: Rewrite `historyPersistence.ts`**

Replace the file body (keep `HistoryEntry`/`HistoryFile`/`fnv1a`/`historyFileName`/`historyFileNameLegacy` verbatim) with:

```ts
import { tauriBridge } from "../../infrastructure/tauriBridge";

// (Keep existing HistoryEntry / HistoryFile / fnv1a / historyFileName /
//  historyFileNameLegacy unchanged.)

export async function readHistoryFile<T>(
  filePath: string,
): Promise<HistoryFile<T> | null> {
  try {
    const text = await tauriBridge.readText(historyFileName(filePath));
    return JSON.parse(text) as HistoryFile<T>;
  } catch {
    try {
      const legacyText = await tauriBridge.readText(historyFileNameLegacy(filePath));
      return JSON.parse(legacyText) as HistoryFile<T>;
    } catch {
      return null;
    }
  }
}

export async function writeHistoryFile<T>(
  filePath: string,
  data: HistoryFile<T>,
): Promise<void> {
  try {
    await tauriBridge.writeText(historyFileName(filePath), JSON.stringify(data));
  } catch {
    // Silently ignore write failures — matches FSA-era behaviour.
  }
}
```

Delete `resolveParentHandle` entirely (no longer needed; `tauriBridge.writeText` is `vault_write_text` which `mkdir -p`s the parent in Rust).

- [ ] **Step 4: Run the tests — expect pass**

```bash
npm run test:run -- src/app/knowledge_base/shared/utils/historyPersistence.test.ts
```

Expected: PASS — all `fnv1a` / `historyFileName` / `HIST-5.4` / `HIST-5.5` cases green.

- [ ] **Step 5: Verify the full Vitest suite still typechecks (callers will not yet)**

```bash
npm run typecheck
```

Expected: typecheck reports errors at the callers (`useHistoryFileSync.ts`, `useBackgroundScanner.ts`) — these are fixed in subsequent tasks. Note the count and list as a baseline so Tasks 2–10 can drive it back to 0.

- [ ] **Step 6: Commit**

```bash
git add src/app/knowledge_base/shared/utils/historyPersistence.ts src/app/knowledge_base/shared/utils/historyPersistence.test.ts
git commit -m "feat(history): port historyPersistence FSA reads/writes to tauriBridge"
```

---

## Task 2: Drop FSA params from `useHistoryFileSync`

**Files:**
- Modify: `src/app/knowledge_base/shared/hooks/useHistoryFileSync.ts`
- Test: `src/app/knowledge_base/shared/hooks/useHistoryFileSync.test.ts`

New `initHistory` signature:

```ts
initHistory(
  fileContent: string,
  initialSnapshot: T,
  filePath: string | null,
): Promise<void>
```

`dirHandleRef` is deleted from the hook. `scheduleSave` writes via path only.

- [ ] **Step 1: Update the test for the new signature**

Search the file for any call shaped `initHistory(content, snapshot, dirHandle, path)` and rewrite as `initHistory(content, snapshot, path)`. Drop FSA mocks (`createMockDirectoryHandle`, etc.). The tests already mock `historyPersistence` reads/writes — keep those mocks but adjust expectations to assert path-only calls.

If the existing test file mocks `historyPersistence` directly, change:

```ts
expect(writeHistoryFile).toHaveBeenCalledWith(handle, "notes.md", expect.any(Object));
```

to:

```ts
expect(writeHistoryFile).toHaveBeenCalledWith("notes.md", expect.any(Object));
```

- [ ] **Step 2: Run the test — expect failures**

```bash
npm run test:run -- src/app/knowledge_base/shared/hooks/useHistoryFileSync.test.ts
```

Expected: FAIL — current `initHistory` takes 4 args.

- [ ] **Step 3: Rewrite `useHistoryFileSync.ts`**

Apply these specific edits:

**Drop the dirHandleRef and FSA imports:**

```ts
// REMOVE:
const dirHandleRef = useRef<FileSystemDirectoryHandle | null>(null);

// `dirHandle` parameter and `dirHandleRef.current = dirHandle;` line.
// All references to `dirHandleRef.current` in scheduleSave and clearHistory.
```

**New `scheduleSave`:**

```ts
const scheduleSave = useCallback(() => {
  if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  saveTimerRef.current = setTimeout(() => {
    const file = activeFileRef.current;
    const c = coreRef.current;
    if (!file || !c) return;
    const { entries, currentIndex, savedIndex } = c.getLatestState();
    writeHistoryFile(file, {
      checksum: checksumRef.current,
      currentIndex,
      savedIndex,
      entries,
    });
  }, 1000);
}, []);
```

**New `initHistory`:**

```ts
const initHistory = useCallback(async (
  fileContent: string,
  initialSnapshot: T,
  filePath: string | null,
) => {
  activeFileRef.current = filePath;
  const checksum = fnv1a(fileContent);
  checksumRef.current = checksum;

  if (!filePath) {
    const entry: HistoryEntry<T> = {
      id: 0,
      description: "File loaded",
      timestamp: Date.now(),
      snapshot: initialSnapshot,
    };
    core.initEntries([entry], 0, 0);
    return;
  }

  const histFile = await readHistoryFile<T>(filePath);
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
}, [core.initEntries, scheduleSave]);
```

**Update `HistoryFileSync<T>` interface:**

```ts
export interface HistoryFileSync<T> extends HistoryCore<T> {
  initHistory(
    fileContent: string,
    initialSnapshot: T,
    filePath: string | null,
  ): Promise<void>;
  onFileSave(fileContent: string): void;
  clearHistory(): void;
  readonly diskChecksumRef: React.RefObject<string>;
}
```

**Update `clearHistory`:**

```ts
const clearHistory = useCallback(() => {
  if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  saveTimerRef.current = null;
  activeFileRef.current = null;
  checksumRef.current = "";
  core.clear();
}, [core.clear]);
```

- [ ] **Step 4: Run the tests — expect pass**

```bash
npm run test:run -- src/app/knowledge_base/shared/hooks/useHistoryFileSync.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/knowledge_base/shared/hooks/useHistoryFileSync.ts src/app/knowledge_base/shared/hooks/useHistoryFileSync.test.ts
git commit -m "refactor(history): drop FSA dirHandle from useHistoryFileSync.initHistory"
```

---

## Task 3: Drop FSA param from `useDocumentHistory.initHistory`

**Files:**
- Modify: `src/app/knowledge_base/shared/hooks/useDocumentHistory.ts`
- Test: `src/app/knowledge_base/shared/hooks/useDocumentHistory.test.ts`

- [ ] **Step 1: Adjust the test to call `initHistory(content, filePath)`**

Search test for `initHistory(...)` calls and drop the `dirHandle` arg. Drop FSA mocks.

- [ ] **Step 2: Run the test — expect failures**

```bash
npm run test:run -- src/app/knowledge_base/shared/hooks/useDocumentHistory.test.ts
```

- [ ] **Step 3: Rewrite the `initHistory` wrapper**

```ts
export interface DocumentHistory extends Omit<HistoryFileSync<string>, 'initHistory' | 'onFileSave'> {
  initHistory(fileContent: string, filePath: string | null): Promise<void>;
  onContentChange(content: string): void;
  onBlockChange(content: string): void;
  onFileSave(content: string): void;
}

const initHistory = useCallback(async (
  fileContent: string,
  filePath: string | null,
) => {
  await sync.initHistory(fileContent, fileContent, filePath);
}, [sync]);
```

- [ ] **Step 4: Run the test — expect pass**

```bash
npm run test:run -- src/app/knowledge_base/shared/hooks/useDocumentHistory.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/app/knowledge_base/shared/hooks/useDocumentHistory.ts src/app/knowledge_base/shared/hooks/useDocumentHistory.test.ts
git commit -m "refactor(history): drop FSA dirHandle from useDocumentHistory.initHistory"
```

---

## Task 4: Update `DocumentView.tsx` and `useFileActions.ts` call sites

**Files:**
- Modify: `src/app/knowledge_base/features/document/DocumentView.tsx:190`
- Modify: `src/app/knowledge_base/shared/hooks/useFileActions.ts:20,118-126`
- Test: `src/app/knowledge_base/shared/hooks/useFileActions.test.ts` (already exists post-MVP-1d)

- [ ] **Step 1: Patch `DocumentView.tsx:190`**

```ts
// BEFORE:
await history.initHistory(content, null, filePath);
// AFTER:
await history.initHistory(content, filePath);
```

- [ ] **Step 2: Patch `useFileActions.ts` typedef (line 20)**

```ts
// BEFORE:
initHistory: (diskJson: string, snapshot: DiagramSnapshot, dirHandle: FileSystemDirectoryHandle | null, fileName: string) => Promise<void>;
// AFTER:
initHistory: (diskJson: string, snapshot: DiagramSnapshot, fileName: string) => Promise<void>;
```

- [ ] **Step 3: Patch the call site (line 118 → 126)**

```ts
// BEFORE:
await history.initHistory(diskJson, {
  title: diskData.title ?? "Untitled",
  layerDefs: diskData.layers,
  nodes: diskData.nodes,
  connections: diskData.connections,
  layerManualSizes: diskData.layerManualSizes ?? {},
  lineCurve: diskData.lineCurve ?? "orthogonal",
  flows: diskData.flows ?? [],
}, fileExplorer.dirHandleRef.current, fileName);

// AFTER:
await history.initHistory(diskJson, {
  title: diskData.title ?? "Untitled",
  layerDefs: diskData.layers,
  nodes: diskData.nodes,
  connections: diskData.connections,
  layerManualSizes: diskData.layerManualSizes ?? {},
  lineCurve: diskData.lineCurve ?? "orthogonal",
  flows: diskData.flows ?? [],
}, fileName);
```

- [ ] **Step 4: Run the affected test files**

```bash
npm run test:run -- src/app/knowledge_base/shared/hooks/useFileActions.test.ts src/app/knowledge_base/features/document
```

If the test asserts `initHistory` was called with `(content, null, filePath)`, drop the `null` arg.

- [ ] **Step 5: Typecheck — expect 0 errors in document/ + useFileActions; remaining errors live in `useBackgroundScanner` and `knowledgeBase.tsx`**

```bash
npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add src/app/knowledge_base/features/document/DocumentView.tsx src/app/knowledge_base/shared/hooks/useFileActions.ts src/app/knowledge_base/shared/hooks/useFileActions.test.ts
git commit -m "refactor(history): drop FSA dirHandle from DocumentView + useFileActions call sites"
```

---

## Task 5: Port `useBackgroundScanner` to path-only API

**Files:**
- Modify: `src/app/knowledge_base/shared/hooks/useBackgroundScanner.ts`
- Test: `src/app/knowledge_base/shared/hooks/useBackgroundScanner.test.ts`

The new options shape:

```ts
export interface UseBackgroundScannerOptions {
  tree: TreeNode[];
  openFilePath: string | null;
  dirtyFiles: Set<string>;
  /** Test override for reading file content. In production this routes through `tauriBridge.readText(filePath)`. */
  readFile?: (path: string) => Promise<string>;
  readHistory?: (path: string) => Promise<HistoryFile<unknown> | null>;
  writeHistory?: (path: string, data: HistoryFile<unknown>) => Promise<void>;
}
```

`dirHandleRef` removed entirely. `flattenTree` is still used for *path enumeration* but no `handle` is needed. The scan loop reads via `tauriBridge.readText(filePath)` in production, the override in tests.

- [ ] **Step 1: Adapt the test — drop dirHandleRef construction; add the historyPersistence mock**

Verified pre-dispatch: `useBackgroundScanner.test.ts` does NOT currently mock `../utils/historyPersistence`. Once `historyPersistence.ts` imports `tauriBridge` (Task 1), test runs without a mock will hit real `invoke()` and fail. **Add this at the top of the test file before any other edit:**

```ts
vi.mock("../utils/historyPersistence", async (importOriginal) => {
  const real = await importOriginal<typeof import("../utils/historyPersistence")>();
  return {
    ...real,
    readHistoryFile: vi.fn().mockResolvedValue(null),
    writeHistoryFile: vi.fn(),
  };
});
```

Also add a mock for `tauriBridge.readText` so the in-test scan reaches the path-only branch:

```ts
vi.mock("../../infrastructure/tauriBridge", () => ({
  tauriBridge: {
    readText: vi.fn(),
  },
}));
```

Then search test for `dirHandleRef:` and remove. Pass `readFile` / `readHistory` / `writeHistory` overrides as before — they take precedence over the default mocks. Verified pre-dispatch: `flattenTree` already returns `Map<string, {}>` (post-MVP-1d), so the new `for (const [filePath] of flatMap)` destructure matches reality — no `handle` properties needed in the test fixture.

- [ ] **Step 2: Run the test — expect failures**

```bash
npm run test:run -- src/app/knowledge_base/shared/hooks/useBackgroundScanner.test.ts
```

- [ ] **Step 3: Rewrite the hook body**

```ts
"use client";

import { useCallback } from "react";
import { flattenTree } from "../utils/fileTree";
import type { TreeNode } from "../utils/fileTree";
import {
  fnv1a,
  readHistoryFile,
  writeHistoryFile,
} from "../utils/historyPersistence";
import type { HistoryFile } from "../utils/historyPersistence";
import { tauriBridge } from "../../infrastructure/tauriBridge";
import { clearDraft } from "../utils/persistence";

export interface UseBackgroundScannerOptions {
  tree: TreeNode[];
  openFilePath: string | null;
  dirtyFiles: Set<string>;
  readFile?: (path: string) => Promise<string>;
  readHistory?: (path: string) => Promise<HistoryFile<unknown> | null>;
  writeHistory?: (path: string, data: HistoryFile<unknown>) => Promise<void>;
}

export interface UseBackgroundScannerResult {
  scan: () => Promise<number>;
}

export function useBackgroundScanner({
  tree,
  openFilePath,
  dirtyFiles,
  readFile: readFileOverride,
  readHistory: readHistoryOverride,
  writeHistory: writeHistoryOverride,
}: UseBackgroundScannerOptions): UseBackgroundScannerResult {
  const scan = useCallback(async (): Promise<number> => {
    const flatMap = flattenTree(tree);
    let updatedCount = 0;

    for (const [filePath] of flatMap) {
      if (filePath === openFilePath) continue;
      if (!filePath.endsWith(".md") && !filePath.endsWith(".json")) continue;

      const sidecar = readHistoryOverride
        ? await readHistoryOverride(filePath)
        : await readHistoryFile<unknown>(filePath);
      if (!sidecar) continue;

      let text: string;
      try {
        text = readFileOverride
          ? await readFileOverride(filePath)
          : await tauriBridge.readText(filePath);
      } catch {
        continue; // file vanished or unreadable
      }

      const contentForChecksum = filePath.endsWith(".json")
        ? JSON.stringify(JSON.parse(text), null, 2)
        : text;
      const checksum = fnv1a(contentForChecksum);
      if (checksum === sidecar.checksum) continue;

      if (
        !sidecar.entries.length ||
        sidecar.currentIndex < 0 ||
        sidecar.currentIndex >= sidecar.entries.length
      ) continue;

      const isDirty = dirtyFiles.has(filePath);
      const now = Date.now();
      const maxId = sidecar.entries.reduce((m, e) => Math.max(m, e.id), -1);
      const diskSnapshot: unknown = filePath.endsWith(".json") ? JSON.parse(text) : text;

      const newEntries = [...sidecar.entries.slice(0, sidecar.currentIndex + 1)];
      let nextId = maxId + 1;

      if (isDirty) {
        const draftSnapshot = sidecar.entries[sidecar.currentIndex].snapshot;
        newEntries.push({
          id: nextId,
          description: "Unsaved changes (auto-preserved)",
          timestamp: now,
          snapshot: draftSnapshot,
        });
        nextId++;
      }

      newEntries.push({
        id: nextId,
        description: "Reloaded from disk",
        timestamp: now,
        snapshot: diskSnapshot,
      });

      const newCurrentIndex = newEntries.length - 1;
      const updated: HistoryFile<unknown> = {
        checksum,
        currentIndex: newCurrentIndex,
        savedIndex: newCurrentIndex,
        entries: newEntries,
      };

      if (writeHistoryOverride) {
        await writeHistoryOverride(filePath, updated);
      } else {
        await writeHistoryFile(filePath, updated);
      }

      clearDraft(filePath);
      updatedCount++;
    }

    return updatedCount;
  }, [
    tree,
    openFilePath,
    dirtyFiles,
    readFileOverride,
    readHistoryOverride,
    writeHistoryOverride,
  ]);

  return { scan };
}
```

- [ ] **Step 4: Run the test — expect pass**

```bash
npm run test:run -- src/app/knowledge_base/shared/hooks/useBackgroundScanner.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/app/knowledge_base/shared/hooks/useBackgroundScanner.ts src/app/knowledge_base/shared/hooks/useBackgroundScanner.test.ts
git commit -m "refactor(history): port useBackgroundScanner to tauriBridge.readText (path-only)"
```

---

## Task 6: Drop `dirHandleRef` from `knowledgeBase.tsx` and `useFileExplorer.ts`

**Files:**
- Modify: `src/app/knowledge_base/knowledgeBase.tsx:290-294`
- Modify: `src/app/knowledge_base/shared/hooks/useFileExplorer.ts:660-663,700` (and any other `dirHandleRef` mentions)
- Test: `src/app/knowledge_base/shared/hooks/useFileExplorer.test.tsx` (and any companion `*.boot.test.tsx`, `*.switchVault.test.tsx`)

- [ ] **Step 1: Patch `knowledgeBase.tsx`**

```tsx
// BEFORE:
const { scan } = useBackgroundScanner({
  tree: fileExplorer.tree,
  openFilePath: fileExplorer.activeFile,
  dirHandleRef: fileExplorer.dirHandleRef,
  dirtyFiles,
});

// AFTER:
const { scan } = useBackgroundScanner({
  tree: fileExplorer.tree,
  openFilePath: fileExplorer.activeFile,
  dirtyFiles,
});
```

- [ ] **Step 2: Patch `useFileExplorer.ts` — delete the stub and the return entry**

```ts
// REMOVE these lines (around line 660-663):
// dirHandleRef is kept as a stub (always null current) so consumers in
// TODO 28a: remove dirHandleRef from this return once all consumers are migrated.
const dirHandleRef = useRef<FileSystemDirectoryHandle | null>(null);

// REMOVE the `dirHandleRef,` line in the return object (around line 700).
```

Also remove `dirHandleRef` from any explicit `UseFileExplorerResult` interface if such exists.

- [ ] **Step 3: Search the codebase for any other `fileExplorer.dirHandleRef` references**

```bash
grep -rn "dirHandleRef" src/ --include="*.ts" --include="*.tsx"
```

Expected: only references inside `useHistoryFileSync.ts` (deleted in Task 2) and inside `useBackgroundScanner.ts` (deleted in Task 5). If anything else surfaces, patch it.

- [ ] **Step 4: Run the affected test files**

```bash
npm run test:run -- src/app/knowledge_base/shared/hooks/useFileExplorer
```

- [ ] **Step 5: Commit**

```bash
git add src/app/knowledge_base/knowledgeBase.tsx src/app/knowledge_base/shared/hooks/useFileExplorer.ts src/app/knowledge_base/shared/hooks/useFileExplorer.test.tsx
git commit -m "refactor(shell): drop dirHandleRef stub from useFileExplorer + knowledgeBase"
```

---

## Task 7: Replace `FirstRunHero` with a simple "Open Vault" CTA

**Files:**
- Modify: `src/app/knowledge_base/knowledgeBase.tsx:6,1378-1383`
- Delete: `src/app/knowledge_base/shared/components/FirstRunHero.tsx`
- Delete: `src/app/knowledge_base/shared/components/FirstRunHero.test.tsx` (if it exists)
- Delete: `src/app/knowledge_base/shared/components/seedSampleVault.ts`
- Delete: `src/app/knowledge_base/shared/components/seedSampleVault.test.ts`
- Modify: `src/app/knowledge_base/shared/hooks/useFileExplorer.ts` — drop `openFolderWithSeed` and any `seed` callback parameter
- Modify: `src/app/knowledge_base/shared/hooks/useFileExplorer.test.tsx` — drop `openFolderWithSeed` cases

The replacement empty-state component:

```tsx
function NoVaultCTA({ onOpenVault }: { onOpenVault: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
      <h2 className="text-lg font-semibold">No vault open</h2>
      <p className="text-sm text-muted-foreground max-w-prose">
        Open an existing knowledge-base vault to get started, or use the vault switcher in the header to pick one.
      </p>
      <button
        type="button"
        onClick={onOpenVault}
        className="px-4 py-2 rounded bg-primary text-primary-foreground hover:bg-primary/90"
      >
        Open Vault
      </button>
    </div>
  );
}
```

- [ ] **Step 1: Add the test for the new CTA in `knowledgeBase.tsx`'s test suite (or co-located)**

If `knowledgeBase.test.tsx` exists for the no-vault path, add or rename a case asserting that:

- when `noVaultOpen` is true, the rendered tree contains a button with accessible name `Open Vault`
- clicking the button calls `fileExplorer.openFolder`

If no such test file exists, create `src/app/knowledge_base/knowledgeBase.noVault.test.tsx` minimally:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NoVaultCTA } from "./knowledgeBase"; // export it from knowledgeBase.tsx

describe("SHELL-1.17-06: NoVaultCTA empty state", () => {
  it("renders an Open Vault button that calls onOpenVault", async () => {
    const onOpenVault = vi.fn();
    render(<NoVaultCTA onOpenVault={onOpenVault} />);
    await userEvent.click(screen.getByRole("button", { name: /open vault/i }));
    expect(onOpenVault).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the new test — expect failure**

```bash
npm run test:run -- src/app/knowledge_base/knowledgeBase.noVault.test.tsx
```

- [ ] **Step 3: Patch `knowledgeBase.tsx`**

Remove `import FirstRunHero from "./shared/components/FirstRunHero";` (line 6).

Add the `NoVaultCTA` component (export it for the test):

```tsx
export function NoVaultCTA({ onOpenVault }: { onOpenVault: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
      <h2 className="text-lg font-semibold">No vault open</h2>
      <p className="text-sm text-muted-foreground max-w-prose">
        Open an existing knowledge-base vault to get started, or use the vault switcher in the header to pick one.
      </p>
      <button
        type="button"
        onClick={onOpenVault}
        className="px-4 py-2 rounded bg-primary text-primary-foreground hover:bg-primary/90"
      >
        Open Vault
      </button>
    </div>
  );
}
```

Replace the empty-state assignment (around line 1378–1383):

```tsx
// BEFORE:
const emptyState = noVaultOpen ? (
  <FirstRunHero
    onOpenFolder={fileExplorer.openFolder}
    onOpenWithSeed={fileExplorer.openFolderWithSeed}
  />
) : (
  // ...
);

// AFTER:
const emptyState = noVaultOpen ? (
  <NoVaultCTA onOpenVault={fileExplorer.openFolder} />
) : (
  // ...
);
```

- [ ] **Step 4: Delete the FSA components and tests**

```bash
git rm src/app/knowledge_base/shared/components/FirstRunHero.tsx
git rm src/app/knowledge_base/shared/components/seedSampleVault.ts src/app/knowledge_base/shared/components/seedSampleVault.test.ts
# Delete FirstRunHero.test.tsx if it exists
[ -f src/app/knowledge_base/shared/components/FirstRunHero.test.tsx ] && git rm src/app/knowledge_base/shared/components/FirstRunHero.test.tsx
```

- [ ] **Step 5: Drop `openFolderWithSeed` from `useFileExplorer.ts`**

Search for `openFolderWithSeed` and `seedSampleVault` references in `useFileExplorer.ts`. Delete the function definition, drop it from the return object, and drop any `seed` callback parameter still threaded through `openFolder`.

- [ ] **Step 6: Run the test suite**

```bash
npm run test:run
```

Expected: PASS — no FirstRunHero / seedSampleVault references remain. The new `NoVaultCTA` test passes.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(shell): retire FirstRunHero + seedSampleVault — replace with NoVaultCTA"
```

---

## Task 8: Clean up remaining FSA helpers in `fileExplorerHelpers.ts`

**Files:**
- Modify: `src/app/knowledge_base/shared/hooks/fileExplorerHelpers.ts`

- [ ] **Step 1: Audit which helpers are still consumed**

```bash
grep -n "^export\|^async function\|^function" src/app/knowledge_base/shared/hooks/fileExplorerHelpers.ts
```

For each export, run a usage grep:

```bash
grep -rn "fromHelper" src/ --include="*.ts" --include="*.tsx"
```

(Replace `fromHelper` with each export name.)

- [ ] **Step 2: Delete every export with zero callers**

`readTextFile(handle: FileSystemFileHandle)` was used by `useBackgroundScanner` (now path-only) and may have other callers. Each FSA-shaped helper that has zero callers post-MVP-1d/MVP-1e is dead and must go. Also drop the `declare global` augmentation lines added in MVP-1d Task 6 if their consumers are gone.

- [ ] **Step 3: Typecheck and lint**

```bash
npm run typecheck && npm run lint
```

Expected: 0 errors; lint warnings ≤ the post-MVP-1d baseline.

- [ ] **Step 4: Commit**

```bash
git add src/app/knowledge_base/shared/hooks/fileExplorerHelpers.ts
git commit -m "chore(shell): drop dead FSA helpers from fileExplorerHelpers"
```

---

## Task 9: Update `Features.md` and `test-cases/`

**Files:**
- Modify: `Features.md`
- Modify: `test-cases/06-shared-hooks.md`
- Modify: `test-cases/01-app-shell.md`

- [ ] **Step 1: Update `Features.md`**

- §0 Deferred-line: append "(MVP-1e: history sidecar I/O ported to Tauri; FirstRunHero/seedSampleVault retired; FSA layer fully gone)".
- Section covering history persistence (§1.5 / §2.x): drop any FSA wording, keep the sidecar behaviour, point at `historyPersistence.ts` as Tauri-routed.
- Drop the FirstRunHero / seedSampleVault bullet from §1.x (sample vault onboarding).
- Add a §1.x bullet under empty states: "No-vault CTA — `knowledgeBase.tsx` `NoVaultCTA` shown when no vault is open; replaces the deleted FirstRunHero card."

- [ ] **Step 2: Update `test-cases/06-shared-hooks.md`**

- HIST-5.x cases that asserted FSA reads/writes: flip status if covered, otherwise leave ❌ with a note pointing at the new path-only path.
- Add HIST-5.6-01 ❌ "Sidecar reads route through `tauriBridge.readText`" if not present.

- [ ] **Step 3: Update `test-cases/01-app-shell.md`**

- Add SHELL-1.17-06 ✅ "No-vault CTA renders Open Vault button that triggers `fileExplorer.openFolder`".
- Mark any legacy FirstRunHero cases as 🚫 with reason "Removed in MVP-1e — replaced by NoVaultCTA".

- [ ] **Step 4: Commit**

```bash
git add Features.md test-cases/06-shared-hooks.md test-cases/01-app-shell.md
git commit -m "docs(kb): MVP-1e — Features.md and test-cases updates"
```

---

## Task 10: Full local verification

- [ ] **Step 1: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 2: Lint**

```bash
npm run lint
```

Expected: warning count ≤ post-MVP-1d baseline (77 per the MVP-1d Task 1 record).

- [ ] **Step 3: Vitest**

```bash
npm run test:run
```

Expected: green; total count ≥ post-MVP-1d baseline minus the deleted FSA test files; new tests for `NoVaultCTA` and the rewritten `historyPersistence` suite included.

- [ ] **Step 4: Next.js build**

```bash
npm run build
```

Expected: green; `output: "export"` produces `out/` directory consumed by Tauri's `frontendDist`.

- [ ] **Step 5: Tauri debug bundle (sanity)**

```bash
cd src-tauri && cargo tauri build --debug --no-bundle && cd ..
```

Expected: green (matches the `tauri-build` CI job added in MVP-1d).

- [ ] **Step 6: Manual smoke (real Tauri app)**

```bash
npm run tauri:dev
```

Manual checklist:

- App launches; previously-opened vault auto-restores via MVP-1c's `lastPath`.
- Open a `.md` file. Make 3 edits. Wait 1 s. Confirm `.<file>.history.json` exists in vault root via Finder.
- Close app, reopen, open the same file. Use Cmd+Z — undo replays the entries from the sidecar.
- Switch vaults via the Header dropdown — sidecars in the new vault are read for the first file opened there.
- Trigger a no-vault state (run `await window.__TAURI__.core.invoke('settings_set', { key: 'last_path', value: null })` in DevTools, then `vault_set_root` with empty string fails — restart with cleared `last_path`). Confirm `NoVaultCTA` renders with the Open Vault button.

- [ ] **Step 7: Commit any test-touch fixups discovered during verification**

```bash
git status
# If anything was touched, stage and commit per the touched area:
# git commit -m "test(history): fix mocks broken by sidecar API change"
```

---

## Task 11: Open the PR

**Files:**
- (No files modified — uses `gh pr create`.)

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feat/tauri-mvp1e-history-substrate
```

- [ ] **Step 2: Confirm CI's three jobs (`checks`, `build`, `tauri-build`) pick up the push**

```bash
gh run list --branch feat/tauri-mvp1e-history-substrate --limit 5
```

- [ ] **Step 3: Open the PR**

```bash
gh pr create --title "feat(tauri): MVP-1e — port history sidecars to Tauri, retire FirstRunHero" --body "$(cat <<'EOF'
## Summary

- Port `historyPersistence.ts` reads/writes from FSA `FileSystemDirectoryHandle` to Tauri `tauriBridge.readText` / `writeText` — API simplifies from `(rootHandle, filePath)` to `(filePath)`. Migration fallback to legacy sidecar names preserved.
- Drop `dirHandle` parameter from `useHistoryFileSync.initHistory`, `useDocumentHistory.initHistory`, and the typedef in `useFileActions`. Update call sites in `DocumentView.tsx` and `useFileActions.ts`.
- Port `useBackgroundScanner` to path-only API — drop `dirHandleRef` option, route file content reads through `tauriBridge.readText(filePath)`.
- Drop `dirHandleRef` stub + `seed` callback from `useFileExplorer` + `knowledgeBase.tsx`.
- Retire `FirstRunHero.tsx` + `seedSampleVault.ts` (broken in Tauri mode, redundant with MVP-1c's `UninitializedVaultSplash` + Header `VaultSwitcher`); replace the no-vault empty state with a simple `NoVaultCTA` component.
- Delete remaining dead FSA helpers in `fileExplorerHelpers.ts`.
- Update `Features.md` and `test-cases/` to reflect the retired FSA layer and the new no-vault CTA.

Plan: `docs/superpowers/plans/2026-05-08-tauri-mvp1e-history-substrate-plan.md`.

## Test plan

- [x] `npm run typecheck` — 0 errors
- [x] `npm run lint` — ≤ baseline warnings
- [x] `npm run test:run` — green (sidecar + scanner + history hooks adjusted)
- [x] `npm run build` — green (static export still works)
- [x] `cargo tauri build --debug --no-bundle` — green
- [x] Manual: undo across restart preserves entries via `.history.json` sidecars
- [x] Manual: `NoVaultCTA` renders Open Vault button when no vault is mounted

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Wait for CI green; request review; merge**

After merge, run the **Post-merge cleanup protocol** in `docs/superpowers/handoffs/2026-05-07-tauri-claude-integration.md`. Next MVP is **MVP-2 (Claude subprocess integration)**.

---

## Self-review checklist

Run before declaring the plan complete (verify against the spec, not against expectations):

**Spec coverage (against `docs/superpowers/specs/2026-05-07-tauri-claude-integration-design.md` § 6.4 / § 11.5):**
- ✅ § 6.4 "MVP-1d — Cleanup, bundle, CI" already shipped via PR #152; this plan is the follow-up MVP-1e covering the deferred history substrate.
- ✅ § 11.5 "Discovered during MVP-1a execution — abstraction debt clean-up" — this plan finishes the FSA retirement (history sidecars were the last unmigrated I/O path).

**Placeholder scan:**
- No "TBD" / "implement later" / "fill in details" anywhere in the plan.
- Every code step shows the actual code.
- Every command lists expected output.

**Type consistency:**
- `initHistory` signatures match across `useHistoryFileSync.ts` (Task 2), `useDocumentHistory.ts` (Task 3), `useFileActions.ts` (Task 4), and `DocumentView.tsx` (Task 4).
- `readHistoryFile` / `writeHistoryFile` signatures match between `historyPersistence.ts` (Task 1) and consumers in `useHistoryFileSync.ts` (Task 2) + `useBackgroundScanner.ts` (Task 5).
- `tauriBridge.readText` / `writeText` are the same methods already shipped in MVP-1a — no new bridge surface.

**Risk surface called out:**
- The `historyFileNameLegacy` migration fallback is preserved. Without it, users with sidecars created pre-collision-fix lose undo on first open in the Tauri build.
- The `vault_write_text` Rust command must `mkdir -p` the parent directory for sidecars in nested folders (it does, per MVP-1a `src-tauri/src/vault/io.rs`). Verify in Task 1 Step 3 if behaviour seems off.
- Empty-state CTA reachability: `noVaultOpen` is true only after a deliberate `clearLastPath()` or first-ever launch with no `last_path`. MVP-1c's auto-restore covers the common path.
