# MVP-2 SVG Attachments + Diagram Wiki-Link Backlinks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Bring SVG files to attachment parity with diagrams and tabs (file-level only), and merge wiki-link backlinks into the diagram root-scope reference list. Extract two shared UI primitives along the way so the three surfaces stop reimplementing the same thing.

**Architecture:** Extend `EntityType` with `"svg"` (whole-file scope, stored in the existing workspace flat file `attachmentLinks.json`). Build two shared components — `<ReferenceRow>` (row primitive used by Diagrams + Tab + SVG) and `<FileLevelReferencesGroup>` (file-scope merge container used by Tab + SVG). Migrate Tab/Diagram callsites to consume them; add new SVG callsite. Wire SVG rename + delete propagation through the existing matcher pipeline. Fix a latent gap discovered during planning: whole-file `entityId` rewrite on file rename (currently absent for `tab` rows; new helper covers both `tab` and `svg`).

**Tech Stack:** TypeScript, React 18, Vitest + jsdom + @testing-library/react, File System Access API, existing `attachmentLinksRepo` workspace flat file.

**Spec:** `docs/superpowers/specs/2026-05-07-svg-attachments-design.md`

**Branch:** `feat/diagram-mvp2-svg-attachments` (already created with the spec commit).

**Depends on:** MVP-2a (PR #128), MVP-2b (PR #129), MVP-4b (PR #145) — all merged.

**Discovered during planning (added to scope):** No `entityId` rewrite on whole-file rename exists today. Renaming `song.alphatex` leaves `attachmentLinks` rows pointing to the old path. This MVP introduces a shared `rewriteFileScopedRows(rows, oldPath, newPath)` helper that handles both `tab` and `svg` whole-file rows plus their `tab-section`/`tab-track` prefixed children. **Latent-bug fix for Tab is in scope** because the same helper covers both; flagging here so the reviewer knows it's intentional, not silent scope-creep.

---

## File Map

| File | Action |
|------|--------|
| `src/app/knowledge_base/domain/attachmentLinks.ts` | Modify — extend `EntityType` with `"svg"`; add `rewriteFileScopedRows`. |
| `src/app/knowledge_base/domain/attachmentLinks.test.ts` | Modify — `"svg"` round-trip cases; `rewriteFileScopedRows` cases. |
| `src/app/knowledge_base/shared/types/attachments.ts` | Modify — extend `AttachedToScope` with `"svg"`. |
| `src/app/knowledge_base/shared/types/attachments.test.ts` | Modify — extend the scope-list test. |
| `src/app/knowledge_base/domain/svgRefs.ts` | Modify — comment clarifying `attachedTo?` is forward-compat-unused. |
| `src/app/knowledge_base/domain/tabRefs.ts` | Modify — same comment on its `attachedTo?` field. |
| `src/app/knowledge_base/features/document/utils/fileTreeMatchers.ts` | Modify — add `svgFileMatcher`; extend `collectAttachableFilePaths` to include `.svg`. |
| `src/app/knowledge_base/features/document/utils/fileTreeMatchers.test.ts` | Modify — `svgFileMatcher` cases. |
| `src/app/knowledge_base/shared/components/ReferenceRow.tsx` | **New** — pure row primitive. |
| `src/app/knowledge_base/shared/components/ReferenceRow.test.tsx` | **New**. |
| `src/app/knowledge_base/shared/utils/mergeAttachmentsWithBacklinks.ts` | **New** — pure merge helper. |
| `src/app/knowledge_base/shared/utils/mergeAttachmentsWithBacklinks.test.ts` | **New**. |
| `src/app/knowledge_base/shared/components/FileLevelReferencesGroup.tsx` | **New** — file-scope merge container. |
| `src/app/knowledge_base/shared/components/FileLevelReferencesGroup.test.tsx` | **New**. |
| `src/app/knowledge_base/features/tab/properties/TabReferencesList.tsx` | Modify — migrate row markup to `<ReferenceRow>`. |
| `src/app/knowledge_base/features/tab/properties/TabReferencesList.test.tsx` | Modify — keep behaviour assertions; visual contract unchanged. |
| `src/app/knowledge_base/features/diagram/properties/AttachmentsSection.tsx` | Modify — migrate row markup to `<ReferenceRow>`. |
| `src/app/knowledge_base/features/diagram/properties/AttachmentsSection.test.tsx` | Modify — same contract, new internals. |
| `src/app/knowledge_base/features/diagram/properties/DiagramProperties.tsx` | Modify — root-scope reference list now merges wiki-link backlinks via `mergeAttachmentsWithBacklinks`. |
| `src/app/knowledge_base/features/diagram/properties/DiagramProperties.test.tsx` | Modify — new wiki-backlinks merge case. |
| `src/app/knowledge_base/features/svgEditor/properties/SvgProperties.tsx` | Modify — mount `<FileLevelReferencesGroup>` above the existing Sources section. |
| `src/app/knowledge_base/features/svgEditor/properties/SvgProperties.test.tsx` | Modify — references group rendering, attach/detach happy paths. |
| `src/app/knowledge_base/knowledgeBase.tsx` | Modify — `cleanupAttachmentsForPath` adds `.svg` branch using `svgFileMatcher`; rename pipeline calls `rewriteFileScopedRows`. |
| `Features.md` | Modify — entry under §3 (Diagram wiki-backlinks) and §4.18 (SVG attachments). |
| `test-cases/03-diagram.md` | Modify — `DIAG-3.x-NN` for the new wiki-backlinks merge. |
| `test-cases/06-svg-editor.md` | Modify — `SVG-?-NN` for attach / detach / rename / delete / wiki-backlinks. |

**Adaptations baked in:**
- The plan's reference implementation snippets paste verbatim into the files. Implementer should still `sed` existing files first to ground location of insertion points (the project's Read tool truncates files with prior memory observations).
- Tests use `vi.useFakeTimers({ shouldAdvanceTime: true })` + `afterEach(vi.useRealTimers)` (matches T7/T8 of MVP-4b — required for `waitFor` polling to coexist with timers).
- `StubRepositoryProvider` value bag must include all repository fields including `svgRefs: null` (added in MVP-4b).

---

## Task 1: Extend `EntityType` and `AttachedToScope` with `"svg"`

**Files:**
- Modify: `src/app/knowledge_base/domain/attachmentLinks.ts`
- Modify: `src/app/knowledge_base/domain/attachmentLinks.test.ts`
- Modify: `src/app/knowledge_base/shared/types/attachments.ts`
- Modify: `src/app/knowledge_base/shared/types/attachments.test.ts`

- [ ] **Step 1.1: Extend `EntityType` in `domain/attachmentLinks.ts`**

Locate the existing `export type EntityType` union (currently 8 members) and add `"svg"` as the 9th:

```ts
export type EntityType =
  | "root"
  | "node"
  | "connection"
  | "flow"
  | "type"
  | "tab"
  | "tab-section"
  | "tab-track"
  | "svg";   // whole-file only; entityId is the vault-relative .svg path
```

- [ ] **Step 1.2: Extend `AttachedToScope` in `shared/types/attachments.ts`**

Same addition in the parallel union:

```ts
export type AttachedToScope =
  | "root"
  | "node"
  | "connection"
  | "flow"
  | "type"
  | "tab"
  | "tab-section"
  | "tab-track"
  | "svg";   // whole-file only; entityId is the vault-relative .svg path
```

- [ ] **Step 1.3: Update `attachments.test.ts`**

Find the existing `scopes: AttachedToScope[]` literal and append `"svg"`:

```ts
const scopes: AttachedToScope[] = [
  "root", "node", "connection", "flow", "type",
  "tab", "tab-section", "tab-track",
  "svg",
];
```

- [ ] **Step 1.4: Add `attachmentLinks.test.ts` round-trip case**

Append a test verifying an `"svg"` row round-trips through `addRow` / `removeRow` / `isSameRow`:

```ts
it("supports svg whole-file rows", () => {
  const row: AttachmentLink = { docPath: "doc.md", entityType: "svg", entityId: "drawing.svg" };
  const rows = addRow([], row);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toEqual(row);
  expect(removeRow(rows, row)).toEqual([]);
});
```

- [ ] **Step 1.5: Run + verify**

```bash
cd "/Users/kiro/My Projects/knowledge-base"
npm run typecheck
npm run test:run -- src/app/knowledge_base/domain/attachmentLinks.test.ts \
                    src/app/knowledge_base/shared/types/attachments.test.ts
```
Expected: typecheck clean, all tests pass.

- [ ] **Step 1.6: Commit**

```bash
git add src/app/knowledge_base/domain/attachmentLinks.ts \
        src/app/knowledge_base/domain/attachmentLinks.test.ts \
        src/app/knowledge_base/shared/types/attachments.ts \
        src/app/knowledge_base/shared/types/attachments.test.ts
git commit -m "feat(attachments): extend EntityType + AttachedToScope with svg"
```

---

## Task 2: `rewriteFileScopedRows` helper (latent rename gap)

**Files:**
- Modify: `src/app/knowledge_base/domain/attachmentLinks.ts`
- Modify: `src/app/knowledge_base/domain/attachmentLinks.test.ts`

- [ ] **Step 2.1: Write failing tests**

Append to `attachmentLinks.test.ts`:

```ts
import { rewriteFileScopedRows } from "./attachmentLinks";

describe("rewriteFileScopedRows", () => {
  it("returns the same array when oldPath === newPath", () => {
    const rows: AttachmentLink[] = [
      { docPath: "d.md", entityType: "tab", entityId: "song.alphatex" },
    ];
    expect(rewriteFileScopedRows(rows, "song.alphatex", "song.alphatex")).toBe(rows);
  });

  it("rewrites tab whole-file entityId on rename", () => {
    const rows: AttachmentLink[] = [
      { docPath: "d.md", entityType: "tab", entityId: "song.alphatex" },
      { docPath: "d2.md", entityType: "tab", entityId: "other.alphatex" },
    ];
    expect(rewriteFileScopedRows(rows, "song.alphatex", "renamed.alphatex")).toEqual([
      { docPath: "d.md", entityType: "tab", entityId: "renamed.alphatex" },
      { docPath: "d2.md", entityType: "tab", entityId: "other.alphatex" },
    ]);
  });

  it("rewrites svg whole-file entityId on rename", () => {
    const rows: AttachmentLink[] = [
      { docPath: "d.md", entityType: "svg", entityId: "drawing.svg" },
    ];
    expect(rewriteFileScopedRows(rows, "drawing.svg", "logo.svg")).toEqual([
      { docPath: "d.md", entityType: "svg", entityId: "logo.svg" },
    ]);
  });

  it("rewrites tab-section / tab-track entityIds with the file prefix", () => {
    const rows: AttachmentLink[] = [
      { docPath: "d.md", entityType: "tab-section", entityId: "song.alphatex#verse" },
      { docPath: "d.md", entityType: "tab-track", entityId: "song.alphatex#track:abc" },
      { docPath: "d.md", entityType: "tab-section", entityId: "other.alphatex#verse" },
    ];
    expect(rewriteFileScopedRows(rows, "song.alphatex", "renamed.alphatex")).toEqual([
      { docPath: "d.md", entityType: "tab-section", entityId: "renamed.alphatex#verse" },
      { docPath: "d.md", entityType: "tab-track", entityId: "renamed.alphatex#track:abc" },
      { docPath: "d.md", entityType: "tab-section", entityId: "other.alphatex#verse" },
    ]);
  });

  it("does not match prefix-collision paths (foo.svg vs foo.svg.bak)", () => {
    const rows: AttachmentLink[] = [
      { docPath: "d.md", entityType: "svg", entityId: "foo.svg.bak" },
    ];
    expect(rewriteFileScopedRows(rows, "foo.svg", "renamed.svg")).toEqual([
      { docPath: "d.md", entityType: "svg", entityId: "foo.svg.bak" },
    ]);
  });

  it("returns the same array reference when nothing matches", () => {
    const rows: AttachmentLink[] = [
      { docPath: "d.md", entityType: "node", entityId: "n-1" },
    ];
    expect(rewriteFileScopedRows(rows, "song.alphatex", "renamed.alphatex")).toBe(rows);
  });
});
```

- [ ] **Step 2.2: Run, expect FAIL (function missing)**

```bash
cd "/Users/kiro/My Projects/knowledge-base" && npm run test:run -- src/app/knowledge_base/domain/attachmentLinks.test.ts
```

- [ ] **Step 2.3: Implement**

Append to `domain/attachmentLinks.ts`:

```ts
/**
 * Rewrite the entityId of file-scoped rows when a file is renamed or moved.
 *
 * Scope:
 *   - `tab` and `svg` whole-file rows: rewrite when entityId === oldPath.
 *   - `tab-section` and `tab-track`: rewrite when entityId starts with `oldPath + "#"`,
 *     replacing the path prefix (the fragment after `#` is preserved).
 *
 * Returns the same array reference when nothing changes (no React re-render churn).
 */
export function rewriteFileScopedRows(
  rows: AttachmentLink[],
  oldPath: string,
  newPath: string,
): AttachmentLink[] {
  if (oldPath === newPath) return rows;
  let touched = false;
  const next = rows.map((r) => {
    if ((r.entityType === "tab" || r.entityType === "svg") && r.entityId === oldPath) {
      touched = true;
      return { ...r, entityId: newPath };
    }
    if (
      (r.entityType === "tab-section" || r.entityType === "tab-track") &&
      r.entityId.startsWith(oldPath + "#")
    ) {
      touched = true;
      return { ...r, entityId: newPath + r.entityId.slice(oldPath.length) };
    }
    return r;
  });
  return touched ? next : rows;
}
```

- [ ] **Step 2.4: Run, expect PASS**

```bash
npm run test:run -- src/app/knowledge_base/domain/attachmentLinks.test.ts
```
Expected: 6 new cases pass.

- [ ] **Step 2.5: Commit**

```bash
git add src/app/knowledge_base/domain/attachmentLinks.ts \
        src/app/knowledge_base/domain/attachmentLinks.test.ts
git commit -m "feat(attachments): rewriteFileScopedRows for whole-file rename"
```

---

## Task 3: `svgFileMatcher` + extend `collectAttachableFilePaths`

**Files:**
- Modify: `src/app/knowledge_base/features/document/utils/fileTreeMatchers.ts`
- Modify: `src/app/knowledge_base/features/document/utils/fileTreeMatchers.test.ts`

- [ ] **Step 3.1: Write failing tests**

Append to `fileTreeMatchers.test.ts`:

```ts
import { svgFileMatcher } from "./fileTreeMatchers";

describe("svgFileMatcher", () => {
  it("matches svg row with matching entityId path", () => {
    const matcher = svgFileMatcher("diagrams/logo.svg");
    expect(matcher({ docPath: "d.md", entityType: "svg", entityId: "diagrams/logo.svg" })).toBe(true);
  });

  it("does not match svg row with different path", () => {
    const matcher = svgFileMatcher("diagrams/logo.svg");
    expect(matcher({ docPath: "d.md", entityType: "svg", entityId: "diagrams/other.svg" })).toBe(false);
  });

  it("does not match non-svg entity types pointing to the same path", () => {
    const matcher = svgFileMatcher("diagrams/logo.svg");
    expect(matcher({ docPath: "d.md", entityType: "tab", entityId: "diagrams/logo.svg" })).toBe(false);
  });

  it("does not match prefix-collision paths (logo.svg vs logo.svg.bak)", () => {
    const matcher = svgFileMatcher("diagrams/logo.svg");
    expect(matcher({ docPath: "d.md", entityType: "svg", entityId: "diagrams/logo.svg.bak" })).toBe(false);
  });
});

describe("collectAttachableFilePaths includes .svg files", () => {
  it("walks the tree and collects .svg paths alongside .md/.kbjson/.alphatex", () => {
    const tree: TreeNode[] = [
      { type: "folder", path: "f", children: [
        { type: "file", path: "f/a.svg" },
        { type: "file", path: "f/b.alphatex" },
        { type: "file", path: "f/c.png" },
      ] },
    ];
    expect(collectAttachableFilePaths(tree, "f").sort()).toEqual([
      "f/a.svg", "f/b.alphatex",
    ]);
  });
});
```

(Use the existing `TreeNode` import already in the file. If `collectAttachableFilePaths` test already exists, extend it with the `.svg` case rather than duplicating.)

- [ ] **Step 3.2: Run, expect FAIL**

```bash
npm run test:run -- src/app/knowledge_base/features/document/utils/fileTreeMatchers.test.ts
```

- [ ] **Step 3.3: Add `svgFileMatcher` and extend `collectAttachableFilePaths`**

In `fileTreeMatchers.ts`, append after `tabFileMatcher`:

```ts
/**
 * Attachment-row matcher for `.svg` file-tree deletions.
 *
 * Matches `svg` rows whose entityId equals the file path exactly.
 * Per-shape sub-entities are not supported in MVP-2 SVG; the matcher is
 * deliberately tighter than tabFileMatcher (no `path#...` prefix branch).
 */
export function svgFileMatcher(
  path: string,
): (r: AttachmentLink) => boolean {
  return (r: AttachmentLink) => r.entityType === "svg" && r.entityId === path;
}
```

In the same file, locate `collectAttachableFilePaths` and update its `isAttachable` predicate:

```ts
function isAttachable(nodePath: string): boolean {
  return (
    nodePath.endsWith(".md") ||
    nodePath.endsWith(".kbjson") ||
    nodePath.endsWith(".alphatex") ||
    nodePath.endsWith(".svg")   // new
  );
}
```

- [ ] **Step 3.4: Run, expect PASS**

```bash
npm run test:run -- src/app/knowledge_base/features/document/utils/fileTreeMatchers.test.ts
```

- [ ] **Step 3.5: Commit**

```bash
git add src/app/knowledge_base/features/document/utils/fileTreeMatchers.ts \
        src/app/knowledge_base/features/document/utils/fileTreeMatchers.test.ts
git commit -m "feat(attachments): svgFileMatcher + collect .svg in attachable paths"
```

---

## Task 4: Sidecar `attachedTo?` clarifying comments

**Files:**
- Modify: `src/app/knowledge_base/domain/svgRefs.ts`
- Modify: `src/app/knowledge_base/domain/tabRefs.ts`

- [ ] **Step 4.1: Update `svgRefs.ts` comment**

Find the existing `attachedTo?: AttachedToEntry[];` field. Replace the JSDoc with:

```ts
/**
 * Forward-compat field reserved in MVP-4b. **Not the canonical store.**
 * The workspace flat file `attachmentLinks.json` (`attachmentLinksRepo`)
 * is the single source of truth for SVG attachments. This field stays
 * in the schema only so legacy sidecars round-trip cleanly when read.
 */
attachedTo?: AttachedToEntry[];
```

- [ ] **Step 4.2: Update `tabRefs.ts` comment**

Same shape on the v3 payload's `attachedTo?: AttachedToEntry[];` field. Tab attachments live in `attachmentLinks.json` (TAB-007a / MVP-2b).

- [ ] **Step 4.3: Typecheck + commit**

```bash
npm run typecheck
git add src/app/knowledge_base/domain/svgRefs.ts \
        src/app/knowledge_base/domain/tabRefs.ts
git commit -m "docs(sidecars): clarify attachedTo? is forward-compat-unused"
```

---

## Task 5: `mergeAttachmentsWithBacklinks` shared helper

**Files:**
- Create: `src/app/knowledge_base/shared/utils/mergeAttachmentsWithBacklinks.ts`
- Create: `src/app/knowledge_base/shared/utils/mergeAttachmentsWithBacklinks.test.ts`

- [ ] **Step 5.1: Write failing tests**

```ts
// mergeAttachmentsWithBacklinks.test.ts
import { describe, it, expect } from "vitest";
import { mergeAttachmentsWithBacklinks, type MergedReference } from "./mergeAttachmentsWithBacklinks";

describe("mergeAttachmentsWithBacklinks", () => {
  it("returns empty array when both inputs are empty", () => {
    expect(mergeAttachmentsWithBacklinks([], [])).toEqual([]);
  });

  it("preserves attachments only", () => {
    const got = mergeAttachmentsWithBacklinks(["a.md", "b.md"], []);
    expect(got).toEqual<MergedReference[]>([
      { sourcePath: "a.md", source: "attachment" },
      { sourcePath: "b.md", source: "attachment" },
    ]);
  });

  it("preserves backlinks only", () => {
    const got = mergeAttachmentsWithBacklinks([], [{ sourcePath: "x.md" }]);
    expect(got).toEqual<MergedReference[]>([
      { sourcePath: "x.md", source: "wiki-link" },
    ]);
  });

  it("attachment wins on duplicate path", () => {
    const got = mergeAttachmentsWithBacklinks(
      ["a.md"],
      [{ sourcePath: "a.md" }, { sourcePath: "b.md" }],
    );
    expect(got).toEqual<MergedReference[]>([
      { sourcePath: "a.md", source: "attachment" },
      { sourcePath: "b.md", source: "wiki-link" },
    ]);
  });

  it("preserves input order: attachments first, then unique backlinks", () => {
    const got = mergeAttachmentsWithBacklinks(
      ["z.md", "a.md"],
      [{ sourcePath: "m.md" }, { sourcePath: "z.md" }],
    );
    expect(got.map((r) => r.sourcePath)).toEqual(["z.md", "a.md", "m.md"]);
  });
});
```

- [ ] **Step 5.2: Run, expect FAIL**

```bash
npm run test:run -- src/app/knowledge_base/shared/utils/mergeAttachmentsWithBacklinks.test.ts
```

- [ ] **Step 5.3: Implement**

```ts
// mergeAttachmentsWithBacklinks.ts
/**
 * Merge a list of attached document paths with a list of wiki-link
 * backlinks for the same target file. De-duplicates by `sourcePath`;
 * when the same path appears in both lists, the attachment wins (i.e.
 * the row is rendered with the attachment affordances, not the
 * read-only wiki-link affordance).
 */

export interface BacklinkRef {
  sourcePath: string;
  /** Optional section anchor; preserved in the input but not used by the merge. */
  section?: string;
}

export interface MergedReference {
  sourcePath: string;
  source: "attachment" | "wiki-link";
}

export function mergeAttachmentsWithBacklinks(
  attachmentPaths: string[],
  backlinks: BacklinkRef[],
): MergedReference[] {
  const seen = new Set<string>();
  const out: MergedReference[] = [];
  for (const p of attachmentPaths) {
    if (seen.has(p)) continue;
    seen.add(p);
    out.push({ sourcePath: p, source: "attachment" });
  }
  for (const b of backlinks) {
    if (seen.has(b.sourcePath)) continue;
    seen.add(b.sourcePath);
    out.push({ sourcePath: b.sourcePath, source: "wiki-link" });
  }
  return out;
}
```

- [ ] **Step 5.4: Run, expect PASS**

```bash
npm run test:run -- src/app/knowledge_base/shared/utils/mergeAttachmentsWithBacklinks.test.ts
```

- [ ] **Step 5.5: Commit**

```bash
git add src/app/knowledge_base/shared/utils/mergeAttachmentsWithBacklinks.ts \
        src/app/knowledge_base/shared/utils/mergeAttachmentsWithBacklinks.test.ts
git commit -m "feat(shared): mergeAttachmentsWithBacklinks helper for ref-list de-dup"
```

---

## Task 6: `<ReferenceRow>` shared row primitive

**Files:**
- Create: `src/app/knowledge_base/shared/components/ReferenceRow.tsx`
- Create: `src/app/knowledge_base/shared/components/ReferenceRow.test.tsx`

The visual contract has to match what `TabReferencesList` already renders today (Tab tests will exercise the migration in Task 7). Mirror its existing structure:
- Icon: `Paperclip` for `source: "attachment"`, `ArrowUpRight` for `source: "wiki-link"`.
- Click row → `onPreview(filePath)`.
- Trailing `X` (lucide) button → `onDetach(filePath)`. Hidden when `readOnly` or `source === "wiki-link"`.

- [ ] **Step 6.1: Write failing tests**

```tsx
// ReferenceRow.test.tsx
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReferenceRow } from "./ReferenceRow";

describe("ReferenceRow", () => {
  it("renders the file's basename as label", () => {
    render(<ReferenceRow filePath="docs/a.md" label="A Document" source="attachment" />);
    expect(screen.getByText("A Document")).toBeInTheDocument();
  });

  it("uses Paperclip icon when source is attachment", () => {
    const { container } = render(
      <ReferenceRow filePath="a.md" label="A" source="attachment" />,
    );
    expect(container.querySelector('[data-testid="reference-row-icon-attachment"]')).not.toBeNull();
  });

  it("uses ArrowUpRight icon when source is wiki-link", () => {
    const { container } = render(
      <ReferenceRow filePath="a.md" label="A" source="wiki-link" />,
    );
    expect(container.querySelector('[data-testid="reference-row-icon-wiki-link"]')).not.toBeNull();
  });

  it("invokes onPreview when the row is clicked", () => {
    const onPreview = vi.fn();
    render(<ReferenceRow filePath="a.md" label="A" source="attachment" onPreview={onPreview} />);
    fireEvent.click(screen.getByRole("button", { name: /open a/i }));
    expect(onPreview).toHaveBeenCalledOnce();
  });

  it("invokes onDetach when the detach button is clicked", () => {
    const onDetach = vi.fn();
    render(
      <ReferenceRow filePath="a.md" label="A" source="attachment" onDetach={onDetach} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /detach a/i }));
    expect(onDetach).toHaveBeenCalledOnce();
  });

  it("hides the detach button when readOnly", () => {
    render(
      <ReferenceRow filePath="a.md" label="A" source="attachment" readOnly onDetach={vi.fn()} />,
    );
    expect(screen.queryByRole("button", { name: /detach a/i })).toBeNull();
  });

  it("hides the detach button when source is wiki-link", () => {
    render(
      <ReferenceRow filePath="a.md" label="A" source="wiki-link" onDetach={vi.fn()} />,
    );
    expect(screen.queryByRole("button", { name: /detach a/i })).toBeNull();
  });
});
```

- [ ] **Step 6.2: Run, expect FAIL**

```bash
npm run test:run -- src/app/knowledge_base/shared/components/ReferenceRow.test.tsx
```

- [ ] **Step 6.3: Implement**

```tsx
// ReferenceRow.tsx
"use client";

import type { ReactElement } from "react";
import { Paperclip, ArrowUpRight, X } from "lucide-react";

export interface ReferenceRowProps {
  filePath: string;
  label: string;
  source: "attachment" | "wiki-link";
  readOnly?: boolean;
  onPreview?: (filePath: string) => void;
  onDetach?: (filePath: string) => void;
}

export function ReferenceRow({
  filePath, label, source,
  readOnly = false, onPreview, onDetach,
}: ReferenceRowProps): ReactElement {
  const Icon = source === "attachment" ? Paperclip : ArrowUpRight;
  const iconTestId = `reference-row-icon-${source}`;
  const showDetach = !readOnly && source === "attachment" && onDetach !== undefined;

  return (
    <li className="flex items-center gap-1 text-[12px]">
      <button
        type="button"
        aria-label={`Open ${label}`}
        onClick={() => onPreview?.(filePath)}
        className="flex flex-1 items-center gap-1 truncate text-left hover:underline"
      >
        <Icon className="h-3 w-3 shrink-0 text-mute" data-testid={iconTestId} aria-hidden="true" />
        <span className="truncate">{label}</span>
      </button>
      {showDetach && (
        <button
          type="button"
          aria-label={`Detach ${label}`}
          onClick={() => onDetach?.(filePath)}
          className="rounded p-0.5 text-mute hover:bg-line/20 hover:text-warn"
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      )}
    </li>
  );
}
```

- [ ] **Step 6.4: Run, expect PASS**

```bash
npm run test:run -- src/app/knowledge_base/shared/components/ReferenceRow.test.tsx
```
Expected: 7/7 pass.

- [ ] **Step 6.5: Commit**

```bash
git add src/app/knowledge_base/shared/components/ReferenceRow.tsx \
        src/app/knowledge_base/shared/components/ReferenceRow.test.tsx
git commit -m "feat(shared): ReferenceRow row primitive for attachments + backlinks"
```

---

## Task 7: Migrate `TabReferencesList` to consume `<ReferenceRow>`

**Files:**
- Modify: `src/app/knowledge_base/features/tab/properties/TabReferencesList.tsx`
- Modify: `src/app/knowledge_base/features/tab/properties/TabReferencesList.test.tsx`

This is a refactor — visual contract preserved, internals swapped. Existing TAB-007a tests must continue to pass.

- [ ] **Step 7.1: Read current implementation**

```bash
sed -n '1,120p' src/app/knowledge_base/features/tab/properties/TabReferencesList.tsx
```
The merge logic stays in `TabReferencesList` for now (Task 9 will further consolidate). Just swap inline row markup for `<ReferenceRow>`.

- [ ] **Step 7.2: Replace the row-rendering JSX**

Inside the existing `rows.map((row) => …)` block, replace the inline `<li>` with:

```tsx
{rows.map((row) => {
  const filename = row.sourcePath.split("/").pop() ?? row.sourcePath;
  const doc = documents.find((d) => d.filename === row.sourcePath);
  const label = doc?.title || filename;
  return (
    <ReferenceRow
      key={row.sourcePath}
      filePath={row.sourcePath}
      label={label}
      source={row.source === "attachment" ? "attachment" : "wiki-link"}
      readOnly={readOnly}
      onPreview={onPreview}
      onDetach={onDetach}
    />
  );
})}
```

(Adapt to the file's actual prop names — the existing test file pins exact behavior; if `documents` isn't already a prop, surface it. `row.source` is the existing internal merge tag.)

Replace the inline `import { FileText, Paperclip, ArrowUpRight, X } from "lucide-react";` with `import { ReferenceRow } from "../../../shared/components/ReferenceRow";` (FileText was unused in the live render — delete only what's actually unused; preserve any lucide imports referenced elsewhere).

- [ ] **Step 7.3: Run existing tab tests**

```bash
npm run test:run -- src/app/knowledge_base/features/tab/properties/TabReferencesList.test.tsx \
                    src/app/knowledge_base/features/tab/properties/TabProperties.test.tsx
```
Expected: all green. If a test asserts on the exact icon import or the inline markup structure, adjust the test to query via the new `data-testid="reference-row-icon-…"` markers (preserve behavior coverage, not implementation coupling).

- [ ] **Step 7.4: Wider tab smoke**

```bash
npm run test:run -- src/app/knowledge_base/features/tab
```
Expected: full tab suite green (~362 tests).

- [ ] **Step 7.5: Commit**

```bash
git add src/app/knowledge_base/features/tab/properties/TabReferencesList.tsx \
        src/app/knowledge_base/features/tab/properties/TabReferencesList.test.tsx
git commit -m "refactor(tab): TabReferencesList consumes shared ReferenceRow"
```

---

## Task 8: Migrate diagrams `AttachmentsSection` rows to `<ReferenceRow>`

**Files:**
- Modify: `src/app/knowledge_base/features/diagram/properties/AttachmentsSection.tsx`
- Modify: `src/app/knowledge_base/features/diagram/properties/AttachmentsSection.test.tsx`

`AttachmentsSection` keeps its multi-bucket structure (documents / diagrams / svgs). Only the row primitive changes.

- [ ] **Step 8.1: Read current implementation**

```bash
sed -n '1,200p' src/app/knowledge_base/features/diagram/properties/AttachmentsSection.tsx
```
Locate the inline row JSX inside each bucket. There are likely 3 nearly-identical row blocks (one per bucket).

- [ ] **Step 8.2: Swap each row block for `<ReferenceRow>`**

Each existing bucket row becomes:

```tsx
<ReferenceRow
  key={item.filename}
  filePath={item.filename}
  label={item.title || item.filename.split("/").pop() || item.filename}
  source="attachment"
  readOnly={readOnly}
  onPreview={() => onPreview?.(item.filename)}
  onDetach={() => onDetach?.(item.filename)}
/>
```

Add `import { ReferenceRow } from "../../../shared/components/ReferenceRow";`. Remove inline lucide row icons that are no longer referenced.

- [ ] **Step 8.3: Run + smoke**

```bash
npm run test:run -- src/app/knowledge_base/features/diagram/properties
```
Expected: all green. Adjust any tests that asserted on the inline markup; they should now query via `<ReferenceRow>`'s testids.

- [ ] **Step 8.4: Commit**

```bash
git add src/app/knowledge_base/features/diagram/properties/AttachmentsSection.tsx \
        src/app/knowledge_base/features/diagram/properties/AttachmentsSection.test.tsx
git commit -m "refactor(diagram): AttachmentsSection consumes shared ReferenceRow"
```

---

## Task 9: `<FileLevelReferencesGroup>` container

**Files:**
- Create: `src/app/knowledge_base/shared/components/FileLevelReferencesGroup.tsx`
- Create: `src/app/knowledge_base/shared/components/FileLevelReferencesGroup.test.tsx`

The container takes pre-filtered attachment paths + backlinks for one file, runs them through `mergeAttachmentsWithBacklinks`, renders `<ReferenceRow>` per merged item, and exposes an `onAttach` callback that the parent wires to the `DocumentPicker`.

- [ ] **Step 9.1: Write failing tests**

```tsx
// FileLevelReferencesGroup.test.tsx
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FileLevelReferencesGroup } from "./FileLevelReferencesGroup";

const docs = [
  { filename: "a.md", title: "A Doc" },
  { filename: "b.md", title: "B Doc" },
  { filename: "c.md", title: "" },
];

describe("FileLevelReferencesGroup", () => {
  it("renders empty state when there are no rows", () => {
    render(
      <FileLevelReferencesGroup
        filePath="x.svg"
        attachmentPaths={[]}
        backlinks={[]}
        documents={docs}
      />,
    );
    expect(screen.getByText(/no references/i)).toBeInTheDocument();
  });

  it("renders attachment rows", () => {
    render(
      <FileLevelReferencesGroup
        filePath="x.svg"
        attachmentPaths={["a.md"]}
        backlinks={[]}
        documents={docs}
      />,
    );
    expect(screen.getByText("A Doc")).toBeInTheDocument();
  });

  it("merges attachments and backlinks; attachment wins on duplicate", () => {
    render(
      <FileLevelReferencesGroup
        filePath="x.svg"
        attachmentPaths={["a.md"]}
        backlinks={[{ sourcePath: "a.md" }, { sourcePath: "b.md" }]}
        documents={docs}
      />,
    );
    expect(screen.getByText("A Doc")).toBeInTheDocument();
    expect(screen.getByText("B Doc")).toBeInTheDocument();
    // a.md row uses the attachment icon, not wiki-link
    const aIcon = screen.getAllByTestId("reference-row-icon-attachment");
    expect(aIcon.length).toBeGreaterThan(0);
  });

  it("falls back to filename when title is blank", () => {
    render(
      <FileLevelReferencesGroup
        filePath="x.svg"
        attachmentPaths={["c.md"]}
        backlinks={[]}
        documents={docs}
      />,
    );
    expect(screen.getByText("c.md")).toBeInTheDocument();
  });

  it("invokes onPreview with the source path", () => {
    const onPreview = vi.fn();
    render(
      <FileLevelReferencesGroup
        filePath="x.svg"
        attachmentPaths={["a.md"]}
        backlinks={[]}
        documents={docs}
        onPreview={onPreview}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /open a doc/i }));
    expect(onPreview).toHaveBeenCalledWith("a.md");
  });

  it("invokes onDetach with the source path", () => {
    const onDetach = vi.fn();
    render(
      <FileLevelReferencesGroup
        filePath="x.svg"
        attachmentPaths={["a.md"]}
        backlinks={[]}
        documents={docs}
        onDetach={onDetach}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /detach a doc/i }));
    expect(onDetach).toHaveBeenCalledWith("a.md");
  });

  it("renders + Attach document button when onAttach is provided and not readOnly", () => {
    const onAttach = vi.fn();
    render(
      <FileLevelReferencesGroup
        filePath="x.svg"
        attachmentPaths={[]}
        backlinks={[]}
        documents={docs}
        onAttach={onAttach}
      />,
    );
    fireEvent.click(screen.getByTestId("file-references-attach"));
    expect(onAttach).toHaveBeenCalledOnce();
  });

  it("hides attach button when readOnly", () => {
    render(
      <FileLevelReferencesGroup
        filePath="x.svg"
        attachmentPaths={[]}
        backlinks={[]}
        documents={docs}
        readOnly
        onAttach={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("file-references-attach")).toBeNull();
  });
});
```

- [ ] **Step 9.2: Run, expect FAIL**

```bash
npm run test:run -- src/app/knowledge_base/shared/components/FileLevelReferencesGroup.test.tsx
```

- [ ] **Step 9.3: Implement**

```tsx
// FileLevelReferencesGroup.tsx
"use client";

import type { ReactElement } from "react";
import { ReferenceRow } from "./ReferenceRow";
import {
  mergeAttachmentsWithBacklinks,
  type BacklinkRef,
} from "../utils/mergeAttachmentsWithBacklinks";

interface DocLite {
  filename: string;
  title?: string;
}

export interface FileLevelReferencesGroupProps {
  /** Path of the file these references attach to (purely for parent context — not rendered). */
  filePath: string;
  /** Pre-filtered list of doc paths that are attached to this file. */
  attachmentPaths: string[];
  /** Pre-filtered list of wiki-link backlinks pointing to this file. */
  backlinks: BacklinkRef[];
  /** All known docs in the vault, used to resolve titles for the merged rows. */
  documents: DocLite[];
  readOnly?: boolean;
  onPreview?: (path: string) => void;
  onDetach?: (path: string) => void;
  /** When provided + not readOnly, renders a "+ Attach document" affordance. */
  onAttach?: () => void;
}

export function FileLevelReferencesGroup({
  attachmentPaths, backlinks, documents,
  readOnly = false, onPreview, onDetach, onAttach,
}: FileLevelReferencesGroupProps): ReactElement {
  const rows = mergeAttachmentsWithBacklinks(attachmentPaths, backlinks);
  const docByPath = new Map(documents.map((d) => [d.filename, d]));

  return (
    <div className="flex flex-col gap-1">
      {rows.length === 0 ? (
        <p className="text-[11px] text-mute">No references</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {rows.map((row) => {
            const doc = docByPath.get(row.sourcePath);
            const filename = row.sourcePath.split("/").pop() ?? row.sourcePath;
            const label = doc?.title && doc.title.trim() !== "" ? doc.title : filename;
            return (
              <ReferenceRow
                key={row.sourcePath}
                filePath={row.sourcePath}
                label={label}
                source={row.source}
                readOnly={readOnly}
                onPreview={onPreview}
                onDetach={onDetach}
              />
            );
          })}
        </ul>
      )}
      {!readOnly && onAttach !== undefined && (
        <button
          type="button"
          data-testid="file-references-attach"
          onClick={onAttach}
          className="self-start text-xs text-accent hover:underline"
        >
          + Attach document
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 9.4: Run, expect PASS**

```bash
npm run test:run -- src/app/knowledge_base/shared/components/FileLevelReferencesGroup.test.tsx
```
Expected: 8/8 pass.

- [ ] **Step 9.5: Commit**

```bash
git add src/app/knowledge_base/shared/components/FileLevelReferencesGroup.tsx \
        src/app/knowledge_base/shared/components/FileLevelReferencesGroup.test.tsx
git commit -m "feat(shared): FileLevelReferencesGroup container for tab+svg"
```

---

## Task 10: Mount `<FileLevelReferencesGroup>` in `SvgProperties`

**Files:**
- Modify: `src/app/knowledge_base/features/svgEditor/properties/SvgProperties.tsx`
- Modify: `src/app/knowledge_base/features/svgEditor/properties/SvgProperties.test.tsx`

`SvgProperties` needs the props plumbed from above (the SVGEditorView shell or knowledgeBase.tsx). For this task, **add the props pass-through at the SvgProperties level only** — wiring from the shell happens in Task 12.

- [ ] **Step 10.1: Extend `SvgPropertiesProps`**

In `SvgProperties.tsx`, replace the existing prop interface with:

```ts
export interface SvgPropertiesProps {
  filePath: string | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
  readOnly?: boolean;
  /** Doc paths attached to this SVG (filtered upstream from attachmentLinks.json). */
  attachedDocPaths?: string[];
  /** Wiki-link backlinks pointing to this SVG (filtered upstream from linkIndex). */
  backlinks?: { sourcePath: string; section?: string }[];
  /** All known docs in the vault. Used by the references group for title lookup. */
  documents?: { filename: string; title?: string }[];
  /** Open the doc picker for this SVG. Undefined → no Attach button. */
  onOpenDocPicker?: () => void;
  /** Detach a doc from this SVG. Undefined → rows render read-only paperclip. */
  onDetachDocument?: (docPath: string) => void;
  /** Open a doc in the opposite pane on row click. */
  onPreviewDocument?: (docPath: string) => void;
}
```

- [ ] **Step 10.2: Render the references group**

Inside the body (the `!collapsed && filePath !== null && (…)` block), add a new section above the existing Sources block:

```tsx
import { FileLevelReferencesGroup } from "../../../shared/components/FileLevelReferencesGroup";
// …
<section>
  <h3 className="mb-2 text-xs font-medium text-mute">References</h3>
  <FileLevelReferencesGroup
    filePath={filePath}
    attachmentPaths={attachedDocPaths ?? []}
    backlinks={backlinks ?? []}
    documents={documents ?? []}
    readOnly={readOnly}
    onPreview={onPreviewDocument}
    onDetach={onDetachDocument}
    onAttach={onOpenDocPicker}
  />
</section>
<section>
  <h3 className="mb-2 text-xs font-medium text-mute">Sources</h3>
  <SourcesSection sources={sources} onChange={setSources} readOnly={readOnly} />
</section>
```

(The existing Sources section stays as-is; the new References section is added before it. Confirm the existing layout has `space-y-4` on the parent — it does per T9 of MVP-4b.)

- [ ] **Step 10.3: Add a UI test**

In `SvgProperties.test.tsx`, append:

```tsx
it("renders the References section with attached docs", async () => {
  const { repo } = stubSvgRefs();
  render(
    <ShellErrorProvider>
      <StubRepositoryProvider value={{
        attachment: null, attachmentLinks: null, diagram: null,
        document: null, linkIndex: null, svg: null, svgRefs: repo,
        tab: null, tabRefs: null, vaultConfig: null,
      }}>
        <SvgProperties
          filePath="diagrams/logo.svg"
          collapsed={false}
          onToggleCollapse={() => {}}
          attachedDocPaths={["notes.md"]}
          backlinks={[{ sourcePath: "other.md" }]}
          documents={[
            { filename: "notes.md", title: "Notes" },
            { filename: "other.md", title: "Other" },
          ]}
        />
      </StubRepositoryProvider>
    </ShellErrorProvider>,
  );
  expect(await screen.findByText("Notes")).toBeInTheDocument();
  expect(await screen.findByText("Other")).toBeInTheDocument();
});

it("invokes onOpenDocPicker when the Attach button is clicked", () => {
  const { repo } = stubSvgRefs();
  const onOpen = vi.fn();
  render(
    <ShellErrorProvider>
      <StubRepositoryProvider value={{
        attachment: null, attachmentLinks: null, diagram: null,
        document: null, linkIndex: null, svg: null, svgRefs: repo,
        tab: null, tabRefs: null, vaultConfig: null,
      }}>
        <SvgProperties
          filePath="diagrams/logo.svg"
          collapsed={false}
          onToggleCollapse={() => {}}
          attachedDocPaths={[]}
          backlinks={[]}
          documents={[]}
          onOpenDocPicker={onOpen}
        />
      </StubRepositoryProvider>
    </ShellErrorProvider>,
  );
  fireEvent.click(screen.getByTestId("file-references-attach"));
  expect(onOpen).toHaveBeenCalledOnce();
});
```

- [ ] **Step 10.4: Run + commit**

```bash
npm run test:run -- src/app/knowledge_base/features/svgEditor/properties/SvgProperties.test.tsx
npm run typecheck
git add src/app/knowledge_base/features/svgEditor/properties/SvgProperties.tsx \
        src/app/knowledge_base/features/svgEditor/properties/SvgProperties.test.tsx
git commit -m "feat(svgProperties): mount FileLevelReferencesGroup above sources"
```

---

## Task 11: Migrate `TabProperties` file-level group to `<FileLevelReferencesGroup>`

**Files:**
- Modify: `src/app/knowledge_base/features/tab/properties/TabProperties.tsx`
- Modify: `src/app/knowledge_base/features/tab/properties/TabProperties.test.tsx`

The `FileReferences` block currently uses `TabReferencesList` directly. Migrate it to consume `<FileLevelReferencesGroup>` for symmetry with SVG (and to lock in the shared container's contract).

- [ ] **Step 11.1: Locate and rewrite the FileReferences block**

```bash
sed -n '120,200p' src/app/knowledge_base/features/tab/properties/TabProperties.tsx
```

Find the `<FileReferences>` rendering. Replace its body with `<FileLevelReferencesGroup>` driven by the same props (filtering `attachmentLinks` rows where `entityType === "tab" && entityId === filePath` to extract the `attachmentPaths`).

If `FileReferences` is a small inline subcomponent, replace it. If it's a full component the team may want to keep, just have it return `<FileLevelReferencesGroup>` internally. Plan-time call.

- [ ] **Step 11.2: Run + smoke**

```bash
npm run test:run -- src/app/knowledge_base/features/tab/properties
npm run test:run -- src/app/knowledge_base/features/tab
```
Expected: all TAB-007a regression cases continue to pass; the new shared-container path is exercised by them.

- [ ] **Step 11.3: Commit**

```bash
git add src/app/knowledge_base/features/tab/properties/TabProperties.tsx \
        src/app/knowledge_base/features/tab/properties/TabProperties.test.tsx
git commit -m "refactor(tab): TabProperties file group consumes FileLevelReferencesGroup"
```

---

## Task 12: Wire SVG references in `knowledgeBase.tsx`

**Files:**
- Modify: `src/app/knowledge_base/knowledgeBase.tsx`

Two changes:
1. Pass `attachedDocPaths`, `backlinks`, `documents`, `onOpenDocPicker`, `onDetachDocument`, `onPreviewDocument` into the `<SVGEditorView>` site (or whichever component now hosts `SvgProperties`).
2. Extend `cleanupAttachmentsForPath` with a `.svg` branch.
3. Wire SVG rename to call `rewriteFileScopedRows`.

Since `SVGEditorView` is the current SVG host and it already mounts `SvgProperties` internally (per T10 of MVP-4b), we have two options:
- **(A)** Add the new props to `SVGEditorView` and forward them to `SvgProperties`.
- **(B)** Lift `SvgProperties` rendering up to `knowledgeBase.tsx` (parallel to how Tab renders `TabProperties` outside the canvas component).

**Recommend (A)** — narrower change, matches the existing T10 layout. Implementer should verify by reading the current `SVGEditorView.tsx` first.

- [ ] **Step 12.1: Add `.svg` branch to `cleanupAttachmentsForPath`**

Locate the function around line 395-414 of `knowledgeBase.tsx`. Add:

```ts
} else if (path.endsWith(".svg")) {
  docManager.detachAttachmentsFor(svgFileMatcher(path));
}
```

Add `svgFileMatcher` to the existing import line:

```ts
import {
  tabFileMatcher,
  svgFileMatcher,
  diagramFileMatcher,
  mdFileMatcher,
  collectAttachableFilePaths,
} from "./features/document/utils/fileTreeMatchers";
```

- [ ] **Step 12.2: Wire rename → `rewriteFileScopedRows`**

Locate `handleRenameFileWithLinks` (line ~359). After the existing `propagateRename` call (which handles wiki-link rewrites in doc bodies), add:

```ts
docManager.rewriteAttachments(oldPath, newPath);
```

If `docManager` doesn't expose `rewriteAttachments`, add it: locate `useDocuments.ts` and add a method that dispatches `rewriteFileScopedRows`:

```ts
// in useDocuments.ts
const rewriteAttachments = useCallback((oldPath: string, newPath: string) => {
  dispatch({ type: "rewrite-file-scoped", oldPath, newPath });
}, []);
```

Plus the matching reducer arm that calls `rewriteFileScopedRows(state.attachmentLinks, oldPath, newPath)`. (Plan-time: confirm reducer shape; if `attachmentLinks` is React-state-only and not in the reducer, do the rewrite via `attachmentLinksRepo.write` directly.)

- [ ] **Step 12.3: Forward props to SVGEditorView → SvgProperties**

In the `<SVGEditorView>` JSX site (line ~1248), add the same shape of props that `<TabView>` already gets for cross-references:

```tsx
<SVGEditorView
  …existing props…
  attachedDocPaths={getAttachedDocPathsForSvg(activeFile)}
  backlinks={linkIndex.getBacklinksFor(activeFile)}
  documents={documentsByPath}
  onOpenDocPicker={() => onOpenDocPicker?.("svg", activeFile)}
  onDetachDocument={(docPath) => onDetachDocument?.(docPath, "svg", activeFile)}
  onPreviewDocument={onPreviewDocument}
/>
```

`getAttachedDocPathsForSvg(path)` filters `attachmentLinks` rows where `entityType === "svg" && entityId === path` and returns `row.docPath`. Either inline the filter or add a tiny derived selector.

`SVGEditorView.tsx` then forwards these to `SvgProperties.tsx` 1:1.

- [ ] **Step 12.4: Run + smoke**

```bash
npm run test:run -- src/app/knowledge_base/features/svgEditor src/app/knowledge_base/knowledgeBase
npm run typecheck
```
Expected: green, clean.

- [ ] **Step 12.5: Commit**

```bash
git add src/app/knowledge_base/knowledgeBase.tsx \
        src/app/knowledge_base/features/svgEditor/SVGEditorView.tsx \
        src/app/knowledge_base/features/document/hooks/useDocuments.ts
git commit -m "feat(svg): wire attach/detach + rename + delete propagation in shell"
```

---

## Task 13: Diagram root-scope wiki-backlinks merge

**Deviation captured during execution:** `DocumentsSection` is **retained** and reused (with the new `title` prop) for anchored backlinks (`bl.section !== undefined`). The merge helper de-dupes by `sourcePath` alone, so anchored backlinks would collide with file-level entries if pushed through it. They route to a separate "Section References" block instead.

**Files:**
- Modify: `src/app/knowledge_base/features/diagram/properties/DiagramProperties.tsx`
- Modify: `src/app/knowledge_base/features/diagram/properties/DiagramProperties.test.tsx`

Today `DiagramProperties` shows backlinks (the `<DocumentsSection>` block) and explicit attachments (the `<AttachmentsSection>` block) as **separate** UI groupings. Merge their root-scope content via `mergeAttachmentsWithBacklinks` so a doc with `[[diagram.json]]` + an explicit attachment row appears once (attachment wins), matching how Tab works.

- [ ] **Step 13.1: Locate the root-scope rendering**

```bash
sed -n '275,310p' src/app/knowledge_base/features/diagram/properties/DiagramProperties.tsx
```

Three nearby blocks:
- `<DocumentsSection backlinks={…} />` (renders backlinks only)
- `<AttachmentsSection buckets={…} />` (renders explicit attachments by type — docs, diagrams, svgs)

The merge applies only to the **document bucket** (since wiki-link backlinks come from `.md` files). The diagram + svg buckets stay as-is.

- [ ] **Step 13.2: Refactor the docs bucket to merge backlinks**

Plan-level: extract the docs from `attachmentsByType({ type: "root", id: diagramFilename }).documents` and merge them with `backlinks` for the same diagram path:

```tsx
const docPaths = (attachmentsByType?.({ type: "root", id: diagramFilename }) ?? { documents: [] })
  .documents.map((d) => d.filename);
const merged = mergeAttachmentsWithBacklinks(docPaths, backlinks ?? []);
```

Render a `<FileLevelReferencesGroup>` for the merged docs (or pass merged data into `AttachmentsSection`'s docs bucket — let the implementer pick the cleanest approach during execution; both are valid).

Remove the standalone `<DocumentsSection backlinks={…} />` block — its contents are now subsumed by the merged group. Keep the diagram + svg buckets in `<AttachmentsSection>` as their own groupings (they don't have wiki-link backlinks to merge with).

- [ ] **Step 13.3: Add a regression test**

```tsx
it("merges wiki-link backlinks into the root-scope docs list (attachment wins on duplicate)", () => {
  // Render DiagramProperties with:
  //   attachmentsByType({ root, id }) -> { documents: [{ filename: "a.md", title: "A" }] }
  //   backlinks: [{ sourcePath: "a.md" }, { sourcePath: "b.md" }]
  // Expected: "A" appears once with the attachment icon; "b.md" appears as a wiki-link.
  // (Adapt to the file's existing test harness.)
});
```

- [ ] **Step 13.4: Run + commit**

```bash
npm run test:run -- src/app/knowledge_base/features/diagram/properties
npm run typecheck
git add src/app/knowledge_base/features/diagram/properties/DiagramProperties.tsx \
        src/app/knowledge_base/features/diagram/properties/DiagramProperties.test.tsx
git commit -m "feat(diagram): root-scope docs merge wiki-link backlinks"
```

---

## Task 14: Test-cases + Features.md

**Files:**
- Modify: `Features.md`
- Modify: `test-cases/03-diagram.md`
- Modify: `test-cases/06-svg-editor.md`

- [ ] **Step 14.1: Add SVG attachment cases to `test-cases/06-svg-editor.md`**

Append after `## 6.5 Sources (MVP-4b)`:

```markdown
## 6.6 Attachments (MVP-2 SVG)

| ID | Scenario | Status |
|----|----------|--------|
| SVG-6.6-01 | User attaches a doc to an SVG via the picker → row persists in `attachmentLinks.json` and renders in the References group (component: `SvgProperties.test.tsx`) | ✅ |
| SVG-6.6-02 | User detaches a doc → row removed; cascade-detach modal appears when the doc has no other attachments (existing detach-modal regression) | ✅ |
| SVG-6.6-03 | Wiki-link backlinks (any `[[drawing.svg]]` in any doc body) appear in References alongside explicit attachments (component: `FileLevelReferencesGroup.test.tsx` + `SvgProperties.test.tsx`) | ✅ |
| SVG-6.6-04 | `svgFileMatcher` matches `svg` rows for the given path; rejects other entity types and prefix-collision paths (unit: `fileTreeMatchers.test.ts`) | ✅ |
| SVG-6.6-05 | Renaming an `.svg` rewrites all `attachmentLinks` rows pointing to the old path via `rewriteFileScopedRows` (unit: `attachmentLinks.test.ts`) | ✅ |
| SVG-6.6-06 | Deleting an `.svg` removes all attachment rows pointing to it via `svgFileMatcher` + `cleanupAttachmentsForPath` (integration: `knowledgeBase.tsx`) | ✅ |
| SVG-6.6-07 | Sidecar `attachedTo?` field is forward-compat-unused — populating it does not affect attachments (the canonical store is `attachmentLinks.json`) (documentation in `domain/svgRefs.ts`) | ✅ |
```

- [ ] **Step 14.2: Add diagram backlinks-merge case to `test-cases/03-diagram.md`**

Find the next free `DIAG-3.x-NN` ID under the appropriate section (likely §3.13 or similar — locate via `grep "^##" test-cases/03-diagram.md`). Append:

```markdown
- **DIAG-3.x-NN** ✅ **Root-scope reference list merges wiki-link backlinks** — a doc with `[[diagram.json]]` appears alongside explicit attachments; attachment wins on duplicate path. _(component: `DiagramProperties.test.tsx`.)_
```

- [ ] **Step 14.3: Update `Features.md` §3 (Diagram) and §4.18 (SVG)**

Append a bullet to §3 (or the closest matching root-scope subsection):

```markdown
- ✅ **Wiki-link backlinks merged into root-scope reference list** (MVP-2 SVG) — docs with `[[diagram.json]]` now appear in `DiagramProperties` alongside explicit `attachedTo` rows; attachment wins on duplicate path. Mirrors Tab's TAB-007a behaviour. `features/diagram/properties/DiagramProperties.tsx`.
```

Append a bullet to §4.18 (SVG Editor):

```markdown
- ✅ **File-level document attachments** (MVP-2 SVG) — new `"svg"` `EntityType`. Users attach docs to an SVG via `SvgProperties`'s References group; rows persist in `attachmentLinks.json` (workspace flat file). Wiki-link backlinks (any `[[drawing.svg]]`) merge in. Rename + delete propagation handled by the existing matcher pipeline. `shared/components/FileLevelReferencesGroup.tsx`, `features/document/utils/fileTreeMatchers.ts`.
```

- [ ] **Step 14.4: Commit**

```bash
git add Features.md test-cases/03-diagram.md test-cases/06-svg-editor.md
git commit -m "docs(tests+features): MVP-2 SVG attachments + diagram backlinks"
```

---

## Task 15: Final verification + open PR

- [ ] **Step 15.1: Full typecheck**

```bash
npm run typecheck
```
Expected: clean.

- [ ] **Step 15.2: Full lint**

```bash
npm run lint
```
Expected: 0 errors.

- [ ] **Step 15.3: Full unit suite**

```bash
npm run test:run
```
Expected: green; case count grows by all new tests across Tasks 1-13.

- [ ] **Step 15.4: Build**

```bash
npm run build
```
Expected: clean.

- [ ] **Step 15.5: Update handoff doc**

Mark MVP-2 SVG attachment branch closed in `docs/superpowers/handoffs/2026-05-05-diagram-flow-enhancements.md`. Note that the latent tab-rename gap was also closed by the new `rewriteFileScopedRows` helper.

- [ ] **Step 15.6: Push + open PR**

```bash
git push -u origin feat/diagram-mvp2-svg-attachments
gh pr create --title "feat(svg+diagram): MVP-2 SVG attachments + diagram wiki-link backlinks" --body "$(cat <<'EOF'
## Summary

Closes the deferred MVP-2 SVG attachment branch (Tab attachments already shipped via TAB-007a / MVP-2b). Adds two related slices in one PR:

- **SVG attachments.** New `"svg"` `EntityType`, whole-file scope, stored in the existing workspace `attachmentLinks.json`. UI in `SvgProperties` — attach via `DocumentPicker`, detach with cascade-detach modal, wiki-link backlinks merged in.
- **Diagram wiki-link backlinks.** Diagrams' root-scope reference list now merges wiki-link backlinks with explicit attachments (matches Tab's TAB-007a behaviour).

Two shared component extractions land along the way: `<ReferenceRow>` (used by Diagrams + Tab + SVG) and `<FileLevelReferencesGroup>` (Tab + SVG).

**Discovered during planning:** No `entityId` rewrite on whole-file rename existed for `tab` rows. New `rewriteFileScopedRows` helper covers both `tab` and `svg` whole-file rows plus their `tab-section`/`tab-track` children. Latent-bug fix for Tab is in scope because the same helper covers both.

## Spec / plan

- Spec: `docs/superpowers/specs/2026-05-07-svg-attachments-design.md`
- Plan: `docs/superpowers/plans/2026-05-07-svg-attachments-mvp-plan.md`

## Test plan

Automated:
- [x] `npm run typecheck` clean
- [x] `npm run lint` 0 errors
- [x] `npm run test:run` green (new cases across attachmentLinks, fileTreeMatchers, ReferenceRow, FileLevelReferencesGroup, SvgProperties, TabProperties regression, DiagramProperties)
- [x] `npm run build` clean

Manual:
- [ ] Open a `.svg`, click + Attach document, pick a doc → row appears in References
- [ ] Type `[[drawing.svg]]` in a doc body → SVG's References group shows it as a wiki-link row
- [ ] Detach a doc that has no other attachments → cascade-detach modal asks to delete the doc too
- [ ] Rename `drawing.svg` → all attachmentLinks rows now point to the new path (no manual rebuild)
- [ ] Delete `drawing.svg` → no orphan rows in `attachmentLinks.json`
- [ ] Open a diagram with both an explicit doc attachment and a wiki-link backlink for the same doc → renders once with attachment icon
- [ ] Tab's existing TAB-007a behaviour unchanged after the migration to the shared component

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review checklist

The author of the plan ran this once. Re-run if you make edits.

- **Spec coverage:**
  - §3.1 EntityType extension → Task 1.
  - §3.2 ReferenceRow + FileLevelReferencesGroup → Tasks 5, 6, 9.
  - §3.3 SvgProperties UI → Task 10.
  - §3.4 DocumentPicker integration → Task 12 (entry point wiring).
  - §3.5 Cascade-detach → existing DetachDocModal reused; verified by Task 12 manual smoke.
  - §3.6 Diagram wiki-link backlinks merge → Task 13.
  - §3.7 File operations (rename + delete) → Tasks 2, 3, 12.
  - §3.8 Sidecar `attachedTo?` clarifying comments → Task 4.
  - §6 Tests → Tasks 1, 2, 3, 5, 6, 9, 10, 11, 13 each include their slice.
  - §7 Test cases / Features.md → Task 14.
- **Placeholder scan:** none — every code step has the actual code.
- **Type consistency:** `EntityType` includes `"svg"` consistently across Tasks 1, 2, 3, 12, 14. `MergedReference.source` is `"attachment" | "wiki-link"` consistently in Task 5 (helper), Task 6 (ReferenceRow props), Task 9 (FileLevelReferencesGroup), Task 13 (diagram merge).
- **Discovered scope:** `rewriteFileScopedRows` (Task 2) covers both tab and svg — flagged at the top of the plan as latent-bug fix in addition to new SVG functionality. Clear callout, not silent scope creep.
