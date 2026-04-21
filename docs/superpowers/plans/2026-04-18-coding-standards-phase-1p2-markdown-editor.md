# Phase 1.2 — MarkdownEditor Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans.

**Goal:** Decompose `MarkdownEditor.tsx` (1018 lines, one file) into a composition root + raw-syntax engine + toolbar + table picker, preserving every externally-observable behaviour pinned by the existing unit tests (`MarkdownEditor.test.tsx` — 17 tests including content-sync + toolbar) and e2e (`e2e/documentGoldenPath.spec.ts`).

**Architecture:** The file today mixes:
- 8 raw-syntax helper functions (`countConsecutiveChar`, `findEnclosingSyntaxRange`, `toggleRawSyntax`, `getActiveRawFormats`, `getRawHeadingLevel`, `isRawBlockquote`, `toggleRawBlockType`, `forceExitRawBlock`) — pure functions of `editor` state. ~450 lines.
- Two toolbar UI primitives (`TBtn`, `Sep`) and a `TablePicker` component (~100 lines).
- The main `MarkdownEditor` component (L608–1018) wiring editor + content sync + toolbar JSX.

After: one file per responsibility — pure engine / isolated picker / toolbar JSX / composition root.

**Tech Stack:** React 19, Tiptap 3, TypeScript 5, Vitest + Playwright.

**Baseline:** 831 unit + 25 e2e tests passing. Every task runs `npm run test:run + test:e2e + build` on Node 22 before committing.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/app/knowledge_base/features/document/extensions/rawSyntaxEngine.ts` | **Create.** | The 8 editor-coupled raw-syntax functions moved verbatim. Pure functions taking `editor` (and sometimes extra args). |
| `src/app/knowledge_base/features/document/components/TablePicker.tsx` | **Create.** | The 8×8 grid popup for inserting a table with a chosen size. |
| `src/app/knowledge_base/features/document/components/MarkdownToolbar.tsx` | **Create.** | The whole toolbar JSX block (bold/italic/heading/list/table/link buttons + Raw/WYSIWYG tabs) including `TBtn` and `Sep` primitives. |
| `src/app/knowledge_base/features/document/components/MarkdownEditor.tsx` | **Modify.** | Stays as the composition root: editor host, content-sync effect, prop plumbing to `MarkdownToolbar`. Target: ~300–400 lines. |
| `Features.md` | **Modify.** | Update section 4 (Document Editor) to describe the new composition. |

**Out of scope:**
- Extracting helpers out of `markdownReveal.ts` (separate Phase 1.3).
- Any behaviour changes to the raw-syntax engine — this is a pure move.
- Coverage changes to `MarkdownEditor.test.tsx`; existing tests must continue to pass unchanged.

---

## Pre-flight

- [ ] `source ~/.nvm/nvm.sh && nvm use` (Node 22).
- [ ] `npm ci && npm run test:run && npm run test:e2e && npm run build` — all green.

---

## Task 1: Extract `rawSyntaxEngine.ts`

**Why first:** Biggest single chunk (~450 lines). Pure functions — mechanical move. Zero JSX. Lowest risk.

**Files:**
- Create: `src/app/knowledge_base/features/document/extensions/rawSyntaxEngine.ts`
- Modify: `src/app/knowledge_base/features/document/components/MarkdownEditor.tsx` (delete the moved block, import from new file)

- [ ] **Step 1:** Read `MarkdownEditor.tsx` lines 79–517 (the span covering all 8 functions + their private helpers).
- [ ] **Step 2:** Create `extensions/rawSyntaxEngine.ts` with the following **exported** functions (move each verbatim including their local helper `shouldSkip` / `wrapSide`): `countConsecutiveChar`, `findEnclosingSyntaxRange`, `toggleRawSyntax`, `getActiveRawFormats`, `getRawHeadingLevel`, `isRawBlockquote`, `toggleRawBlockType`, `forceExitRawBlock`. Move any type-only imports they need (Tiptap types, `SYNTAX_PATTERNS` from `markdownReveal`, `RAW_BLOCK_NAME` etc.).
- [ ] **Step 3:** Delete the moved blocks from `MarkdownEditor.tsx`. Add: `import { toggleRawSyntax, getActiveRawFormats, getRawHeadingLevel, isRawBlockquote, toggleRawBlockType, forceExitRawBlock } from "../extensions/rawSyntaxEngine";`. `countConsecutiveChar` and `findEnclosingSyntaxRange` are internal helpers — don't re-export if only used internally by the engine.
- [ ] **Step 4:** Remove any now-unused imports in `MarkdownEditor.tsx` (likely `SYNTAX_PATTERNS`, `TextSelection`, `NodeRange`, etc.).
- [ ] **Step 5:** `npm run build && npm run test:run && npm run test:e2e` — all green. Tests must be **identical** count (831 unit + 25 e2e).
- [ ] **Step 6:** Commit `refactor(doc): extract rawSyntaxEngine from MarkdownEditor` with Co-Authored-By.

## Task 2: Extract `TablePicker.tsx`

**Files:**
- Create: `src/app/knowledge_base/features/document/components/TablePicker.tsx`
- Modify: `components/MarkdownEditor.tsx`

- [ ] **Step 1:** Read lines 531–606 of `MarkdownEditor.tsx` (the `TablePicker` function + its local `close` helper).
- [ ] **Step 2:** Create `components/TablePicker.tsx` — default-export the component. Preserve the exact JSX, state, and click-away behaviour.
- [ ] **Step 3:** Remove the function from `MarkdownEditor.tsx`; add `import TablePicker from "./TablePicker";`.
- [ ] **Step 4:** Remove any now-unused imports.
- [ ] **Step 5:** Full verify (build + test:run + test:e2e).
- [ ] **Step 6:** Commit `refactor(doc): extract TablePicker component`.

## Task 3: Extract `MarkdownToolbar.tsx`

**Files:**
- Create: `src/app/knowledge_base/features/document/components/MarkdownToolbar.tsx`
- Modify: `components/MarkdownEditor.tsx`

- [ ] **Step 1:** In `MarkdownEditor.tsx`, locate the toolbar JSX — the block starting at the `!readOnly && (<div>...</div>)` wrapper around all the formatting buttons (grep for `isAct("bold")` or `isH(1)` to find the buttons). It spans roughly from the start of the toolbar to the `<TablePicker />` usage.
- [ ] **Step 2:** Move `TBtn` (L52–72) and `Sep` (L74–76) into `MarkdownToolbar.tsx` as internal components. They become unexported helpers inside the toolbar file.
- [ ] **Step 3:** Enumerate closed-over identifiers in the toolbar JSX by grep. Common ones:
  - State values: `editor`, `rawFormats`, `rawH`, `rawBQ`, `mode`, `linkMode`, `showTablePicker`
  - Setters: `setShowTablePicker`, `setMode`, `setLinkMode`
  - Callbacks that invoke engine: `handleBold`, `handleItalic`, `handleStrike`, `handleCode`, `handleHeading`, `handleBlockquote`, `handleBulletList`, `handleOrderedList`, `handleTaskList`, `handleHR`, `handleUndo`, `handleRedo`
  - `isAct` / `isH` predicate helpers (L881–882) — move into the toolbar file since they're toolbar-specific.
- [ ] **Step 4:** Create `MarkdownToolbar.tsx` with a `MarkdownToolbarProps` interface listing every referenced identifier, and the JSX wrapped in `<div className="...">...</div>`.
- [ ] **Step 5:** Replace the JSX in `MarkdownEditor.tsx` with `<MarkdownToolbar {...} />` passing all the state/handlers.
- [ ] **Step 6:** Remove now-unused imports (Lucide icons that moved, etc.).
- [ ] **Step 7:** Full verify. Particularly watch the DOC-4.5 toolbar tests (`MarkdownEditor.test.tsx`) — if they fail, it's a missing prop.
- [ ] **Step 8:** Commit `refactor(doc): extract MarkdownToolbar component`.

## Task 4: Cleanup + Features.md

- [ ] **Step 1:** `npm run lint | grep MarkdownEditor.tsx` — fix any newly-unused imports.
- [ ] **Step 2:** Update `Features.md` section 4.x describing MarkdownEditor to list the new `rawSyntaxEngine`, `TablePicker`, `MarkdownToolbar`.
- [ ] **Step 3:** Final verify.
- [ ] **Step 4:** Commit `refactor(doc): dead-import sweep + Features.md update`.

---

## Definition of Done

- [ ] All 4 tasks complete. Every commit green on Node 22.
- [ ] 831 unit + 25 e2e tests pass unchanged.
- [ ] `MarkdownEditor.tsx` < 500 lines (target; stretch <400).
- [ ] `rawSyntaxEngine.ts` exports the 8 editor-coupled functions.
- [ ] No user-visible behaviour change.
- [ ] `MarkdownEditorProps` exported interface unchanged.

## Risk & rollback

- **Risk: Type drift on `MarkdownToolbarProps`** (same pattern as Phase 1.1 Task 4). Mitigation: run full `npm run build` (tsc) after every extraction. Phase 1.1 caught several only at build time, not during turbopack compile.
- **Risk: Raw-syntax functions rely on a private helper that stays in MarkdownEditor.** Mitigation: move `shouldSkip` / `wrapSide` together with their parent function.
- **Rollback:** Each task = one commit = `git revert <SHA>`.
