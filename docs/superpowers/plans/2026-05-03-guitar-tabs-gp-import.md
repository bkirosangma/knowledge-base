# Guitar Tabs — Guitar Pro (`.gp`) Import Implementation Plan (TAB-006)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a palette command "Import Guitar Pro file…" that lets the user pick a `.gp` / `.gp3` / `.gp4` / `.gp5` / `.gp7` file from anywhere on disk, converts it to alphaTex via alphatab's importer + exporter, writes it into the open vault as a new `.alphatex` file, and opens it in the tab pane.

**Architecture:** A pure utility `gpToAlphatex(bytes)` lazy-imports `@coderline/alphatab`, calls `importer.ScoreLoader.loadScoreFromBytes(bytes)` to parse the binary, then `new exporter.AlphaTexExporter().exportToString(score)` to serialise back to alphaTex text. A `useGpImport` hook drives the file-picker → read-bytes → convert → write-via-`TabRepository` → open-pane flow. The palette command (`tabs.import-gp`) is registered in `knowledgeBase.tsx` and triggers the hook.

**Tech Stack:** Same as TAB-001..TAB-005 — TypeScript, React, `@coderline/alphatab` (already pinned), Vitest. No new deps. The `.gp` source path was already typed in the `TabSource` union from TAB-001 (`{ kind: "gp"; bytes: Uint8Array }`); this slice activates it.

**Spec:** [`docs/superpowers/specs/2026-05-02-guitar-tabs-design.md`](../specs/2026-05-02-guitar-tabs-design.md) — see "File format → Import: `.gp`" section.

**Out of scope for this plan:**
- **Drag-drop on the explorer.** The spec lists drag-drop *or* palette command as the trigger; for a 1-day ticket, palette-only ships first. Drag-drop folds in cleanly once the explorer's drop zone exists for other features (currently it doesn't).
- **Folder-of-choice on import.** The new `.alphatex` lands at the vault root with the `.gp` basename. User can rename via the existing file-rename flow afterwards.
- **Round-tripping `.gp` exports.** This is import-only; alphatab's `Gp7Exporter` is available for a future export ticket.
- **Lossy-conversion warnings.** Some Guitar Pro features (sound banks, tone presets) don't survive the round-trip to alphaTex. Document this in `Features.md` but don't surface a UI warning in this slice.

**Settled decisions:**
- Conversion is **fully synchronous and DOM-free** thanks to alphatab's `ScoreLoader.loadScoreFromBytes` + `AlphaTexExporter.exportToString`. No hidden mount, no AudioContext, no timers — the conversion is just a byte-buffer transformation.
- The palette command lives in the global `View` group alongside other top-level toggles, but uses `id: "tabs.import-gp"` so its identity is unambiguous.

---

## File Structure

```
src/app/knowledge_base/
  infrastructure/
    gpToAlphatex.ts                ← NEW (pure: Uint8Array → alphaTex string; lazy alphatab import)
    gpToAlphatex.test.ts           ← NEW
  features/tab/
    hooks/
      useGpImport.ts               ← NEW (pick → read → convert → write → open)
      useGpImport.test.tsx         ← NEW
  knowledgeBase.tsx                ← MODIFIED (register `tabs.import-gp` palette command)
test-cases/11-tabs.md              ← MODIFIED (add §11.4 .gp import; 6 cases)
Features.md                        ← MODIFIED (§11.3 Pending → split: §11.3 .gp import + §11.4 Pending)
```

Notes on shape:
- `gpToAlphatex.ts` is a pure utility — no React, no hooks. Lives in `infrastructure/` next to `alphaTabEngine.ts` because both lazy-load alphatab.
- `useGpImport.ts` is the *only* React hook for this slice; it owns DOM access (the hidden `<input type="file">`) and the FSA write through `TabRepository`.

---

## Task 1: `gpToAlphatex(bytes)` utility (TDD)

**Files:**
- Create: `src/app/knowledge_base/infrastructure/gpToAlphatex.ts`
- Test: `src/app/knowledge_base/infrastructure/gpToAlphatex.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/knowledge_base/infrastructure/gpToAlphatex.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const loadScoreFromBytesMock = vi.fn();
const exportToStringMock = vi.fn();

vi.mock("@coderline/alphatab", () => ({
  importer: {
    ScoreLoader: {
      loadScoreFromBytes: loadScoreFromBytesMock,
    },
  },
  exporter: {
    AlphaTexExporter: class {
      exportToString = exportToStringMock;
    },
  },
}));

import { gpToAlphatex } from "./gpToAlphatex";

describe("gpToAlphatex", () => {
  beforeEach(() => {
    loadScoreFromBytesMock.mockReset();
    exportToStringMock.mockReset();
  });

  it("loads bytes via ScoreLoader then exports via AlphaTexExporter", async () => {
    const fakeScore = { title: "Test" };
    loadScoreFromBytesMock.mockReturnValue(fakeScore);
    exportToStringMock.mockReturnValue("\\title \"Test\"\n.");

    const bytes = new Uint8Array([1, 2, 3, 4]);
    const result = await gpToAlphatex(bytes);

    expect(loadScoreFromBytesMock).toHaveBeenCalledTimes(1);
    expect(loadScoreFromBytesMock).toHaveBeenCalledWith(bytes);
    expect(exportToStringMock).toHaveBeenCalledTimes(1);
    expect(exportToStringMock).toHaveBeenCalledWith(fakeScore);
    expect(result).toBe("\\title \"Test\"\n.");
  });

  it("propagates ScoreLoader errors as-is", async () => {
    loadScoreFromBytesMock.mockImplementation(() => {
      throw new Error("Unsupported format");
    });
    const bytes = new Uint8Array([0, 0, 0, 0]);
    await expect(gpToAlphatex(bytes)).rejects.toThrow("Unsupported format");
    expect(exportToStringMock).not.toHaveBeenCalled();
  });

  it("propagates AlphaTexExporter errors as-is", async () => {
    loadScoreFromBytesMock.mockReturnValue({ title: "Bad" });
    exportToStringMock.mockImplementation(() => {
      throw new Error("Export failed");
    });
    await expect(gpToAlphatex(new Uint8Array([1]))).rejects.toThrow("Export failed");
  });
});
```

- [ ] **Step 2: Run, confirm fail**

Run: `npm run test:run -- gpToAlphatex`
Expected: FAIL — `Cannot find module './gpToAlphatex'`.

- [ ] **Step 3: Create the utility**

Create `src/app/knowledge_base/infrastructure/gpToAlphatex.ts`:

```ts
/**
 * Pure conversion: Guitar Pro bytes (`.gp` / `.gp3..7`) → alphaTex text.
 *
 * Uses alphatab's `importer.ScoreLoader.loadScoreFromBytes` (auto-detects
 * the GP format from magic bytes) and `exporter.AlphaTexExporter.exportToString`.
 * Lazy-imports alphatab so the ~1 MB chunk is only fetched when the user
 * actually triggers an import — matches the same lazy-load discipline as
 * `AlphaTabEngine.mount()`.
 *
 * No DOM access, no AudioContext, no timers — just a byte-buffer
 * transformation. Safe to call from any context.
 *
 * Errors propagate as-is. Caller decides how to surface them
 * (`useGpImport` routes them through `ShellErrorContext`).
 */
export async function gpToAlphatex(bytes: Uint8Array): Promise<string> {
  const mod = await import("@coderline/alphatab");
  const score = mod.importer.ScoreLoader.loadScoreFromBytes(bytes);
  const exporter = new mod.exporter.AlphaTexExporter();
  return exporter.exportToString(score);
}
```

- [ ] **Step 4: Run tests, iterate until 3/3 pass**

Run: `npm run test:run -- gpToAlphatex`
Expected: 3/3 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/knowledge_base/infrastructure/gpToAlphatex.ts \
        src/app/knowledge_base/infrastructure/gpToAlphatex.test.ts
git commit -m "feat(tabs): add gpToAlphatex conversion utility (TAB-006)"
```

---

## Task 2: `useGpImport` hook (TDD)

**Files:**
- Create: `src/app/knowledge_base/features/tab/hooks/useGpImport.ts`
- Test: `src/app/knowledge_base/features/tab/hooks/useGpImport.test.tsx`

The hook surfaces a single `importGpFile()` callable. When invoked it:
1. Synthesizes a hidden `<input type="file" accept=".gp,.gp3,.gp4,.gp5,.gp7">` and clicks it.
2. On user pick: reads the file as `Uint8Array`, calls `gpToAlphatex`, derives the new vault-relative path (basename + `.alphatex`), writes via `useRepositories().tab.write`, and calls a supplied `onImported(path)` callback so the caller can route the new file into the active pane.
3. On error at any stage: routes through `useShellErrors().reportError`. Returns silently to caller.
4. On user cancel (no file chosen): returns silently — no error.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { ReactNode } from "react";
import { StubRepositoryProvider } from "../../../shell/RepositoryContext";
import { StubShellErrorProvider } from "../../../shell/ShellErrorContext";
import { useGpImport } from "./useGpImport";

vi.mock("../../../infrastructure/gpToAlphatex", () => ({
  gpToAlphatex: vi.fn(),
}));
import { gpToAlphatex } from "../../../infrastructure/gpToAlphatex";

function Wrap({
  children,
  write = vi.fn().mockResolvedValue(undefined),
  reportError = vi.fn(),
}: {
  children: ReactNode;
  write?: ReturnType<typeof vi.fn>;
  reportError?: ReturnType<typeof vi.fn>;
}) {
  return (
    <StubShellErrorProvider value={{ current: null, reportError, dismiss: vi.fn() }}>
      <StubRepositoryProvider
        value={{
          attachment: null, document: null, diagram: null,
          linkIndex: null, svg: null, vaultConfig: null,
          tab: { read: vi.fn().mockResolvedValue(""), write },
        }}
      >
        {children}
      </StubRepositoryProvider>
    </StubShellErrorProvider>
  );
}

/**
 * Build a minimal File-like object whose `arrayBuffer()` returns the given
 * payload. Real Files are constructed via FormData/Blob; in JSDOM the
 * spec-compliant ArrayBuffer access works without polyfills.
 */
function makeFile(name: string, bytes: number[]): File {
  const buf = new Uint8Array(bytes);
  return new File([buf], name, { type: "application/octet-stream" });
}

describe("useGpImport", () => {
  beforeEach(() => {
    vi.mocked(gpToAlphatex).mockReset();
  });

  it("converts the picked file and writes a sibling .alphatex via TabRepository", async () => {
    vi.mocked(gpToAlphatex).mockResolvedValue("\\title \"Hi\"\n.");
    const write = vi.fn().mockResolvedValue(undefined);
    const onImported = vi.fn();
    const { result } = renderHook(() => useGpImport({ onImported }), {
      wrapper: ({ children }) => <Wrap write={write}>{children}</Wrap>,
    });

    const file = makeFile("song.gp", [1, 2, 3]);
    await act(async () => {
      await result.current.importBytes(file);
    });

    expect(gpToAlphatex).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith("song.alphatex", "\\title \"Hi\"\n.");
    expect(onImported).toHaveBeenCalledWith("song.alphatex");
  });

  it("strips a multi-segment path to just the basename", async () => {
    vi.mocked(gpToAlphatex).mockResolvedValue("alphatex");
    const write = vi.fn().mockResolvedValue(undefined);
    const onImported = vi.fn();
    const { result } = renderHook(() => useGpImport({ onImported }), {
      wrapper: ({ children }) => <Wrap write={write}>{children}</Wrap>,
    });
    const file = makeFile("solo.gp7", [9]);
    await act(async () => {
      await result.current.importBytes(file);
    });
    expect(write).toHaveBeenCalledWith("solo.alphatex", "alphatex");
  });

  it("handles .gp3/.gp4/.gp5/.gp7 by stripping any of those extensions", async () => {
    vi.mocked(gpToAlphatex).mockResolvedValue("x");
    const write = vi.fn().mockResolvedValue(undefined);
    const onImported = vi.fn();
    for (const ext of ["gp3", "gp4", "gp5", "gp7"]) {
      write.mockClear();
      const { result } = renderHook(() => useGpImport({ onImported }), {
        wrapper: ({ children }) => <Wrap write={write}>{children}</Wrap>,
      });
      const file = makeFile(`song.${ext}`, [1]);
      await act(async () => {
        await result.current.importBytes(file);
      });
      expect(write).toHaveBeenCalledWith("song.alphatex", "x");
      cleanup();
    }
  });

  it("routes a conversion failure through ShellErrorContext", async () => {
    vi.mocked(gpToAlphatex).mockRejectedValue(new Error("Unsupported format"));
    const write = vi.fn();
    const reportError = vi.fn();
    const onImported = vi.fn();
    const { result } = renderHook(() => useGpImport({ onImported }), {
      wrapper: ({ children }) => <Wrap write={write} reportError={reportError}>{children}</Wrap>,
    });
    const file = makeFile("broken.gp", [0]);
    await act(async () => {
      await result.current.importBytes(file);
    });
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError.mock.calls[0][0].message).toBe("Unsupported format");
    expect(write).not.toHaveBeenCalled();
    expect(onImported).not.toHaveBeenCalled();
  });

  it("routes a write failure through ShellErrorContext", async () => {
    vi.mocked(gpToAlphatex).mockResolvedValue("alphatex");
    const write = vi.fn().mockRejectedValue(new Error("permission denied"));
    const reportError = vi.fn();
    const onImported = vi.fn();
    const { result } = renderHook(() => useGpImport({ onImported }), {
      wrapper: ({ children }) => <Wrap write={write} reportError={reportError}>{children}</Wrap>,
    });
    const file = makeFile("a.gp", [1]);
    await act(async () => {
      await result.current.importBytes(file);
    });
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(onImported).not.toHaveBeenCalled();
  });
});
```

(Note: this test exercises `importBytes(file)` directly. The hook also exposes `pickFile()` which spawns a `<input>` and clicks it — that path is too DOM-heavy to test without an extensive mock; we verify it manually + via the e2e in Task 4.)

- [ ] **Step 2: Run, confirm fail**

Run: `npm run test:run -- useGpImport`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the hook**

Create `src/app/knowledge_base/features/tab/hooks/useGpImport.ts`:

```ts
"use client";

import { useCallback } from "react";
import { gpToAlphatex } from "../../../infrastructure/gpToAlphatex";
import { useRepositories } from "../../../shell/RepositoryContext";
import { useShellErrors } from "../../../shell/ShellErrorContext";

const GP_EXTENSIONS = ["gp", "gp3", "gp4", "gp5", "gp7"];
const ACCEPT_ATTR = GP_EXTENSIONS.map((e) => `.${e}`).join(",");

export interface UseGpImportOptions {
  /** Called with the new vault-relative path after a successful import.
   *  Caller is responsible for opening the file in a pane. */
  onImported: (path: string) => void;
}

export interface UseGpImport {
  /** Open a file picker, then convert + write + notify on the chosen file. */
  pickFile: () => void;
  /** Internal entry point — exposed for unit tests + the file-picker callback. */
  importBytes: (file: File) => Promise<void>;
}

/**
 * Drives the Guitar Pro import flow: file picker → bytes → alphaTex →
 * vault write → caller-supplied onImported. Errors at any stage route
 * through `ShellErrorContext` (same path docs/diagrams use); user cancel
 * returns silently.
 */
export function useGpImport(opts: UseGpImportOptions): UseGpImport {
  const { tab } = useRepositories();
  const { reportError } = useShellErrors();

  const importBytes = useCallback(async (file: File): Promise<void> => {
    try {
      if (!tab) throw new Error("No vault is open. Open a folder first.");
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const alphaTex = await gpToAlphatex(bytes);
      const targetPath = deriveAlphatexPath(file.name);
      await tab.write(targetPath, alphaTex);
      opts.onImported(targetPath);
    } catch (e) {
      reportError(e, `Importing ${file.name}`);
    }
  }, [tab, reportError, opts]);

  const pickFile = useCallback(() => {
    if (typeof document === "undefined") return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ACCEPT_ATTR;
    input.style.display = "none";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      document.body.removeChild(input);
      if (!file) return; // user cancelled
      void importBytes(file);
    }, { once: true });
    document.body.appendChild(input);
    input.click();
  }, [importBytes]);

  return { pickFile, importBytes };
}

/**
 * `song.gp7` → `song.alphatex`. Multi-dot names (e.g. `my.song.gp`) keep
 * everything before the FINAL `.gpN` segment.
 */
function deriveAlphatexPath(filename: string): string {
  const lower = filename.toLowerCase();
  for (const ext of GP_EXTENSIONS) {
    if (lower.endsWith(`.${ext}`)) {
      return filename.slice(0, filename.length - ext.length - 1) + ".alphatex";
    }
  }
  // Defensive: filename had an unexpected extension (the picker's accept
  // attribute should have prevented this). Fall through to a generic
  // ".alphatex" tail without losing the original basename.
  return filename + ".alphatex";
}
```

- [ ] **Step 4: Iterate until green**

Run: `npm run test:run -- useGpImport`
Expected: 5/5 PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm run test:run`
Expected: full suite passes (no other consumer affected).

- [ ] **Step 6: Commit**

```bash
git add src/app/knowledge_base/features/tab/hooks/useGpImport.ts \
        src/app/knowledge_base/features/tab/hooks/useGpImport.test.tsx
git commit -m "feat(tabs): add useGpImport hook (TAB-006)"
```

---

## Task 3: Register the `tabs.import-gp` palette command

**Files:**
- Modify: `src/app/knowledge_base/knowledgeBase.tsx`

The command appears in the palette under the "File" group (next to other create/import commands) — only visible when a vault is open (`when: () => fileExplorer.directoryName !== null`). When invoked it calls `useGpImport.pickFile()`. The `onImported` callback routes to `handleSelectFile(path)` so the new file opens in the active pane via the existing routing chain.

- [ ] **Step 1: Find an anchor in `knowledgeBase.tsx`**

Run: `grep -n "useRegisterCommands\|themeCommands" src/app/knowledge_base/knowledgeBase.tsx | head`

Expected output includes `useRegisterCommands(themeCommands);` near line ~1282 (the last existing call). Insert the new registration BEFORE the `themeCommands` block so the import command appears in the palette before settings-style commands.

- [ ] **Step 2: Add the import + command registration**

(a) Add the hook import at the top of `knowledgeBase.tsx` alongside other `./features/tab/...` imports:

```tsx
import { useGpImport } from "./features/tab/hooks/useGpImport";
```

(b) Inside the `KnowledgeBaseInner()` body, BEFORE the `themeCommands` block (around the same place as `openSearchCommands`), wire the hook + command:

```tsx
  const gpImport = useGpImport({
    onImported: (path) => handleSelectFile(path),
  });
  const importGpCommands = useMemo(() => [{
    id: "tabs.import-gp",
    title: "Import Guitar Pro file…",
    group: "File",
    when: () => fileExplorer.directoryName !== null,
    run: () => gpImport.pickFile(),
  }], [gpImport, fileExplorer.directoryName]);
  useRegisterCommands(importGpCommands);
```

The `when` guard mirrors the pattern other vault-bound commands use; before a folder is open, there's no `tab` repository to write into.

- [ ] **Step 3: Typecheck + full suite**

Run in parallel:
- `npm run typecheck` → exit 0
- `npm run test:run` → all pass; no test changes (the command exists in the registry but no test asserts its presence in this slice — that's the e2e's job).
- `npm run lint` → exit 0

- [ ] **Step 4: Manual smoke (recommended)**

Run: `npm run dev`. Open the app, open a vault. Press `⌘K` → search "Import" → confirm "Import Guitar Pro file…" appears in the palette. Click it → confirm a native file picker opens with the `.gp/.gp3/.gp4/.gp5/.gp7` accept filter. Cancel → no error. Pick an actual `.gp` file (or `.gp7` from a sample) → confirm a new `.alphatex` lands at the vault root and opens in the tab pane.

Per `feedback_preview_verification_limits.md`, the picker is gestureable in a real Chromium; if you're using the preview MCP this step is the verification ceiling — pass + clean console is enough.

- [ ] **Step 5: Commit**

```bash
git add src/app/knowledge_base/knowledgeBase.tsx
git commit -m "feat(tabs): register Import Guitar Pro palette command (TAB-006)"
```

---

## Task 4: Update `test-cases/11-tabs.md` and `Features.md`

**Files:**
- Modify: `test-cases/11-tabs.md`
- Modify: `Features.md`

### 1. Add §11.4 .gp import to test-cases/11-tabs.md

Insert this new section AFTER the existing §11.3 Playback chrome section (or at the end of the file if the layout has shifted):

```markdown
## 11.4 .gp import (TAB-006)

Palette command + hook + utility for converting Guitar Pro files (`.gp` / `.gp3..7`) to `.alphatex` via alphatab's importer/exporter. Shipped 2026-05-03.

- **TAB-11.4-01** ✅ **`gpToAlphatex` loads bytes via ScoreLoader and exports via AlphaTexExporter** — pure utility, no DOM access. _(unit: gpToAlphatex.test.ts.)_
- **TAB-11.4-02** ✅ **`gpToAlphatex` propagates importer + exporter errors as-is** — `useGpImport` decides how to surface them; the utility stays unopinionated. _(unit: gpToAlphatex.test.ts.)_
- **TAB-11.4-03** ✅ **`useGpImport.importBytes(file)` writes a sibling `.alphatex` and notifies onImported** — derives the new path from the basename (strips the GP extension). _(unit: useGpImport.test.tsx.)_
- **TAB-11.4-04** ✅ **`.gp3` / `.gp4` / `.gp5` / `.gp7` extensions all map to `.alphatex` correctly** — _(unit: useGpImport.test.tsx.)_
- **TAB-11.4-05** ✅ **Conversion + write failures route through `ShellErrorContext`** — onImported is NOT called on either failure path. _(unit: useGpImport.test.tsx.)_
- **TAB-11.4-06** ❌ **End-to-end import flow** — Playwright drives the palette command, picks a `.gp` fixture, asserts the resulting `.alphatex` opens in a tab pane. Deferred — file-picker drive in headless Chromium requires a custom mock layer; the manual smoke in Task 3 step 4 is the verification ceiling for now.
```

(Use Edit on the file with exact `old_string` matching the closing line of §11.3 to find the insertion point.)

### 2. Update Features.md §11

Find the existing `### 11.3 Pending` block (under `## 11. Guitar Tabs`) and REPLACE it with:

```markdown
### 11.3 .gp import (TAB-006)
- ⚙️ **`gpToAlphatex` utility** (`src/app/knowledge_base/infrastructure/gpToAlphatex.ts`) — lazy alphatab import; converts `.gp`/`.gp3-7` bytes to alphaTex via `ScoreLoader.loadScoreFromBytes` + `AlphaTexExporter.exportToString`. No DOM, no AudioContext.
- ⚙️ **`useGpImport` hook** (`features/tab/hooks/useGpImport.ts`) — drives file picker → bytes → convert → `TabRepository.write` → `onImported` callback. Errors route through `ShellErrorContext`. New file lands at vault root with the GP basename + `.alphatex` extension.
- ✅ **"Import Guitar Pro file…" palette command** (`tabs.import-gp`, group "File") — appears when a vault is open. Note: lossy round-trip — Guitar Pro's sound-bank / tone presets do not survive the conversion to alphaTex.

### 11.4 Pending
- ? **Properties panel** (tuning / capo / key / tempo / sections + attachments) — TAB-007 / TAB-007a.
- ? **Vault search** (titles / artist / key / tuning) — TAB-011.
- ? **Mobile gating** (read-only + playback only) — TAB-012.
- ? **Editor (M2)** — TAB-008+.
```

(The `?` line for `.gp` import is dropped from Pending; it's now §11.3.)

### 3. Verify

```bash
grep -c '^- \*\*TAB-' test-cases/11-tabs.md  # was 48, expect 54 (+6)
grep -n '^### 11\.' Features.md              # expect §11.1, §11.2, §11.3 (.gp import), §11.4 (Pending)
npm run test:run                             # full suite passes
```

### 4. Commit

```bash
git add test-cases/11-tabs.md Features.md
git commit -m "docs: register TAB-006 .gp import in test-cases + Features.md"
```

---

## Wrap-up

After Task 4 lands:
- `⌘K` → "Import Guitar Pro file…" → user picks a `.gp` → conversion happens fully client-side → a sibling `.alphatex` appears at the vault root → the tab pane opens it → user can play / loop / change tempo.
- The Playwright smoke is intentionally deferred (TAB-11.4-06) — driving a native file picker in headless Chromium is non-trivial and the unit tests cover the conversion + write paths definitively.

**Branch:** `plan/guitar-tabs-gp-import`. Per `feedback_no_worktrees.md`: don't push, don't worktree. Per `project_branch_protection.md`: open a PR via `gh pr create` when ready.

**Next plan after this ships:** TAB-007 (properties panel — tuning / capo / key / tempo / sections, read-only metadata view) — surfaces the metadata that the engine has been emitting via `"loaded"` events all along.

---

_End of TAB-006 plan._
