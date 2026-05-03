# TAB-007a Tab Properties Cross-References — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire whole-file + per-section attachments and wiki-link backlinks into the tab properties panel, mirroring the diagram pattern, with a section-rename reconciliation hook.

**Architecture:** Two pure helpers (`slugifySectionName`, `getSectionIds`) in `domain/tabEngine.ts` derive deterministic ids. `DocumentMeta.attachedTo[].type` widens additively. A new `useDocuments.migrateAttachments` helper handles bulk rewrite. A new `useTabSectionSync` hook diffs section ids on change and triggers migrations. A new presentational `TabReferencesList` component merges attachments + backlinks with de-dupe-by-`sourcePath` and an "attached wins" precedence. `TabProperties` grows file-level + per-section "References" sub-lists with Attach affordances; `TabView` and `knowledgeBase.tsx` plumb the surface end-to-end, mirroring `DiagramView`.

**Tech Stack:** TypeScript, React, Vitest + Testing Library, existing `useDocuments` / `linkManager` / `RepositoryContext` infrastructure, no new runtime deps.

**Spec:** `docs/superpowers/specs/2026-05-03-tab-cross-references-design.md`

**Branch:** `plan/guitar-tabs-properties-cross-refs` (already created).

---

## Pre-flight

- [ ] **Verify branch and clean tree.**

  Run:
  ```bash
  cd "/Users/kiro/My Projects/knowledge-base"
  git status
  git branch --show-current
  ```

  Expected: branch is `plan/guitar-tabs-properties-cross-refs`; only untracked files are the two unrelated docs noted in the bootstrap.

- [ ] **Confirm baseline tests pass before starting.**

  Run:
  ```bash
  npm run test:run -- --run
  ```

  Expected: all suites green (the spec doc commit shouldn't have changed any code).

---

## Task 1: `slugifySectionName` pure helper

**Files:**
- Modify: `src/app/knowledge_base/domain/tabEngine.ts`
- Create: `src/app/knowledge_base/domain/tabEngine.slugify.test.ts`

- [ ] **Step 1: Write the failing test.**

  Create `src/app/knowledge_base/domain/tabEngine.slugify.test.ts`:

  ```ts
  import { describe, it, expect } from "vitest";
  import { slugifySectionName } from "./tabEngine";

  describe("slugifySectionName", () => {
    it("lowercases and joins words with hyphens", () => {
      expect(slugifySectionName("Verse 1")).toBe("verse-1");
    });

    it("collapses runs of whitespace", () => {
      expect(slugifySectionName("  Pre   Chorus  ")).toBe("pre-chorus");
    });

    it("strips punctuation", () => {
      expect(slugifySectionName("Solo (Lead)")).toBe("solo-lead");
      expect(slugifySectionName("Chorus!?")).toBe("chorus");
    });

    it("preserves alphanumerics across cases and digits", () => {
      expect(slugifySectionName("Bridge 2B")).toBe("bridge-2b");
    });

    it("strips diacritics to ASCII equivalents", () => {
      expect(slugifySectionName("Refrão Final")).toBe("refrao-final");
    });

    it("returns 'section' for empty / whitespace / punctuation-only input", () => {
      expect(slugifySectionName("")).toBe("section");
      expect(slugifySectionName("   ")).toBe("section");
      expect(slugifySectionName("!!!")).toBe("section");
    });
  });
  ```

- [ ] **Step 2: Run the test to verify it fails.**

  Run:
  ```bash
  npm run test:run -- src/app/knowledge_base/domain/tabEngine.slugify.test.ts
  ```

  Expected: FAIL with `slugifySectionName is not exported from "./tabEngine"` or similar import error.

- [ ] **Step 3: Implement `slugifySectionName`.**

  Append to `src/app/knowledge_base/domain/tabEngine.ts`:

  ```ts
  /**
   * Pure function: derive a kebab-case slug from a tab section name.
   * Used as the stable id portion of `tab-section` entity references.
   *
   * Rules: lowercase, strip diacritics to ASCII, collapse non-alphanumeric
   * runs to a single hyphen, trim leading/trailing hyphens. Empty / all-
   * punctuation input returns the literal "section" so callers always get
   * a non-empty id (collisions are then resolved by `getSectionIds`).
   */
  export function slugifySectionName(name: string): string {
    const ascii = name.normalize("NFKD").replace(/[̀-ͯ]/g, "");
    const slug = ascii
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return slug || "section";
  }
  ```

- [ ] **Step 4: Run the test to verify it passes.**

  Run:
  ```bash
  npm run test:run -- src/app/knowledge_base/domain/tabEngine.slugify.test.ts
  ```

  Expected: 6 tests pass.

- [ ] **Step 5: Commit.**

  ```bash
  git add src/app/knowledge_base/domain/tabEngine.ts src/app/knowledge_base/domain/tabEngine.slugify.test.ts
  git commit -m "feat(tabs): slugifySectionName pure helper (TAB-007a)"
  ```

---

## Task 2: `getSectionIds` collision-resolving helper

**Files:**
- Modify: `src/app/knowledge_base/domain/tabEngine.ts`
- Create: `src/app/knowledge_base/domain/tabEngine.getSectionIds.test.ts`

- [ ] **Step 1: Write the failing test.**

  Create `src/app/knowledge_base/domain/tabEngine.getSectionIds.test.ts`:

  ```ts
  import { describe, it, expect } from "vitest";
  import { getSectionIds } from "./tabEngine";

  const at = (name: string) => ({ name, startBeat: 0 });

  describe("getSectionIds", () => {
    it("returns slugified ids aligned 1:1 with input", () => {
      expect(getSectionIds([at("Intro"), at("Verse 1"), at("Chorus")])).toEqual([
        "intro",
        "verse-1",
        "chorus",
      ]);
    });

    it("suffixes -2, -3 on duplicate slugs in order of appearance", () => {
      expect(getSectionIds([at("Verse"), at("Chorus"), at("Verse"), at("Verse")])).toEqual([
        "verse",
        "chorus",
        "verse-2",
        "verse-3",
      ]);
    });

    it("handles empty input", () => {
      expect(getSectionIds([])).toEqual([]);
    });

    it("treats slug-equivalent names (case/punct only) as collisions", () => {
      expect(getSectionIds([at("Verse 1"), at("verse 1"), at("VERSE-1")])).toEqual([
        "verse-1",
        "verse-1-2",
        "verse-1-3",
      ]);
    });

    it("handles all-empty / punctuation-only names by colliding on 'section'", () => {
      expect(getSectionIds([at(""), at("!!!"), at("   ")])).toEqual([
        "section",
        "section-2",
        "section-3",
      ]);
    });
  });
  ```

- [ ] **Step 2: Run the test to verify it fails.**

  Run:
  ```bash
  npm run test:run -- src/app/knowledge_base/domain/tabEngine.getSectionIds.test.ts
  ```

  Expected: FAIL on import.

- [ ] **Step 3: Implement `getSectionIds`.**

  Append to `src/app/knowledge_base/domain/tabEngine.ts`:

  ```ts
  /**
   * Derive deterministic, collision-free section ids from `TabMetadata.sections`.
   * Output array is 1:1 with input. Duplicate slugs receive `-2`, `-3`, …
   * suffixes in order of appearance — stable across re-runs given identical
   * input.
   */
  export function getSectionIds(sections: { name: string }[]): string[] {
    const counts = new Map<string, number>();
    return sections.map((s) => {
      const base = slugifySectionName(s.name);
      const seen = counts.get(base) ?? 0;
      counts.set(base, seen + 1);
      return seen === 0 ? base : `${base}-${seen + 1}`;
    });
  }
  ```

- [ ] **Step 4: Run the test to verify it passes.**

  Run:
  ```bash
  npm run test:run -- src/app/knowledge_base/domain/tabEngine.getSectionIds.test.ts
  ```

  Expected: 5 tests pass.

- [ ] **Step 5: Commit.**

  ```bash
  git add src/app/knowledge_base/domain/tabEngine.ts src/app/knowledge_base/domain/tabEngine.getSectionIds.test.ts
  git commit -m "feat(tabs): getSectionIds with collision suffixing (TAB-007a)"
  ```

---

## Task 3: Widen `DocumentMeta.attachedTo[].type`

**Files:**
- Modify: `src/app/knowledge_base/features/document/types.ts`

This is a single-file additive type extension. Verified by `tsc --noEmit`; no runtime test needed since the union is consumed structurally by existing callers.

- [ ] **Step 1: Inspect the current union.**

  Run:
  ```bash
  sed -n '1,15p' src/app/knowledge_base/features/document/types.ts
  ```

  Expected output includes:
  ```ts
  attachedTo?: {
    type: 'root' | 'node' | 'connection' | 'flow' | 'type';
    id: string;
  }[];
  ```

- [ ] **Step 2: Widen the union additively.**

  Edit `src/app/knowledge_base/features/document/types.ts`. Replace:

  ```ts
    attachedTo?: {
      type: 'root' | 'node' | 'connection' | 'flow' | 'type';
      id: string;
    }[];
  ```

  with:

  ```ts
    attachedTo?: {
      type: 'root' | 'node' | 'connection' | 'flow' | 'type' | 'tab' | 'tab-section';
      id: string;
    }[];
  ```

- [ ] **Step 3: Verify typecheck passes.**

  Run:
  ```bash
  npx tsc --noEmit
  ```

  Expected: no errors. The DiagramView wrapper at `knowledgeBase.tsx:947–951` already does a runtime `as` cast on `entityType`, which still narrows correctly.

- [ ] **Step 4: Run existing tests to confirm no regressions.**

  Run:
  ```bash
  npm run test:run -- src/app/knowledge_base/features/document src/app/knowledge_base/features/diagram
  ```

  Expected: all green.

- [ ] **Step 5: Commit.**

  ```bash
  git add src/app/knowledge_base/features/document/types.ts
  git commit -m "feat(tabs): widen DocumentMeta.attachedTo.type with tab + tab-section (TAB-007a)"
  ```

---

## Task 4: `useDocuments.migrateAttachments` helper

**Files:**
- Modify: `src/app/knowledge_base/features/document/hooks/useDocuments.ts`
- Modify: `src/app/knowledge_base/features/document/hooks/useDocuments.test.ts`

- [ ] **Step 1: Write the failing test.**

  Open `src/app/knowledge_base/features/document/hooks/useDocuments.test.ts` and append a new `describe` block at the bottom (preserve every existing test):

  ```ts
  describe("migrateAttachments", () => {
    it("rewrites tab-section attachment ids matching filePath#oldId → filePath#newId", () => {
      const { result } = renderHook(() => useDocuments());
      act(() => {
        result.current.setDocuments([
          {
            id: "d1",
            filename: "notes.md",
            title: "Notes",
            attachedTo: [{ type: "tab-section", id: "tabs/song.alphatex#verse-1" }],
          },
        ]);
      });

      act(() => {
        result.current.migrateAttachments("tabs/song.alphatex", [
          { from: "verse-1", to: "verse-one" },
        ]);
      });

      expect(result.current.documents[0].attachedTo).toEqual([
        { type: "tab-section", id: "tabs/song.alphatex#verse-one" },
      ]);
    });

    it("applies multiple migrations in a single call", () => {
      const { result } = renderHook(() => useDocuments());
      act(() => {
        result.current.setDocuments([
          {
            id: "d1",
            filename: "a.md",
            title: "A",
            attachedTo: [{ type: "tab-section", id: "tabs/song.alphatex#intro" }],
          },
          {
            id: "d2",
            filename: "b.md",
            title: "B",
            attachedTo: [{ type: "tab-section", id: "tabs/song.alphatex#chorus" }],
          },
        ]);
      });

      act(() => {
        result.current.migrateAttachments("tabs/song.alphatex", [
          { from: "intro", to: "opening" },
          { from: "chorus", to: "refrain" },
        ]);
      });

      expect(result.current.documents[0].attachedTo).toEqual([
        { type: "tab-section", id: "tabs/song.alphatex#opening" },
      ]);
      expect(result.current.documents[1].attachedTo).toEqual([
        { type: "tab-section", id: "tabs/song.alphatex#refrain" },
      ]);
    });

    it("ignores attachments for other file paths", () => {
      const { result } = renderHook(() => useDocuments());
      act(() => {
        result.current.setDocuments([
          {
            id: "d1",
            filename: "notes.md",
            title: "Notes",
            attachedTo: [{ type: "tab-section", id: "tabs/other.alphatex#verse-1" }],
          },
        ]);
      });

      act(() => {
        result.current.migrateAttachments("tabs/song.alphatex", [
          { from: "verse-1", to: "verse-one" },
        ]);
      });

      expect(result.current.documents[0].attachedTo).toEqual([
        { type: "tab-section", id: "tabs/other.alphatex#verse-1" },
      ]);
    });

    it("ignores non-tab-section attachments", () => {
      const { result } = renderHook(() => useDocuments());
      act(() => {
        result.current.setDocuments([
          {
            id: "d1",
            filename: "notes.md",
            title: "Notes",
            attachedTo: [{ type: "flow", id: "tabs/song.alphatex#verse-1" }],
          },
        ]);
      });

      act(() => {
        result.current.migrateAttachments("tabs/song.alphatex", [
          { from: "verse-1", to: "verse-one" },
        ]);
      });

      expect(result.current.documents[0].attachedTo).toEqual([
        { type: "flow", id: "tabs/song.alphatex#verse-1" },
      ]);
    });

    it("is a no-op when migrations is empty", () => {
      const { result } = renderHook(() => useDocuments());
      const before = [
        {
          id: "d1",
          filename: "notes.md",
          title: "Notes",
          attachedTo: [{ type: "tab-section" as const, id: "tabs/song.alphatex#intro" }],
        },
      ];
      act(() => { result.current.setDocuments(before); });
      const snapshot = result.current.documents;
      act(() => { result.current.migrateAttachments("tabs/song.alphatex", []); });
      expect(result.current.documents).toBe(snapshot);
    });
  });
  ```

  If `renderHook` and `act` aren't already imported at the top of the test file, add them:

  ```ts
  import { renderHook, act } from "@testing-library/react";
  ```

  (Use whatever existing import line already pulls these in — check the top of the file before adding a duplicate.)

- [ ] **Step 2: Run the test to verify it fails.**

  Run:
  ```bash
  npm run test:run -- src/app/knowledge_base/features/document/hooks/useDocuments.test.ts
  ```

  Expected: FAIL — `result.current.migrateAttachments is not a function`.

- [ ] **Step 3: Implement `migrateAttachments`.**

  In `src/app/knowledge_base/features/document/hooks/useDocuments.ts`, add inside the `useDocuments` function body (after `removeDocument`, before `getDocumentsForEntity`):

  ```ts
  /**
   * Bulk rewrite `tab-section` attachment ids when sections are renamed.
   * Idempotent. No-op when migrations is empty (preserves identity to
   * skip an unnecessary re-render).
   */
  const migrateAttachments = useCallback((
    filePath: string,
    migrations: { from: string; to: string }[],
  ) => {
    if (migrations.length === 0) return;
    const map = new Map<string, string>();
    for (const m of migrations) {
      map.set(`${filePath}#${m.from}`, `${filePath}#${m.to}`);
    }
    setDocuments(prev =>
      prev.map(d => {
        if (!d.attachedTo) return d;
        let touched = false;
        const next = d.attachedTo.map(a => {
          if (a.type !== "tab-section") return a;
          const replacement = map.get(a.id);
          if (replacement === undefined) return a;
          touched = true;
          return { ...a, id: replacement };
        });
        return touched ? { ...d, attachedTo: next } : d;
      })
    );
  }, []);
  ```

  Then add `migrateAttachments` to the returned object literal at the bottom:

  ```ts
    return {
      documents,
      setDocuments,
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
  ```

- [ ] **Step 4: Run the test to verify it passes.**

  Run:
  ```bash
  npm run test:run -- src/app/knowledge_base/features/document/hooks/useDocuments.test.ts
  ```

  Expected: all tests in this file (existing + 5 new) pass.

- [ ] **Step 5: Commit.**

  ```bash
  git add src/app/knowledge_base/features/document/hooks/useDocuments.ts src/app/knowledge_base/features/document/hooks/useDocuments.test.ts
  git commit -m "feat(tabs): useDocuments.migrateAttachments for section renames (TAB-007a)"
  ```

---

## Task 5: `useTabSectionSync` hook

**Files:**
- Create: `src/app/knowledge_base/features/tab/properties/useTabSectionSync.ts`
- Create: `src/app/knowledge_base/features/tab/properties/useTabSectionSync.test.tsx`

- [ ] **Step 1: Write the failing test.**

  Create `src/app/knowledge_base/features/tab/properties/useTabSectionSync.test.tsx`:

  ```tsx
  import { describe, it, expect, vi } from "vitest";
  import { renderHook } from "@testing-library/react";
  import type { TabMetadata } from "../../../domain/tabEngine";
  import { useTabSectionSync } from "./useTabSectionSync";

  const meta = (sections: { name: string; startBeat: number }[]): TabMetadata => ({
    title: "T",
    tempo: 120,
    timeSignature: { numerator: 4, denominator: 4 },
    capo: 0,
    tuning: [],
    tracks: [],
    sections,
    totalBeats: 0,
    durationSeconds: 0,
  });

  describe("useTabSectionSync", () => {
    it("emits no migrations on first run (no prior snapshot)", () => {
      const onMigrate = vi.fn();
      renderHook(() =>
        useTabSectionSync("tabs/song.alphatex", meta([
          { name: "Verse 1", startBeat: 0 },
        ]), onMigrate),
      );
      expect(onMigrate).not.toHaveBeenCalled();
    });

    it("emits a position-aligned migration when a section is renamed in place", () => {
      const onMigrate = vi.fn();
      const { rerender } = renderHook(
        ({ sections }) =>
          useTabSectionSync("tabs/song.alphatex", meta(sections), onMigrate),
        { initialProps: { sections: [{ name: "Verse 1", startBeat: 0 }] } },
      );
      expect(onMigrate).not.toHaveBeenCalled();

      rerender({ sections: [{ name: "Verse One", startBeat: 0 }] });

      expect(onMigrate).toHaveBeenCalledWith(
        "tabs/song.alphatex",
        [{ from: "verse-1", to: "verse-one" }],
      );
    });

    it("does not emit when ids are unchanged", () => {
      const onMigrate = vi.fn();
      const { rerender } = renderHook(
        ({ sections }) =>
          useTabSectionSync("tabs/song.alphatex", meta(sections), onMigrate),
        { initialProps: { sections: [{ name: "Intro", startBeat: 0 }] } },
      );
      rerender({ sections: [{ name: "Intro", startBeat: 100 }] }); // startBeat change only
      expect(onMigrate).not.toHaveBeenCalled();
    });

    it("emits no migration for trailing deletions (orphan-by-design)", () => {
      const onMigrate = vi.fn();
      const { rerender } = renderHook(
        ({ sections }) =>
          useTabSectionSync("tabs/song.alphatex", meta(sections), onMigrate),
        {
          initialProps: {
            sections: [
              { name: "Intro", startBeat: 0 },
              { name: "Verse", startBeat: 100 },
            ],
          },
        },
      );
      rerender({ sections: [{ name: "Intro", startBeat: 0 }] });
      expect(onMigrate).not.toHaveBeenCalled();
    });

    it("emits migrations only for indices where ids actually differ", () => {
      const onMigrate = vi.fn();
      const { rerender } = renderHook(
        ({ sections }) =>
          useTabSectionSync("tabs/song.alphatex", meta(sections), onMigrate),
        {
          initialProps: {
            sections: [
              { name: "Intro", startBeat: 0 },
              { name: "Verse", startBeat: 100 },
              { name: "Chorus", startBeat: 200 },
            ],
          },
        },
      );

      rerender({
        sections: [
          { name: "Intro", startBeat: 0 },
          { name: "Verse One", startBeat: 100 }, // renamed
          { name: "Chorus", startBeat: 200 },    // unchanged
        ],
      });

      expect(onMigrate).toHaveBeenCalledTimes(1);
      expect(onMigrate).toHaveBeenCalledWith(
        "tabs/song.alphatex",
        [{ from: "verse", to: "verse-one" }],
      );
    });

    it("resets cache when filePath changes (new file → no migrations on first run)", () => {
      const onMigrate = vi.fn();
      const { rerender } = renderHook(
        ({ filePath, sections }: { filePath: string; sections: { name: string; startBeat: number }[] }) =>
          useTabSectionSync(filePath, meta(sections), onMigrate),
        {
          initialProps: {
            filePath: "tabs/a.alphatex",
            sections: [{ name: "Intro", startBeat: 0 }],
          },
        },
      );
      rerender({
        filePath: "tabs/b.alphatex",
        sections: [{ name: "Different", startBeat: 0 }],
      });
      expect(onMigrate).not.toHaveBeenCalled();
    });
  });
  ```

- [ ] **Step 2: Run the test to verify it fails.**

  Run:
  ```bash
  npm run test:run -- src/app/knowledge_base/features/tab/properties/useTabSectionSync.test.tsx
  ```

  Expected: FAIL — module not found.

- [ ] **Step 3: Implement `useTabSectionSync`.**

  Create `src/app/knowledge_base/features/tab/properties/useTabSectionSync.ts`:

  ```ts
  "use client";

  import { useEffect, useRef } from "react";
  import { getSectionIds } from "../../../domain/tabEngine";
  import type { TabMetadata } from "../../../domain/tabEngine";

  /**
   * Diff `metadata.sections` against the previous snapshot (per file) and
   * fire `onMigrate` with position-aligned id rewrites. Trailing deletions
   * orphan by design — surfaced in the UI rather than silently re-bound.
   * Cache is keyed by `filePath`; switching files resets the snapshot so
   * the new file's first observation establishes a baseline (no spurious
   * migrations).
   */
  export function useTabSectionSync(
    filePath: string,
    metadata: TabMetadata | null,
    onMigrate: (filePath: string, migrations: { from: string; to: string }[]) => void,
  ): void {
    const lastIdsRef = useRef<{ filePath: string; ids: string[] } | null>(null);

    useEffect(() => {
      if (metadata === null) return;
      const nextIds = getSectionIds(metadata.sections);
      const prev = lastIdsRef.current;
      lastIdsRef.current = { filePath, ids: nextIds };

      if (prev === null || prev.filePath !== filePath) return;

      const overlap = Math.min(prev.ids.length, nextIds.length);
      const migrations: { from: string; to: string }[] = [];
      for (let i = 0; i < overlap; i++) {
        if (prev.ids[i] !== nextIds[i]) {
          migrations.push({ from: prev.ids[i], to: nextIds[i] });
        }
      }
      if (migrations.length > 0) onMigrate(filePath, migrations);
    }, [filePath, metadata, onMigrate]);
  }
  ```

- [ ] **Step 4: Run the test to verify it passes.**

  Run:
  ```bash
  npm run test:run -- src/app/knowledge_base/features/tab/properties/useTabSectionSync.test.tsx
  ```

  Expected: 6 tests pass.

- [ ] **Step 5: Commit.**

  ```bash
  git add src/app/knowledge_base/features/tab/properties/useTabSectionSync.ts src/app/knowledge_base/features/tab/properties/useTabSectionSync.test.tsx
  git commit -m "feat(tabs): useTabSectionSync hook for rename reconciliation (TAB-007a)"
  ```

---

## Task 6: `TabReferencesList` presentational component

**Files:**
- Create: `src/app/knowledge_base/features/tab/properties/TabReferencesList.tsx`
- Create: `src/app/knowledge_base/features/tab/properties/TabReferencesList.test.tsx`

- [ ] **Step 1: Write the failing test.**

  Create `src/app/knowledge_base/features/tab/properties/TabReferencesList.test.tsx`:

  ```tsx
  import { describe, it, expect, vi } from "vitest";
  import { render, screen } from "@testing-library/react";
  import userEvent from "@testing-library/user-event";
  import type { DocumentMeta } from "../../document/types";
  import { TabReferencesList } from "./TabReferencesList";

  const attached = (filename: string, attachedTo: DocumentMeta["attachedTo"]): DocumentMeta => ({
    id: filename,
    filename,
    title: filename.replace(/\.md$/, ""),
    attachedTo,
  });

  describe("TabReferencesList", () => {
    it("renders an empty state when there are no references", () => {
      render(<TabReferencesList attachments={[]} backlinks={[]} />);
      expect(screen.getByText(/no references/i)).toBeInTheDocument();
    });

    it("renders attachments with a paperclip indicator", () => {
      render(
        <TabReferencesList
          attachments={[
            attached("notes/song-history.md", [
              { type: "tab", id: "tabs/song.alphatex" },
            ]),
          ]}
          backlinks={[]}
        />,
      );
      const row = screen.getByTestId("tab-reference-row");
      expect(row).toHaveTextContent("song-history.md");
      expect(row).toHaveAttribute("data-source", "attachment");
    });

    it("renders wiki-link backlinks with an arrow indicator and no detach button", () => {
      render(
        <TabReferencesList
          attachments={[]}
          backlinks={[{ sourcePath: "notes/intro-theory.md" }]}
        />,
      );
      const row = screen.getByTestId("tab-reference-row");
      expect(row).toHaveTextContent("intro-theory.md");
      expect(row).toHaveAttribute("data-source", "backlink");
      expect(row.querySelector('[data-testid="detach-reference"]')).toBeNull();
    });

    it("merges and de-duplicates by sourcePath, with attached winning over backlink", () => {
      render(
        <TabReferencesList
          attachments={[
            attached("notes/intro-theory.md", [
              { type: "tab-section", id: "tabs/song.alphatex#intro" },
            ]),
          ]}
          backlinks={[{ sourcePath: "notes/intro-theory.md" }]}
        />,
      );
      const rows = screen.getAllByTestId("tab-reference-row");
      expect(rows).toHaveLength(1);
      expect(rows[0]).toHaveAttribute("data-source", "attachment");
    });

    it("invokes onPreview with the source path on click", async () => {
      const user = userEvent.setup();
      const onPreview = vi.fn();
      render(
        <TabReferencesList
          attachments={[]}
          backlinks={[{ sourcePath: "notes/x.md" }]}
          onPreview={onPreview}
        />,
      );
      await user.click(screen.getByRole("button", { name: /x\.md/i }));
      expect(onPreview).toHaveBeenCalledWith("notes/x.md");
    });

    it("invokes onDetach with the doc path when detach is clicked", async () => {
      const user = userEvent.setup();
      const onDetach = vi.fn();
      render(
        <TabReferencesList
          attachments={[
            attached("notes/song-history.md", [
              { type: "tab", id: "tabs/song.alphatex" },
            ]),
          ]}
          backlinks={[]}
          onDetach={onDetach}
        />,
      );
      await user.click(screen.getByTestId("detach-reference"));
      expect(onDetach).toHaveBeenCalledWith("notes/song-history.md");
    });

    it("hides the detach button when readOnly is true", () => {
      render(
        <TabReferencesList
          attachments={[
            attached("notes/song-history.md", [
              { type: "tab", id: "tabs/song.alphatex" },
            ]),
          ]}
          backlinks={[]}
          readOnly
        />,
      );
      expect(screen.queryByTestId("detach-reference")).toBeNull();
    });
  });
  ```

- [ ] **Step 2: Run the test to verify it fails.**

  Run:
  ```bash
  npm run test:run -- src/app/knowledge_base/features/tab/properties/TabReferencesList.test.tsx
  ```

  Expected: FAIL — module not found.

- [ ] **Step 3: Implement `TabReferencesList`.**

  Create `src/app/knowledge_base/features/tab/properties/TabReferencesList.tsx`:

  ```tsx
  "use client";

  import type { ReactElement } from "react";
  import { FileText, Paperclip, ArrowUpRight, X } from "lucide-react";
  import type { DocumentMeta } from "../../document/types";

  export interface TabReferencesListProps {
    attachments: DocumentMeta[];
    backlinks: { sourcePath: string; section?: string }[];
    readOnly?: boolean;
    onPreview?: (path: string) => void;
    onDetach?: (docPath: string) => void;
  }

  type Row = { sourcePath: string; source: "attachment" | "backlink" };

  function mergeRows(
    attachments: DocumentMeta[],
    backlinks: { sourcePath: string; section?: string }[],
  ): Row[] {
    const seen = new Map<string, Row>();
    for (const a of attachments) {
      seen.set(a.filename, { sourcePath: a.filename, source: "attachment" });
    }
    for (const b of backlinks) {
      if (!seen.has(b.sourcePath)) {
        seen.set(b.sourcePath, { sourcePath: b.sourcePath, source: "backlink" });
      }
    }
    return [...seen.values()];
  }

  export function TabReferencesList({
    attachments,
    backlinks,
    readOnly,
    onPreview,
    onDetach,
  }: TabReferencesListProps): ReactElement {
    const rows = mergeRows(attachments, backlinks);

    if (rows.length === 0) {
      return <p className="text-[11px] text-mute">No references</p>;
    }

    return (
      <ul className="flex flex-col gap-1">
        {rows.map((row) => {
          const filename = row.sourcePath.split("/").pop() ?? row.sourcePath;
          const Icon = row.source === "attachment" ? Paperclip : ArrowUpRight;
          return (
            <li
              key={row.sourcePath}
              data-testid="tab-reference-row"
              data-source={row.source}
              className="flex items-center gap-1.5 rounded border border-line bg-surface-2 px-2 py-1 text-xs"
            >
              <Icon size={12} className="flex-shrink-0 text-emerald-500" />
              <button
                type="button"
                onClick={() => onPreview?.(row.sourcePath)}
                className="flex flex-1 items-center gap-1 truncate text-left text-accent hover:underline"
              >
                <FileText size={11} className="flex-shrink-0 opacity-60" />
                {filename}
              </button>
              {!readOnly && row.source === "attachment" && onDetach && (
                <button
                  type="button"
                  data-testid="detach-reference"
                  aria-label={`Detach ${filename}`}
                  onClick={() => onDetach(row.sourcePath)}
                  className="rounded p-0.5 text-mute hover:bg-line/30 hover:text-ink"
                >
                  <X size={11} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    );
  }
  ```

- [ ] **Step 4: Run the test to verify it passes.**

  Run:
  ```bash
  npm run test:run -- src/app/knowledge_base/features/tab/properties/TabReferencesList.test.tsx
  ```

  Expected: 7 tests pass.

- [ ] **Step 5: Commit.**

  ```bash
  git add src/app/knowledge_base/features/tab/properties/TabReferencesList.tsx src/app/knowledge_base/features/tab/properties/TabReferencesList.test.tsx
  git commit -m "feat(tabs): TabReferencesList merge + de-dupe component (TAB-007a)"
  ```

---

## Task 7: Extend `TabProperties` with attachment surface

**Files:**
- Modify: `src/app/knowledge_base/features/tab/properties/TabProperties.tsx`
- Modify: `src/app/knowledge_base/features/tab/properties/TabProperties.test.tsx`

- [ ] **Step 1: Write failing tests for the new surface.**

  Append to `src/app/knowledge_base/features/tab/properties/TabProperties.test.tsx` (preserve all existing tests):

  ```tsx
  describe("TabProperties — cross-references", () => {
    const baseDocs: DocumentMeta[] = [
      {
        id: "d1",
        filename: "notes/song-history.md",
        title: "song-history",
        attachedTo: [{ type: "tab", id: "tabs/song.alphatex" }],
      },
      {
        id: "d2",
        filename: "notes/intro-theory.md",
        title: "intro-theory",
        attachedTo: [{ type: "tab-section", id: "tabs/song.alphatex#intro" }],
      },
    ];

    it("renders a Whole-file references section listing tab-typed attachments", () => {
      render(
        <TabProperties
          metadata={makeMetadata()}
          collapsed={false}
          onToggleCollapse={vi.fn()}
          filePath="tabs/song.alphatex"
          documents={baseDocs}
          backlinks={[]}
        />,
      );
      expect(screen.getByText(/whole-file references/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /song-history\.md/i })).toBeInTheDocument();
    });

    it("renders a per-section References sub-list using the deterministic section id", () => {
      render(
        <TabProperties
          metadata={makeMetadata()}
          collapsed={false}
          onToggleCollapse={vi.fn()}
          filePath="tabs/song.alphatex"
          documents={baseDocs}
          backlinks={[]}
        />,
      );
      expect(screen.getByRole("button", { name: /intro-theory\.md/i })).toBeInTheDocument();
    });

    it("renders an Attach affordance per section and at file level when not readOnly", () => {
      render(
        <TabProperties
          metadata={makeMetadata()}
          collapsed={false}
          onToggleCollapse={vi.fn()}
          filePath="tabs/song.alphatex"
          documents={[]}
          backlinks={[]}
          onOpenDocPicker={vi.fn()}
        />,
      );
      const attachButtons = screen.getAllByRole("button", { name: /attach/i });
      // Two sections in makeMetadata + one file-level → 3 buttons.
      expect(attachButtons.length).toBeGreaterThanOrEqual(3);
    });

    it("invokes onOpenDocPicker with the composite section id when section Attach is clicked", async () => {
      const user = userEvent.setup();
      const onOpenDocPicker = vi.fn();
      render(
        <TabProperties
          metadata={makeMetadata()}
          collapsed={false}
          onToggleCollapse={vi.fn()}
          filePath="tabs/song.alphatex"
          documents={[]}
          backlinks={[]}
          onOpenDocPicker={onOpenDocPicker}
        />,
      );
      const introAttach = screen.getByTestId("attach-section-intro");
      await user.click(introAttach);
      expect(onOpenDocPicker).toHaveBeenCalledWith(
        "tab-section",
        "tabs/song.alphatex#intro",
      );
    });

    it("invokes onOpenDocPicker with type 'tab' and the file path when file-level Attach is clicked", async () => {
      const user = userEvent.setup();
      const onOpenDocPicker = vi.fn();
      render(
        <TabProperties
          metadata={makeMetadata()}
          collapsed={false}
          onToggleCollapse={vi.fn()}
          filePath="tabs/song.alphatex"
          documents={[]}
          backlinks={[]}
          onOpenDocPicker={onOpenDocPicker}
        />,
      );
      await user.click(screen.getByTestId("attach-file"));
      expect(onOpenDocPicker).toHaveBeenCalledWith("tab", "tabs/song.alphatex");
    });

    it("hides all Attach affordances when readOnly is true", () => {
      render(
        <TabProperties
          metadata={makeMetadata()}
          collapsed={false}
          onToggleCollapse={vi.fn()}
          filePath="tabs/song.alphatex"
          documents={[]}
          backlinks={[]}
          onOpenDocPicker={vi.fn()}
          readOnly
        />,
      );
      expect(screen.queryAllByRole("button", { name: /attach/i })).toHaveLength(0);
    });

    it("uses deterministic section ids as React keys (duplicates render once each)", () => {
      const { container } = render(
        <TabProperties
          metadata={makeMetadata({
            sections: [
              { name: "Verse", startBeat: 0 },
              { name: "Verse", startBeat: 1920 },
            ],
          })}
          collapsed={false}
          onToggleCollapse={vi.fn()}
          filePath="tabs/song.alphatex"
          documents={[]}
          backlinks={[]}
        />,
      );
      // Both rows mount (no React key warning, both visible).
      const sectionRows = container.querySelectorAll('[data-testid^="tab-section-row-"]');
      expect(sectionRows).toHaveLength(2);
      expect(sectionRows[0].getAttribute("data-testid")).toBe("tab-section-row-verse");
      expect(sectionRows[1].getAttribute("data-testid")).toBe("tab-section-row-verse-2");
    });
  });
  ```

  Add the missing imports at the top of the test file if not already present:

  ```ts
  import type { DocumentMeta } from "../../document/types";
  ```

- [ ] **Step 2: Run the tests to verify they fail.**

  Run:
  ```bash
  npm run test:run -- src/app/knowledge_base/features/tab/properties/TabProperties.test.tsx
  ```

  Expected: new tests fail (props don't exist yet); existing tests still pass.

- [ ] **Step 3: Replace `TabProperties.tsx` with the extended implementation.**

  Replace the entire contents of `src/app/knowledge_base/features/tab/properties/TabProperties.tsx` with:

  ```tsx
  "use client";

  import type { ReactElement } from "react";
  import { Paperclip } from "lucide-react";
  import type { TabMetadata } from "../../../domain/tabEngine";
  import { getSectionIds } from "../../../domain/tabEngine";
  import type { DocumentMeta } from "../../document/types";
  import { TabReferencesList } from "./TabReferencesList";

  export interface TabPropertiesProps {
    metadata: TabMetadata | null;
    collapsed: boolean;
    onToggleCollapse: () => void;
    filePath?: string;
    documents?: DocumentMeta[];
    backlinks?: { sourcePath: string; section?: string }[];
    readOnly?: boolean;
    onPreviewDocument?: (path: string) => void;
    onOpenDocPicker?: (entityType: "tab" | "tab-section", entityId: string) => void;
    onDetachDocument?: (docPath: string, entityType: "tab" | "tab-section", entityId: string) => void;
  }

  /**
   * Side panel for an open tab. Surfaces metadata from
   * `useTabEngine().metadata` and (TAB-007a) cross-references: a
   * "Whole-file references" group plus per-section "References" sub-lists,
   * each merging explicit attachments with wiki-link backlinks.
   */
  export function TabProperties(props: TabPropertiesProps): ReactElement {
    const {
      metadata, collapsed, onToggleCollapse,
      filePath, documents, backlinks, readOnly,
      onPreviewDocument, onOpenDocPicker, onDetachDocument,
    } = props;
    const widthClass = collapsed ? "w-9" : "w-72";
    return (
      <aside
        data-testid="tab-properties"
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
            {metadata === null ? (
              <p className="text-mute">Loading score…</p>
            ) : (
              <>
                <Header metadata={metadata} />
                <General metadata={metadata} />
                <Tuning metadata={metadata} />
                <Tracks metadata={metadata} />
                <Sections
                  metadata={metadata}
                  filePath={filePath}
                  documents={documents}
                  backlinks={backlinks}
                  readOnly={readOnly}
                  onPreviewDocument={onPreviewDocument}
                  onOpenDocPicker={onOpenDocPicker}
                  onDetachDocument={onDetachDocument}
                />
                {filePath && (
                  <FileReferences
                    filePath={filePath}
                    documents={documents}
                    backlinks={backlinks}
                    readOnly={readOnly}
                    onPreviewDocument={onPreviewDocument}
                    onOpenDocPicker={onOpenDocPicker}
                    onDetachDocument={onDetachDocument}
                  />
                )}
              </>
            )}
          </div>
        )}
      </aside>
    );
  }

  function Header({ metadata }: { metadata: TabMetadata }): ReactElement {
    return (
      <section>
        <h2 className="text-base font-semibold">{metadata.title}</h2>
        {metadata.artist && <p className="text-mute">{metadata.artist}</p>}
        {metadata.subtitle && <p className="text-xs text-mute">{metadata.subtitle}</p>}
      </section>
    );
  }

  function General({ metadata }: { metadata: TabMetadata }): ReactElement {
    const ts = `${metadata.timeSignature.numerator}/${metadata.timeSignature.denominator}`;
    return (
      <section>
        <h3 className="mb-1 text-xs font-medium uppercase text-mute">General</h3>
        <dl className="space-y-1">
          <Row label="Tempo">{`${metadata.tempo} BPM`}</Row>
          {metadata.key && <Row label="Key">{metadata.key}</Row>}
          <Row label="Time">{ts}</Row>
          <Row label="Capo">{`Capo ${metadata.capo}`}</Row>
        </dl>
      </section>
    );
  }

  function Tuning({ metadata }: { metadata: TabMetadata }): ReactElement | null {
    if (metadata.tuning.length === 0) return null;
    return (
      <section>
        <h3 className="mb-1 text-xs font-medium uppercase text-mute">Tuning</h3>
        <p className="font-mono text-xs">{metadata.tuning.join(" ")}</p>
      </section>
    );
  }

  function Tracks({ metadata }: { metadata: TabMetadata }): ReactElement | null {
    if (metadata.tracks.length === 0) return null;
    return (
      <section>
        <h3 className="mb-1 text-xs font-medium uppercase text-mute">
          Tracks ({metadata.tracks.length})
        </h3>
        <ul className="space-y-1">
          {metadata.tracks.map((track) => (
            <li key={track.id} className="rounded border border-line/50 px-2 py-1">
              <span>{track.name}</span>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  function Sections({
    metadata, filePath, documents, backlinks, readOnly,
    onPreviewDocument, onOpenDocPicker, onDetachDocument,
  }: {
    metadata: TabMetadata;
    filePath?: string;
    documents?: DocumentMeta[];
    backlinks?: { sourcePath: string; section?: string }[];
    readOnly?: boolean;
    onPreviewDocument?: (path: string) => void;
    onOpenDocPicker?: (entityType: "tab" | "tab-section", entityId: string) => void;
    onDetachDocument?: (docPath: string, entityType: "tab" | "tab-section", entityId: string) => void;
  }): ReactElement | null {
    if (metadata.sections.length === 0) return null;
    const ids = getSectionIds(metadata.sections);
    return (
      <section>
        <h3 className="mb-1 text-xs font-medium uppercase text-mute">
          Sections ({metadata.sections.length})
        </h3>
        <ul className="space-y-2">
          {metadata.sections.map((section, i) => {
            const id = ids[i];
            const entityId = filePath ? `${filePath}#${id}` : "";
            const sectionAttachments = (documents ?? []).filter((d) =>
              d.attachedTo?.some((a) => a.type === "tab-section" && a.id === entityId),
            );
            const sectionBacklinks = (backlinks ?? []).filter((bl) => bl.section === id);
            return (
              <li
                key={id}
                data-testid={`tab-section-row-${id}`}
                className="rounded border border-line/50 px-2 py-1 space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span>{section.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-mute">beat {section.startBeat}</span>
                    {!readOnly && filePath && onOpenDocPicker && (
                      <button
                        type="button"
                        data-testid={`attach-section-${id}`}
                        aria-label={`Attach to ${section.name}`}
                        onClick={() => onOpenDocPicker("tab-section", entityId)}
                        className="rounded p-0.5 text-mute hover:bg-line/30 hover:text-ink"
                      >
                        <Paperclip size={12} />
                      </button>
                    )}
                  </div>
                </div>
                {filePath && (sectionAttachments.length > 0 || sectionBacklinks.length > 0) && (
                  <TabReferencesList
                    attachments={sectionAttachments}
                    backlinks={sectionBacklinks}
                    readOnly={readOnly}
                    onPreview={onPreviewDocument}
                    onDetach={
                      onDetachDocument
                        ? (docPath) => onDetachDocument(docPath, "tab-section", entityId)
                        : undefined
                    }
                  />
                )}
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  function FileReferences({
    filePath, documents, backlinks, readOnly,
    onPreviewDocument, onOpenDocPicker, onDetachDocument,
  }: {
    filePath: string;
    documents?: DocumentMeta[];
    backlinks?: { sourcePath: string; section?: string }[];
    readOnly?: boolean;
    onPreviewDocument?: (path: string) => void;
    onOpenDocPicker?: (entityType: "tab" | "tab-section", entityId: string) => void;
    onDetachDocument?: (docPath: string, entityType: "tab" | "tab-section", entityId: string) => void;
  }): ReactElement {
    const fileAttachments = (documents ?? []).filter((d) =>
      d.attachedTo?.some((a) => a.type === "tab" && a.id === filePath),
    );
    const fileBacklinks = (backlinks ?? []).filter((bl) => !bl.section);
    return (
      <section>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-xs font-medium uppercase text-mute">Whole-file references</h3>
          {!readOnly && onOpenDocPicker && (
            <button
              type="button"
              data-testid="attach-file"
              aria-label="Attach to file"
              onClick={() => onOpenDocPicker("tab", filePath)}
              className="rounded p-0.5 text-mute hover:bg-line/30 hover:text-ink"
            >
              <Paperclip size={12} />
            </button>
          )}
        </div>
        <TabReferencesList
          attachments={fileAttachments}
          backlinks={fileBacklinks}
          readOnly={readOnly}
          onPreview={onPreviewDocument}
          onDetach={
            onDetachDocument
              ? (docPath) => onDetachDocument(docPath, "tab", filePath)
              : undefined
          }
        />
      </section>
    );
  }

  function Row({ label, children }: { label: string; children: React.ReactNode }): ReactElement {
    return (
      <div className="flex items-center justify-between">
        <dt className="text-xs text-mute">{label}</dt>
        <dd className="text-xs">{children}</dd>
      </div>
    );
  }
  ```

- [ ] **Step 4: Run the tests to verify they pass.**

  Run:
  ```bash
  npm run test:run -- src/app/knowledge_base/features/tab/properties/TabProperties.test.tsx
  ```

  Expected: every test in the file passes (existing + new).

- [ ] **Step 5: Commit.**

  ```bash
  git add src/app/knowledge_base/features/tab/properties/TabProperties.tsx src/app/knowledge_base/features/tab/properties/TabProperties.test.tsx
  git commit -m "feat(tabs): TabProperties cross-references surface (TAB-007a)"
  ```

---

## Task 8: Thread props through `TabView`

**Files:**
- Modify: `src/app/knowledge_base/features/tab/TabView.tsx`
- Modify: `src/app/knowledge_base/features/tab/TabView.test.tsx`

`TabView` already accepts `{ filePath }` and renders `TabProperties`. We extend its prop surface to mirror `DiagramView` for the attachment plumbing, plus call `useTabSectionSync` so renames migrate.

- [ ] **Step 1: Inspect existing `TabView.test.tsx` to keep new tests in style.**

  Run:
  ```bash
  head -40 src/app/knowledge_base/features/tab/TabView.test.tsx
  ```

  Use the established mocking pattern (it currently mocks `useTabContent` / `useTabEngine`).

- [ ] **Step 2: Write a failing test asserting prop pass-through and rename migration.**

  Append to `src/app/knowledge_base/features/tab/TabView.test.tsx`:

  ```tsx
  describe("TabView — cross-reference plumbing", () => {
    it("passes filePath, documents, and backlinks through to TabProperties", () => {
      // Existing mock infra in this file already stubs useTabContent /
      // useTabEngine to emit a metadata snapshot. Add a minimal pass-
      // through assertion: a doc attached at the file level shows up
      // in the panel.
      const { setMetadata } = mockTabEngine({
        title: "Song",
        sections: [{ name: "Intro", startBeat: 0 }],
      });
      render(
        <TabView
          filePath="tabs/song.alphatex"
          documents={[
            {
              id: "d1",
              filename: "notes/song-history.md",
              title: "song-history",
              attachedTo: [{ type: "tab", id: "tabs/song.alphatex" }],
            },
          ]}
          backlinks={[]}
        />,
      );
      setMetadata();
      expect(screen.getByText(/whole-file references/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /song-history\.md/i })).toBeInTheDocument();
    });

    it("calls onMigrateAttachments when a section is renamed", () => {
      const onMigrateAttachments = vi.fn();
      const { setMetadata } = mockTabEngine({
        title: "Song",
        sections: [{ name: "Verse 1", startBeat: 0 }],
      });
      const { rerender } = render(
        <TabView
          filePath="tabs/song.alphatex"
          documents={[]}
          backlinks={[]}
          onMigrateAttachments={onMigrateAttachments}
        />,
      );
      setMetadata({ sections: [{ name: "Verse 1", startBeat: 0 }] });
      // Trigger a metadata update with the renamed section; the helper
      // mockTabEngine exposes is responsible for emitting "loaded".
      setMetadata({ sections: [{ name: "Verse One", startBeat: 0 }] });
      // useTabSectionSync sees the rename:
      expect(onMigrateAttachments).toHaveBeenCalledWith(
        "tabs/song.alphatex",
        [{ from: "verse-1", to: "verse-one" }],
      );
    });
  });
  ```

  > If `mockTabEngine` doesn't already exist in this file, the existing tests are using a different pattern — match that pattern instead. Read 30 lines around the first `useTabEngine` mock in this file before writing the test, then adapt the helper accordingly. **The above is a template — adjust to match the actual mock infra in the file.**

- [ ] **Step 3: Run the test to verify it fails.**

  Run:
  ```bash
  npm run test:run -- src/app/knowledge_base/features/tab/TabView.test.tsx
  ```

  Expected: FAIL — new props not accepted yet.

- [ ] **Step 4: Extend `TabView.tsx`.**

  Open `src/app/knowledge_base/features/tab/TabView.tsx`. Make the following surgical edits:

  **(a) Imports** — add at the top alongside existing imports:

  ```ts
  import type { DocumentMeta } from "../document/types";
  import { useTabSectionSync } from "./properties/useTabSectionSync";
  ```

  **(b) Component signature** — replace:

  ```tsx
  export function TabView({ filePath }: { filePath: string }) {
  ```

  with:

  ```tsx
  export interface TabViewProps {
    filePath: string;
    documents?: DocumentMeta[];
    backlinks?: { sourcePath: string; section?: string }[];
    readOnly?: boolean;
    onPreviewDocument?: (path: string) => void;
    onOpenDocPicker?: (entityType: "tab" | "tab-section", entityId: string) => void;
    onDetachDocument?: (docPath: string, entityType: "tab" | "tab-section", entityId: string) => void;
    onMigrateAttachments?: (
      filePath: string,
      migrations: { from: string; to: string }[],
    ) => void;
  }

  export function TabView({
    filePath,
    documents,
    backlinks,
    readOnly,
    onPreviewDocument,
    onOpenDocPicker,
    onDetachDocument,
    onMigrateAttachments,
  }: TabViewProps) {
  ```

  **(c) Hook call** — directly above the `return` JSX, add:

  ```tsx
  useTabSectionSync(
    filePath,
    metadata,
    onMigrateAttachments ?? noopMigrate,
  );
  ```

  And add this constant at module scope (above the component, after imports):

  ```ts
  const noopMigrate = () => {};
  ```

  **(d) `<TabProperties …/>` mount** — replace the existing JSX:

  ```tsx
  <TabProperties
    metadata={metadata}
    collapsed={propertiesCollapsed}
    onToggleCollapse={toggleProperties}
  />
  ```

  with:

  ```tsx
  <TabProperties
    metadata={metadata}
    collapsed={propertiesCollapsed}
    onToggleCollapse={toggleProperties}
    filePath={filePath}
    documents={documents}
    backlinks={backlinks}
    readOnly={readOnly}
    onPreviewDocument={onPreviewDocument}
    onOpenDocPicker={onOpenDocPicker}
    onDetachDocument={onDetachDocument}
  />
  ```

- [ ] **Step 5: Run the tests to verify they pass.**

  Run:
  ```bash
  npm run test:run -- src/app/knowledge_base/features/tab/TabView.test.tsx
  ```

  Expected: all existing tests still pass; new tests pass.

- [ ] **Step 6: Commit.**

  ```bash
  git add src/app/knowledge_base/features/tab/TabView.tsx src/app/knowledge_base/features/tab/TabView.test.tsx
  git commit -m "feat(tabs): TabView wires cross-reference props + section-rename sync (TAB-007a)"
  ```

---

## Task 9: Wire `knowledgeBase.tsx` → `TabView`

**Files:**
- Modify: `src/app/knowledge_base/knowledgeBase.tsx`

We mirror the `DiagramView` block at lines 940–987 for the tab case in `renderTabPaneEntry` (or wherever the tab pane is rendered).

- [ ] **Step 1: Locate the tab pane render call.**

  Run:
  ```bash
  grep -n "renderTabPaneEntry\|TabView\b" src/app/knowledge_base/knowledgeBase.tsx src/app/knowledge_base/knowledgeBase.tabRouting.helper.ts 2>/dev/null
  ```

  Confirm where `<TabView … />` is constructed. (The handler likely lives in `knowledgeBase.tabRouting.helper.ts` since `knowledgeBase.tsx` only delegates via `renderTabPaneEntry(entry)`.)

- [ ] **Step 2: Promote the `TabView` render to the parent so it can access docManager + linkManager.**

  Read the existing `renderTabPaneEntry` helper. If it already only takes `entry`, refactor the tab branch to be inlined in `knowledgeBase.tsx`'s `renderPane` so the tab view can receive the same surfaces `DiagramView` already does. Use the existing `DiagramView` JSX block (lines 940–987) as the template.

  Replace whatever currently produces the `TabView` JSX with:

  ```tsx
  if (entry.fileType === "tab") {
    return (
      <TabView
        filePath={entry.filePath}
        documents={docManager.documents}
        backlinks={entry.filePath ? linkManager.getBacklinksFor(entry.filePath) : []}
        onPreviewDocument={(docPath) => handleOpenDocument(docPath)}
        onOpenDocPicker={(entityType, entityId) => {
          // Reuse the existing diagram doc picker.
          handleOpenDocPicker(entityType, entityId);
        }}
        onDetachDocument={(docPath, entityType, entityId) => {
          docManager.detachDocument(docPath, entityType, entityId);
        }}
        onMigrateAttachments={(filePath, migrations) => {
          docManager.migrateAttachments(filePath, migrations);
        }}
      />
    );
  }
  ```

  > **If `handleOpenDocPicker` is currently named differently / takes different args**, follow whatever the diagram block does for `onOpenDocPicker`. The literal name above is illustrative; match the actual symbol in the file.

  Add the `TabView` import at the top of `knowledgeBase.tsx` if it's not already imported there (it currently lives in the helper; either re-export from the helper or import directly).

- [ ] **Step 3: Run the typechecker.**

  Run:
  ```bash
  npx tsc --noEmit
  ```

  Expected: no errors. Fix any import / signature mismatches surfaced.

- [ ] **Step 4: Run the test suites that exercise the routing.**

  Run:
  ```bash
  npm run test:run -- src/app/knowledge_base/knowledgeBase.tabRouting.test.tsx src/app/knowledge_base/features/tab
  ```

  Expected: green.

- [ ] **Step 5: Manual smoke test (build + dev server).**

  Run:
  ```bash
  npm run build
  ```

  Expected: build completes with no errors. (Per `feedback_preview_verification_limits` memory, the FSA folder picker can't be driven from the preview MCP — build + clean console is the verification ceiling.)

- [ ] **Step 6: Commit.**

  ```bash
  git add src/app/knowledge_base/knowledgeBase.tsx src/app/knowledge_base/knowledgeBase.tabRouting.helper.ts
  git commit -m "feat(tabs): knowledgeBase plumbs cross-reference surface to TabView (TAB-007a)"
  ```

---

## Task 10: Test catalog — `test-cases/11-tabs.md` §11.7

**Files:**
- Modify: `test-cases/11-tabs.md`

Add a new section at the bottom (above the "Future sections" block). Numbering: §11.7, IDs `TAB-11.7-01…`. Status flips to ✅ in the same commit as Task 9 lands the wiring (already merged by this point in the plan; but per project rules the catalog flip and the wiring must ride together — if landing them as separate commits, ensure the same PR).

- [ ] **Step 1: Add the §11.7 block.**

  Open `test-cases/11-tabs.md` and add — after the `## 11.6 Vault search (TAB-011)` block and before `## Future sections`:

  ```markdown
  ## 11.7 Cross-references (TAB-007a)

  Tab properties cross-references: whole-file + per-section explicit attachments and wiki-link backlinks. Section-rename reconciliation. Read-only suppression of the attachment chrome.

  - **TAB-11.7-01** ✅ **`slugifySectionName` derives kebab-case slug** — empty / punctuation-only input falls back to `"section"`. _(unit: `tabEngine.slugify.test.ts`.)_
  - **TAB-11.7-02** ✅ **`getSectionIds` resolves duplicate slugs with `-2`/`-3` suffixes** — order-stable. _(unit: `tabEngine.getSectionIds.test.ts`.)_
  - **TAB-11.7-03** ✅ **`useDocuments.migrateAttachments` rewrites `tab-section` ids on file** — only matching `${filePath}#${old}` entries change; other paths/types untouched. _(unit: `useDocuments.test.ts`.)_
  - **TAB-11.7-04** ✅ **`useTabSectionSync` emits position-aligned migrations on rename** — trailing deletions emit nothing (orphan-by-design). _(unit: `useTabSectionSync.test.tsx`.)_
  - **TAB-11.7-05** ✅ **`useTabSectionSync` resets cache on `filePath` change** — first observation per file is a baseline. _(unit: `useTabSectionSync.test.tsx`.)_
  - **TAB-11.7-06** ✅ **`TabReferencesList` renders empty state when no rows** — _(unit: `TabReferencesList.test.tsx`.)_
  - **TAB-11.7-07** ✅ **`TabReferencesList` distinguishes attachment vs backlink rows** — different icon, attachment-only `[detach]` button. _(unit: `TabReferencesList.test.tsx`.)_
  - **TAB-11.7-08** ✅ **`TabReferencesList` de-duplicates by `sourcePath` with attachment winning over backlink** — _(unit: `TabReferencesList.test.tsx`.)_
  - **TAB-11.7-09** ✅ **`TabReferencesList` hides detach when `readOnly`** — _(unit: `TabReferencesList.test.tsx`.)_
  - **TAB-11.7-10** ✅ **`TabProperties` shows file-level "Whole-file references" listing `tab`-typed attachments** — _(unit: `TabProperties.test.tsx`.)_
  - **TAB-11.7-11** ✅ **`TabProperties` per-section "References" sub-list keyed by deterministic `tab-section` id** — _(unit: `TabProperties.test.tsx`.)_
  - **TAB-11.7-12** ✅ **`TabProperties` Attach affordance opens picker with composite `${filePath}#${sectionId}`** — file-level uses `entityType="tab"`, `entityId=filePath`. _(unit: `TabProperties.test.tsx`.)_
  - **TAB-11.7-13** ✅ **`TabProperties` hides every Attach affordance when `readOnly`** — _(unit: `TabProperties.test.tsx`.)_
  - **TAB-11.7-14** ✅ **`TabProperties` renders duplicate section names with deterministic suffixed ids** — both rows mount, no React key collision. _(unit: `TabProperties.test.tsx`.)_
  - **TAB-11.7-15** ✅ **`TabView` propagates documents + backlinks to `TabProperties`** — _(unit: `TabView.test.tsx`.)_
  - **TAB-11.7-16** ✅ **`TabView` invokes `onMigrateAttachments` when section renames between metadata snapshots** — _(unit: `TabView.test.tsx`.)_
  - **TAB-11.7-17** 🚫 **End-to-end attach via FSA folder picker** — out of scope per `feedback_preview_verification_limits`; covered manually by the `npm run build` smoke test.
  ```

  Also bump the case-count line at the top of the file (it currently reads "62 cases" or similar; update to reflect 62 + 7 new from TAB-011 + 17 new here = check the actual current count first via `grep -c "^- \*\*TAB-11" test-cases/11-tabs.md` and add 17).

- [ ] **Step 2: Verify the count change.**

  Run:
  ```bash
  grep -c "^- \*\*TAB-11" test-cases/11-tabs.md
  ```

  Note the number; update any inline mention in the file header to match.

- [ ] **Step 3: Commit.**

  ```bash
  git add test-cases/11-tabs.md
  git commit -m "test-cases(tabs): §11.7 cross-references catalog (TAB-007a)"
  ```

---

## Task 11: `Features.md` — split off cross-references section

**Files:**
- Modify: `Features.md`

Promote the `Tab attachments` line from `### 11.6 Pending` into its own `### 11.6 Cross-references (TAB-007a)`. Push the existing `### 11.6 Pending` to `### 11.7 Pending`. Keep the legend discipline: ✅ for user-observable, ⚙️ for internal.

- [ ] **Step 1: Edit `Features.md`.**

  Insert before the existing `### 11.6 Pending` header:

  ```markdown
  ### 11.6 Cross-references (TAB-007a)

  - ✅ **Whole-file references** (`src/app/knowledge_base/features/tab/properties/TabProperties.tsx`) — bottom group listing every `.md` doc attached to the tab via `attachedTo: { type: "tab", id: filePath }` plus every wiki-link backlink without a `#section` qualifier. Click to open in the opposite pane; click the paperclip to detach (hidden in `readOnly`).
  - ✅ **Per-section references** — each section row has an inline "References" sub-list using the deterministic kebab-case section id (e.g. `\section "Verse 1"` → `verse-1`). Wiki-link backlinks of the form `[[song#Verse 1]]` and explicit attachments of `attachedTo: { type: "tab-section", id: "${filePath}#${sectionId}" }` both surface here, de-duplicated by source path with attachment winning.
  - ✅ **Attach affordance** — per-section and file-level paperclip buttons open the existing document picker with `(entityType, entityId)` matching the diagram pattern. Hidden when `readOnly`.
  - ✅ **Section-rename reconciliation** — `useTabSectionSync` (`src/app/knowledge_base/features/tab/properties/useTabSectionSync.ts`) diffs the section-id list across metadata snapshots and emits position-aligned migrations to `useDocuments.migrateAttachments`. Trailing deletions orphan by design.
  - ⚙️ **`slugifySectionName` + `getSectionIds`** (`src/app/knowledge_base/domain/tabEngine.ts`) — pure helpers deriving deterministic ids; `getSectionIds` suffixes `-2`/`-3` for duplicate names.
  - ⚙️ **`TabReferencesList`** (`src/app/knowledge_base/features/tab/properties/TabReferencesList.tsx`) — small presentational component used twice per panel for the merge / de-dupe / detach UX.

  ```

  Then update the existing `### 11.6 Pending` header to `### 11.7 Pending`, and remove the `Tab attachments` bullet from inside it (it has just been promoted).

- [ ] **Step 2: Verify Features.md is internally consistent.**

  Run:
  ```bash
  grep -n "^### 11\." Features.md
  ```

  Expected: §11.1 → §11.7 numbering with no gaps; "Pending" is §11.7.

- [ ] **Step 3: Commit.**

  ```bash
  git add Features.md
  git commit -m "docs(features): §11.6 cross-references; push Pending to §11.7 (TAB-007a)"
  ```

---

## Task 12: Final verification — full suite + build + lint

- [ ] **Step 1: Run the full Vitest suite.**

  Run:
  ```bash
  npm run test:run
  ```

  Expected: all suites green. If any unrelated test fails, investigate before opening the PR.

- [ ] **Step 2: Run the e2e suite.**

  Run:
  ```bash
  npm run test:e2e
  ```

  Expected: all 32+ Playwright specs pass (per `project_test_suite_complete` memory). If timing-flaky, retry once before pushing.

- [ ] **Step 3: Build.**

  Run:
  ```bash
  npm run build
  ```

  Expected: clean build, no warnings about missing exports / unresolved imports.

- [ ] **Step 4: Lint.**

  Run:
  ```bash
  npx eslint src/app/knowledge_base/features/tab src/app/knowledge_base/features/document/hooks/useDocuments.ts src/app/knowledge_base/domain/tabEngine.ts src/app/knowledge_base/knowledgeBase.tsx
  ```

  Expected: no errors.

- [ ] **Step 5: Commit any tweaks the verification surfaced.**

  If steps 1–4 turned up adjustments (lint fixes, type tweaks), stage them as a single follow-up commit:

  ```bash
  git add -A
  git commit -m "chore(tabs): post-verification fixes (TAB-007a)"
  ```

---

## Task 13: Handoff doc refresh + PR

Per `feedback_handoff_no_doc_only_pr`: handoff updates ride alongside the feature PR, **not** as a separate doc-only PR.

**Files:**
- Modify: `docs/superpowers/handoffs/2026-05-03-guitar-tabs.md`

- [ ] **Step 1: Update the handoff per protocol.**

  Open `docs/superpowers/handoffs/2026-05-03-guitar-tabs.md` and edit:

  - **Last updated** line — bump date and parenthetical to "after TAB-007a merged; TAB-012 is next."
  - **Where we are** table — append a row for TAB-007a and the PR link (placeholder until `gh pr create` returns the URL; come back and update).
  - **Remaining tickets** — strike TAB-007a's row from the M1 table.
  - **Open follow-up items** — append two new entries:
    1. *Audit diagram flow rename/delete attachment integrity* — flow ids are stable so rename is safe by construction, but deletion may leave orphan `attachedTo` entries (no cleanup hook visible in `DiagramView`). Spec a fix.
    2. *Side-car stable section ids for tabs* — persist `name → stableId` per tab so section renames survive concurrent reorder. Targets TAB-008/M2.
  - **Reference architecture** — add the new files: `TabReferencesList.tsx`, `useTabSectionSync.ts`, `slugifySectionName` + `getSectionIds` helpers in `tabEngine.ts`, `migrateAttachments` in `useDocuments.ts`.
  - **Next Action** — replace with TAB-012 bootstrap (mobile read-only + playback per KB-040). Mention dependencies (TAB-005 — already shipped) and the spec section to read in the design doc.
  - **Test case count** — bump from 69 to 86 (or whatever `grep -c "^- \*\*TAB-11" test-cases/11-tabs.md` reports after Task 10).

- [ ] **Step 2: Stage + commit on the same branch.**

  ```bash
  git add docs/superpowers/handoffs/2026-05-03-guitar-tabs.md
  git commit -m "docs(handoffs): refresh after TAB-007a; mark TAB-012 next"
  ```

- [ ] **Step 3: Push and open the PR.**

  ```bash
  git push -u origin plan/guitar-tabs-properties-cross-refs
  gh pr create --title "feat(tabs): cross-references (TAB-007a)" --body "$(cat <<'EOF'
## Summary
- New file-level + per-section "References" surface in `TabProperties`, merging explicit attachments and wiki-link backlinks (de-dup by source path; attachment wins).
- `TabReferencesList` presentational component, `useTabSectionSync` hook, `useDocuments.migrateAttachments` helper.
- `slugifySectionName` / `getSectionIds` helpers in `domain/tabEngine.ts` give every section a deterministic kebab-case id (closes Open follow-up #7 — unstable React keys on duplicate section names).
- `DocumentMeta.attachedTo[].type` widens additively with `'tab' | 'tab-section'`.
- `knowledgeBase.tsx` plumbs the same attachment surface into `TabView` that `DiagramView` already receives.
- §11.6 Cross-references in `Features.md` (Pending pushed to §11.7); 17 new cases in `test-cases/11-tabs.md` §11.7.
- Handoff doc bumped per protocol; TAB-012 (mobile) is now next.

## Test plan
- [ ] `npm run test:run` — all unit suites green.
- [ ] `npm run test:e2e` — Playwright suite green.
- [ ] `npm run build` — clean build.
- [ ] Manual: open a `.alphatex` file in the dev server, attach a `.md` doc to a section via the paperclip, confirm it appears under that section's References sub-list. Edit the `.alphatex` to rename the section; confirm the attachment migrates.
EOF
  )"
  ```

- [ ] **Step 4: Update the handoff PR row with the URL.**

  Once `gh pr create` returns a URL, edit the handoff doc's `## Where we are` table to use it, amend the previous handoff commit:

  ```bash
  git commit --amend --no-edit
  git push --force-with-lease
  ```

  > Per project rule: only amend before the PR is reviewed. If the PR has already received review, add a new commit instead.

---

## Self-Review

**Spec coverage:**
- §1 Goal — Tasks 1–9 cover the panel surface and wiring.
- §2 Entity types and IDs — Tasks 1–2 derive ids; Task 3 widens the type union; Task 7 wires composite ids in.
- §3 Section ID derivation — Tasks 1–2.
- §4 Section-rename reconciliation — Task 5 (hook); Task 8 (TabView call-site); Task 9 (parent prop wiring).
- §5 `migrateAttachments` — Task 4.
- §6 `TabReferencesList` — Task 6.
- §7 UI structure — Task 7.
- §8 Wiring — Tasks 8–9.
- §9 Tests — every task has its own TDD cycle; Task 12 runs the global suite.
- §10 File-by-file impact — covered across Tasks 1–9, 11.
- §11 Parked follow-ups — Task 13 step 1.
- §12 Acceptance checklist — Task 13 PR description.

**Placeholder scan:** None. Every step has either complete code or a verifiable command. Two notes use `>` to flag context-sensitive adjustments (Task 8 mock pattern, Task 9 `handleOpenDocPicker` symbol name) — these are pointers to verify against the live file, not placeholder content the engineer has to invent.

**Type consistency:**
- `slugifySectionName(name: string): string` — used in Tasks 1, 2, 7.
- `getSectionIds(sections: { name: string }[]): string[]` — used in Tasks 2, 7.
- `migrateAttachments(filePath, migrations[])` — same signature in Tasks 4, 5, 8, 9.
- `useTabSectionSync(filePath, metadata, onMigrate)` — same signature in Tasks 5, 8.
- `TabReferencesList` props — same shape in Task 6 definition and Task 7 usage.
- `TabPropertiesProps` extension — same fields in Task 7 component and Task 8 `TabView` pass-through.
- `entityType: "tab" | "tab-section"` and `entityId` shape — consistent across Tasks 7, 8, 9.

No mismatches found.
