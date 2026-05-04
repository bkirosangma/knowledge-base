# DocumentMeta Persistence Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move DocumentMeta persistence out of per-diagram JSON into a workspace-scoped flat-relations store at `<vault>/.kb/attachment-links.json`, with lazy migration on first diagram load. Implement the cross-entity orphan attachment cleanup that this refactor unblocks (in-flight diagram delete, tab `remove-track`, file-tree delete of `.alphatex` and `.kbjson`).

**Architecture:** Domain types + pure helpers in `domain/attachmentLinks.ts`. FSA-backed repo in `infrastructure/attachmentLinksRepo.ts` (registered in `RepositoryContext`). Hook `useDocuments` rebuilt around `rows: AttachmentLink[]` with a memoized `documents: DocumentMeta[]` projection for back-compat. Lazy migration step in `useFileActions`. Diagram history snapshot reduced to diagram-scope subset. Cleanup primitive `detachAttachmentsFor(matcher)` wired into `useDeletion`, `TabView.handleRemoveTrack`, `handleDeleteFileWithLinks`.

**Tech Stack:** TypeScript, React, Vitest, File System Access API.

**Spec:** `docs/superpowers/specs/2026-05-04-document-meta-persistence-design.md`

**Branch:** `plan/document-meta-persistence`

---

## File Structure

**Create:**
- `src/app/knowledge_base/domain/attachmentLinks.ts` — types + pure helpers
- `src/app/knowledge_base/domain/attachmentLinks.test.ts` — domain tests
- `src/app/knowledge_base/infrastructure/attachmentLinksRepo.ts` — FSA repo
- `src/app/knowledge_base/infrastructure/attachmentLinksRepo.test.ts` — repo tests
- `src/app/knowledge_base/features/diagram/utils/diagramEntityIds.ts` — pure helper
- `src/app/knowledge_base/features/diagram/utils/diagramEntityIds.test.ts` — helper tests

**Modify:**
- `src/app/knowledge_base/domain/repositories.ts` — add `AttachmentLinksRepository` interface
- `src/app/knowledge_base/shell/RepositoryContext.tsx` — register `attachmentLinks` slot
- `src/app/knowledge_base/features/document/hooks/useDocuments.ts` — rebuild around rows + projection + batch + cleanup primitive + persistence
- `src/app/knowledge_base/features/document/hooks/useDocuments.test.ts` — extend tests
- `src/app/knowledge_base/shared/hooks/useFileActions.ts` — lazy migration step + drop `onLoadDocuments` calls + drop `documents` parameter
- `src/app/knowledge_base/shared/hooks/useFileActions.test.ts` — add migration coverage
- `src/app/knowledge_base/features/diagram/hooks/useDiagramHistoryStore.ts` — subset snapshot
- `src/app/knowledge_base/features/diagram/hooks/useDiagramController.ts` — drop `onLoadDocuments` prop, drop `handleDeleteFlow:321` wrapper, thread attachments into `useDeletion`
- `src/app/knowledge_base/features/diagram/DiagramView.tsx` — drop `onLoadDocuments` prop
- `src/app/knowledge_base/features/diagram/hooks/useDeletion.ts` — accept attachments + integrate cleanup
- `src/app/knowledge_base/features/diagram/hooks/useDeletion.test.ts` — add cleanup coverage (create if absent)
- `src/app/knowledge_base/features/tab/TabView.tsx` — `handleRemoveTrack` cleanup
- `src/app/knowledge_base/features/tab/TabView.test.tsx` — add remove-track cleanup case
- `src/app/knowledge_base/knowledgeBase.tsx` — file-tree delete extension branches
- `Features.md` — update §11 references and §3/§4 attachment notes
- `test-cases/03-diagram.md` — add cleanup cases (DIAG-3.x-XX)
- `test-cases/04-document.md` — add rows-model cases (DOC-4.x-XX)
- `test-cases/11-tabs.md` — add remove-track + .alphatex cleanup cases (TAB-11.x-XX)

---

## Project conventions to honour while executing

- **TDD strictly.** Test file → run failing → implement → run passing → commit.
- **Commit per task** with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- **No worktrees.** Work directly on `plan/document-meta-persistence`.
- **`useRepositories()` only works below `RepositoryProvider`.** `useDocuments` is mounted at `KnowledgeBaseInner` which is *above* the provider, so the boot read must accept the repo as a prop, not call `useRepositories()`.
- **Verification ceiling.** `npm run test:run` clean + `npx tsc --noEmit` clean + `npm run lint` 0 errors. Manual UI testing only confirmed at PR time.

---

## Task 1: Domain types + identity helpers

**Files:**
- Create: `src/app/knowledge_base/domain/attachmentLinks.ts`
- Create: `src/app/knowledge_base/domain/attachmentLinks.test.ts`

- [ ] **Step 1.1: Write failing tests for types and `addRow` / `removeRow` / `isSameRow`**

```ts
// src/app/knowledge_base/domain/attachmentLinks.test.ts
import { describe, it, expect } from "vitest";
import {
  addRow,
  removeRow,
  isSameRow,
  type AttachmentLink,
} from "./attachmentLinks";

const A: AttachmentLink = { docPath: "a.md", entityType: "node", entityId: "n1" };
const B: AttachmentLink = { docPath: "b.md", entityType: "flow", entityId: "f1" };

describe("isSameRow", () => {
  it("returns true for identical tuple", () => {
    expect(isSameRow(A, { ...A })).toBe(true);
  });
  it("returns false when any field differs", () => {
    expect(isSameRow(A, { ...A, docPath: "x.md" })).toBe(false);
    expect(isSameRow(A, { ...A, entityType: "flow" })).toBe(false);
    expect(isSameRow(A, { ...A, entityId: "n2" })).toBe(false);
  });
});

describe("addRow", () => {
  it("appends a new row", () => {
    expect(addRow([], A)).toEqual([A]);
  });
  it("is idempotent on duplicate (returns same array reference)", () => {
    const rows = [A];
    expect(addRow(rows, { ...A })).toBe(rows);
  });
  it("appends when only one field matches", () => {
    expect(addRow([A], B)).toEqual([A, B]);
  });
});

describe("removeRow", () => {
  it("removes an existing row", () => {
    expect(removeRow([A, B], A)).toEqual([B]);
  });
  it("returns same array reference when row absent", () => {
    const rows = [A];
    expect(removeRow(rows, B)).toBe(rows);
  });
});
```

- [ ] **Step 1.2: Run test to verify it fails**

Run: `npx vitest run src/app/knowledge_base/domain/attachmentLinks.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 1.3: Implement domain types and helpers**

```ts
// src/app/knowledge_base/domain/attachmentLinks.ts
/**
 * Workspace-scoped flat relations store. Each row links a markdown
 * document (by its vault-relative path) to one entity it is "attached to"
 * in a diagram or tab. Persisted at `<vault>/.kb/attachment-links.json`.
 */

export type EntityType =
  | "root"
  | "node"
  | "connection"
  | "flow"
  | "type"
  | "tab"
  | "tab-section"
  | "tab-track";

export interface AttachmentLink {
  docPath: string;
  entityType: EntityType;
  entityId: string;
}

export function isSameRow(a: AttachmentLink, b: AttachmentLink): boolean {
  return (
    a.docPath === b.docPath &&
    a.entityType === b.entityType &&
    a.entityId === b.entityId
  );
}

export function addRow(
  rows: AttachmentLink[],
  row: AttachmentLink,
): AttachmentLink[] {
  if (rows.some((r) => isSameRow(r, row))) return rows;
  return [...rows, row];
}

export function removeRow(
  rows: AttachmentLink[],
  row: AttachmentLink,
): AttachmentLink[] {
  if (!rows.some((r) => isSameRow(r, row))) return rows;
  return rows.filter((r) => !isSameRow(r, row));
}
```

- [ ] **Step 1.4: Run test to verify it passes**

Run: `npx vitest run src/app/knowledge_base/domain/attachmentLinks.test.ts`
Expected: PASS — all tests green.

- [ ] **Step 1.5: Commit**

```bash
git add src/app/knowledge_base/domain/attachmentLinks.ts src/app/knowledge_base/domain/attachmentLinks.test.ts
git commit -m "$(cat <<'EOF'
feat(attachments): T1 — domain types + addRow/removeRow/isSameRow

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Domain matcher helpers (`removeMatchingRows`, `replaceSubset`, `migrateRows`)

**Files:**
- Modify: `src/app/knowledge_base/domain/attachmentLinks.ts`
- Modify: `src/app/knowledge_base/domain/attachmentLinks.test.ts`

- [ ] **Step 2.1: Add failing tests for the three helpers**

Append to `attachmentLinks.test.ts`:

```ts
import {
  removeMatchingRows,
  replaceSubset,
  migrateRows,
} from "./attachmentLinks";

describe("removeMatchingRows", () => {
  it("removes rows matching the predicate, returns count", () => {
    const rows: AttachmentLink[] = [
      { docPath: "a.md", entityType: "node", entityId: "n1" },
      { docPath: "a.md", entityType: "node", entityId: "n2" },
      { docPath: "b.md", entityType: "flow", entityId: "f1" },
    ];
    const result = removeMatchingRows(rows, (r) => r.entityType === "node");
    expect(result.removed).toBe(2);
    expect(result.rows).toEqual([
      { docPath: "b.md", entityType: "flow", entityId: "f1" },
    ]);
  });
  it("returns same array reference when no match", () => {
    const rows: AttachmentLink[] = [
      { docPath: "a.md", entityType: "node", entityId: "n1" },
    ];
    const result = removeMatchingRows(rows, (r) => r.entityType === "flow");
    expect(result.rows).toBe(rows);
    expect(result.removed).toBe(0);
  });
});

describe("replaceSubset", () => {
  it("removes rows matching (entityTypes, entityIds), then adds replacements", () => {
    const rows: AttachmentLink[] = [
      { docPath: "a.md", entityType: "node", entityId: "n1" },
      { docPath: "a.md", entityType: "tab-track", entityId: "t.alphatex#track:u1" },
    ];
    const replacement: AttachmentLink[] = [
      { docPath: "a.md", entityType: "node", entityId: "n2" },
    ];
    const next = replaceSubset(
      rows,
      new Set(["node", "connection", "flow", "type", "root"]),
      new Set(["n1"]),
      replacement,
    );
    expect(next).toEqual([
      { docPath: "a.md", entityType: "tab-track", entityId: "t.alphatex#track:u1" },
      { docPath: "a.md", entityType: "node", entityId: "n2" },
    ]);
  });
  it("preserves rows whose entityType is outside the subset entityTypes", () => {
    const rows: AttachmentLink[] = [
      { docPath: "a.md", entityType: "tab-track", entityId: "x" },
    ];
    const next = replaceSubset(
      rows,
      new Set(["node"]),
      new Set(["n1"]),
      [],
    );
    expect(next).toEqual(rows);
  });
});

describe("migrateRows", () => {
  it("rewrites tab-section / tab-track ids per the map", () => {
    const rows: AttachmentLink[] = [
      { docPath: "a.md", entityType: "tab-section", entityId: "f.alphatex#old" },
      { docPath: "a.md", entityType: "tab-track", entityId: "f.alphatex#track:T" },
      { docPath: "a.md", entityType: "node", entityId: "n1" },
    ];
    const next = migrateRows(rows, new Map([
      ["f.alphatex#old", "f.alphatex#new"],
    ]));
    expect(next).toEqual([
      { docPath: "a.md", entityType: "tab-section", entityId: "f.alphatex#new" },
      { docPath: "a.md", entityType: "tab-track", entityId: "f.alphatex#track:T" },
      { docPath: "a.md", entityType: "node", entityId: "n1" },
    ]);
  });
  it("leaves diagram-scope ids untouched even if the map has matching keys", () => {
    const rows: AttachmentLink[] = [
      { docPath: "a.md", entityType: "node", entityId: "n1" },
    ];
    const next = migrateRows(rows, new Map([["n1", "n2"]]));
    expect(next).toEqual(rows);
  });
});
```

- [ ] **Step 2.2: Run test to verify it fails**

Run: `npx vitest run src/app/knowledge_base/domain/attachmentLinks.test.ts`
Expected: FAIL — `removeMatchingRows`, `replaceSubset`, `migrateRows` not exported.

- [ ] **Step 2.3: Implement the helpers**

Append to `attachmentLinks.ts`:

```ts
export function removeMatchingRows(
  rows: AttachmentLink[],
  matcher: (row: AttachmentLink) => boolean,
): { rows: AttachmentLink[]; removed: number } {
  let removed = 0;
  const next = rows.filter((r) => {
    if (matcher(r)) {
      removed++;
      return false;
    }
    return true;
  });
  if (removed === 0) return { rows, removed: 0 };
  return { rows: next, removed };
}

/**
 * Remove every row whose `entityType ∈ entityTypes` AND `entityId ∈ entityIds`,
 * then concat `replacement`. Used by diagram-undo to swap a diagram's subset.
 */
export function replaceSubset(
  rows: AttachmentLink[],
  entityTypes: Set<string>,
  entityIds: Set<string>,
  replacement: AttachmentLink[],
): AttachmentLink[] {
  const filtered = rows.filter(
    (r) => !(entityTypes.has(r.entityType) && entityIds.has(r.entityId)),
  );
  return [...filtered, ...replacement];
}

/**
 * Rewrite tab-scope ids per the supplied map. Only `tab-section` and
 * `tab-track` rows are eligible (matches the existing `migrateAttachments`
 * scope at `useDocuments.ts:115`).
 */
export function migrateRows(
  rows: AttachmentLink[],
  idMap: Map<string, string>,
): AttachmentLink[] {
  if (idMap.size === 0) return rows;
  let touched = false;
  const next = rows.map((r) => {
    if (r.entityType !== "tab-section" && r.entityType !== "tab-track") return r;
    const replacement = idMap.get(r.entityId);
    if (replacement === undefined) return r;
    touched = true;
    return { ...r, entityId: replacement };
  });
  return touched ? next : rows;
}
```

- [ ] **Step 2.4: Run test to verify it passes**

Run: `npx vitest run src/app/knowledge_base/domain/attachmentLinks.test.ts`
Expected: PASS — all tests green.

- [ ] **Step 2.5: Commit**

```bash
git add src/app/knowledge_base/domain/attachmentLinks.ts src/app/knowledge_base/domain/attachmentLinks.test.ts
git commit -m "$(cat <<'EOF'
feat(attachments): T2 — removeMatchingRows / replaceSubset / migrateRows helpers

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Diagram entity-id collector helper

**Files:**
- Create: `src/app/knowledge_base/features/diagram/utils/diagramEntityIds.ts`
- Create: `src/app/knowledge_base/features/diagram/utils/diagramEntityIds.test.ts`

- [ ] **Step 3.1: Write failing test**

```ts
// src/app/knowledge_base/features/diagram/utils/diagramEntityIds.test.ts
import { describe, it, expect } from "vitest";
import { collectDiagramEntityIds } from "./diagramEntityIds";
import type { DiagramData } from "../../../shared/utils/types";

const empty: DiagramData = {
  title: "T",
  layers: [],
  nodes: [],
  connections: [],
};

describe("collectDiagramEntityIds", () => {
  it("returns empty Set for empty diagram", () => {
    expect(collectDiagramEntityIds(empty).size).toBe(0);
  });

  it("collects nodes, connections, and flows", () => {
    const data: DiagramData = {
      ...empty,
      nodes: [
        { id: "n1", label: "x", x: 0, y: 0, layer: "L1", type: "Db" } as any,
        { id: "n2", label: "y", x: 0, y: 0, layer: "L1", type: "Api" } as any,
      ],
      connections: [
        { id: "c1", from: "n1", to: "n2", label: "" } as any,
      ],
      flows: [{ id: "f1", name: "main", path: ["c1"] } as any],
    };
    const ids = collectDiagramEntityIds(data);
    expect(ids.has("n1")).toBe(true);
    expect(ids.has("n2")).toBe(true);
    expect(ids.has("c1")).toBe(true);
    expect(ids.has("f1")).toBe(true);
    expect(ids.size).toBe(4);
  });
});
```

- [ ] **Step 3.2: Run test to verify it fails**

Run: `npx vitest run src/app/knowledge_base/features/diagram/utils/diagramEntityIds.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3.3: Implement helper**

```ts
// src/app/knowledge_base/features/diagram/utils/diagramEntityIds.ts
import type { DiagramData } from "../../../shared/utils/types";

/**
 * Collect every entity id whose lifecycle is bound to this diagram —
 * nodes, connections, flows. Used by file-tree delete cleanup and
 * diagram-undo subset snapshots.
 */
export function collectDiagramEntityIds(data: DiagramData): Set<string> {
  const ids = new Set<string>();
  for (const n of data.nodes) ids.add(n.id);
  for (const c of data.connections) ids.add(c.id);
  for (const f of data.flows ?? []) ids.add(f.id);
  return ids;
}
```

- [ ] **Step 3.4: Run test to verify it passes**

Run: `npx vitest run src/app/knowledge_base/features/diagram/utils/diagramEntityIds.test.ts`
Expected: PASS.

- [ ] **Step 3.5: Commit**

```bash
git add src/app/knowledge_base/features/diagram/utils/diagramEntityIds.ts src/app/knowledge_base/features/diagram/utils/diagramEntityIds.test.ts
git commit -m "$(cat <<'EOF'
feat(attachments): T3 — collectDiagramEntityIds helper

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: AttachmentLinksRepository interface + FSA implementation + tests

**Files:**
- Modify: `src/app/knowledge_base/domain/repositories.ts`
- Create: `src/app/knowledge_base/infrastructure/attachmentLinksRepo.ts`
- Create: `src/app/knowledge_base/infrastructure/attachmentLinksRepo.test.ts`

- [ ] **Step 4.1: Add interface to `domain/repositories.ts`**

Inspect first: `grep -n "TabRefsRepository" src/app/knowledge_base/domain/repositories.ts` — add the new interface in the same section, mirroring the export style.

```ts
// In src/app/knowledge_base/domain/repositories.ts
import type { AttachmentLink } from "./attachmentLinks";

export interface AttachmentLinksRepository {
  /** Read the persisted rows. Returns [] when the file is absent. */
  read(): Promise<AttachmentLink[]>;
  /** Replace the entire stored set with `rows`. Creates `.kb/` if absent. */
  write(rows: AttachmentLink[]): Promise<void>;
}
```

- [ ] **Step 4.2: Write failing repo test**

```ts
// src/app/knowledge_base/infrastructure/attachmentLinksRepo.test.ts
import { describe, it, expect } from "vitest";
import { createAttachmentLinksRepository } from "./attachmentLinksRepo";
import type { AttachmentLink } from "../domain/attachmentLinks";
import { FileSystemError } from "../domain/errors";

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
    async getFileHandle(name: string) { return fileHandle(name); },
    async getDirectoryHandle() { return dirHandle; },
  } as unknown as FileSystemDirectoryHandle;
  return { dirHandle, store };
}

const A: AttachmentLink = { docPath: "a.md", entityType: "node", entityId: "n1" };
const B: AttachmentLink = { docPath: "b.md", entityType: "flow", entityId: "f1" };

describe("attachmentLinksRepo", () => {
  it("read on missing file returns []", async () => {
    const { dirHandle } = makeHandle();
    const repo = createAttachmentLinksRepository(dirHandle);
    expect(await repo.read()).toEqual([]);
  });

  it("write then read round-trips", async () => {
    const { dirHandle } = makeHandle();
    const repo = createAttachmentLinksRepository(dirHandle);
    await repo.write([A, B]);
    expect(await repo.read()).toEqual([A, B]);
  });

  it("malformed JSON triggers backup write and returns []", async () => {
    const { dirHandle, store } = makeHandle({
      ".kb/attachment-links.json": "{not json",
    });
    const repo = createAttachmentLinksRepository(dirHandle);
    expect(await repo.read()).toEqual([]);
    expect(store.get(".kb/attachment-links.json.broken")).toBe("{not json");
  });

  it("throws FileSystemError(malformed) on shape mismatch", async () => {
    const { dirHandle } = makeHandle({
      ".kb/attachment-links.json": JSON.stringify([{ wrong: "shape" }]),
    });
    const repo = createAttachmentLinksRepository(dirHandle);
    await expect(repo.read()).rejects.toBeInstanceOf(FileSystemError);
  });
});
```

- [ ] **Step 4.3: Run test to verify it fails**

Run: `npx vitest run src/app/knowledge_base/infrastructure/attachmentLinksRepo.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4.4: Implement the repo**

```ts
// src/app/knowledge_base/infrastructure/attachmentLinksRepo.ts
/**
 * File System Access API implementation of `AttachmentLinksRepository`.
 * Persists the workspace-wide attachment-link store at
 * `<vault>/.kb/attachment-links.json`. Missing file → []; malformed JSON
 * → backup to `.broken` then []; wrong-shape JSON → FileSystemError.
 */

import type { AttachmentLink, EntityType } from "../domain/attachmentLinks";
import type { AttachmentLinksRepository } from "../domain/repositories";
import {
  readTextFile,
  writeTextFile,
} from "../shared/hooks/fileExplorerHelpers";
import {
  classifyError,
  FileSystemError,
} from "../domain/errors";

const ATTACHMENT_LINKS_PATH = ".kb/attachment-links.json";
const BACKUP_PATH = ".kb/attachment-links.json.broken";

const VALID_TYPES: ReadonlySet<EntityType> = new Set([
  "root", "node", "connection", "flow", "type", "tab", "tab-section", "tab-track",
]);

function isAttachmentLink(x: unknown): x is AttachmentLink {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.docPath === "string" &&
    typeof o.entityType === "string" &&
    VALID_TYPES.has(o.entityType as EntityType) &&
    typeof o.entityId === "string"
  );
}

export function createAttachmentLinksRepository(
  rootHandle: FileSystemDirectoryHandle,
): AttachmentLinksRepository {
  return {
    async read(): Promise<AttachmentLink[]> {
      let text: string;
      try {
        const parts = ATTACHMENT_LINKS_PATH.split("/");
        let dir = rootHandle;
        for (const part of parts.slice(0, -1)) {
          dir = await dir.getDirectoryHandle(part);
        }
        const fileHandle = await dir.getFileHandle(parts[parts.length - 1]);
        text = await readTextFile(fileHandle);
      } catch (e) {
        const err = e as Error & { name?: string };
        if (err?.name === "NotFoundError") return [];
        throw classifyError(e);
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        // Backup the malformed file so we don't lose user data on next write.
        try {
          await writeTextFile(rootHandle, BACKUP_PATH, text);
        } catch {
          // best-effort
        }
        return [];
      }

      if (!Array.isArray(parsed) || !parsed.every(isAttachmentLink)) {
        throw new FileSystemError(
          "malformed",
          `${ATTACHMENT_LINKS_PATH} does not match the AttachmentLink[] shape`,
        );
      }
      return parsed;
    },

    async write(rows: AttachmentLink[]): Promise<void> {
      try {
        await writeTextFile(rootHandle, ATTACHMENT_LINKS_PATH, JSON.stringify(rows, null, 2));
      } catch (e) {
        throw classifyError(e);
      }
    },
  };
}
```

- [ ] **Step 4.5: Run test to verify it passes**

Run: `npx vitest run src/app/knowledge_base/infrastructure/attachmentLinksRepo.test.ts`
Expected: PASS.

- [ ] **Step 4.6: Commit**

```bash
git add src/app/knowledge_base/domain/repositories.ts src/app/knowledge_base/infrastructure/attachmentLinksRepo.ts src/app/knowledge_base/infrastructure/attachmentLinksRepo.test.ts
git commit -m "$(cat <<'EOF'
feat(attachments): T4 — AttachmentLinksRepository + FSA impl with malformed-backup

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Wire `attachmentLinks` into `RepositoryContext`

**Files:**
- Modify: `src/app/knowledge_base/shell/RepositoryContext.tsx`
- Modify: `src/app/knowledge_base/shell/RepositoryContext.test.tsx` (if it exists; otherwise skip)

- [ ] **Step 5.1: Inspect existing wiring**

Run: `grep -n "Repositories\|attachment" src/app/knowledge_base/shell/RepositoryContext.tsx`. Confirm the `Repositories` interface and the `EMPTY_REPOS` stub.

- [ ] **Step 5.2: Add `attachmentLinks` slot**

In `RepositoryContext.tsx`, add to the `Repositories` interface (near the existing `attachment` slot):

```ts
import { createAttachmentLinksRepository } from "../infrastructure/attachmentLinksRepo";
import type { AttachmentLinksRepository } from "../domain/repositories";

// inside Repositories interface
attachmentLinks: AttachmentLinksRepository;
```

Update `EMPTY_REPOS` with a no-op stub:

```ts
attachmentLinks: { async read() { return []; }, async write() {} },
```

Inside the `useMemo` body of `RepositoryProvider`:

```ts
attachmentLinks: createAttachmentLinksRepository(rootHandle),
```

Update `StubRepositoryProvider` to accept an optional `attachmentLinks` override and default to the no-op shape.

- [ ] **Step 5.3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5.4: Run full test suite**

Run: `npm run test:run`
Expected: existing tests still pass; the `attachmentLinks` slot is unused so no regression.

- [ ] **Step 5.5: Commit**

```bash
git add src/app/knowledge_base/shell/RepositoryContext.tsx
git commit -m "$(cat <<'EOF'
feat(attachments): T5 — register attachmentLinks slot in RepositoryContext

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Rebuild `useDocuments` around `rows` + memoized `documents` projection

**Files:**
- Modify: `src/app/knowledge_base/features/document/hooks/useDocuments.ts`
- Modify: `src/app/knowledge_base/features/document/hooks/useDocuments.test.ts`

This is the heaviest task. The hook keeps its public surface (back-compat) but the internal storage shifts from `DocumentMeta[]` to `AttachmentLink[]`. The persistence wiring lands in T8; this task is purely the in-memory shift + projection.

- [ ] **Step 6.1: Add a failing test asserting `rows` is exposed and projection groups correctly**

Append to `useDocuments.test.ts` (preserving existing tests):

```ts
import type { AttachmentLink } from "../../../domain/attachmentLinks";

describe("useDocuments rows model", () => {
  it("attachDocument adds a row; rows reflects the model directly", () => {
    const { result } = renderHook(() => useDocuments());
    act(() => { result.current.attachDocument("a.md", "node", "n1"); });
    const expected: AttachmentLink = {
      docPath: "a.md", entityType: "node", entityId: "n1",
    };
    expect(result.current.rows).toEqual([expected]);
  });

  it("documents projection groups rows by docPath and synthesises DocumentMeta", () => {
    const { result } = renderHook(() => useDocuments());
    act(() => {
      result.current.attachDocument("a.md", "node", "n1");
      result.current.attachDocument("a.md", "flow", "f1");
    });
    expect(result.current.documents).toHaveLength(1);
    expect(result.current.documents[0]).toMatchObject({
      filename: "a.md",
      title: "a",
      attachedTo: [
        { type: "node", id: "n1" },
        { type: "flow", id: "f1" },
      ],
    });
    expect(result.current.documents[0].id).toMatch(/^doc-/);
  });

  it("documents projection drops doc when last row is detached", () => {
    const { result } = renderHook(() => useDocuments());
    act(() => {
      result.current.attachDocument("a.md", "node", "n1");
      result.current.detachDocument("a.md", "node", "n1");
    });
    expect(result.current.documents).toEqual([]);
    expect(result.current.rows).toEqual([]);
  });
});
```

- [ ] **Step 6.2: Run test to verify failure**

Run: `npx vitest run src/app/knowledge_base/features/document/hooks/useDocuments.test.ts`
Expected: FAIL — `rows` does not exist on the hook return.

- [ ] **Step 6.3: Rewrite `useDocuments.ts`**

Replace the body of `useDocuments` (preserve `collectDocPaths`, `existingDocPaths`, `createDocument`):

```ts
"use client";

import { useState, useCallback, useMemo } from "react";
import type { DocumentMeta } from "../types";
import {
  addRow,
  removeRow,
  removeMatchingRows,
  migrateRows,
  type AttachmentLink,
} from "../../../domain/attachmentLinks";
import { createDocumentRepository } from "../../../infrastructure/documentRepo";
import type { TreeNode } from "../../../shared/hooks/useFileExplorer";

export function useDocuments() {
  const [rows, setRows] = useState<AttachmentLink[]>([]);

  // ─── Tree helpers — unchanged behaviour ──────────────────────────
  const collectDocPaths = useCallback((tree: TreeNode[]): string[] => {
    const paths: string[] = [];
    function walk(nodes: TreeNode[]) {
      for (const node of nodes) {
        if (node.type === "file" && node.fileType === "document") {
          paths.push(node.path);
        }
        if (node.children) walk(node.children);
      }
    }
    walk(tree);
    return paths;
  }, []);

  const existingDocPaths = useCallback(
    (tree: TreeNode[]): Set<string> => new Set(collectDocPaths(tree)),
    [collectDocPaths],
  );

  // ─── Mutators (in-memory only this task — persistence in T8) ─────
  const attachDocument = useCallback(
    (
      docPath: string,
      entityType: AttachmentLink["entityType"],
      entityId: string,
    ) => {
      setRows((prev) => addRow(prev, { docPath, entityType, entityId }));
    },
    [],
  );

  const detachDocument = useCallback(
    (docPath: string, entityType: string, entityId: string) => {
      setRows((prev) =>
        removeRow(prev, {
          docPath,
          entityType: entityType as AttachmentLink["entityType"],
          entityId,
        }),
      );
    },
    [],
  );

  const removeDocument = useCallback((docPath: string) => {
    setRows((prev) => removeMatchingRows(prev, (r) => r.docPath === docPath).rows);
  }, []);

  const migrateAttachments = useCallback(
    (filePath: string, migrations: { from: string; to: string }[]) => {
      if (migrations.length === 0) return;
      const map = new Map<string, string>();
      for (const m of migrations) {
        map.set(`${filePath}#${m.from}`, `${filePath}#${m.to}`);
      }
      setRows((prev) => migrateRows(prev, map));
    },
    [],
  );

  // ─── Memoised DocumentMeta projection (back-compat) ──────────────
  const documents = useMemo<DocumentMeta[]>(() => {
    const byDoc = new Map<string, DocumentMeta>();
    for (const r of rows) {
      let entry = byDoc.get(r.docPath);
      if (!entry) {
        const title = r.docPath.split("/").pop()?.replace(/\.md$/, "") ?? r.docPath;
        entry = {
          id: `doc-${r.docPath}`,
          filename: r.docPath,
          title,
          attachedTo: [],
        };
        byDoc.set(r.docPath, entry);
      }
      entry.attachedTo!.push({ type: r.entityType, id: r.entityId });
    }
    return Array.from(byDoc.values());
  }, [rows]);

  // ─── Selectors ───────────────────────────────────────────────────
  const getDocumentsForEntity = useCallback(
    (entityType: string, entityId: string): DocumentMeta[] =>
      documents.filter((d) =>
        d.attachedTo?.some((a) => a.type === entityType && a.id === entityId),
      ),
    [documents],
  );

  const hasDocuments = useCallback(
    (entityType: string, entityId: string): boolean =>
      rows.some((r) => r.entityType === entityType && r.entityId === entityId),
    [rows],
  );

  // ─── Disk creation (unchanged) ───────────────────────────────────
  const createDocument = useCallback(
    async (
      rootHandle: FileSystemDirectoryHandle,
      path: string,
      initialContent = "",
    ) => {
      const repo = createDocumentRepository(rootHandle);
      await repo.write(path, initialContent);
      return path;
    },
    [],
  );

  return {
    rows,
    setRows,
    documents,
    setDocuments: (next: DocumentMeta[]) => {
      // Back-compat shim — used by old onLoadDocuments call sites until T12.
      const flat: AttachmentLink[] = next.flatMap((d) =>
        (d.attachedTo ?? []).map((a) => ({
          docPath: d.filename,
          entityType: a.type,
          entityId: a.id,
        })),
      );
      setRows(flat);
    },
    createDocument,
    attachDocument,
    detachDocument,
    removeDocument,
    migrateAttachments,
    getDocumentsForEntity,
    hasDocuments,
    collectDocPaths,
    existingDocPaths,
  };
}
```

- [ ] **Step 6.4: Update existing `useDocuments.test.ts` assertions for the projection's deterministic id**

The existing test asserts `expect(result.current.documents[0].id).toMatch(/^doc-/)` — that still passes (`doc-${docPath}` starts with `doc-`). The existing test that creates two attachments to the same `a.md` should still produce one DocumentMeta. Re-run the test file:

Run: `npx vitest run src/app/knowledge_base/features/document/hooks/useDocuments.test.ts`
Expected: PASS — all old + new tests green.

- [ ] **Step 6.5: Typecheck the project**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6.6: Commit**

```bash
git add src/app/knowledge_base/features/document/hooks/useDocuments.ts src/app/knowledge_base/features/document/hooks/useDocuments.test.ts
git commit -m "$(cat <<'EOF'
feat(attachments): T6 — useDocuments rebuilt around rows + memoized DocumentMeta projection

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `withBatch` primitive

**Files:**
- Modify: `src/app/knowledge_base/features/document/hooks/useDocuments.ts`
- Modify: `src/app/knowledge_base/features/document/hooks/useDocuments.test.ts`

The batch primitive defers an external write callback (added in T8) until the outermost batch returns. In this task we install the depth counter and a *test hook* (a flush-call counter via a stubbed `onFlush` prop) so the behaviour can be asserted before T8's persistence wiring.

- [ ] **Step 7.1: Write failing test using a flush spy**

Append to `useDocuments.test.ts`:

```ts
describe("withBatch", () => {
  it("flushes once per outer batch regardless of inner mutations", async () => {
    const onFlush = vi.fn();
    const { result } = renderHook(() => useDocuments({ onFlush }));
    await act(async () => {
      await result.current.withBatch(async () => {
        result.current.attachDocument("a.md", "node", "n1");
        result.current.attachDocument("a.md", "flow", "f1");
      });
    });
    expect(onFlush).toHaveBeenCalledTimes(1);
  });

  it("nested withBatch only flushes at outermost return", async () => {
    const onFlush = vi.fn();
    const { result } = renderHook(() => useDocuments({ onFlush }));
    await act(async () => {
      await result.current.withBatch(async () => {
        result.current.attachDocument("a.md", "node", "n1");
        await result.current.withBatch(async () => {
          result.current.attachDocument("a.md", "flow", "f1");
        });
      });
    });
    expect(onFlush).toHaveBeenCalledTimes(1);
  });

  it("single mutation outside batch flushes immediately", () => {
    const onFlush = vi.fn();
    const { result } = renderHook(() => useDocuments({ onFlush }));
    act(() => { result.current.attachDocument("a.md", "node", "n1"); });
    expect(onFlush).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 7.2: Run test to verify failure**

Run: `npx vitest run src/app/knowledge_base/features/document/hooks/useDocuments.test.ts -t withBatch`
Expected: FAIL — hook does not accept opts; `withBatch` does not exist.

- [ ] **Step 7.3: Update `useDocuments.ts` to accept opts and implement `withBatch`**

```ts
// Top of useDocuments.ts file
import { useRef } from "react";

interface UseDocumentsOpts {
  /** Called whenever the in-memory rows change (debounced inside withBatch). */
  onFlush?: (rows: AttachmentLink[]) => void;
}

export function useDocuments(opts: UseDocumentsOpts = {}) {
  // ... existing state above

  const onFlushRef = useRef(opts.onFlush);
  onFlushRef.current = opts.onFlush;

  const batchDepthRef = useRef(0);
  const pendingFlushRef = useRef(false);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const flushIfReady = useCallback(() => {
    if (batchDepthRef.current > 0) {
      pendingFlushRef.current = true;
      return;
    }
    if (!pendingFlushRef.current) {
      onFlushRef.current?.(rowsRef.current);
      return;
    }
    pendingFlushRef.current = false;
    onFlushRef.current?.(rowsRef.current);
  }, []);

  // Wrap each mutator's setRows to call flushIfReady AFTER the state update.
  // Easiest pattern: useEffect on rows that calls flushIfReady when rows change
  // outside batch; but to keep the test deterministic we call the spy
  // synchronously from the mutators. Implementation note: the spy fires once
  // per state-update batch React commits, which matches the "single mutation
  // → one flush" expectation.
}
```

The cleanest implementation: drive `onFlush` from a `useEffect([rows])` hook combined with the batch counter:

```ts
useEffect(() => {
  if (batchDepthRef.current > 0) {
    pendingFlushRef.current = true;
    return;
  }
  onFlushRef.current?.(rows);
  pendingFlushRef.current = false;
}, [rows]);

const withBatch = useCallback(
  async <T,>(fn: () => Promise<T> | T): Promise<T> => {
    batchDepthRef.current += 1;
    try {
      return await fn();
    } finally {
      batchDepthRef.current -= 1;
      if (batchDepthRef.current === 0 && pendingFlushRef.current) {
        pendingFlushRef.current = false;
        onFlushRef.current?.(rowsRef.current);
      }
    }
  },
  [],
);
```

Add `withBatch` to the returned object.

**Important:** the initial mount also fires `useEffect([rows])` once with `rows = []`. That fires `onFlush([])` on mount, which would skew the test counts. Suppress it by tracking initial mount:

```ts
const mountedRef = useRef(false);
useEffect(() => {
  if (!mountedRef.current) {
    mountedRef.current = true;
    return;
  }
  if (batchDepthRef.current > 0) {
    pendingFlushRef.current = true;
    return;
  }
  onFlushRef.current?.(rows);
  pendingFlushRef.current = false;
}, [rows]);
```

- [ ] **Step 7.4: Run test to verify it passes**

Run: `npx vitest run src/app/knowledge_base/features/document/hooks/useDocuments.test.ts -t withBatch`
Expected: PASS.

- [ ] **Step 7.5: Run full hook test file to confirm no regressions**

Run: `npx vitest run src/app/knowledge_base/features/document/hooks/useDocuments.test.ts`
Expected: PASS — all tests green.

- [ ] **Step 7.6: Commit**

```bash
git add src/app/knowledge_base/features/document/hooks/useDocuments.ts src/app/knowledge_base/features/document/hooks/useDocuments.test.ts
git commit -m "$(cat <<'EOF'
feat(attachments): T7 — withBatch primitive defers onFlush until outer batch returns

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `detachAttachmentsFor` primitive

**Files:**
- Modify: `src/app/knowledge_base/features/document/hooks/useDocuments.ts`
- Modify: `src/app/knowledge_base/features/document/hooks/useDocuments.test.ts`

- [ ] **Step 8.1: Write failing test**

```ts
describe("detachAttachmentsFor", () => {
  it("removes matching rows; idempotent on second call", async () => {
    const { result } = renderHook(() => useDocuments());
    act(() => {
      result.current.attachDocument("a.md", "node", "n1");
      result.current.attachDocument("a.md", "flow", "f1");
    });
    let res!: { detached: number };
    act(() => {
      res = result.current.detachAttachmentsFor((r) => r.entityType === "node");
    });
    expect(res.detached).toBe(1);
    expect(result.current.rows).toEqual([
      { docPath: "a.md", entityType: "flow", entityId: "f1" },
    ]);

    act(() => {
      res = result.current.detachAttachmentsFor((r) => r.entityType === "node");
    });
    expect(res.detached).toBe(0);
    expect(result.current.rows).toEqual([
      { docPath: "a.md", entityType: "flow", entityId: "f1" },
    ]);
  });

  it("respects withBatch — flushes once for cascade detach", async () => {
    const onFlush = vi.fn();
    const { result } = renderHook(() => useDocuments({ onFlush }));
    act(() => {
      result.current.attachDocument("a.md", "node", "n1");
      result.current.attachDocument("b.md", "node", "n1");
    });
    onFlush.mockClear();
    await act(async () => {
      await result.current.withBatch(async () => {
        result.current.detachAttachmentsFor((r) => r.entityId === "n1");
      });
    });
    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(result.current.rows).toEqual([]);
  });
});
```

- [ ] **Step 8.2: Run test to verify failure**

Run: `npx vitest run src/app/knowledge_base/features/document/hooks/useDocuments.test.ts -t detachAttachmentsFor`
Expected: FAIL — `detachAttachmentsFor` does not exist.

- [ ] **Step 8.3: Implement and export the primitive**

In `useDocuments.ts`, add (between `migrateAttachments` and the projection):

```ts
const detachAttachmentsFor = useCallback(
  (matcher: (row: AttachmentLink) => boolean): { detached: number } => {
    let removedCount = 0;
    setRows((prev) => {
      const result = removeMatchingRows(prev, matcher);
      removedCount = result.removed;
      return result.rows;
    });
    return { detached: removedCount };
  },
  [],
);
```

Add `detachAttachmentsFor` to the returned object.

- [ ] **Step 8.4: Run test to verify it passes**

Run: `npx vitest run src/app/knowledge_base/features/document/hooks/useDocuments.test.ts`
Expected: PASS.

- [ ] **Step 8.5: Commit**

```bash
git add src/app/knowledge_base/features/document/hooks/useDocuments.ts src/app/knowledge_base/features/document/hooks/useDocuments.test.ts
git commit -m "$(cat <<'EOF'
feat(attachments): T8 — detachAttachmentsFor cleanup primitive

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Persistence wiring — boot read + write-on-flush in `KnowledgeBaseInner`

**Files:**
- Modify: `src/app/knowledge_base/knowledgeBase.tsx`

- [ ] **Step 9.1: Inspect current docManager mount point**

Run: `grep -n "useDocuments\|docManager" src/app/knowledge_base/knowledgeBase.tsx | head -10`. Confirm `useDocuments()` is called at line 146 (or near).

- [ ] **Step 9.2: Wire repo and onFlush; perform initial read**

`KnowledgeBaseInner` is *above* `RepositoryProvider`, so it cannot use `useRepositories()`. Pass the rootHandle directly and create the repo inline (mirrors how `useGpImport` accepts `tab` as a prop per `feedback_no_worktrees.md`'s sibling memory `project_repository_context_deferred.md`).

```ts
// Workspace-scoped attachment-links repo. Created inline because
// KnowledgeBaseInner is above RepositoryProvider (see project_repository_context_deferred).
// Uses fileExplorer.rootHandle (state) — NOT dirHandleRef.current — so the memo
// correctly invalidates when the user switches vaults.
const attachmentLinksRepo = useMemo(() => {
  return fileExplorer.rootHandle
    ? createAttachmentLinksRepository(fileExplorer.rootHandle)
    : null;
}, [fileExplorer.rootHandle]);

// One-time boot read of .kb/attachment-links.json, re-runs when the repo
// identity changes (vault switch). The bootLoaded gate prevents the
// empty-default mount-effect from clobbering disk before the read finishes.
const [bootLoaded, setBootLoaded] = useState(false);
const bootLoadedRef = useRef(false);
bootLoadedRef.current = bootLoaded;

const onFlush = useCallback(
  (rows: AttachmentLink[]) => {
    if (!attachmentLinksRepo || !bootLoadedRef.current) return;
    void attachmentLinksRepo.write(rows).catch((e) =>
      reportError(e as Error, "Writing .kb/attachment-links.json"),
    );
  },
  [attachmentLinksRepo, reportError],
);

const docManager = useDocuments({ onFlush });

// Reset + boot-read whenever the repo identity changes (vault open / switch / close).
useEffect(() => {
  if (!attachmentLinksRepo) {
    setBootLoaded(false);
    return;
  }
  let cancelled = false;
  setBootLoaded(false);  // re-arm gate before the new read
  attachmentLinksRepo
    .read()
    .then((rows) => {
      if (cancelled) return;
      docManager.setRows(rows);
      setBootLoaded(true);
    })
    .catch((e) => {
      if (cancelled) return;
      reportError(e as Error, "Reading .kb/attachment-links.json");
      setBootLoaded(true);
    });
  return () => {
    cancelled = true;
  };
}, [attachmentLinksRepo, docManager, reportError]);
```

The `bootLoaded` gate prevents the empty-default mount-effect from clobbering disk before the read finishes. On vault switch, `attachmentLinksRepo` gets a new identity (because `fileExplorer.rootHandle` is reactive state), which re-runs the effect; `setBootLoaded(false)` at the top re-arms the gate before the new read begins, ensuring no stale flush from the previous vault can land in the new vault's file.

**Key differences from an earlier draft:** `useMemo` deps use `fileExplorer.rootHandle` (reactive state) not `dirHandleRef.current` (ref anti-pattern); `bootLoaded` is not in the `useEffect` deps (the effect re-runs on repo identity change, not on every `bootLoaded` flip); both `.then` and `.catch` are guarded by `if (cancelled) return`.

- [ ] **Step 9.3: Run typecheck + full test suite**

Run: `npx tsc --noEmit && npm run test:run`
Expected: clean + all green.

- [ ] **Step 9.4: Commit**

```bash
git add src/app/knowledge_base/knowledgeBase.tsx
git commit -m "$(cat <<'EOF'
feat(attachments): T9 — boot-read + write-on-flush wiring in KnowledgeBaseInner

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Lazy migration step in `useFileActions` diagram-load

**Files:**
- Modify: `src/app/knowledge_base/shared/hooks/useFileActions.ts`
- Modify: `src/app/knowledge_base/shared/hooks/useFileActions.test.ts` (if exists; otherwise add coverage in a new file)

- [ ] **Step 10.1: Inspect existing load path**

Run: `sed -n '85,140p' src/app/knowledge_base/shared/hooks/useFileActions.ts`. Identify the `selectFile` block where `data` is parsed.

- [ ] **Step 10.2: Add migration parameter**

Extend `useFileActions` signature to accept:

```ts
onMigrateLegacyDocuments?: (filePath: string, docs: DocumentMeta[]) => Promise<void>;
```

The implementation goes in `KnowledgeBaseInner` (callsite of `useFileActions`):

```ts
const onMigrateLegacyDocuments = useCallback(
  async (filePath: string, docs: DocumentMeta[]) => {
    if (!docs.length) return;
    const flat: AttachmentLink[] = docs.flatMap((d) =>
      (d.attachedTo ?? []).map((a) => ({
        docPath: d.filename,
        entityType: a.type,
        entityId: a.id,
      })),
    );
    await docManager.withBatch(async () => {
      for (const row of flat) {
        docManager.attachDocument(row.docPath, row.entityType, row.entityId);
      }
    });
    // Rewrite the diagram with documents: [] — the rest is owned by useFileActions.
  },
  [docManager],
);
```

In `useFileActions`, after parsing data:

```ts
if (data.documents?.length && currentStateRef.current.onMigrateLegacyDocuments) {
  await currentStateRef.current.onMigrateLegacyDocuments(fileName, data.documents);
  data.documents = [];
  await diagramRepo.write(fileName, data); // existing write helper or inline
}
```

(The exact wiring of `diagramRepo.write` may need to be threaded — inspect the current save path and reuse.)

- [ ] **Step 10.3: Add test for the migration path**

In `useFileActions.test.ts` (or a new dedicated test):

```ts
it("migrates data.documents into attachments + rewrites diagram with []", async () => {
  // Mock fileExplorer.selectFile to return a diagram with embedded docs.
  // Spy on onMigrateLegacyDocuments and on diagramRepo.write.
  // Call openFile (or the relevant entry point); assert spy called with the
  // correct path + flattened docs; assert the rewrite call has documents: [].
});
```

- [ ] **Step 10.4: Run test to verify behaviour**

Run: `npx vitest run src/app/knowledge_base/shared/hooks/useFileActions.test.ts`
Expected: PASS.

- [ ] **Step 10.5: Commit**

```bash
git add src/app/knowledge_base/shared/hooks/useFileActions.ts src/app/knowledge_base/knowledgeBase.tsx src/app/knowledge_base/shared/hooks/useFileActions.test.ts
git commit -m "$(cat <<'EOF'
feat(attachments): T10 — lazy migration on first diagram load (folds documents → rows, rewrites diagram)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Diagram history — subset snapshot

**Files:**
- Modify: `src/app/knowledge_base/features/diagram/hooks/useDiagramHistoryStore.ts`
- Modify: `src/app/knowledge_base/features/diagram/hooks/useDiagramController.ts` (signature changes)

- [ ] **Step 11.1: Inspect current snapshot shape**

Run: `grep -n "documents" src/app/knowledge_base/features/diagram/hooks/useDiagramHistoryStore.ts`. Confirm full-array capture at lines 16, 27, 98.

- [ ] **Step 11.2: Replace `documents: DocumentMeta[]` with `attachmentSubset: AttachmentLink[]` in the snapshot type**

Update the `Snapshot` / per-entry shape (`DiagramHistoryEntry` or whatever it's called):

```ts
import type { AttachmentLink } from "../../../domain/attachmentLinks";

interface DiagramHistoryEntry {
  // ... existing fields
  attachmentSubset?: AttachmentLink[];
}
```

- [ ] **Step 11.3: Update the recording call to compute the subset**

`useDiagramHistoryStore` receives the global rows from the parent. Add the subset-compute at record time:

```ts
import { collectDiagramEntityIds } from "../utils/diagramEntityIds";
import { replaceSubset } from "../../../domain/attachmentLinks";

const DIAGRAM_ENTITY_TYPES = new Set(["root", "node", "connection", "flow", "type"]);

// at scheduleRecord time
const diagramIds = new Set<string>([
  ...nodes.map(n => n.id),
  ...connections.map(c => c.id),
  ...(flows ?? []).map(f => f.id),
]);
const attachmentSubset = rows.filter(
  r => DIAGRAM_ENTITY_TYPES.has(r.entityType) && diagramIds.has(r.entityId),
);
history.push({ ...entry, attachmentSubset });
```

- [ ] **Step 11.4: Update undo / redo / goToEntry to call `replaceSubset` on rows**

```ts
const handleUndo = useCallback(() => {
  // ... existing apply
  if (snapshot.attachmentSubset !== undefined) {
    const diagramIds = collectDiagramEntityIds(restoredDiagramData);
    setRows((prev) => replaceSubset(
      prev,
      DIAGRAM_ENTITY_TYPES,
      diagramIds,
      snapshot.attachmentSubset!,
    ));
  }
}, [...]);
```

`setRows` is exposed from the parent's `useDocuments` instance — thread it through.

- [ ] **Step 11.5: Update `useDiagramController` to pass `rows` + `setRows` instead of `documents` + `onLoadDocuments`**

```ts
// useDiagramController interface
rows: AttachmentLink[];
setRows: (next: AttachmentLink[] | ((prev: AttachmentLink[]) => AttachmentLink[])) => void;
```

Remove the `documents` and `onLoadDocuments` props from `useDiagramController` and `useDiagramHistoryStore`.

- [ ] **Step 11.6: Add test for cross-diagram safety**

```ts
it("diagram-undo only affects this diagram's attachment subset", () => {
  // Setup: rows = [
  //   { docPath: "a.md", entityType: "node", entityId: "n1" },         // diagram A
  //   { docPath: "a.md", entityType: "tab-track", entityId: "tx" },    // workspace
  //   { docPath: "a.md", entityType: "node", entityId: "nB" },         // diagram B
  // ]
  // Push a snapshot for diagram A whose subset is just n1.
  // After undo to a state with no n1: row { node, n1 } is removed; tab-track and nB rows preserved.
});
```

- [ ] **Step 11.7: Run tests**

Run: `npx vitest run src/app/knowledge_base/features/diagram/hooks/useDiagramHistoryStore.test.ts`
Expected: PASS.

- [ ] **Step 11.8: Commit**

```bash
git add src/app/knowledge_base/features/diagram/hooks/useDiagramHistoryStore.ts src/app/knowledge_base/features/diagram/hooks/useDiagramController.ts src/app/knowledge_base/features/diagram/hooks/useDiagramHistoryStore.test.ts
git commit -m "$(cat <<'EOF'
feat(attachments): T11 — diagram-undo snapshots only this diagram's attachment subset

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Drop `onLoadDocuments` cascade

**Files:**
- Modify: `src/app/knowledge_base/features/diagram/DiagramView.tsx`
- Modify: `src/app/knowledge_base/features/diagram/hooks/useDiagramController.ts`
- Modify: `src/app/knowledge_base/shared/hooks/useFileActions.ts`
- Modify: `src/app/knowledge_base/knowledgeBase.tsx`

The `onLoadDocuments` prop chain (`KnowledgeBaseInner` → `DiagramView` → `useDiagramController` → `useDiagramHistoryStore` → `useFileActions`) is now obsolete — diagram load no longer pushes documents into a global state. Remove it from all four signatures and corresponding call sites.

- [ ] **Step 12.1: Inspect callsites**

Run: `grep -rn "onLoadDocuments" src/app/knowledge_base --include="*.ts" --include="*.tsx" | grep -v test`

- [ ] **Step 12.2: Remove from interfaces and call sites top-down**

Order: `useFileActions.ts` → `useDiagramHistoryStore.ts` → `useDiagramController.ts` → `DiagramView.tsx` → `knowledgeBase.tsx`.

In each file:
- Drop the prop from the interface / parameter list.
- Remove every call to `onLoadDocuments(…)`.
- The diagram load no longer pushes to the global store; rows survive untouched.

- [ ] **Step 12.3: Update tests that asserted on `onLoadDocuments`**

Search and update:
```bash
grep -rn "onLoadDocuments" src/app/knowledge_base --include="*.test.*"
```
Replace assertions with checks that `setRows` is *not* called on diagram load (or just remove the now-irrelevant tests).

- [ ] **Step 12.4: Run typecheck + full test suite**

Run: `npx tsc --noEmit && npm run test:run`
Expected: clean + all green.

- [ ] **Step 12.5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(attachments): T12 — drop onLoadDocuments prop chain (rows are workspace-scoped now)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: `useDeletion` cleanup integration

**Files:**
- Modify: `src/app/knowledge_base/features/diagram/hooks/useDeletion.ts`
- Modify or create: `src/app/knowledge_base/features/diagram/hooks/useDeletion.test.ts`
- Modify: `src/app/knowledge_base/features/diagram/hooks/useDiagramController.ts`

- [ ] **Step 13.1: Write failing test**

```ts
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { useDeletion } from "./useDeletion";

it("DIAG-3.x-XX: node delete detaches matching attachment rows", () => {
  const detachAttachmentsFor = vi.fn(() => ({ detached: 0 }));
  const withBatch = vi.fn(async (fn: () => unknown) => fn());
  // … wire useDeletion with these via props (signature update below)
  // act(() => deleteSelection({ type: "node", id: "n1" }));
  // expect(detachAttachmentsFor).toHaveBeenCalledTimes(1);
  // expect(detachAttachmentsFor.mock.calls[0][0]).toBeInstanceOf(Function);
  // const matcher = detachAttachmentsFor.mock.calls[0][0];
  // expect(matcher({ docPath: "a.md", entityType: "node", entityId: "n1" })).toBe(true);
  // expect(matcher({ docPath: "a.md", entityType: "node", entityId: "n2" })).toBe(false);
});
```

(Fill in real wiring — use refs as the existing useDeletion does.)

Add a second case for **cascade**: deleting a node that cascades to a connection — both `node` and `connection` rows must match.

Add a third case for **broken-flow**: `confirmDeletion` path detaches `flow` rows for the broken flow ids.

- [ ] **Step 13.2: Run test to verify failure**

Expected: FAIL — `useDeletion` doesn't accept `detachAttachmentsFor` / `withBatch`.

- [ ] **Step 13.3: Update `useDeletion` to accept the cleanup callbacks**

```ts
// useDeletion.ts
interface DeletionSetters {
  // ... existing
  detachAttachmentsFor: (matcher: (r: AttachmentLink) => boolean) => { detached: number };
  withBatch: <T>(fn: () => Promise<T> | T) => Promise<T>;
}

const executeDeletion = useCallback(async (...) => {
  const allNodeIds = new Set([...nodeIdsToDelete, ...nodesInLayers]);
  const allConnIds = new Set<string>();
  for (const c of connectionsRef.current) {
    if (allNodeIds.has(c.from) || allNodeIds.has(c.to)) allConnIds.add(c.id);
  }
  for (const id of lineIdsToDelete) allConnIds.add(id);

  await withBatch(async () => {
    detachAttachmentsFor((r) =>
      (r.entityType === "node" && allNodeIds.has(r.entityId)) ||
      (r.entityType === "connection" && allConnIds.has(r.entityId)) ||
      (r.entityType === "flow" && brokenFlowIds.has(r.entityId)),
    );
    setNodes(...);
    setConnections(...);
    setFlows(...);
    setLayerDefs(...);
    setMeasuredSizes(...);
    setLayerManualSizes(...);
  });

  setSelection(null);
  onActionComplete?.(...);
}, [...]);
```

(Note: `executeDeletion` becomes async because `withBatch` is async. Update callers to `await`.)

- [ ] **Step 13.4: Update `useDiagramController` to pass `detachAttachmentsFor` and `withBatch` from `docManager`**

```ts
const { deleteSelection, confirmDeletion } = useDeletion(
  // ... existing args
  {
    // ... existing setters
    detachAttachmentsFor,
    withBatch,
  },
);
```

- [ ] **Step 13.5: Run tests**

Run: `npx vitest run src/app/knowledge_base/features/diagram/hooks/useDeletion.test.ts`
Expected: PASS.

- [ ] **Step 13.6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(attachments): T13 — useDeletion detaches attachment rows on node/connection/broken-flow cascade

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Drop `useDiagramController:321` flow-direct wrapper

**Files:**
- Modify: `src/app/knowledge_base/features/diagram/hooks/useDiagramController.ts`

- [ ] **Step 14.1: Inspect the wrapper**

Run: `sed -n '318,328p' src/app/knowledge_base/features/diagram/hooks/useDiagramController.ts`

Today's flow-direct delete uses an inline wrapper that loops `documents` and calls `onDetachDocument` per match. Now that `useDeletion` handles flow cleanup centrally (via the `case "flow"` branch + `executeDeletion` chain), the wrapper is duplicate work.

- [ ] **Step 14.2: Update the `case "flow"` branch in `useDeletion.ts`**

Currently `useDeletion.deleteSelection`'s flow branch returns early without going through `executeDeletion`. Update it to also call `detachAttachmentsFor` + `withBatch`:

```ts
case "flow":
  await withBatch(async () => {
    detachAttachmentsFor((r) => r.entityType === "flow" && r.entityId === sel.id);
    setFlows((prev) => prev.filter((f) => f.id !== sel.id));
  });
  setSelection(null);
  onActionComplete?.("Delete flow");
  return null;
```

- [ ] **Step 14.3: Remove the wrapper at `useDiagramController:321`**

Replace:
```ts
const handleDeleteFlow = useCallback((flowId: string) => {
  for (const d of documents) {
    if (d.attachedTo?.some((a) => a.type === "flow" && a.id === flowId)) onDetachDocument(d.filename, "flow", flowId);
  }
  rawHandleDeleteFlow(flowId);
}, [documents, onDetachDocument, rawHandleDeleteFlow]);
```
With:
```ts
const handleDeleteFlow = rawHandleDeleteFlow;
```
(Or pass `rawHandleDeleteFlow` directly to consumers and remove the alias.)

- [ ] **Step 14.4: Update `useDiagramController` test that asserted on the wrapper**

```bash
grep -rn "handleDeleteFlow\|wrapper\|onDetachDocument" src/app/knowledge_base/features/diagram --include="*.test.*"
```
Update or remove the test. Add (if absent) a coverage point that flow-delete via `deleteSelection({ type: "flow", id })` still detaches matching rows.

- [ ] **Step 14.5: Run tests**

Run: `npm run test:run`
Expected: all green.

- [ ] **Step 14.6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(attachments): T14 — drop useDiagramController:321 wrapper; flow-delete cleanup goes through useDeletion

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: TabView `handleRemoveTrack` cleanup

**Files:**
- Modify: `src/app/knowledge_base/features/tab/TabView.tsx`
- Modify: `src/app/knowledge_base/features/tab/TabView.test.tsx`

- [ ] **Step 15.1: Write failing test**

```ts
import { vi } from "vitest";

it("TAB-11.x-XX: handleRemoveTrack detaches tab-track rows for the removed track", async () => {
  const detachAttachmentsFor = vi.fn(() => ({ detached: 0 }));
  // Render TabView with TabPaneContext exposing detachAttachmentsFor + withBatch
  // Seed sidecar with trackRefs[0] = { id: "uuid-A", name: "Lead" }
  // Click Remove on track 0
  // Expect detachAttachmentsFor called with a matcher that returns true for
  //   { docPath: "x.md", entityType: "tab-track", entityId: "song.alphatex#track:uuid-A" }
});
```

- [ ] **Step 15.2: Update `TabPaneContext` to carry `detachAttachmentsFor` + `withBatch`**

In `knowledgeBase.tabRouting.helper.tsx`, add:
```ts
detachAttachmentsFor?: (matcher: (r: AttachmentLink) => boolean) => { detached: number };
withBatch?: <T>(fn: () => Promise<T> | T) => Promise<T>;
```

In `knowledgeBase.tsx` where the tab pane context is built (around line 1083), add:
```ts
detachAttachmentsFor: docManager.detachAttachmentsFor,
withBatch: docManager.withBatch,
```

- [ ] **Step 15.3: Update `handleRemoveTrack` in `TabView.tsx`**

Currently at line ~285. Add the detach call:

```ts
const handleRemoveTrack = useCallback((trackId: string) => {
  const removedPosition = Number(trackId);
  const fp = filePathRef.current;
  const stableUuid = sidecarRef.current?.trackRefs[removedPosition]?.id;

  if (stableUuid && fp && detachAttachmentsFor) {
    const trackEntityId = `${fp}#track:${stableUuid}`;
    detachAttachmentsFor((r) => r.entityType === "tab-track" && r.entityId === trackEntityId);
  }

  propertiesApply({ type: "remove-track", trackId });
  setCursor({ trackIndex: 0, voiceIndex: 0, beat: 0, string: 1 });
  // existing sidecar reconcile
}, [propertiesApply, setCursor, tabRefs, detachAttachmentsFor]);
```

- [ ] **Step 15.4: Run tests**

Run: `npx vitest run src/app/knowledge_base/features/tab/TabView.test.tsx`
Expected: PASS.

- [ ] **Step 15.5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(attachments): T15 — TabView.handleRemoveTrack detaches tab-track rows for the removed track

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: `handleDeleteFileWithLinks` extension branches

**Files:**
- Modify: `src/app/knowledge_base/knowledgeBase.tsx`
- Add tests in `knowledgeBase.test.tsx` or a new dedicated test file.

- [ ] **Step 16.1: Inspect existing handler**

Run: `sed -n '320,345p' src/app/knowledge_base/knowledgeBase.tsx`. Confirm structure.

- [ ] **Step 16.2: Write failing tests**

```ts
describe("handleDeleteFileWithLinks attachment cleanup", () => {
  it("TAB-11.x-XX: .alphatex delete removes tab/tab-section/tab-track rows for that file", async () => {
    // Seed docManager.rows with:
    //   { docPath: "n.md", entityType: "tab", entityId: "song.alphatex" }
    //   { docPath: "n.md", entityType: "tab-section", entityId: "song.alphatex#intro" }
    //   { docPath: "n.md", entityType: "tab-track", entityId: "song.alphatex#track:U" }
    //   { docPath: "n.md", entityType: "tab-section", entityId: "other.alphatex#intro" }
    // Trigger handleDeleteFileWithLinks("song.alphatex", event)
    // Expect rows reduced to the "other.alphatex" entry only.
  });

  it("DIAG-3.x-XX: .kbjson delete reads diagram, extracts ids, removes matching diagram-entity rows", async () => {
    // Mock diagramRepo.read to return { nodes: [{ id: "el-1" }], connections: [{ id: "dl-1" }], flows: [{ id: "fl-1" }] }
    // Seed rows with mixed diagram-A and diagram-B entries.
    // Trigger handleDeleteFileWithLinks("a.kbjson", event)
    // Expect rows for el-1, dl-1, fl-1 removed; others preserved.
  });

  it("DIAG-3.x-XX: .kbjson read failure proceeds with unlink, no detach, error reported", async () => {
    // Mock diagramRepo.read to reject.
    // Spy on reportError + diagramBridge.handleDeleteFile + detachAttachmentsFor.
    // Trigger handleDeleteFileWithLinks("a.kbjson", event)
    // Expect reportError called; diagramBridge.handleDeleteFile called; detachAttachmentsFor not called.
  });

  it("DOC-4.x-XX: .md delete removes all rows where docPath === path", async () => {
    // Seed rows with two entries for "n.md" and one for "other.md".
    // Trigger handleDeleteFileWithLinks("n.md", event)
    // Expect rows = [other.md row].
  });
});
```

- [ ] **Step 16.3: Update the handler**

```ts
const handleDeleteFileWithLinks = useCallback(async (path: string, event: React.MouseEvent) => {
  const rootHandle = fileExplorer.dirHandleRef.current;

  if (path.endsWith(".alphatex")) {
    docManager.detachAttachmentsFor((r) =>
      (r.entityType === "tab" && r.entityId === path) ||
      ((r.entityType === "tab-section" || r.entityType === "tab-track") && r.entityId.startsWith(path + "#"))
    );
  } else if (path.endsWith(".kbjson") && rootHandle) {
    try {
      const repo = createDiagramRepository(rootHandle);
      const data = await repo.read(path);
      const ids = collectDiagramEntityIds(data);
      docManager.detachAttachmentsFor((r) =>
        (r.entityType === "node" || r.entityType === "connection" || r.entityType === "flow") && ids.has(r.entityId)
      );
    } catch (e) {
      reportError(e as Error, `Reading ${path} for attachment cleanup`);
    }
  } else if (path.endsWith(".md")) {
    docManager.detachAttachmentsFor((r) => r.docPath === path);
  }

  if (diagramBridgeRef.current) {
    diagramBridgeRef.current.handleDeleteFile(path, event);
    if (path.endsWith(".md") && fileExplorer.dirHandleRef.current) {
      void linkManager.removeDocumentFromIndex(fileExplorer.dirHandleRef.current, path).catch(
        (e) => reportError(e, `Updating link index after deleting ${path}`)
      );
    }
    searchManager.removePath(path);
  } else {
    setShellConfirmAction({ type: "delete-file", path, x: event.clientX, y: event.clientY });
  }
}, [fileExplorer.dirHandleRef, linkManager, reportError, searchManager, docManager]);
```

- [ ] **Step 16.4: Run tests**

Run: `npx vitest run src/app/knowledge_base/knowledgeBase.test.tsx`
Expected: PASS.

- [ ] **Step 16.5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(attachments): T16 — handleDeleteFileWithLinks branches by extension and detaches matching rows

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 17: `Features.md` and `test-cases/*.md` sync

**Files:**
- Modify: `Features.md`
- Modify: `test-cases/03-diagram.md`
- Modify: `test-cases/04-document.md`
- Modify: `test-cases/11-tabs.md`

- [ ] **Step 17.1: Update `Features.md`**

Add a new subsection (e.g. §4.x or §11.x — pick the closest existing section to "attachments") describing:
- Workspace-scoped attachment-link store at `<vault>/.kb/attachment-links.json`.
- Lazy migration on first diagram load.
- Cleanup on in-flight diagram delete, tab `remove-track`, file-tree delete.
- Diagram-undo restores diagram-scope subset only.

Update existing bullets that referenced the old per-diagram `documents` field.

- [ ] **Step 17.2: Add cases to `test-cases/03-diagram.md`**

Append (numbering follows next-free):
- `DIAG-3.x-XX: deleting a node detaches matching attachment rows`
- `DIAG-3.x-XX: deleting a node that cascades to a connection detaches both rows`
- `DIAG-3.x-XX: confirming a broken-flow cascade detaches flow rows for the removed flows`
- `DIAG-3.x-XX: deleting a layer cascades to nodes and detaches their rows`
- `DIAG-3.x-XX: deleting a flow directly detaches flow rows`
- `DIAG-3.x-XX: .kbjson file delete reads the diagram, extracts ids, detaches matching rows`
- `DIAG-3.x-XX: .kbjson file delete with read failure proceeds with unlink, logs error, no detach`
- `DIAG-3.x-XX: diagram-undo only restores rows whose entityId belongs to this diagram`

- [ ] **Step 17.3: Add cases to `test-cases/04-document.md`**

- `DOC-4.x-XX: docManager.rows is the canonical store; documents is a memoized projection`
- `DOC-4.x-XX: withBatch coalesces multi-attach into one flush`
- `DOC-4.x-XX: detachAttachmentsFor returns count and is idempotent`
- `DOC-4.x-XX: lazy migration folds a diagram's documents[] into rows on first load`
- `DOC-4.x-XX: lazy migration writes the diagram with documents: []`
- `DOC-4.x-XX: lazy migration is idempotent — re-loading a migrated diagram is a no-op`
- `DOC-4.x-XX: .md file-tree delete removes all rows where docPath === path`

- [ ] **Step 17.4: Add cases to `test-cases/11-tabs.md`**

- `TAB-11.x-XX: tab remove-track detaches tab-track rows for the removed track`
- `TAB-11.x-XX: tab remove-track with absent sidecar performs no detach (engine still splices)`
- `TAB-11.x-XX: .alphatex file-tree delete detaches tab/tab-section/tab-track rows for that file`

- [ ] **Step 17.5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
docs(attachments): T17 — Features.md + test-cases sync

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 18: Final verification + handoff doc update

**Files:**
- Modify: `docs/superpowers/handoffs/2026-05-03-guitar-tabs.md` (flip parked-item #11 to closed; update Last updated; remove stale TAB-008b "in flight" line)

- [ ] **Step 18.1: Run full verification**

```bash
npx tsc --noEmit && npm run test:run && npm run lint
```
Expected:
- `tsc` clean
- `npm run test:run` all green
- `npm run lint` 0 errors

If any failure: diagnose, fix, re-run. Do not bypass.

- [ ] **Step 18.2: Update handoff doc**

In `docs/superpowers/handoffs/2026-05-03-guitar-tabs.md`:
- Bump `Last updated:` line.
- Replace parked item #11 entry with: `~~Audit diagram flow rename/delete attachment integrity~~ — _Closed by document-meta-persistence refactor (PR #X)_: workspace-scoped attachment-link store at `<vault>/.kb/attachment-links.json`; orphan cleanup wired into useDeletion (cascade-aware), TabView remove-track, and file-tree delete for `.alphatex` / `.kbjson` / `.md`.`
- Add a new follow-up item: `**Vault-wide draft-orphan reaper** — accepted limitation in document-meta-persistence (D8). A future ticket can add a "Clean up orphan attachments" command that walks every `.kbjson` to build the canonical entity-id set.`
- Add a new follow-up item: `**`type` entity extinction/revival** — soft orphan from node-type extinction; out of scope of document-meta-persistence. Revisit when real complaints surface.`

- [ ] **Step 18.3: Commit handoff update**

```bash
git add docs/superpowers/handoffs/2026-05-03-guitar-tabs.md
git commit -m "$(cat <<'EOF'
docs(handoffs): T18 — close parked-item #11 via document-meta-persistence; add D8 + type-entity follow-ups

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 18.4: Push branch + open PR**

```bash
git push -u origin plan/document-meta-persistence
gh pr create --title "DocumentMeta persistence refactor + cross-entity attachment cleanup" --body "$(cat <<'EOF'
## Summary

Moves DocumentMeta out of per-diagram JSON into a workspace-scoped flat-relations store at `<vault>/.kb/attachment-links.json`, with lazy migration on first diagram load. Implements the cross-entity orphan attachment cleanup that this refactor unblocks (in-flight diagram delete, tab `remove-track`, file-tree delete of `.alphatex` / `.kbjson` / `.md`).

Closes Guitar-Tabs handoff parked-item #11.

## Architecture

- **Domain:** `domain/attachmentLinks.ts` — `AttachmentLink` row type + pure helpers (`addRow`, `removeRow`, `removeMatchingRows`, `replaceSubset`, `migrateRows`).
- **Infrastructure:** `infrastructure/attachmentLinksRepo.ts` — FSA-backed CRUD; missing file → `[]`; malformed → backup + `[]`; wrong shape → `FileSystemError`.
- **Hook:** `useDocuments` (file path unchanged for grep continuity) rebuilt around `rows: AttachmentLink[]`. Public surface preserved: `documents` is now a memoized `DocumentMeta[]` projection grouped by `docPath`. New: `withBatch`, `detachAttachmentsFor`.
- **Persistence:** `KnowledgeBaseInner` performs boot read of `.kb/attachment-links.json` and wires `onFlush` to write on every mutation. `bootLoaded` gate prevents the empty-default mount-effect from clobbering disk before the read finishes.
- **Migration:** `useFileActions` diagram-load path detects legacy `data.documents`, folds into rows, rewrites the diagram with `documents: []`. Idempotent.
- **History:** `useDiagramHistoryStore` snapshot stores only this diagram's `(entityType, entityId)` subset. Undo uses `replaceSubset` to swap that subset; tab/workspace rows untouched.
- **Cleanup:** `useDeletion` accepts `detachAttachmentsFor` + `withBatch`; runs cleanup inside a single batch alongside state mutations. Flow-direct cleanup goes through the same path (the old `useDiagramController:321` wrapper is removed). `TabView.handleRemoveTrack` calls `detachAttachmentsFor` before `propertiesApply`. `handleDeleteFileWithLinks` branches on extension; `.kbjson` reads the file before unlink to extract entity ids.

## Documents

- Design spec: `docs/superpowers/specs/2026-05-04-document-meta-persistence-design.md`
- Plan: `docs/superpowers/plans/2026-05-04-document-meta-persistence.md`
- Features.md and test-cases/03/04/11 updated in same change set.

## Test plan

- [x] `npm run test:run` — all green
- [x] `npx tsc --noEmit` — clean
- [x] `npm run lint` — 0 errors
- [ ] Manual: open an existing vault with embedded `documents` → first diagram open migrates silently; `.kb/attachment-links.json` appears; diagram is rewritten with `documents: []`.
- [ ] Manual: attach a doc to a node, delete the node → row disappears from `.kb/attachment-links.json`.
- [ ] Manual: attach a doc to a tab-track, remove the track → row disappears.
- [ ] Manual: attach a doc to a node and to a tab-track from a tab pane; delete the diagram file via file tree → both diagram-scope and tab-scope rows for that file are removed.
- [ ] Manual: diagram-undo of a node-attach restores the row; tab attachments to a different file remain untouched.

## Out of scope (future tickets)

- Vault-wide draft-orphan reaper (D8 in spec).
- `type` entity extinction/revival cleanup.
- Workspace-level attach/detach undo history.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review checklist (run after writing this plan)

This list mirrors the brainstorming-skill's spec self-review. All issues caught here have been fixed inline.

1. **Spec coverage:**
   - D1 (flat rows) → T1, T2 ✅
   - D2 (workspace-scoped persistence) → T4, T9 ✅
   - D3 (lazy migration) → T10 ✅
   - D4 (subset snapshot) → T11 ✅
   - D5 (batch + immediate flush) → T7, T8 ✅
   - D6 (detach-before-remove ordering) → T13, T15, T16 ✅
   - D7 (sole-source after migration) → T12 (drop `onLoadDocuments`) ✅
   - D8 (draft-orphan accepted) → covered in spec, no implementation task; mentioned in Features.md and handoff follow-ups (T17, T18) ✅
   - Cleanup primitive (`detachAttachmentsFor`) → T8 ✅
   - `useDeletion` integration → T13 ✅
   - Drop `useDiagramController:321` wrapper → T14 ✅
   - TabView `remove-track` → T15 ✅
   - `handleDeleteFileWithLinks` branches → T16 ✅
   - `Features.md` + test-cases sync → T17 ✅
   - Final verification + handoff update → T18 ✅

2. **Placeholder scan:** No "TBD" / "fill in details" / unfilled steps. T13 step 13.1 has a partial test sketch with comments — engineer fills in the wiring using the existing `useDeletion.test.ts` if present, otherwise creates the harness following `useDeletion.ts`'s ref-driven shape. T16 step 16.2 lists test scenarios with seed data; engineer fills in the harness using existing `knowledgeBase.test.tsx` patterns.

3. **Type consistency:**
   - `AttachmentLink` field names (`docPath`, `entityType`, `entityId`) are consistent across all tasks. ✅
   - `EntityType` values match `DocumentMeta.attachedTo[].type` union. ✅
   - `withBatch<T>` signature consistent across T7, T8, T13, T15. ✅
   - `detachAttachmentsFor(matcher)` signature consistent across T8, T13, T14, T15, T16. ✅

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-04-document-meta-persistence.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
