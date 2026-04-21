# Phase 1.3 — markdownReveal Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans.

**Goal:** Split `markdownReveal.ts` (1005 lines) into three focused files: conversion helpers, decoration builders, and the Extension + plugin body. Preserve every behaviour pinned by `markdownReveal.test.ts` and the live-reveal golden-path e2e.

**Architecture:** Three responsibilities today mixed in one file:
1. **Conversion** (~300 lines) — rich block ↔ raw block text, rawBlockToRichNodes, cache helpers.
2. **Decorations** (~70 lines) — SYNTAX_PATTERNS + buildSyntaxDecorations + pushSyntaxDecorations.
3. **Extension + plugin** (~600 lines) — RawBlock node schema + keybindings + the 242-line `appendTransaction`.

After: three siblings matching the pattern from Phase 1.2 (`rawSyntaxEngine.ts`).

**Tech Stack:** Tiptap 3, ProseMirror, TypeScript 5.

**Baseline:** 831 unit + 25 e2e tests passing on Node 22.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/app/knowledge_base/features/document/extensions/markdownRevealConversion.ts` | **Create.** | `marksToRawMarkdown`, `richBlockToRawFragment`, `rawBlockToRichNodes`, `findMergeTarget`, schema-cache helpers. |
| `src/app/knowledge_base/features/document/extensions/markdownRevealDecorations.ts` | **Create.** | `SYNTAX_PATTERNS` const + `pushSyntaxDecorations` + `buildSyntaxDecorations`. |
| `src/app/knowledge_base/features/document/extensions/markdownReveal.ts` | **Modify.** | Stays as the `MarkdownReveal` Extension + `RawBlock` node + keybindings + `addProseMirrorPlugins` (including `appendTransaction`). |
| `src/app/knowledge_base/features/document/extensions/markdownReveal.test.ts` | Untouched. | Pins `SYNTAX_PATTERNS` regex behaviour; must stay green. |
| `src/app/knowledge_base/features/document/components/MarkdownEditor.tsx` | **Modify if needed.** | Update any imports that moved. |
| `src/app/knowledge_base/features/document/extensions/rawSyntaxEngine.ts` | **Modify.** | Import `SYNTAX_PATTERNS` and `rawBlockToRichNodes` from the new files. |
| `Features.md` | **Modify** (final). | Update document-editor section. |

**Out of scope:**
- Breaking up the 242-line `appendTransaction` into named handlers — aspirational, defer.
- Changing any behaviour.
- Changing the public `MarkdownReveal` Extension export, or the `RawBlock` node export.

---

## Pre-flight

- [ ] `source ~/.nvm/nvm.sh && nvm use` (Node 22); `npm ci && npm run test:run && npm run build` green.

---

## Task 1: Extract `markdownRevealConversion.ts`

**Files:**
- Create: `extensions/markdownRevealConversion.ts`
- Modify: `extensions/markdownReveal.ts` (delete moved block, import what we still need)
- Modify: `extensions/rawSyntaxEngine.ts` (import `rawBlockToRichNodes` from the new file)

- [ ] **Step 1:** Read `markdownReveal.ts` lines 30–365. Scope is: `Mark` type imports, `marksToRawMarkdown`, `richBlockToRawFragment` (with inner helpers `flushText`, `transitionMarks`, `closeAllMarks`, `visit`), `cacheFor` / `cacheSet` / `cacheGet`, `rawBlockToRichNodes`, `findMergeTarget`.
- [ ] **Step 2:** Create `markdownRevealConversion.ts`. Export: `marksToRawMarkdown`, `richBlockToRawFragment`, `rawBlockToRichNodes`, `findMergeTarget`. Keep cache helpers + inner visitors private.
- [ ] **Step 3:** Delete moved blocks from `markdownReveal.ts`. Add import `import { richBlockToRawFragment, rawBlockToRichNodes, findMergeTarget, marksToRawMarkdown } from "./markdownRevealConversion";` plus any type imports now needed.
- [ ] **Step 4:** Update `rawSyntaxEngine.ts`: change `import { SYNTAX_PATTERNS, rawBlockToRichNodes } from "./markdownReveal";` to pull `rawBlockToRichNodes` from `markdownRevealConversion` (SYNTAX_PATTERNS still in markdownReveal for now — moves in Task 2).
- [ ] **Step 5:** Remove any newly-unused imports from `markdownReveal.ts` (`Fragment`, `DOMParser` alias, etc.).
- [ ] **Step 6:** `npm run build && npm run test:run && npm run test:e2e` — all green.
- [ ] **Step 7:** Commit `refactor(doc): extract markdownRevealConversion`.

## Task 2: Extract `markdownRevealDecorations.ts`

**Files:**
- Create: `extensions/markdownRevealDecorations.ts`
- Modify: `extensions/markdownReveal.ts`
- Modify: `extensions/rawSyntaxEngine.ts` (re-source `SYNTAX_PATTERNS`)

- [ ] **Step 1:** Read `markdownReveal.ts` lines covering `SYNTAX_PATTERNS` const, `pushSyntaxDecorations`, `buildSyntaxDecorations` (approximately L370–450 post-Task-1).
- [ ] **Step 2:** Create `markdownRevealDecorations.ts`. Export: `SYNTAX_PATTERNS`, `buildSyntaxDecorations`. Keep `pushSyntaxDecorations` private (only called by `buildSyntaxDecorations`).
- [ ] **Step 3:** Delete moved blocks from `markdownReveal.ts`. Add `import { SYNTAX_PATTERNS, buildSyntaxDecorations } from "./markdownRevealDecorations";`.
- [ ] **Step 4:** Update `rawSyntaxEngine.ts` to import `SYNTAX_PATTERNS` from `markdownRevealDecorations` instead of `markdownReveal`.
- [ ] **Step 5:** Check any other importers of `SYNTAX_PATTERNS` (grep) — update each.
- [ ] **Step 6:** `npm run build && npm run test:run && npm run test:e2e`.
- [ ] **Step 7:** Commit `refactor(doc): extract markdownRevealDecorations`.

## Task 3: Cleanup + Features.md

- [ ] **Step 1:** `npm run lint | grep markdownReveal.ts` — remove any newly-unused imports.
- [ ] **Step 2:** Update `Features.md` section 4 document-editor entry to describe the three files.
- [ ] **Step 3:** `npm run test:run && npm run test:e2e && npm run build` — all green.
- [ ] **Step 4:** Commit `refactor(doc): dead-import sweep + Features.md update`.

---

## Definition of Done

- [ ] All 3 tasks complete. Every commit green on Node 22.
- [ ] 831 unit + 25 e2e tests pass unchanged.
- [ ] `markdownReveal.ts` < 700 lines (target; stretch <600).
- [ ] No user-visible behaviour change.
- [ ] `MarkdownReveal` Extension + `RawBlock` node still exported from `markdownReveal.ts`.

## Risk & rollback

- **Risk: `SYNTAX_PATTERNS` import cycle** (markdownRevealDecorations imports from itself? no — it's a const). Should be safe.
- **Risk: `rawBlockToRichNodes` is also exported from the public barrel-like `markdownReveal.ts`.** Mitigation: leave a re-export in `markdownReveal.ts` for backward compat if any caller imports from there.
- **Rollback:** Each task = one commit.
