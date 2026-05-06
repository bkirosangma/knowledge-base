# Diagram Flow Enhancements — Session Handoff

> **Purpose:** A pointer document so that an LLM session with no prior context can resume work on the Diagram Flow Enhancements feature cleanly. Read top-to-bottom, run the bootstrap commands, then jump to **Next Action**.

**Last updated:** 2026-05-06 (MVP-2a ready for review as PR #128; MVP-2b re-plan pending — 4-way attachment type system locked, see § "MVP 2 status" below).

---

## Resume protocol — when the user says "take the next task"

If the user says anything like *"continue from this doc"*, *"take the next task"*, *"resume diagram flow enhancements"*, or just points at this file:

1. Run the **Bootstrap** block below.
2. Skim **Where we are** to confirm which MVP is next — the **Next Action** section names it explicitly.
3. Check open PRs (`gh pr list --state open`). If a Diagram-Flow-Enhancements PR is open, ask the user whether to wait or stack a follow-up branch.
4. Read the spec and the next MVP's plan file.
5. **Branch first** (`git checkout -b mvp1-task-N-<slug>` or similar — see **Branch convention** below), then execute via subagents (`superpowers:subagent-driven-development`).
6. Honour every rule in **Project conventions** (branch-per-task, main protected, no worktrees, etc.).
7. After the task / MVP merges, **update this doc** per the **Doc-update protocol** — same branch as the cleanup, same PR.

The user's intent when pointing here is: *"Pick up where we left off without re-explaining anything."* Don't ask clarifying questions if the doc + spec + plan already answer them; just go.

---

## Doc-update protocol (do this on every task / MVP close)

Before starting the next task, update this doc on the current branch (or fold into the next task's branch). Touch:

1. **Last updated** — bump the date and parenthetical to reflect what just shipped.
2. **Where we are** table — flip the just-shipped task to ✅ Merged with PR number.
3. **Open follow-up items** — add anything the just-merged review surfaced as deferred. Remove items resolved by the merge.
4. **Reference architecture** — add new files / hooks / components introduced. Remove deleted ones.
5. **Next Action** — replace the body with the next task's bootstrap: which plan section to read, key patterns to mirror, ship target.

If you skip the doc update, future sessions will resume from a stale map — that's the failure mode this protocol exists to prevent.

---

## Bootstrap (run first)

```bash
cd "/Users/kiro/My Projects/knowledge-base"
git checkout main && git pull --ff-only
git fetch origin
gh pr list --state open
git log --oneline -10
ls docs/superpowers/specs/2026-05-05-*.md
ls docs/superpowers/plans/2026-05-05-*.md
```

This puts you on the latest `main`, lists open PRs, shows recent merge commits, and lists the spec + 5 plan files.

---

## Where we are

### Spec
| File | Status |
|---|---|
| `docs/superpowers/specs/2026-05-05-diagram-flow-enhancements-design.md` | ✅ Committed on `feat/diagram-flow-enhancements` (commits `24a842c` + `a2c2eea` + `1b99d51`). |

### Plans (5 MVPs)
| MVP | Plan file | Status |
|---|---|---|
| **MVP 1** | Flow Ordering | `docs/superpowers/plans/2026-05-05-flow-ordering-mvp-plan.md` | ✅ Merged (PR #127, commit `2ff16da`). All 17 tasks shipped. |
| **MVP 2** | Cross-Entity Attachment | `docs/superpowers/plans/2026-05-05-cross-entity-attachment-mvp-plan.md` | 🟡 Split: **MVP-2a** ✅ Ready for review (PR #128, Tasks 1–2: data-model + persistence). **MVP-2b** Tasks 3–10 await re-plan against actual code, honouring the 4-way attachment type system decision (see "MVP 2 status" below). |
| **MVP 3** | Wiki-Link Anchors | `docs/superpowers/plans/2026-05-05-wiki-link-anchors-mvp-plan.md` | ✅ Committed. 10 tasks. ❌ Not implemented. |
| **MVP 4** | Source Links | `docs/superpowers/plans/2026-05-05-source-links-mvp-plan.md` | ✅ Committed. 8 tasks. ❌ Not implemented. |
| **MVP 5** | KB Skill Update | `docs/superpowers/plans/2026-05-05-kb-skill-update-mvp-plan.md` | ✅ Committed. 12 tasks. ❌ Not implemented. Depends on MVPs 1–4 deployed first. |

### Implementation
**MVP 1 (Flow Ordering) merged** via PR #127 on 2026-05-06 (squash commit `2ff16da`). **MVP-2a ready for review** as PR #128 (Tasks 1–2 of the original 12-task plan). **MVP-2b** (Tasks 3–10 — UI + refactor) pending re-plan; user has locked the 4-way attachment type system as a forward-compatible target for the re-plan.

---

## Recommended order

1. **MVP 1 first** — it's the foundation; data-model decisions there constrain MVPs 2–5. Ship it, merge it, validate manually.
2. **MVP 2, 3, 4 in any order, in parallel branches if you have agent capacity.** They're independent of each other (MVP 2 is diagram-feature, MVP 3 is doc-feature, MVP 4 is cross-cutting properties UX).
3. **MVP 5 last.** The skill changes are forward-compatible (new fields are optional in the app), but the skill's output only becomes useful once MVPs 1–4 are merged so the running app honours the fields.

---

## Branch convention

For task-by-task execution (subagent-driven-development):

- One branch per **MVP**, not one per task. Branch off `main`: `git checkout -b feat/diagram-mvp1-flow-ordering`.
- Commit per task within the MVP branch (each plan task has its own commit step).
- Open the PR when the MVP is complete (after the last task in that plan).
- For larger MVPs (1, 2, 5), if review feedback splits the work into staged PRs, create stacked branches: `feat/diagram-mvp1-tasks-1-5` and `feat/diagram-mvp1-tasks-6-17` etc.

The current `feat/diagram-flow-enhancements` branch holds the spec + plans only; it's appropriate as the parent for the spec PR. When implementation starts, create new branches off `main` per the table above — do not implement on the spec branch.

---

## MVP 2 status — partial, plan needs re-grounding (2026-05-06)

**Shipped on `feat/diagram-mvp2-cross-entity-attachment` (draft PR pending):**
- Task 1 (commit `1bfef4d`): `EntityAttachment` + `EntityAttachmentTarget` shared types in `features/document/types.ts`. Reviewed ✅ spec + ✅ quality.
- Task 2 (commits `516bd46` + `40a63e3` fixup): `attachedTo?: EntityAttachment[]` on `DiagramData` (in `shared/utils/types.ts`, not where the plan said), threaded through `loadDiagramFromData`, accepted by `isDiagramData` shape guard, round-trip test added. Reviewed ✅ spec + ✅ quality.

**Why we stopped after Task 2:** the plan at `docs/superpowers/plans/2026-05-05-cross-entity-attachment-mvp-plan.md` references files and symbols that don't exist or behave differently:

- `SvgMeta` (`features/svgEditor/types.ts`) — neither type nor file exists. SVG persists raw XML via `useSVGPersistence.writeSvg` with **no metadata sidecar**. Adding `attachedTo` to SVG requires designing a new sidecar file format — load-bearing design work nobody specified.
- `TabMeta` (`features/tab/types.ts`) — neither exists. Tab uses `TabMetadata` (engine output, in `domain/tabEngine.ts`) and `TabRefsPayload` v2 (refs sidecar, in `domain/tabRefs.ts`). Neither is the right home for `attachedTo`; bumping the sidecar to v3 needs design + migration.
- `documentAttachments.ts` helpers (`hasDocuments`, `getDocumentsForEntity`) are imported only by their own test. The runtime aggregation that Task 4 wants to widen actually lives on `useDocuments` (in `features/document/hooks/useDocuments.ts:154-208`), not in the standalone helpers or in `useDiagramAttachments` (which owns callbacks + a deferred-delete queue, not aggregation).
- The plan's "rename `attachedDocsFor` → `attachmentsFor`" instruction has no target — `attachedDocsFor` doesn't exist.
- The plan's file-path for `DiagramData` (`features/diagram/types.ts`) is wrong — it's in `shared/utils/types.ts`. Already adapted for Task 2.

**Product decisions locked (2026-05-06, by user):**

1. **4-way attachment type system.** UI must be built around `'document' | 'diagram' | 'svg' | 'tab'` from the start, even though SVG and Tab branches are no-ops until their persistence sidecars ship. Forward-compat over minimalism — the re-plan must reflect this.
2. **Split shipment.** Tasks 1–2 ship as **MVP-2a** (PR #128, ready for review). The UI/refactor tasks become **MVP-2b** on a fresh re-grounded plan. MVP-2b branches off MVP-2a (or off `main` after #128 merges — whichever the re-plan picks).

**Next step:** re-plan MVP-2b (Tasks 3–10 of the original plan) against actual code. The new plan must:
- Honour the 4-way type system decision above.
- Treat SVG and Tab source-type branches as runtime no-ops with extension points (no rendered glyphs/tabs/rows when their lists are empty), not as guarded compile-time conditionals.
- Re-target the renames and widening to the actual call sites surveyed below.

### Deferred to a future MVP — "SVG/Tab attachment persistence"

To complete the four-way attachment story (whenever it's prioritised):
- Design + ship an SVG sidecar shape (likely `<file>.svg.refs.json` modelled on `TabRefsPayload`).
- Either bump `TabRefsPayload` to v3 with an optional `attachedTo` field or add a separate `<file>.alphatex.attachments.json` sidecar.
- Pre-conditions: a brainstorm + spec slice before any of MVPs 3/4 lock in their own writes against these shapes.

## Open follow-up items

(See "MVP 2 status" above for the active deviation log.)

---

## Project conventions to honour

These are durable; pull from `MEMORY.md` before any change.

- **Branch per unit of work** (`feedback_branch_per_unit_of_work.md`) — `git checkout -b` BEFORE the first commit on any task. Never commit directly on `main`, even one-liners.
- **Main is protected** (`project_branch_protection.md`) — push to a branch, open a PR via `gh pr create`. Never `git push origin main` directly.
- **No git worktrees** (`feedback_no_worktrees.md`) — work directly on feature branches.
- **`useRepositories()` only works below `RepositoryProvider`** (`project_repository_context_deferred.md`) — `KnowledgeBaseInner` is *above* the provider; hooks called there must take the repository as a prop.
- **Verification ceiling** (`feedback_preview_verification_limits.md`) — preview MCP can't drive the FSA folder picker; clean build + clean console is the verification ceiling.
- **Worktree baseline** (`feedback_worktree_nvm_baseline.md`) — match `.nvmrc` before `npm ci`.
- **Tiptap v3 named exports** — and `immediatelyRender: false` for SSR.

---

## Reference architecture (where the new code will land)

### Diagram feature (MVPs 1, 2)

| Path | Concern |
|---|---|
| `src/app/knowledge_base/features/diagram/types.ts` | All entity types (extended in MVP 1, MVP 2, MVP 4). |
| `src/app/knowledge_base/features/diagram/utils/flowUtils.ts` | `computeFlowRoles` is removed in MVP 1 Task 4. |
| `src/app/knowledge_base/features/diagram/hooks/useDiagramFlowFocus.ts` | `flowOrderData` rewritten in MVP 1 Task 3. |
| `src/app/knowledge_base/features/diagram/components/OrderBadge.tsx` | New in MVP 1 Task 5. |
| `src/app/knowledge_base/features/diagram/components/LockBanner.tsx` | New in MVP 1 Task 9. |
| `src/app/knowledge_base/features/diagram/state/DiagramInteractionContext.tsx` | `LockedFlow` slice in MVP 1 Task 8. |
| `src/app/knowledge_base/features/diagram/components/AttachmentIndicator.tsx` (renamed from `DocInfoBadge`) | MVP 2 Task 5. |
| `src/app/knowledge_base/features/diagram/components/AttachmentPreviewModal.tsx` (renamed from `DocPreviewModal`) | MVP 2 Task 6. |
| `src/app/knowledge_base/features/diagram/components/CreateAttachEntityModal.tsx` (renamed) | MVP 2 Task 7. |
| `src/app/knowledge_base/features/diagram/properties/AttachmentsSection.tsx` (renamed from `DocumentsSection`) | MVP 2 Task 8. |
| `src/app/knowledge_base/features/diagram/utils/entityAttachments.ts` (renamed from `documentAttachments`) | MVP 2 Task 3. |

### Document feature (MVP 3)

| Path | Concern |
|---|---|
| `src/app/knowledge_base/features/document/utils/headerSlug.ts` | New in MVP 3 Task 1. |
| `src/app/knowledge_base/features/document/utils/extractHeaders.ts` | New in MVP 3 Task 2. |
| `src/app/knowledge_base/features/document/hooks/useLinkIndex.ts` | `headers` map + `findHeaderRename` in MVP 3 Task 3. |
| `src/app/knowledge_base/features/document/components/MarkdownPane.tsx` | `anchor` prop + scroll in MVP 3 Task 4. |
| `src/app/knowledge_base/features/document/components/HeadingCopyLink.tsx` | New in MVP 3 Task 6. |
| `src/app/knowledge_base/shared/components/BrokenAnchorBanner.tsx` | New in MVP 3 Task 9. |

### Source links (MVP 4)

| Path | Concern |
|---|---|
| `src/app/knowledge_base/shared/types/sources.ts` | New in MVP 4 Task 1. |
| `src/app/knowledge_base/shared/components/SourcesSection.tsx` | New in MVP 4 Task 6. |
| `src/app/knowledge_base/features/svgEditor/utils/svgMetaSidecar.ts` | New in MVP 4 Task 5. |

### Knowledge-base skill (MVP 5)

| Path | Concern |
|---|---|
| `~/.claude/skills/knowledge-base/commands/diagram.md` | Steps 1.5, 3a, 3e in MVP 5 Tasks 1–3. |
| `~/.claude/skills/knowledge-base/commands/{document,svg,guitar-tabs}.md` | Step 1.5 source gathering. |
| `~/.claude/skills/knowledge-base/commands/{edit,validate,transform}.md` | New rules. |
| `~/.claude/skills/knowledge-base/archetypes/{roadmaps,software-architecture,_archetype-template}.md` | Examples + new sections. |

---

## Spec key decisions (cheat-sheet for fresh sessions)

These are the load-bearing decisions you should not relitigate without explicit user OK:

1. **Order numbers on nodes, flow-scoped, optional.** Multiple nodes can share an order (parallel steps). Same node can have different orders in different flows. Connections do **not** carry order numbers.
2. **Start/end manually authored.** `startNodeIds: string[]`, `endNodeIds: string[]` on `FlowDef`. Multiple starts and multiple ends allowed. **No heuristic fallback.**
3. **No migration.** Existing flows render with no order/start/end until the author edits.
4. **Lock-into-Flow mode.** Triggered from FlowProperties or `Cmd/Ctrl+L`. Session-only. Non-members dimmed + `pointer-events: none`. Canvas click does not deselect. Properties panel stacks `<FlowProperties>` + selected `<ElementProperties>`.
5. **Read mode badge:** blue corner numeral (top-left). **Edit mode (lock+edit):** dashed editable input in same position. Start/end uses existing green/red glow border + the existing "Start"/"End" pill above the node (KB-032 preserved).
6. **Cross-entity attachment is reciprocal/unified.** Any of `document/diagram/svg/tab` attaches to any of `node/connection/flow`. Single `<AttachmentIndicator>` on nodes shows glyphs (no count). Single `<AttachmentPreviewModal>` renders all four entity types read-only.
7. **Flow descriptions:** rich primary doc per flow (not a hub). Optional sibling extension docs in `flow-descriptions/<flow-id>/<subtopic>.md` when subtopic warrants. Wiki-link section anchors (`[[doc.md#header]]`) clickable, scroll on open. Copy-link icon on every heading. Header rename auto-refactors references; header delete surfaces broken-anchor banner.
8. **Source links** on every primary entity (diagram, node, connection, layer, flow, document, svg, tab). Mandatory at skill-generation time; empty list valid for hand-authored content.

---

## Next Action

**Wait for MVP-2a (PR #128) to merge, then re-plan MVP-2b and execute it.**

Concrete next steps:

1. **Merge MVP-2a.** Watch PR #128. Once merged, sync `main`, delete the local `feat/diagram-mvp2-cross-entity-attachment` branch, and update this doc to flip MVP-2a in the table to ✅ Merged.
2. **Re-plan MVP-2b** using `superpowers:writing-plans` *with the live codebase open*. Constraints:
   - **4-way type system** — `'document' | 'diagram' | 'svg' | 'tab'` is the contract throughout (locked by user, see "MVP 2 status").
   - **SVG/Tab branches are runtime no-ops** — empty lists, no rendered rows/glyphs/tabs, but the wiring is in place so adding their persistence in a future MVP needs no UI changes.
   - **Re-target Tasks 3–4** at `useDocuments` (`features/document/hooks/useDocuments.ts:154–208`) where runtime aggregation actually lives. The standalone `documentAttachments.ts` helpers are imported only by their own test — likely best to delete or absorb into the new `entityAttachments.ts` module.
   - **`useDiagramAttachments` keeps its callback + deferred-delete responsibility** — do not bolt aggregation onto it.
   - **Survey the prop chain** before writing Task 5–8 texts: `Element.tsx`, `DataLine.tsx`, `DiagramCanvas.tsx`, `DiagramLinesOverlay.tsx`, `knowledgeBase.tsx`, properties panels, the `DocPreviewModal` / `DocInfoBadge` / `CreateAttachDocModal` / `DocumentsSection` call sites — list every consumer that the rename touches.
3. **Branch off `main`** as `feat/diagram-mvp2b-cross-entity-attachment-ui` and execute via `superpowers:subagent-driven-development`.
4. **After MVP-2b merges, update this doc** per the Doc-update protocol — flip the MVP 2 row to ✅ Merged and rewrite Next Action to "Implement MVP 3, 4 in parallel (or sequentially)".

If you hit a blocker mid-MVP, commit work in progress on the branch and add a new entry under "MVP 2 status" with what's blocking and what you tried.
