# MVP-4b — SVG/Tab Metadata Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Wire `<SourcesSection>` into the SVG and Guitar Tab editors so a user can attach `SourceLink[]` to those file types — matching the document/diagram experience shipped in MVP-4a.

**Architecture:** Two sidecar files. **Tab** bumps the existing `TabRefsPayload` from v2 → v3 with optional `sources` (one sidecar per tab). **SVG** introduces a new lazy `<file>.svg.refs.json` sidecar (created only on first source add). Both schemas accept an optional `attachedTo?` reserved for the deferred MVP-2 SVG/Tab attachment work — no UI wires that field. New sibling hooks (`useTabSources`, `useSvgMeta`) own only their slice of the sidecar; `useTabSources` does read-modify-write on save so it cannot clobber `sectionRefs`/`trackRefs` written by `useTabEngine`. SVG gains a new `SvgProperties` aside; Tab adds the section into the existing `TabProperties`.

**Tech Stack:** TypeScript, React 18, Vitest + jsdom + @testing-library/react, File System Access API, existing `RepositoryContext` infrastructure.

**Spec:** `docs/superpowers/specs/2026-05-07-svg-tab-metadata-persistence-design.md`

**Depends on:** MVP-4a merged via PR #133, #135 (`SourceLink`, `<SourcesSection>`, `RepositoryContext`).

**Out of scope (forward-compat-only):** `attachedTo` field on either sidecar. Schemas accept it; no hook reads or writes it; no UI binds it. MVP-2 SVG/Tab attachments will pick this up later without another migration.

---

## File Map

| File | Action |
|------|--------|
| `src/app/knowledge_base/shared/types/attachments.ts` | **New** — shared `AttachedToScope` + `AttachedToEntry` (forward-compat type, not wired). |
| `src/app/knowledge_base/shared/types/attachments.test.ts` | **New** — type-shape sanity test. |
| `src/app/knowledge_base/domain/tabRefs.ts` | Modify — bump payload to v3, retain v1/v2 shapes for read migration. |
| `src/app/knowledge_base/infrastructure/tabRefsRepo.ts` | Modify — read v1/v2/v3, always emit v3, drop empty `sources`/`attachedTo` from JSON. |
| `src/app/knowledge_base/infrastructure/tabRefsRepo.test.ts` | Modify — v2→v3 migration, v3 round-trip, empty-drop cases. |
| `src/app/knowledge_base/domain/svgRefs.ts` | **New** — `SvgRefsPayload`, `SvgRefsRepository`, `emptySvgRefs()`. |
| `src/app/knowledge_base/infrastructure/svgRefsRepo.ts` | **New** — file-system implementation; lazy create; delete-when-empty. |
| `src/app/knowledge_base/infrastructure/svgRefsRepo.test.ts` | **New**. |
| `src/app/knowledge_base/shell/RepositoryContext.tsx` | Modify — register `svgRefs: SvgRefsRepository \| null`. |
| `src/app/knowledge_base/shell/RepositoryContext.test.tsx` | Modify — assert `svgRefs` exposed when rootHandle mounted. |
| `src/app/knowledge_base/features/tab/hooks/useTabSources.ts` | **New** — file-level sources hook with merge-guarded write. |
| `src/app/knowledge_base/features/tab/hooks/useTabSources.test.tsx` | **New**. |
| `src/app/knowledge_base/features/svgEditor/hooks/useSvgMeta.ts` | **New** — file-level sources hook for SVG. |
| `src/app/knowledge_base/features/svgEditor/hooks/useSvgMeta.test.tsx` | **New**. |
| `src/app/knowledge_base/features/svgEditor/properties/SvgProperties.tsx` | **New** — collapsible aside, mounts `<SourcesSection>`. |
| `src/app/knowledge_base/features/svgEditor/properties/SvgProperties.test.tsx` | **New**. |
| `src/app/knowledge_base/features/svgEditor/SVGEditorView.tsx` | Modify — wrap canvas + properties in flex row; mount `SvgProperties`. |
| `src/app/knowledge_base/features/svgEditor/SVGEditorView.test.tsx` | Modify — assert aside renders when activeFile set. |
| `src/app/knowledge_base/features/tab/properties/TabProperties.tsx` | Modify — add `<SourcesSection>` slot adjacent to `FileReferences`. |
| `src/app/knowledge_base/features/tab/properties/TabProperties.test.tsx` | Modify — assert section rendered + add-source path. |
| `Features.md` | Modify — entries under §4 (Guitar Tabs) and §? (SVG) for source links. |
| `test-cases/04-svg-editor.md` (or current SVG file) | Modify — `SVG-?-NN` source-links cases. |
| `test-cases/11-tabs.md` | Modify — `TAB-?-NN` file-level source-links case. |

**Adaptations baked in (apply per task):**
- **`useRepositories()`** is the standard access path — every new hook reads from it, every test wraps under `StubRepositoryProvider`.
- **`readOrNull` + `classifyError`** wrap every repo call (matches `tabRefsRepo.ts`, `svgRepo.ts`).
- **Debounce 200 ms** matches `useSVGPersistence` and the rest of the autosave plumbing.
- **`SourcesSection`** is a controlled component — pass `sources` and `onChange`, parent owns state.
- **No diagram code changes** in this MVP. The new `attachments.ts` shared type is *only* referenced by the new SVG/Tab schemas.

---

## Task 1: Shared `AttachedToEntry` type module

**Files:**
- Create: `src/app/knowledge_base/shared/types/attachments.ts`
- Create: `src/app/knowledge_base/shared/types/attachments.test.ts`

- [ ] **Step 1.1: Write failing test**

```ts
// src/app/knowledge_base/shared/types/attachments.test.ts
import { describe, it, expect } from "vitest";
import type { AttachedToEntry, AttachedToScope } from "./attachments";

describe("AttachedToEntry", () => {
  it("accepts every documented scope", () => {
    const scopes: AttachedToScope[] = [
      "root", "node", "connection", "flow", "type",
      "tab", "tab-section", "tab-track",
    ];
    for (const type of scopes) {
      const e: AttachedToEntry = { type, documentPath: "doc.md" };
      expect(e.type).toBe(type);
    }
  });

  it("permits an `id` field on non-root scopes", () => {
    const e: AttachedToEntry = { type: "node", id: "n-1", documentPath: "x.md" };
    expect(e.id).toBe("n-1");
  });
});
```

- [ ] **Step 1.2: Run test — should fail (module missing)**

```bash
npm run test:run -- src/app/knowledge_base/shared/types/attachments.test.ts
```
Expected: FAIL — `Cannot find module './attachments'`.

- [ ] **Step 1.3: Implement**

```ts
// src/app/knowledge_base/shared/types/attachments.ts
/**
 * Shared scope vocabulary for attachments. Used by SVG and Tab sidecar
 * payloads as a forward-compat field that MVP-2 SVG/Tab branches will
 * eventually wire. No UI in MVP-4b binds this — it is round-trip only.
 */
export type AttachedToScope =
  | "root"
  | "node"
  | "connection"
  | "flow"
  | "type"
  | "tab"
  | "tab-section"
  | "tab-track";

export interface AttachedToEntry {
  type: AttachedToScope;
  /** Entity id; absent for "root". */
  id?: string;
  /** Document path the entity is attached to. */
  documentPath: string;
}
```

- [ ] **Step 1.4: Re-run test — should pass**

```bash
npm run test:run -- src/app/knowledge_base/shared/types/attachments.test.ts
```
Expected: PASS.

- [ ] **Step 1.5: Commit**

```bash
git add src/app/knowledge_base/shared/types/attachments.ts \
        src/app/knowledge_base/shared/types/attachments.test.ts
git commit -m "feat(types): shared AttachedToEntry for SVG/Tab sidecars"
```

---

## Task 2: `SvgRefsPayload` domain types

**Files:**
- Create: `src/app/knowledge_base/domain/svgRefs.ts`
- Add the test inside Task 3 (paired with the repo)

- [ ] **Step 2.1: Implement**

```ts
// src/app/knowledge_base/domain/svgRefs.ts
/**
 * Domain types for the `<file>.svg.refs.json` sidecar.
 *
 * Lazy creation only — the sidecar exists only when the user has added
 * at least one source link (or, in a future MVP, an `attachedTo` entry).
 * Read returns `null` when no sidecar exists. Write deletes the sidecar
 * when both `sources` and `attachedTo` are empty/absent.
 */

import type { SourceLink } from "../shared/types/sources";
import type { AttachedToEntry } from "../shared/types/attachments";

export interface SvgRefsPayload {
  version: 1;
  sources?: SourceLink[];
  /** Reserved for MVP-2 SVG attachments; not wired in MVP-4b. */
  attachedTo?: AttachedToEntry[];
}

export interface SvgRefsRepository {
  read(filePath: string): Promise<SvgRefsPayload | null>;
  write(filePath: string, payload: SvgRefsPayload): Promise<void>;
}

/** Return an empty but valid payload (no sources, no attachedTo). */
export function emptySvgRefs(): SvgRefsPayload {
  return { version: 1 };
}
```

- [ ] **Step 2.2: Typecheck**

```bash
npm run typecheck
```
Expected: clean.

- [ ] **Step 2.3: Commit**

```bash
git add src/app/knowledge_base/domain/svgRefs.ts
git commit -m "feat(svgRefs): SvgRefsPayload + repository interface"
```

---

## Task 3: `svgRefsRepo` with lazy create + delete-when-empty

**Files:**
- Create: `src/app/knowledge_base/infrastructure/svgRefsRepo.ts`
- Create: `src/app/knowledge_base/infrastructure/svgRefsRepo.test.ts`

- [ ] **Step 3.1: Write failing tests**

```ts
// src/app/knowledge_base/infrastructure/svgRefsRepo.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { createSvgRefsRepository } from "./svgRefsRepo";
import { MockDir } from "../../../test-utils/mockFsa"; // existing helper used by tabRefsRepo.test.ts

describe("svgRefsRepo", () => {
  let root: MockDir;
  let repo: ReturnType<typeof createSvgRefsRepository>;

  beforeEach(() => {
    root = new MockDir();
    repo = createSvgRefsRepository(root as unknown as FileSystemDirectoryHandle);
  });

  it("read returns null when no sidecar exists", async () => {
    expect(await repo.read("drawing.svg")).toBeNull();
  });

  it("write then read round-trips a populated payload", async () => {
    await repo.write("drawing.svg", {
      version: 1,
      sources: [{ url: "https://example.com", title: "Spec" }],
    });
    const got = await repo.read("drawing.svg");
    expect(got).toEqual({
      version: 1,
      sources: [{ url: "https://example.com", title: "Spec" }],
    });
  });

  it("write omits empty sources from emitted JSON", async () => {
    await repo.write("drawing.svg", {
      version: 1,
      sources: [{ url: "https://example.com" }],
    });
    // Then clear sources and write again — sidecar should be deleted.
    await repo.write("drawing.svg", { version: 1, sources: [] });
    expect(await repo.read("drawing.svg")).toBeNull();
  });

  it("write deletes sidecar when payload has no sources or attachedTo", async () => {
    await repo.write("drawing.svg", {
      version: 1,
      sources: [{ url: "https://example.com" }],
    });
    expect(await repo.read("drawing.svg")).not.toBeNull();
    await repo.write("drawing.svg", { version: 1 });
    expect(await repo.read("drawing.svg")).toBeNull();
  });

  it("malformed JSON in sidecar reads as null", async () => {
    await root.writeFile("drawing.svg.refs.json", "{ not json");
    expect(await repo.read("drawing.svg")).toBeNull();
  });

  it("preserves attachedTo on round-trip (forward-compat)", async () => {
    await repo.write("drawing.svg", {
      version: 1,
      attachedTo: [{ type: "root", documentPath: "notes.md" }],
    });
    const got = await repo.read("drawing.svg");
    expect(got?.attachedTo).toEqual([{ type: "root", documentPath: "notes.md" }]);
  });
});
```

- [ ] **Step 3.2: Run tests — should fail (module missing)**

```bash
npm run test:run -- src/app/knowledge_base/infrastructure/svgRefsRepo.test.ts
```
Expected: FAIL — `Cannot find module './svgRefsRepo'`.

- [ ] **Step 3.3: Implement**

```ts
// src/app/knowledge_base/infrastructure/svgRefsRepo.ts
/**
 * File System Access API implementation of `SvgRefsRepository`.
 * Mirrors `tabRefsRepo.ts` — lazy creation, `read` returns null on
 * missing or malformed sidecars. `write` deletes the sidecar when the
 * payload has no sources and no attachedTo (i.e. the user cleared all
 * metadata) so the vault stays tidy.
 */

import type { SvgRefsPayload, SvgRefsRepository } from "../domain/svgRefs";
import {
  readTextFile,
  writeTextFile,
} from "../shared/hooks/fileExplorerHelpers";
import { classifyError } from "../domain/errors";
import { readOrNull } from "../domain/repositoryHelpers";

const SIDECAR_SUFFIX = ".refs.json";

export function createSvgRefsRepository(
  rootHandle: FileSystemDirectoryHandle,
): SvgRefsRepository {
  return {
    async read(filePath) {
      const text = await readOrNull(async () => {
        try {
          const parts = sidecarPath(filePath).split("/");
          let dirHandle = rootHandle;
          for (const part of parts.slice(0, -1)) {
            dirHandle = await dirHandle.getDirectoryHandle(part);
          }
          const fileHandle = await dirHandle.getFileHandle(parts[parts.length - 1]);
          return await readTextFile(fileHandle);
        } catch (e) {
          throw classifyError(e);
        }
      });
      if (text === null) return null;
      try {
        const parsed = JSON.parse(text) as SvgRefsPayload;
        if (parsed.version !== 1) return null;
        return parsed;
      } catch {
        return null;
      }
    },

    async write(filePath, payload) {
      try {
        const sources = payload.sources ?? [];
        const attachedTo = payload.attachedTo ?? [];
        if (sources.length === 0 && attachedTo.length === 0) {
          await deleteSidecar(rootHandle, sidecarPath(filePath));
          return;
        }
        const cleaned: SvgRefsPayload = { version: 1 };
        if (sources.length > 0) cleaned.sources = sources;
        if (attachedTo.length > 0) cleaned.attachedTo = attachedTo;
        const json = JSON.stringify(cleaned, null, 2);
        await writeTextFile(rootHandle, sidecarPath(filePath), json);
      } catch (e) {
        throw classifyError(e);
      }
    },
  };
}

function sidecarPath(svgPath: string): string {
  return svgPath + SIDECAR_SUFFIX;
}

async function deleteSidecar(
  root: FileSystemDirectoryHandle,
  path: string,
): Promise<void> {
  const parts = path.split("/");
  let dir = root;
  try {
    for (const part of parts.slice(0, -1)) {
      dir = await dir.getDirectoryHandle(part);
    }
    await dir.removeEntry(parts[parts.length - 1]);
  } catch {
    // Already absent — ignore.
  }
}
```

- [ ] **Step 3.4: Re-run tests — should pass**

```bash
npm run test:run -- src/app/knowledge_base/infrastructure/svgRefsRepo.test.ts
```
Expected: PASS (6/6).

- [ ] **Step 3.5: Commit**

```bash
git add src/app/knowledge_base/infrastructure/svgRefsRepo.ts \
        src/app/knowledge_base/infrastructure/svgRefsRepo.test.ts
git commit -m "feat(svgRefs): repo with lazy create + delete-when-empty"
```

---

## Task 4: Bump `TabRefsPayload` to v3

**Files:**
- Modify: `src/app/knowledge_base/domain/tabRefs.ts`

- [ ] **Step 4.1: Update domain types**

Replace the existing `TabRefsPayload` with the v3 shape; rename existing v2 to `TabRefsPayloadV2` for read-path use; keep `TabRefsPayloadV1`.

```ts
// src/app/knowledge_base/domain/tabRefs.ts
/**
 * Domain types for the `.alphatex.refs.json` sidecar file.
 *
 * Migration history:
 *   v1 → v2 (TAB-009): `sections` → `sectionRefs`; `trackRefs` added.
 *   v2 → v3 (MVP-4b): optional `sources` and reserved `attachedTo` added.
 *
 * Read path is forward-compatible (v1 reads as v3 with empty `trackRefs`,
 * no sources, no attachedTo). Write always emits v3 and drops empty
 * sources/attachedTo arrays from the JSON.
 */

import type { SourceLink } from "../shared/types/sources";
import type { AttachedToEntry } from "../shared/types/attachments";

export interface TabRefEntry {
  id: string;
  name: string;
}

export interface TabRefsPayload {
  version: 3;
  sectionRefs: Record<string, string>;
  trackRefs: TabRefEntry[];
  /** File-level source links. */
  sources?: SourceLink[];
  /** Reserved for MVP-2 Tab attachments; not wired in MVP-4b. */
  attachedTo?: AttachedToEntry[];
}

export interface TabRefsPayloadV2 {
  version: 2;
  sectionRefs: Record<string, string>;
  trackRefs: TabRefEntry[];
}

export interface TabRefsPayloadV1 {
  version: 1;
  sections: Record<string, { currentName: string; createdAt: number }>;
}

export interface TabRefsRepository {
  read(filePath: string): Promise<TabRefsPayload | null>;
  write(filePath: string, payload: TabRefsPayload): Promise<void>;
}

export function emptyTabRefs(): TabRefsPayload {
  return { version: 3, sectionRefs: {}, trackRefs: [] };
}
```

- [ ] **Step 4.2: Typecheck — accept transient breakage**

```bash
npm run typecheck
```
Expected: errors in `tabRefsRepo.ts` (uses old `version: 2`) and any callsites that construct payloads. Fix in Task 5.

- [ ] **Step 4.3: Commit**

```bash
git add src/app/knowledge_base/domain/tabRefs.ts
git commit -m "feat(tabRefs): bump payload domain to v3 with sources + attachedTo"
```

---

## Task 5: Update `tabRefsRepo` for v2 → v3 read migration + v3 emit

**Files:**
- Modify: `src/app/knowledge_base/infrastructure/tabRefsRepo.ts`
- Modify: `src/app/knowledge_base/infrastructure/tabRefsRepo.test.ts`

- [ ] **Step 5.1: Write failing tests**

Add to the existing test file:

```ts
// inside src/app/knowledge_base/infrastructure/tabRefsRepo.test.ts
import type { TabRefsPayload, TabRefsPayloadV2 } from "../domain/tabRefs";

it("v2 sidecar on disk reads as v3 with no sources/attachedTo", async () => {
  const v2: TabRefsPayloadV2 = {
    version: 2,
    sectionRefs: { "abc-123": "Verse" },
    trackRefs: [{ id: "trk-1", name: "Lead" }],
  };
  await root.writeFile("song.alphatex.refs.json", JSON.stringify(v2));
  const got = await repo.read("song.alphatex");
  expect(got).toEqual({
    version: 3,
    sectionRefs: { "abc-123": "Verse" },
    trackRefs: [{ id: "trk-1", name: "Lead" }],
  });
});

it("v3 round-trip preserves sources and attachedTo", async () => {
  const payload: TabRefsPayload = {
    version: 3,
    sectionRefs: {},
    trackRefs: [],
    sources: [{ url: "https://x.test" }],
    attachedTo: [{ type: "tab", documentPath: "n.md" }],
  };
  await repo.write("song.alphatex", payload);
  const got = await repo.read("song.alphatex");
  expect(got).toEqual(payload);
});

it("v3 write drops empty sources from emitted JSON", async () => {
  await repo.write("song.alphatex", {
    version: 3,
    sectionRefs: {},
    trackRefs: [],
    sources: [],
    attachedTo: [],
  });
  const raw = await root.readFile("song.alphatex.refs.json");
  expect(raw).not.toContain("sources");
  expect(raw).not.toContain("attachedTo");
});

it("v1 sidecar on disk reads as v3 with empty trackRefs and no sources", async () => {
  await root.writeFile("song.alphatex.refs.json", JSON.stringify({
    version: 1,
    sections: { "abc-123": { currentName: "Verse", createdAt: 0 } },
  }));
  const got = await repo.read("song.alphatex");
  expect(got).toEqual({
    version: 3,
    sectionRefs: { "abc-123": "Verse" },
    trackRefs: [],
  });
});
```

- [ ] **Step 5.2: Run tests — should fail**

```bash
npm run test:run -- src/app/knowledge_base/infrastructure/tabRefsRepo.test.ts
```
Expected: FAIL on the new cases (v3 not implemented yet).

- [ ] **Step 5.3: Update `tabRefsRepo.ts`**

```ts
// src/app/knowledge_base/infrastructure/tabRefsRepo.ts
import type {
  TabRefsPayload,
  TabRefsPayloadV1,
  TabRefsPayloadV2,
  TabRefsRepository,
} from "../domain/tabRefs";
import {
  readTextFile,
  writeTextFile,
} from "../shared/hooks/fileExplorerHelpers";
import { classifyError } from "../domain/errors";
import { readOrNull } from "../domain/repositoryHelpers";

const SIDECAR_SUFFIX = ".refs.json";

export function createTabRefsRepository(
  rootHandle: FileSystemDirectoryHandle,
): TabRefsRepository {
  return {
    async read(filePath) {
      const text = await readOrNull(async () => {
        try {
          const parts = sidecarPath(filePath).split("/");
          let dirHandle = rootHandle;
          for (const part of parts.slice(0, -1)) {
            dirHandle = await dirHandle.getDirectoryHandle(part);
          }
          const fileHandle = await dirHandle.getFileHandle(parts[parts.length - 1]);
          return await readTextFile(fileHandle);
        } catch (e) {
          throw classifyError(e);
        }
      });
      if (text === null) return null;
      try {
        const parsed = JSON.parse(text) as
          | TabRefsPayload
          | TabRefsPayloadV2
          | TabRefsPayloadV1;
        if (parsed.version === 1) {
          const v1 = parsed as TabRefsPayloadV1;
          const sectionRefs: Record<string, string> = {};
          for (const [stableId, entry] of Object.entries(v1.sections)) {
            sectionRefs[stableId] = entry.currentName;
          }
          return { version: 3, sectionRefs, trackRefs: [] };
        }
        if (parsed.version === 2) {
          const v2 = parsed as TabRefsPayloadV2;
          return {
            version: 3,
            sectionRefs: v2.sectionRefs,
            trackRefs: v2.trackRefs,
          };
        }
        if (parsed.version === 3) return parsed as TabRefsPayload;
        return null;
      } catch {
        return null;
      }
    },

    async write(filePath, payload) {
      try {
        const sources = payload.sources ?? [];
        const attachedTo = payload.attachedTo ?? [];
        const cleaned: TabRefsPayload = {
          version: 3,
          sectionRefs: payload.sectionRefs,
          trackRefs: payload.trackRefs,
        };
        if (sources.length > 0) cleaned.sources = sources;
        if (attachedTo.length > 0) cleaned.attachedTo = attachedTo;
        const json = JSON.stringify(cleaned, null, 2);
        await writeTextFile(rootHandle, sidecarPath(filePath), json);
      } catch (e) {
        throw classifyError(e);
      }
    },
  };
}

function sidecarPath(alphatexPath: string): string {
  return alphatexPath + SIDECAR_SUFFIX;
}
```

- [ ] **Step 5.4: Re-run tests — should pass**

```bash
npm run test:run -- src/app/knowledge_base/infrastructure/tabRefsRepo.test.ts
```
Expected: PASS (existing + 4 new).

- [ ] **Step 5.5: Audit other callsites of `emptyTabRefs()` / `TabRefsPayload`**

```bash
grep -rn "emptyTabRefs\|TabRefsPayload" "src/app/knowledge_base" | grep -v ".test."
```
Update any constructor that hard-coded `version: 2`. Most consumers should already use `emptyTabRefs()`.

- [ ] **Step 5.6: Run full tab test suite**

```bash
npm run test:run -- src/app/knowledge_base/features/tab src/app/knowledge_base/infrastructure/tabRefsRepo.test.ts
```
Expected: green.

- [ ] **Step 5.7: Commit**

```bash
git add src/app/knowledge_base/infrastructure/tabRefsRepo.ts \
        src/app/knowledge_base/infrastructure/tabRefsRepo.test.ts
git commit -m "feat(tabRefs): v2→v3 read migration + v3 emit with sources"
```

---

## Task 6: Register `svgRefs` in `RepositoryContext`

**Files:**
- Modify: `src/app/knowledge_base/shell/RepositoryContext.tsx`
- Modify: `src/app/knowledge_base/shell/RepositoryContext.test.tsx`

- [ ] **Step 6.1: Write failing test**

Add to `RepositoryContext.test.tsx`:

```ts
it("RepositoryProvider exposes svgRefs when a rootHandle is mounted", () => {
  const { result } = renderHook(() => useRepositories(), {
    wrapper: ({ children }) => (
      <RepositoryProvider rootHandle={makeMockRoot()}>
        {children}
      </RepositoryProvider>
    ),
  });
  expect(result.current.svgRefs).not.toBeNull();
  expect(typeof result.current.svgRefs!.read).toBe("function");
});

it("RepositoryProvider sets svgRefs = null when no rootHandle is mounted", () => {
  const { result } = renderHook(() => useRepositories(), {
    wrapper: ({ children }) => (
      <RepositoryProvider rootHandle={null}>{children}</RepositoryProvider>
    ),
  });
  expect(result.current.svgRefs).toBeNull();
});
```

(Use the same `makeMockRoot` helper already imported by the surrounding tests — match the style of the existing `tabRefs` cases.)

- [ ] **Step 6.2: Run test — should fail (svgRefs not on type)**

```bash
npm run test:run -- src/app/knowledge_base/shell/RepositoryContext.test.tsx
```
Expected: FAIL — `Property 'svgRefs' does not exist`.

- [ ] **Step 6.3: Update `RepositoryContext.tsx`**

In imports:
```ts
import type { SvgRefsRepository } from "../domain/svgRefs";
import { createSvgRefsRepository } from "../infrastructure/svgRefsRepo";
```

In `interface Repositories`, add:
```ts
  svgRefs: SvgRefsRepository | null;
```

In `EMPTY_REPOS`, add:
```ts
  svgRefs: null,
```

In the `useMemo` `if (!rootHandle)` branch, you already return `EMPTY_REPOS`. In the populated branch, add:
```ts
      svgRefs: createSvgRefsRepository(rootHandle),
```

- [ ] **Step 6.4: Re-run test**

```bash
npm run test:run -- src/app/knowledge_base/shell/RepositoryContext.test.tsx
```
Expected: PASS.

- [ ] **Step 6.5: Commit**

```bash
git add src/app/knowledge_base/shell/RepositoryContext.tsx \
        src/app/knowledge_base/shell/RepositoryContext.test.tsx
git commit -m "feat(repos): register svgRefs in RepositoryContext"
```

---

## Task 7: `useSvgMeta` hook

**Files:**
- Create: `src/app/knowledge_base/features/svgEditor/hooks/useSvgMeta.ts`
- Create: `src/app/knowledge_base/features/svgEditor/hooks/useSvgMeta.test.tsx`

- [ ] **Step 7.1: Write failing tests**

```tsx
// useSvgMeta.test.tsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { StubRepositoryProvider } from "../../../shell/RepositoryContext";
import { useSvgMeta } from "./useSvgMeta";
import type { SvgRefsPayload, SvgRefsRepository } from "../../../domain/svgRefs";

function stubSvgRefs(): SvgRefsRepository & { _store: Map<string, SvgRefsPayload> } {
  const store = new Map<string, SvgRefsPayload>();
  return {
    _store: store,
    async read(p) { return store.get(p) ?? null; },
    async write(p, payload) {
      const sources = payload.sources ?? [];
      const attached = payload.attachedTo ?? [];
      if (sources.length === 0 && attached.length === 0) {
        store.delete(p);
        return;
      }
      store.set(p, { ...payload });
    },
  };
}

function wrapper(repo: SvgRefsRepository) {
  return ({ children }: { children: React.ReactNode }) => (
    <StubRepositoryProvider value={{
      attachment: null, attachmentLinks: null, diagram: null,
      document: null, linkIndex: null, svg: null, tab: null,
      tabRefs: null, vaultConfig: null, svgRefs: repo,
    }}>
      {children}
    </StubRepositoryProvider>
  );
}

describe("useSvgMeta", () => {
  beforeEach(() => { vi.useFakeTimers(); });

  it("loads sources from sidecar on mount", async () => {
    const repo = stubSvgRefs();
    repo._store.set("a.svg", {
      version: 1,
      sources: [{ url: "https://x.test" }],
    });
    const { result } = renderHook(() => useSvgMeta("a.svg"), { wrapper: wrapper(repo) });
    await waitFor(() => expect(result.current.sources).toHaveLength(1));
    expect(result.current.sources[0].url).toBe("https://x.test");
    expect(result.current.isDirty).toBe(false);
  });

  it("setSources flips isDirty true; debounced write resets it", async () => {
    const repo = stubSvgRefs();
    const { result } = renderHook(() => useSvgMeta("a.svg"), { wrapper: wrapper(repo) });
    await waitFor(() => expect(result.current.isDirty).toBe(false));
    act(() => result.current.setSources([{ url: "https://y.test" }]));
    expect(result.current.isDirty).toBe(true);
    await act(async () => { vi.advanceTimersByTime(250); });
    await waitFor(() => expect(result.current.isDirty).toBe(false));
    expect(repo._store.get("a.svg")?.sources).toEqual([{ url: "https://y.test" }]);
  });

  it("setSources([]) deletes sidecar via repo.write", async () => {
    const repo = stubSvgRefs();
    repo._store.set("a.svg", { version: 1, sources: [{ url: "https://x.test" }] });
    const { result } = renderHook(() => useSvgMeta("a.svg"), { wrapper: wrapper(repo) });
    await waitFor(() => expect(result.current.sources).toHaveLength(1));
    act(() => result.current.setSources([]));
    await act(async () => { vi.advanceTimersByTime(250); });
    await waitFor(() => expect(repo._store.has("a.svg")).toBe(false));
  });

  it("filePath=null leaves sources empty and isDirty false", async () => {
    const repo = stubSvgRefs();
    const { result } = renderHook(() => useSvgMeta(null), { wrapper: wrapper(repo) });
    await waitFor(() => expect(result.current.sources).toEqual([]));
    expect(result.current.isDirty).toBe(false);
  });
});
```

- [ ] **Step 7.2: Run tests — should fail (module missing)**

```bash
npm run test:run -- src/app/knowledge_base/features/svgEditor/hooks/useSvgMeta.test.tsx
```
Expected: FAIL — `Cannot find module './useSvgMeta'`.

- [ ] **Step 7.3: Implement**

```ts
// src/app/knowledge_base/features/svgEditor/hooks/useSvgMeta.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRepositories } from "../../../shell/RepositoryContext";
import { useShellErrors } from "../../../shell/ShellErrorContext";
import type { SourceLink } from "../../../shared/types/sources";

const AUTOSAVE_DEBOUNCE_MS = 200;

export function useSvgMeta(filePath: string | null): {
  sources: SourceLink[];
  setSources: (next: SourceLink[]) => void;
  isDirty: boolean;
} {
  const { svgRefs: repo } = useRepositories();
  const { reportError } = useShellErrors();
  const [sources, setSourcesState] = useState<SourceLink[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repoRef = useRef(repo);
  repoRef.current = repo;
  const reportErrorRef = useRef(reportError);
  reportErrorRef.current = reportError;
  const filePathRef = useRef(filePath);
  filePathRef.current = filePath;

  // Load on file change.
  useEffect(() => {
    if (!filePath) {
      setSourcesState([]);
      setIsDirty(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const payload = await repoRef.current?.read(filePath);
        if (cancelled) return;
        setSourcesState(payload?.sources ?? []);
        setIsDirty(false);
      } catch (e) {
        if (cancelled) return;
        reportErrorRef.current(e, `Loading metadata for ${filePath}`);
      }
    })();
    return () => { cancelled = true; };
  }, [filePath]);

  const flush = useCallback(async (path: string, next: SourceLink[]) => {
    const repo = repoRef.current;
    if (!repo) return;
    try {
      await repo.write(path, { version: 1, sources: next });
      if (filePathRef.current === path) setIsDirty(false);
    } catch (e) {
      reportErrorRef.current(e, `Saving metadata for ${path}`);
    }
  }, []);

  const setSources = useCallback((next: SourceLink[]) => {
    setSourcesState(next);
    setIsDirty(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const path = filePathRef.current;
    if (!path) return;
    debounceRef.current = setTimeout(() => { flush(path, next); }, AUTOSAVE_DEBOUNCE_MS);
  }, [flush]);

  // Cleanup pending debounce on unmount.
  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  return { sources, setSources, isDirty };
}
```

- [ ] **Step 7.4: Re-run tests — should pass**

```bash
npm run test:run -- src/app/knowledge_base/features/svgEditor/hooks/useSvgMeta.test.tsx
```
Expected: PASS (4/4).

- [ ] **Step 7.5: Commit**

```bash
git add src/app/knowledge_base/features/svgEditor/hooks/useSvgMeta.ts \
        src/app/knowledge_base/features/svgEditor/hooks/useSvgMeta.test.tsx
git commit -m "feat(svgMeta): useSvgMeta hook for file-level sources"
```

---

## Task 8: `useTabSources` hook with merge guard

**Files:**
- Create: `src/app/knowledge_base/features/tab/hooks/useTabSources.ts`
- Create: `src/app/knowledge_base/features/tab/hooks/useTabSources.test.tsx`

The merge guard is the key correctness property: this hook *only* owns the `sources` field of `TabRefsPayload`. It must not clobber `sectionRefs` / `trackRefs` written through the same sidecar by `useTabEngine`. The fix is read-modify-write inside the debounced write, not snapshot-on-read.

- [ ] **Step 8.1: Write failing tests**

```tsx
// useTabSources.test.tsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { StubRepositoryProvider } from "../../../shell/RepositoryContext";
import { useTabSources } from "./useTabSources";
import type { TabRefsPayload, TabRefsRepository } from "../../../domain/tabRefs";

function stubTabRefs(): TabRefsRepository & { _store: Map<string, TabRefsPayload> } {
  const store = new Map<string, TabRefsPayload>();
  return {
    _store: store,
    async read(p) { return store.get(p) ?? null; },
    async write(p, payload) { store.set(p, { ...payload }); },
  };
}

function wrapper(repo: TabRefsRepository) {
  return ({ children }: { children: React.ReactNode }) => (
    <StubRepositoryProvider value={{
      attachment: null, attachmentLinks: null, diagram: null,
      document: null, linkIndex: null, svg: null, tab: null,
      tabRefs: repo, vaultConfig: null, svgRefs: null,
    }}>{children}</StubRepositoryProvider>
  );
}

describe("useTabSources", () => {
  beforeEach(() => { vi.useFakeTimers(); });

  it("loads existing sources from sidecar", async () => {
    const repo = stubTabRefs();
    repo._store.set("a.alphatex", {
      version: 3, sectionRefs: {}, trackRefs: [],
      sources: [{ url: "https://x.test" }],
    });
    const { result } = renderHook(() => useTabSources("a.alphatex"), {
      wrapper: wrapper(repo),
    });
    await waitFor(() => expect(result.current.sources).toHaveLength(1));
  });

  it("write preserves sectionRefs and trackRefs (merge guard)", async () => {
    const repo = stubTabRefs();
    repo._store.set("a.alphatex", {
      version: 3,
      sectionRefs: { "sec-1": "Verse" },
      trackRefs: [{ id: "trk-1", name: "Lead" }],
    });
    const { result } = renderHook(() => useTabSources("a.alphatex"), {
      wrapper: wrapper(repo),
    });
    await waitFor(() => expect(result.current.sources).toEqual([]));
    act(() => result.current.setSources([{ url: "https://x.test" }]));
    await act(async () => { vi.advanceTimersByTime(250); });
    const after = repo._store.get("a.alphatex")!;
    expect(after.sectionRefs).toEqual({ "sec-1": "Verse" });
    expect(after.trackRefs).toEqual([{ id: "trk-1", name: "Lead" }]);
    expect(after.sources).toEqual([{ url: "https://x.test" }]);
  });

  it("write merges with current sidecar — no race with concurrent track rename", async () => {
    const repo = stubTabRefs();
    repo._store.set("a.alphatex", {
      version: 3, sectionRefs: {}, trackRefs: [{ id: "trk-1", name: "Lead" }],
    });
    const { result } = renderHook(() => useTabSources("a.alphatex"), {
      wrapper: wrapper(repo),
    });
    await waitFor(() => expect(result.current.sources).toEqual([]));
    act(() => result.current.setSources([{ url: "https://x.test" }]));
    // Simulate a track rename writing through the sidecar mid-debounce.
    await act(async () => {
      repo._store.set("a.alphatex", {
        version: 3, sectionRefs: {},
        trackRefs: [{ id: "trk-1", name: "Renamed Lead" }],
      });
      vi.advanceTimersByTime(250);
    });
    const after = repo._store.get("a.alphatex")!;
    expect(after.trackRefs).toEqual([{ id: "trk-1", name: "Renamed Lead" }]);
    expect(after.sources).toEqual([{ url: "https://x.test" }]);
  });

  it("setSources([]) removes sources but keeps the rest of the sidecar", async () => {
    const repo = stubTabRefs();
    repo._store.set("a.alphatex", {
      version: 3, sectionRefs: { "sec-1": "Verse" }, trackRefs: [],
      sources: [{ url: "https://x.test" }],
    });
    const { result } = renderHook(() => useTabSources("a.alphatex"), {
      wrapper: wrapper(repo),
    });
    await waitFor(() => expect(result.current.sources).toHaveLength(1));
    act(() => result.current.setSources([]));
    await act(async () => { vi.advanceTimersByTime(250); });
    const after = repo._store.get("a.alphatex")!;
    expect(after.sources ?? []).toEqual([]);
    expect(after.sectionRefs).toEqual({ "sec-1": "Verse" });
  });
});
```

- [ ] **Step 8.2: Run tests — should fail (module missing)**

```bash
npm run test:run -- src/app/knowledge_base/features/tab/hooks/useTabSources.test.tsx
```
Expected: FAIL — `Cannot find module './useTabSources'`.

- [ ] **Step 8.3: Implement**

```ts
// src/app/knowledge_base/features/tab/hooks/useTabSources.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRepositories } from "../../../shell/RepositoryContext";
import { useShellErrors } from "../../../shell/ShellErrorContext";
import type { SourceLink } from "../../../shared/types/sources";
import { emptyTabRefs } from "../../../domain/tabRefs";

const AUTOSAVE_DEBOUNCE_MS = 200;

export function useTabSources(filePath: string | null): {
  sources: SourceLink[];
  setSources: (next: SourceLink[]) => void;
  isDirty: boolean;
} {
  const { tabRefs: repo } = useRepositories();
  const { reportError } = useShellErrors();
  const [sources, setSourcesState] = useState<SourceLink[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repoRef = useRef(repo);
  repoRef.current = repo;
  const reportErrorRef = useRef(reportError);
  reportErrorRef.current = reportError;
  const filePathRef = useRef(filePath);
  filePathRef.current = filePath;

  useEffect(() => {
    if (!filePath) {
      setSourcesState([]);
      setIsDirty(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const payload = await repoRef.current?.read(filePath);
        if (cancelled) return;
        setSourcesState(payload?.sources ?? []);
        setIsDirty(false);
      } catch (e) {
        if (cancelled) return;
        reportErrorRef.current(e, `Loading metadata for ${filePath}`);
      }
    })();
    return () => { cancelled = true; };
  }, [filePath]);

  // Read-modify-write so we don't clobber sectionRefs / trackRefs.
  const flush = useCallback(async (path: string, next: SourceLink[]) => {
    const repo = repoRef.current;
    if (!repo) return;
    try {
      const current = (await repo.read(path)) ?? emptyTabRefs();
      const merged = { ...current, sources: next };
      await repo.write(path, merged);
      if (filePathRef.current === path) setIsDirty(false);
    } catch (e) {
      reportErrorRef.current(e, `Saving metadata for ${path}`);
    }
  }, []);

  const setSources = useCallback((next: SourceLink[]) => {
    setSourcesState(next);
    setIsDirty(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const path = filePathRef.current;
    if (!path) return;
    debounceRef.current = setTimeout(() => { flush(path, next); }, AUTOSAVE_DEBOUNCE_MS);
  }, [flush]);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  return { sources, setSources, isDirty };
}
```

- [ ] **Step 8.4: Re-run tests — should pass**

```bash
npm run test:run -- src/app/knowledge_base/features/tab/hooks/useTabSources.test.tsx
```
Expected: PASS (4/4).

- [ ] **Step 8.5: Commit**

```bash
git add src/app/knowledge_base/features/tab/hooks/useTabSources.ts \
        src/app/knowledge_base/features/tab/hooks/useTabSources.test.tsx
git commit -m "feat(tabSources): useTabSources hook with merge-guarded write"
```

---

## Task 9: `SvgProperties` aside

**Files:**
- Create: `src/app/knowledge_base/features/svgEditor/properties/SvgProperties.tsx`
- Create: `src/app/knowledge_base/features/svgEditor/properties/SvgProperties.test.tsx`

- [ ] **Step 9.1: Write failing test**

```tsx
// SvgProperties.test.tsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StubRepositoryProvider } from "../../../shell/RepositoryContext";
import { ShellErrorProvider } from "../../../shell/ShellErrorContext";
import { SvgProperties } from "./SvgProperties";
import type { SvgRefsPayload, SvgRefsRepository } from "../../../domain/svgRefs";

function stubSvgRefs() {
  const store = new Map<string, SvgRefsPayload>();
  const repo: SvgRefsRepository = {
    async read(p) { return store.get(p) ?? null; },
    async write(p, payload) {
      const sources = payload.sources ?? [];
      const attached = payload.attachedTo ?? [];
      if (sources.length === 0 && attached.length === 0) {
        store.delete(p); return;
      }
      store.set(p, { ...payload });
    },
  };
  return { repo, store };
}

function renderProps(filePath: string | null, repo: SvgRefsRepository, readOnly = false) {
  return render(
    <ShellErrorProvider>
      <StubRepositoryProvider value={{
        attachment: null, attachmentLinks: null, diagram: null,
        document: null, linkIndex: null, svg: null, tab: null,
        tabRefs: null, vaultConfig: null, svgRefs: repo,
      }}>
        <SvgProperties filePath={filePath} collapsed={false} onToggleCollapse={() => {}} readOnly={readOnly} />
      </StubRepositoryProvider>
    </ShellErrorProvider>,
  );
}

describe("SvgProperties", () => {
  beforeEach(() => { vi.useFakeTimers(); });

  it("renders the SourcesSection when expanded with a file", async () => {
    const { repo } = stubSvgRefs();
    renderProps("a.svg", repo);
    expect(await screen.findByText(/no sources recorded/i)).toBeInTheDocument();
  });

  it("hides edit affordances when readOnly", async () => {
    const { repo } = stubSvgRefs();
    renderProps("a.svg", repo, true);
    expect(await screen.findByText(/no sources recorded/i)).toBeInTheDocument();
    expect(screen.queryByTestId("sources-add")).toBeNull();
  });

  it("collapsed root has the collapsed marker", () => {
    const { repo } = stubSvgRefs();
    render(
      <ShellErrorProvider>
        <StubRepositoryProvider value={{
          attachment: null, attachmentLinks: null, diagram: null,
          document: null, linkIndex: null, svg: null, tab: null,
          tabRefs: null, vaultConfig: null, svgRefs: repo,
        }}>
          <SvgProperties filePath="a.svg" collapsed={true} onToggleCollapse={() => {}} />
        </StubRepositoryProvider>
      </ShellErrorProvider>,
    );
    expect(screen.getByTestId("svg-properties").getAttribute("data-collapsed")).toBe("true");
  });
});
```

- [ ] **Step 9.2: Run test — should fail**

```bash
npm run test:run -- src/app/knowledge_base/features/svgEditor/properties/SvgProperties.test.tsx
```
Expected: FAIL — `Cannot find module './SvgProperties'`.

- [ ] **Step 9.3: Implement**

```tsx
// src/app/knowledge_base/features/svgEditor/properties/SvgProperties.tsx
"use client";

import type { ReactElement } from "react";
import { SourcesSection } from "../../../shared/components/SourcesSection";
import { useSvgMeta } from "../hooks/useSvgMeta";

export interface SvgPropertiesProps {
  filePath: string | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
  readOnly?: boolean;
}

export function SvgProperties({
  filePath,
  collapsed,
  onToggleCollapse,
  readOnly = false,
}: SvgPropertiesProps): ReactElement {
  const { sources, setSources } = useSvgMeta(filePath);
  const widthClass = collapsed ? "w-9" : "w-72";
  return (
    <aside
      data-testid="svg-properties"
      data-collapsed={collapsed ? "true" : "false"}
      className={`flex h-full flex-col border-l border-line bg-surface text-sm transition-[width] duration-200 ${widthClass}`}
    >
      <div className="flex items-center justify-between border-b border-line px-2 py-1">
        {!collapsed && <span className="text-xs font-medium text-mute">Properties</span>}
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expand properties" : "Collapse properties"}
          className="rounded px-1 hover:bg-line/20"
        >
          {collapsed ? "›" : "‹"}
        </button>
      </div>
      {!collapsed && (
        <div className="flex-1 overflow-auto px-3 py-2 space-y-4">
          <section>
            <h3 className="mb-2 text-xs font-medium text-mute">Sources</h3>
            <SourcesSection sources={sources} onChange={setSources} readOnly={readOnly} />
          </section>
        </div>
      )}
    </aside>
  );
}
```

- [ ] **Step 9.4: Re-run test — should pass**

```bash
npm run test:run -- src/app/knowledge_base/features/svgEditor/properties/SvgProperties.test.tsx
```
Expected: PASS (3/3).

- [ ] **Step 9.5: Commit**

```bash
git add src/app/knowledge_base/features/svgEditor/properties/SvgProperties.tsx \
        src/app/knowledge_base/features/svgEditor/properties/SvgProperties.test.tsx
git commit -m "feat(svgProperties): SvgProperties aside hosting SourcesSection"
```

---

## Task 10: Wire `SvgProperties` into `SVGEditorView`

**Files:**
- Modify: `src/app/knowledge_base/features/svgEditor/SVGEditorView.tsx`
- Modify: `src/app/knowledge_base/features/svgEditor/SVGEditorView.test.tsx`

The current layout is `PaneHeader` → `SVGToolbar` → `SVGCanvas` stacked in a column. Wrap the bottom two in a flex row so `SvgProperties` becomes a right-hand column. Toolbar position decision: keep the toolbar at top of the canvas column (i.e. row contains `<column with toolbar+canvas>` and `<aside>`).

- [ ] **Step 10.1: Add a failing test**

In `SVGEditorView.test.tsx`, add:

```tsx
it("renders the SvgProperties aside when activeFile is set", () => {
  // (whatever existing harness wraps SVGEditorView in this test file —
  // mirror the existing test setup to mount with a stub repo bag that
  // includes svgRefs.)
  // ...render call with activeFile="a.svg"...
  expect(screen.getByTestId("svg-properties")).toBeInTheDocument();
});
```

If the existing test file doesn't currently mount RepositoryContext, mirror the pattern from `useSvgMeta.test.tsx` — wrap in `StubRepositoryProvider` and `ShellErrorProvider`.

- [ ] **Step 10.2: Run — should fail**

```bash
npm run test:run -- src/app/knowledge_base/features/svgEditor/SVGEditorView.test.tsx
```

- [ ] **Step 10.3: Wire the aside in `SVGEditorView.tsx`**

Add to imports:
```ts
import { SvgProperties } from "./properties/SvgProperties";
import { useState } from "react";
```

Add component-local state inside `SVGEditorView`:
```tsx
const [propsCollapsed, setPropsCollapsed] = useState(false);
```

Replace the body return so it becomes:

```tsx
return (
  <div className="flex flex-col h-full min-h-0 flex-1">
    <PaneHeader /* …existing props… */ />
    <div className="flex flex-1 min-h-0">
      <div className="flex flex-col flex-1 min-w-0">
        <SVGToolbar /* …existing props… */ />
        <SVGCanvas /* …existing props… */ />
      </div>
      <SvgProperties
        filePath={activeFile}
        collapsed={propsCollapsed}
        onToggleCollapse={() => setPropsCollapsed((c) => !c)}
        readOnly={isReadOnly}
      />
    </div>
  </div>
);
```

- [ ] **Step 10.4: Re-run test — should pass**

```bash
npm run test:run -- src/app/knowledge_base/features/svgEditor/SVGEditorView.test.tsx
```

- [ ] **Step 10.5: Smoke the wider SVG suite**

```bash
npm run test:run -- src/app/knowledge_base/features/svgEditor
```
Expected: green (existing canvas + persistence tests still pass).

- [ ] **Step 10.6: Commit**

```bash
git add src/app/knowledge_base/features/svgEditor/SVGEditorView.tsx \
        src/app/knowledge_base/features/svgEditor/SVGEditorView.test.tsx
git commit -m "feat(svgEditor): mount SvgProperties aside next to canvas"
```

---

## Task 11: Wire `SourcesSection` into `TabProperties`

**Files:**
- Modify: `src/app/knowledge_base/features/tab/properties/TabProperties.tsx`
- Modify: `src/app/knowledge_base/features/tab/properties/TabProperties.test.tsx`

Place the new section adjacent to `FileReferences` (file-scope metadata sits together).

- [ ] **Step 11.1: Add a failing test**

```tsx
// TabProperties.test.tsx — new case
it("renders SourcesSection at file scope", async () => {
  // Use the existing render helper; ensure repo bag includes a tabRefs stub
  // pre-seeded with a sources entry.
  // ...
  expect(await screen.findByText(/sources/i)).toBeInTheDocument();
  expect(await screen.findByText(/example\.com/i)).toBeInTheDocument();
});
```

If the existing test file uses a different render-helper pattern (e.g. mounts `TabProperties` via a fixture builder), mirror that pattern — include `StubRepositoryProvider` with a tabRefs stub seeded with `{ sources: [{ url: "https://example.com" }] }`.

- [ ] **Step 11.2: Run — should fail**

```bash
npm run test:run -- src/app/knowledge_base/features/tab/properties/TabProperties.test.tsx
```

- [ ] **Step 11.3: Wire the section in `TabProperties.tsx`**

Add imports:
```ts
import { SourcesSection } from "../../../shared/components/SourcesSection";
import { useTabSources } from "../hooks/useTabSources";
```

Inside `TabProperties` body, add:
```tsx
const { sources, setSources } = useTabSources(filePath ?? null);
```

In the JSX body — the existing `{filePath && (<FileReferences …/>)}` block — wrap a sibling section just after it:

```tsx
{filePath && (
  <section data-testid="tab-sources-section">
    <h3 className="mb-2 text-xs font-medium text-mute">Sources</h3>
    <SourcesSection sources={sources} onChange={setSources} readOnly={readOnly} />
  </section>
)}
```

- [ ] **Step 11.4: Re-run test — should pass**

```bash
npm run test:run -- src/app/knowledge_base/features/tab/properties/TabProperties.test.tsx
```

- [ ] **Step 11.5: Smoke the tab suite**

```bash
npm run test:run -- src/app/knowledge_base/features/tab
```

- [ ] **Step 11.6: Commit**

```bash
git add src/app/knowledge_base/features/tab/properties/TabProperties.tsx \
        src/app/knowledge_base/features/tab/properties/TabProperties.test.tsx
git commit -m "feat(tabProperties): mount SourcesSection at file scope"
```

---

## Task 12: Test cases + Features.md

**Files:**
- Modify: `Features.md`
- Modify: `test-cases/04-svg-editor.md` (or current SVG file — locate via `ls test-cases/`)
- Modify: `test-cases/11-tabs.md`

- [ ] **Step 12.1: Locate the SVG test-cases file**

```bash
ls test-cases/
```
The svgEditor entries live in whichever file the existing SVG cases inhabit. Open it and find the next free numeric suffix in the source-links / metadata section (or create a new `## Sources` subsection if none exists).

- [ ] **Step 12.2: Add SVG cases (next free IDs in the SVG file)**

Add one of these lines per case under the existing structure:

```markdown
- ❌ SVG-?-NN: User adds a source link → reopen file → source persisted via `<file>.svg.refs.json`.
- ❌ SVG-?-NN: User clears all sources → sidecar deleted from disk.
- ❌ SVG-?-NN: Invalid URL shows error and is not committed.
- ❌ SVG-?-NN: Read-only mode hides Add / Remove affordances.
```

- [ ] **Step 12.3: Add Tab cases under §11.x in `test-cases/11-tabs.md`**

Append at next free IDs:

```markdown
- ❌ TAB-?-NN: User adds a source link to a tab → sidecar v3 round-trips with sectionRefs preserved.
- ❌ TAB-?-NN: v2 sidecar on disk reads as v3 in memory; first save upgrades it.
- ❌ TAB-?-NN: Sources update during a concurrent track rename does not lose either change (merge guard).
```

- [ ] **Step 12.4: Update `Features.md`**

Under the SVG section, add:
```markdown
- ✅ Source links per SVG file — file-level `sources: SourceLink[]` persisted in `<file>.svg.refs.json` sidecar (lazy-created). `src/app/knowledge_base/features/svgEditor/properties/SvgProperties.tsx`
```

Under the Guitar Tabs section, add:
```markdown
- ✅ Source links per tab file — file-level `sources` persisted in the existing `.alphatex.refs.json` sidecar (v3). `src/app/knowledge_base/features/tab/hooks/useTabSources.ts`
```

- [ ] **Step 12.5: Commit**

```bash
git add Features.md test-cases/
git commit -m "docs(tests+features): MVP-4b SVG/Tab source-link cases"
```

---

## Task 13: Final verification + open PR

- [ ] **Step 13.1: Full typecheck**

```bash
npm run typecheck
```
Expected: clean.

- [ ] **Step 13.2: Full lint**

```bash
npm run lint
```
Expected: 0 errors.

- [ ] **Step 13.3: Full unit suite**

```bash
npm run test:run
```
Expected: green; case count grows by the cases added in Tasks 1, 3, 5, 6, 7, 8, 9, 10, 11.

- [ ] **Step 13.4: Build**

```bash
npm run build
```
Expected: clean. Pre-existing unrelated build issues are out of scope; flag any new failures.

- [ ] **Step 13.5: Update handoff doc**

In `docs/fragmentary-handoffs/2026-05-05-diagram-flow-enhancements.md` (the canonical handoff for the broader feature):
- Mark MVP-4b "Closed" under the deferred-items table.
- Move the SVG/Tab metadata-persistence row from "Deferred" to "Closed by MVP-4b".
- Note that **MVP-2 SVG/Tab attachments** stays deferred but no longer needs a separate brainstorm — the schema for `attachedTo` is already in place from this MVP.

- [ ] **Step 13.6: Sync skill snapshot if any skill files changed**

This MVP doesn't touch the skill, so this is usually a no-op. Sanity check:
```bash
diff -rq ~/.claude/skills/knowledge-base "skills/knowledge-base"
```
Expected: empty (modulo `__pycache__/`, `.pytest_cache/`).

- [ ] **Step 13.7: Push and open PR**

```bash
git push -u origin feat/diagram-mvp4b-svg-tab-metadata
gh pr create --title "feat(svg+tab): MVP-4b — file-level source links via sidecar" --body "$(cat <<'EOF'
## Summary
- Tab sidecar bumps v2 → v3 with optional `sources` and reserved `attachedTo`.
- New `<file>.svg.refs.json` sidecar (lazy creation, delete-when-empty).
- `useTabSources` and `useSvgMeta` hooks own only the sources slice; tab hook is merge-guarded so it cannot clobber sectionRefs/trackRefs.
- New `SvgProperties` aside hosts `<SourcesSection>`; `TabProperties` gains a sources section at file scope.

Closes the MVP-4b precondition called out in `docs/superpowers/handoffs/2026-05-05-diagram-flow-enhancements.md`. `attachedTo` is forward-compat-only — MVP-2 SVG/Tab attachments will pick it up later without another migration.

Spec: `docs/superpowers/specs/2026-05-07-svg-tab-metadata-persistence-design.md`
Plan: `docs/superpowers/plans/2026-05-07-svg-tab-metadata-persistence-mvp4b-plan.md`

## Test plan
- [ ] Unit: typecheck, lint, full vitest suite green.
- [ ] Manual: open a `.svg` file, add a source, reopen — source persists via `<file>.svg.refs.json`.
- [ ] Manual: clear all sources on the SVG — sidecar deleted from disk.
- [ ] Manual: open a `.alphatex` file, add a source, rename a track in the same session, reopen — both persisted.
- [ ] Manual: read-only mode hides Add / Remove on both editors.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 13.8: Update tasklist + done**

Mark all tasks complete; the next session continues from PR review or follow-up.

---

## Self-review checklist (do before finalising the plan)

The author of the plan ran this once. Re-run if you make edits.

- **Spec coverage:**
  - §3.1 v3 Tab schema → Task 4, Task 5.
  - §3.2 SVG sidecar → Task 2, Task 3.
  - §3.3 shared `AttachedToEntry` → Task 1.
  - §3.4 `useTabSources` / `useSvgMeta` → Task 7, Task 8.
  - §3.5 SVG aside / Tab section → Task 9, Task 10, Task 11.
  - §3.6 Repo registration → Task 6.
  - §6 tests → Tasks 3, 5, 7, 8, 9, 10, 11 each include their slice.
  - §7 test-cases / Features.md → Task 12.
- **Placeholder scan:** none — every code step has the actual code.
- **Type consistency:** `useSvgMeta` / `useTabSources` return shape `{ sources, setSources, isDirty }` is consistent across spec, hook code, and tests. `SvgRefsPayload.version` is `1`; `TabRefsPayload.version` is `3`. `AttachedToEntry.documentPath` consistent across spec + Task 1.
- **Forward-compat scope:** `attachedTo` accepted by both schemas, round-tripped by both repos, never wired by hooks or UI — confirmed in Tasks 3, 5 only.
