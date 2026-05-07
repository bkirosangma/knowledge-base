# Diagram Flow Enhancements — Session Handoff

> **Purpose:** A pointer document so that an LLM session with no prior context can resume work on the Diagram Flow Enhancements feature cleanly. Read top-to-bottom, run the bootstrap commands, then jump to **Next Action**.

**Last updated:** 2026-05-07 (MVP-4b — SVG/Tab metadata persistence and source links — implemented on `feat/diagram-mvp4b-svg-tab-metadata`: 20 commits, ~16 files, brainstormed → spec'd → planned → shipped via subagent-driven-development. SVG `.svg.refs.json` sidecar + Tab `.alphatex.refs.json` v3 migration both wired; `<SourcesSection>` mounted in new `SvgProperties` aside and existing `TabProperties`. Forward-compat `attachedTo?` field accepted by both schemas (no UI binds it — reserved for the deferred MVP-2 SVG/Tab attachments). 2418/2418 tests pass; typecheck + build clean.).

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
| **MVP 2** | Cross-Entity Attachment | `docs/superpowers/plans/2026-05-05-cross-entity-attachment-mvp-plan.md` (original) + `docs/superpowers/plans/2026-05-06-cross-entity-attachment-mvp2b-plan.md` (re-grounded) | ✅ Merged via two PRs: **MVP-2a** PR #128 squash `006cf5f` (Tasks 1–2: data-model + persistence). **MVP-2b** PR #129 squash `30ae048` (4-way UI contract + document-only data layer). |
| **MVP 3** | Wiki-Link Anchors | `docs/superpowers/plans/2026-05-05-wiki-link-anchors-mvp-plan.md` | ✅ Merged (PR #132, squash `ca85890`). All 10 tasks shipped. |
| **MVP 4** | Source Links | `docs/superpowers/plans/2026-05-05-source-links-mvp-plan.md` (original) + `docs/superpowers/plans/2026-05-06-source-links-mvp4a-plan.md` (re-grounded MVP-4a) + `docs/superpowers/plans/2026-05-07-svg-tab-metadata-persistence-mvp4b-plan.md` (MVP-4b) | ✅ **MVP-4a** merged via PR #133 squash `cb41629` (8 tasks: diagram entities + document) plus hardening follow-up PR #135 squash `55319f8` (empty-URL frontmatter graceful-degrade). ✅ **MVP-4b** (SVG + Tab source links) shipped on `feat/diagram-mvp4b-svg-tab-metadata` — 13 tasks via subagent-driven-development. New `<file>.svg.refs.json` sidecar + `TabRefsPayload` bumped v2→v3; `<SourcesSection>` mounted in new `SvgProperties` aside and existing `TabProperties`. |
| **MVP 5** | KB Skill Update | `docs/superpowers/plans/2026-05-05-kb-skill-update-mvp-plan.md` | 🟢 Implemented. 10 of 12 tasks shipped (Tasks 5 and 6 covered the SVG/Tab archetype skill docs; now unblocked by MVP-4b — follow-up tracked under "Open follow-up items"). Skill-repo branch `feat/mvp5-flow-enhancements` has 11 commits at `~/.claude/skills/knowledge-base/`. Two `--fix` gaps were closed by MVP-5b (PRs #143, #144). |

### Implementation
**MVP 1 (Flow Ordering) merged** via PR #127 on 2026-05-06 (squash commit `2ff16da`). **MVP-2a (data-model + persistence) merged** via PR #128 on 2026-05-06 (squash commit `006cf5f`, Tasks 1–2 of the original 12-task plan). **MVP-2b (UI + refactor) merged** via PR #129 on 2026-05-06 (squash commit `30ae048`, 17 commits against the re-grounded plan `docs/superpowers/plans/2026-05-06-cross-entity-attachment-mvp2b-plan.md`). **MVP 3 (Wiki-Link Anchors) merged** via PR #132 on 2026-05-06 (squash commit `ca85890`, all 10 tasks of `docs/superpowers/plans/2026-05-05-wiki-link-anchors-mvp-plan.md`). **MVP-4a (Source Links — diagram entities + document) merged** via PR #133 on 2026-05-06 (squash commit `cb41629`, all 8 tasks of `docs/superpowers/plans/2026-05-06-source-links-mvp4a-plan.md`); a hardening follow-up landed via PR #135 squash `55319f8` (empty-URL frontmatter graceful-degrade — drafts filter at save boundary, parser preserves unknown rows on parse failure). **MVP 5 (KB Skill Update) execution begun** on `feat/diagram-mvp5-kb-skill-update` against `docs/superpowers/plans/2026-05-05-kb-skill-update-mvp-plan.md` (12 tasks).

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

## MVP 2 status — both phases merged; SVG/Tab branches deferred (2026-05-06)

**Shipped via PR #128 (squash `006cf5f`, branch `feat/diagram-mvp2-cross-entity-attachment` deleted post-merge):**
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
2. **Split shipment.** Tasks 1–2 shipped as **MVP-2a** (PR #128 merged 2026-05-06, squash `006cf5f`). The UI/refactor tasks become **MVP-2b** on a fresh re-grounded plan, branched off `main` post-merge as `feat/diagram-mvp2b-cross-entity-attachment-ui`.

**Next step (in progress):** re-plan MVP-2b (Tasks 3–10 of the original plan) against actual code on branch `feat/diagram-mvp2b-cross-entity-attachment-ui`. The new plan must:
- Honour the 4-way type system decision above.
- Treat SVG and Tab source-type branches as runtime no-ops with extension points (no rendered glyphs/tabs/rows when their lists are empty), not as guarded compile-time conditionals.
- Re-target the renames and widening to the actual call sites surveyed below.

### Deferred to a future MVP — "SVG/Tab metadata persistence" (covers MVP-2 attachments + MVP-4b sources)

The same blocker stops two distinct features. Resolve it once and both unlock:

- **For attachments (`attachedTo`, MVP 2 deferral):** design + ship an SVG sidecar shape (likely `<file>.svg.refs.json` modelled on `TabRefsPayload`); for tab, either bump `TabRefsPayload` to v3 with an optional `attachedTo` field or add a separate `<file>.alphatex.attachments.json` sidecar.
- **For sources (`sources`, MVP-4b deferral):** the original MVP-4 plan called for SVG `<filename>.meta.json` and an AlphaTex `\sources` header (or trailing-comment fallback). Both fit the same metadata-persistence shape — the SVG sidecar can hold `{ sources, attachedTo }`; the tab sidecar/header can carry both fields.
- **Pre-conditions:** a brainstorm + spec slice on the unified SVG/Tab metadata-persistence pattern. Once that lands, MVP-4b (SVG + Tab branches of the source-links UI) becomes a thin task — wire `<SourcesSection>` into `SvgProperties` / `TabProperties` (those panels currently exist for tabs as `features/tab/properties/TabProperties.tsx`; SVG would need a new `SvgProperties.tsx`) against the new metadata layer.

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

### Source links (MVP-4a)

| Path | Concern |
|---|---|
| `src/app/knowledge_base/shared/types/sources.ts` | New in MVP-4a Task 1. |
| `src/app/knowledge_base/shared/components/SourcesSection.tsx` | New in MVP-4a Task 4. |
| `src/app/knowledge_base/features/document/utils/frontmatter.ts` | New in MVP-4a Task 6 — first frontmatter parser in the codebase (today the codebase only **strips** frontmatter). |
| `src/app/knowledge_base/features/diagram/properties/{Diagram,Node,Line,Layer,Flow}Properties.tsx` | Modified in MVP-4a Task 5 — wire `<SourcesSection>`. |
| `src/app/knowledge_base/features/document/properties/DocumentProperties.tsx` | Modified in MVP-4a Task 7 — wire `<SourcesSection>`. |

### Source links (MVP-4b — closed 2026-05-07)

| Path | Resolution |
|---|---|
| `src/app/knowledge_base/domain/svgRefs.ts` | ✅ New domain types for `<file>.svg.refs.json` sidecar (lazy creation, delete-when-empty). |
| `src/app/knowledge_base/infrastructure/svgRefsRepo.ts` | ✅ FSA-backed repo mirroring `tabRefsRepo`. `deleteSidecar` differentiates `not-found` vs other classified errors. |
| `src/app/knowledge_base/domain/tabRefs.ts` | ✅ Bumped to v3 — adds optional `sources` and reserved `attachedTo`. v1/v2 retained for read migration. |
| `src/app/knowledge_base/infrastructure/tabRefsRepo.ts` | ✅ Reads v1, v2, v3 (each → v3 in memory); always emits v3; drops empty arrays from JSON. |
| `src/app/knowledge_base/features/svgEditor/hooks/useSvgMeta.ts` | ✅ New hook — debounced 200 ms, file-switch flush, write-failure leaves isDirty true. |
| `src/app/knowledge_base/features/tab/hooks/useTabSources.ts` | ✅ New hook with read-modify-write merge guard so `useTabEngine`'s sectionRefs/trackRefs writes are not clobbered. |
| `src/app/knowledge_base/features/svgEditor/properties/SvgProperties.tsx` | ✅ New collapsible aside hosting `<SourcesSection>` driven by `useSvgMeta`. |
| `src/app/knowledge_base/features/tab/properties/TabProperties.tsx` | ✅ `<SourcesSection>` mounted at file scope, adjacent to FileReferences. |
| `src/app/knowledge_base/shared/types/attachments.ts` | ✅ Shared `AttachedToScope`/`AttachedToEntry` for forward-compat `attachedTo?` on both sidecars. |
| AlphaTex `\sources` inline header | ❌ Rejected — invasive to user's tab text; sidecar is cleaner. |

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

**MVP-4b (SVG/Tab metadata persistence + source links) is implemented and ready for review on `feat/diagram-mvp4b-svg-tab-metadata`. With MVP-5b already merged (PRs #143, #144), the only remaining slice is MVP 5 Tasks 5 + 6 — the `archetypes/svg.md` and `archetypes/guitar-tabs.md` skill docs that document the new sidecar schemas.**

Concrete next steps:

1. ✅ **MVP 1 merged.** PR #127 (squash `2ff16da`).
2. ✅ **MVP-2a merged.** PR #128 (squash `006cf5f`).
3. ✅ **MVP-2b merged.** PR #129 (squash `30ae048`).
4. ✅ **MVP 3 merged.** PR #132 (squash `ca85890`).
5. ✅ **MVP-4a merged.** PR #133 (squash `cb41629`) + hardening PR #135 (squash `55319f8`).
6. 🟢 **MVP 5 implemented** on skill-repo branch `feat/mvp5-flow-enhancements` (11 commits at `~/.claude/skills/knowledge-base/`). Project-repo branch `feat/diagram-mvp5-kb-skill-update` carries handoff/plan docs and is ready to push + open PR.
7. **Open PR for MVP 5 documentation** on the project-repo branch. The PR's content is small (handoff updates + MVP 5 plan re-grounding); the bulk of the deliverable lives in the skill repo at `~/.claude/skills/knowledge-base/` (no remote — local-only).
8. ✅ **MVP-4b** (SVG + Tab source links) shipped on `feat/diagram-mvp4b-svg-tab-metadata`. 13 tasks, 20 commits. New SVG sidecar + Tab sidecar v3 migration. `<SourcesSection>` mounted in new `SvgProperties` aside and existing `TabProperties`. Forward-compat `attachedTo?` on both schemas (no UI binds it; reserved for the still-deferred MVP-2 SVG/Tab attachment branches). Re-enables MVP 5 Tasks 5 + 6 (skill archetype docs).
9. ✅ **MVP-5b** (validate/fix hardening) — closed by PRs #143, #144. Inline-vs-block-list `sources:` frontmatter normalisation shipped.
10. **MVP 5 Tasks 5 + 6 — skill archetype docs** for `svg.md` and `guitar-tabs.md`. Document the new sidecar schemas (`<file>.svg.refs.json` and the v3 `.alphatex.refs.json`) so the skill's archetype guidance reflects the persistence layer that MVP-4b just shipped. Skill-only change; no app code involved.
11. **MVP-2 SVG + Tab attachment branches** stays deferred. The schema is now in place — both sidecars accept `attachedTo: AttachedToEntry[]`. When this MVP runs it becomes thin: wire detach UI + adapt `useDocuments.migrateAttachments` for the new entity scopes.

The Diagram Flow Enhancements feature itself is **functionally complete** at the app layer (MVPs 1, 2a, 2b, 3, 4a all merged) and **operationally complete** at the skill layer (MVP 5 implemented). What remains (MVP-4b, MVP-5b) is hardening, not core scope.

### Open follow-up items surfaced by MVP-2b execution (still active)

- ~~**`FlowProperties` has two doc-listing UIs** — the pre-existing bespoke "Documents" section (with cascade-delete confirmation) AND the new `AttachmentsSection`.~~ _Closed: bespoke section retired. `AttachmentsSection` now wraps `DetachDocModal` when `entityScope` + `getDocumentReferences` + `deleteDocumentWithCleanup` are wired (document-type rows only — diagrams/svgs/tabs still use direct detach). FlowProperties keeps the `Create & attach new…` affordance as a slim secondary button below the section. Coverage in `AttachmentsSection.test.tsx` (cascade-detach modal opens, querying refs, confirm-without-also-delete)._
- ~~**DIAG-3.13-50** stays 🟡 — panel-level integration test for the Attach flow is deferred (component-level coverage is in `AttachmentsSection.test.tsx`).~~ _Closed: pinned by `PropertiesPanel.test.tsx` (`DIAG-3.13-50`) — each of the 4 entity selections (`null|root, node, line, flow`) routes through `onOpenDocPicker(<scope>, id)` with the correct scope and id. Case marker is ✅ in `test-cases/03-diagram.md`._
- **`'layer'` is not in `EntityAttachmentTarget`** — `LayerProperties` does not mount `AttachmentsSection`. Add `'layer'` to the union if/when layer-scoped attachments are required. _Forward-looking note; not actionable unless layer-scoped attachments become a requirement._

### Open follow-up items surfaced by MVP 3 execution

- ~~**`AttachmentPreviewModal` header "Open in pane" still passes `(filename, null)`** in some call paths — review whether all entry points now plumb the anchor.~~ _Closed: verified by-design. The modal-header "Open in pane" button (line 240) opens the previewed file as a whole, which has no anchor concept; the `PreviewItem` interface (`filename`, `title`, `entityName`) intentionally has no anchor field. Wiki-link clicks inside the previewed body **do** plumb anchors via the BodyDispatcher callback at line 309. No code change needed._

### Open follow-up items surfaced by MVP 5 execution (active)

- ~~**`kb_validate.py --fix` does not strip bad source entries.**~~ _Closed: `_fix_sources()` helper added; `fix()` now walks every `sources` scope (top-level + nodes / connections / flows / documents) and drops entries that fail `RE_HTTP_URL`, omits empty `title` fields, and removes the `sources` key entirely when no valid entry remains. The Task 11 fixture round-trips clean after `--fix`._
- ~~**Top-level `data.sources` is not validated.**~~ _Closed: fifth `_validate_sources` call site added under the `'schema'` section, label `'top-level'`. Top-level bad entries now surface in the validate report and feed the same `--fix` pruning._
- ~~**Document-frontmatter inline-vs-block-list rule is documented but not enforced.**~~ _Closed: `kb_validate_doc.py` warns when frontmatter contains an inline `sources: [...]`; `kb_transform.py` rewrites inline → canonical block-list AND preserves the frontmatter when sources is non-empty (legacy `title:`-only frontmatter is still stripped). Pinned by 7 new tests in `scripts/tests/test_kb_transform.py`. The skill's validate-doc rule no longer flags valid sources-bearing frontmatter as an error._
- ~~**Roadmaps archetype's `flow-minimum-path` JSON example was replaced.**~~ _Closed: minimal `flow-minimum-path` JSON example restored alongside `flow-fullstack-path` in `archetypes/roadmaps.md`, with a one-line explanation that the minimum path is intentionally linear (one start, one end) and should be authored first._

These four items group naturally as **MVP-5b: validate/fix hardening** — small targeted scope, no app-side changes needed. Estimated 4-6 hours.

### Open follow-up items surfaced by MVP-4a execution (still active)

- ~~**DIAG-3.19-23 Sources Undo/Redo + Dirty Fingerprint** stays 🟡 — has no automated test. Wired through history (per S8525 / S8521) but not pinned by a test case.~~ _Closed: pinned by `useDiagramHistoryStore.test.ts` (history snapshot + undo restore) and `useDiagramPersistence.test.tsx` (dirty fingerprint flips on sources change, clears on revert). Case marker is ✅ in `test-cases/03-diagram.md`._
- **`SourcesSection` accessibility pass** — initial review surfaced minor a11y gaps that were patched (`aria-label` on Title/URL inputs in cleanup commit `b892088`). Re-audit when the section gets reused outside diagram/document panels (e.g. when MVP-4b SVG/Tab branches land).
- ~~**Frontmatter parser scope** — only accepts block-list `sources:` syntax (per S8527). Inline `sources: [{…}]` is silently treated as an unknown key. Document this in the KB skill's `validate.md` rules (relevant to MVP 5 Task 6).~~ _Closed: rule #8 in `~/.claude/skills/knowledge-base/commands/validate.md` (line 40) documents this with the inline-vs-block-list expectation. Enforcement is the remaining MVP-5b gap above (#3)._

If you hit a blocker on MVP 5, commit work in progress on the branch and add a new entry to the appropriate "MVP X status" section.
