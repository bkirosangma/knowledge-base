# Guitar Tabs — Session Handoff

> **Purpose:** A pointer document so that an LLM session with no prior context can resume work on the Guitar Tabs feature cleanly. Read top-to-bottom, run the bootstrap commands, then jump to "Next Action".

**Last updated:** 2026-05-03 (TAB-012 merged via PR #109 — **M1 viewer ship-point complete**; parked items #1, #2, #13 closed via skill fix + `plan/tabs-parked-cleanup-1`).

---

## Resume protocol — when the user says "take the next task"

If the user says anything like *"continue from this doc"*, *"take the next task"*, *"resume guitar tabs"*, or just points at this file:

1. Run the bootstrap block in the next section.
2. Skim **Where we are** + **Remaining tickets** to confirm the next ticket — the **Next Action** section near the bottom names it explicitly.
3. Check open PRs (`gh pr list --state open`). If a Guitar-Tabs PR is still open, ask the user whether to wait for it or stack a follow-up branch on top.
4. Read the spec section + plan-doc references for that ticket.
5. **Branch first** (`git checkout -b plan/guitar-tabs-<slug>`), then plan, then execute via subagents — see the **Process recipe** section.
6. Honour every rule in **Project conventions** (branch-per-unit, main protected, no worktrees, `useRepositories` scope, etc.).
7. After the ticket merges, **update this doc** per the **Doc-update protocol** below — same branch as the cleanup, same PR.

The user's intent when pointing here is: *"Pick up where we left off without me having to re-explain anything."* Don't ask clarifying questions if the doc + spec + previous plans answer them; just go.

---

## Doc-update protocol (do this on every ticket close)

After a Guitar-Tabs PR merges, **before** starting the next ticket, update this doc on a doc-only branch (or fold the updates into the next ticket's branch — either works). Touch these sections:

1. **Last updated** — bump the date + parenthetical to reflect what just shipped.
2. **Where we are table** — flip the just-shipped ticket to ✅ Merged with the merge PR number.
3. **Remaining tickets** — strike or remove the just-shipped row from M1 / M2 tables.
4. **Open follow-up items** — add anything the just-merged review surfaced as deferred (with a memory reference if durable). Remove items that were closed by the just-merged ticket.
5. **Reference architecture** — add new files / hooks / components. Remove deleted ones. Keep paths accurate; this is the map a fresh session relies on.
6. **Next Action** — replace the body with the next ticket's bootstrap: spec section to read, patterns to mirror, key brainstorm decisions, ship target. Make it concrete enough that a fresh session can start in one read.
7. **`Features.md` + `test-cases/11-tabs.md` cross-reference counts** — if you mention case counts anywhere in the doc, update them.

If you skip the doc update, future sessions will resume from a stale map — that's the failure mode this protocol exists to prevent.

---

## Bootstrap (run first)

```bash
cd "/Users/kiro/My Projects/knowledge-base"
git checkout main && git pull --ff-only
gh pr list --state open
git log --oneline -10
ls docs/superpowers/plans/2026-05-*.md
```

This puts you on the latest `main`, lists open PRs, shows recent merge commits, and lists the in-flight Guitar Tabs plans.

---

## Where we are

| Ticket | Title | PR | Status |
|---|---|---|---|
| TAB-001 → TAB-003 | Foundation (domain interfaces, repositories, pane plumbing) | [#98](https://github.com/bkirosangma/knowledge-base/pull/98) | ✅ Merged |
| (test-cases scaffold) | `test-cases/11-tabs.md` §11 added | [#99](https://github.com/bkirosangma/knowledge-base/pull/99) | ✅ Merged |
| TAB-004 | Viewer (lazy AlphaTabEngine + TabView) | [#100](https://github.com/bkirosangma/knowledge-base/pull/100) | ✅ Merged |
| TAB-005 | Playback chrome (toolbar + audio + SoundFont + theme push) | [#101](https://github.com/bkirosangma/knowledge-base/pull/101) | ✅ Merged |
| TAB-006 | Guitar Pro `.gp` import (palette command) | [#102](https://github.com/bkirosangma/knowledge-base/pull/102) | ✅ Merged |
| (handoff doc) | Session resume checklist + protocols | [#103](https://github.com/bkirosangma/knowledge-base/pull/103) | ✅ Merged |
| TAB-007 | Properties panel — read-only metadata view (`TabProperties`) | [#104](https://github.com/bkirosangma/knowledge-base/pull/104) | ✅ Merged |
| (handoff refresh) | Post-TAB-007 handoff update | [#105](https://github.com/bkirosangma/knowledge-base/pull/105) | ✅ Merged |
| TAB-011 | Vault search + wiki-link integration (`alphatexHeader`, `tabFields`, `buildTabEntry`, `handleTabImported`) | [#106](https://github.com/bkirosangma/knowledge-base/pull/106) | ✅ Merged |
| (handoff refresh) | Post-TAB-011 handoff update | [#107](https://github.com/bkirosangma/knowledge-base/pull/107) | ✅ Merged |
| TAB-007a | Tab properties cross-references (`slugifySectionName`, `getSectionIds`, `useTabSectionSync`, `migrateAttachments`, `TabReferencesList`, `TabPaneContext`) | [#108](https://github.com/bkirosangma/knowledge-base/pull/108) | ✅ Merged |
| TAB-012 | Mobile read-only + playback (`readOnly` injection on `TabPaneContext`, `tabs.import-gp` mobile gate) | [#109](https://github.com/bkirosangma/knowledge-base/pull/109) | ✅ Merged |
| (parked-cleanup) | `alphaTabEngine` `LOG_LEVEL_INFO`, `DocumentPicker` Create-row gating, skill `%`→`//` fixes | `plan/tabs-parked-cleanup-1` | 🚧 In flight |

**M1 (viewer ship-point) is complete.** Natural pause-and-evaluate boundary per the spec.

---

## Remaining tickets

### M1 viewer ship-point — ✅ Complete

All M1 tickets merged (TAB-001 → TAB-007a + TAB-011 + TAB-012). Mobile read-only + playback shipped via PR #109. Natural pause-and-evaluate boundary reached.

### M2 editor ship-point

| Ticket | Title | Effort | Dependencies |
|---|---|---|---|
| **TAB-008** | Editor v1 — click-to-place fret, keyboard shortcuts, techniques toolbar, undo/redo through `applyEdit` | ~2 weeks | TAB-007 |
| **TAB-009** | Multi-track + multi-voice editing | 1 week | TAB-008 |
| **TAB-009a** | Track-level attachment surface (folds into TAB-009) | 1 day | TAB-009 |
| **TAB-010** | Export — MIDI / WAV / PDF (alphaTab APIs) | 2 days | TAB-008 |

---

## Open follow-up items (parked, not ticketed yet)

These were flagged during reviews and intentionally deferred. The user explicitly asked to **revisit after all TAB tickets ship** — surface them at the M1 ship boundary or whenever the user invokes `/knowledge-base guitar-tabs` and sees fallout.

1. **~~`~/.claude/skills/knowledge-base/commands/guitar-tabs.md` bug list~~** — _Closed by post-M1 skill fix (commit `2d81e4d` in `~/.claude/skills/knowledge-base`)_: 4 `%`→`//` sites fixed, tuning comment flipped low→high with corrected example pitches, link-index claim refined to "single `// references:` line", validation hook section flipped to active tense.
2. **~~`alphaTabEngine.ts` logLevel = 1 (Debug)~~** — _Closed by `plan/tabs-parked-cleanup-1`_: replaced with named constant `LOG_LEVEL_INFO = 2` matching the existing `PLAYER_STATE_*` style. Test asserts the value.
3. **`useGpImport`'s `opts` memo churn (M1 from TAB-006 review)** — final TAB-006 fix in commit `7e0dbd5` already addressed this via the ref pattern; nothing left to do, leaving here as a note.
4. **e2e for the GP import flow (TAB-11.4-06)** — currently ❌. Driving native file picker in headless Chromium needs a custom mock layer. Defer until there's a clean fixture pattern.
5. **Playwright `clicking Play` smoke (TAB-11.3-19)** — currently 🧪 but relaxed: only asserts the toolbar mounts; SoundFont readiness doesn't fire in headless Chromium within timeout. Could be tightened by mocking `playerReady` or using a tiny SoundFont fixture.
6. **Shared `"properties-collapsed"` localStorage key duplicated across panes** — surfaced in TAB-007 review. Diagram has it as a named constant in `useDiagramLayoutState.ts`; `DocumentView.tsx` and now `TabView.tsx` inline the literal. Toggling collapse on one pane carries to the others (which may even be desired). Pre-existing pattern; collapse into one shared constant when a fourth pane joins or when changing the key.
7. **~~`key={section.name}` in `TabProperties`~~** — _Closed by TAB-007a_: deterministic kebab-case section ids via `getSectionIds` are now the React key.
8. **`linkManager.fullRebuild` walks every file on every GP import** — TAB-011 ships with O(N) re-index per import. Acceptable today (vault sizes ~hundreds of files); a single-file `updateTabLinks()` helper mirroring `updateDocumentLinks()` is the natural follow-up if this ever shows up in profiles.
9. **`\lyrics` extraction is single-line only** — `parseAlphatexHeader` captures only the quoted-string form. AlphaTab's grammar supports multi-string `\lyrics` blocks (one per bar) and per-track `\lyrics t N "…"`. Acceptable for indexing (first stanza usually contains the chorus/title line); extend the parser if real fixtures show this gap.
10. **`REFERENCES_LINE` regex duplicated in two sites** — `infrastructure/alphatexHeader.ts` and `features/document/hooks/useLinkIndex.ts` both define `/^\s*\/\/\s*references\s*:\s*(.*)$/gim`. Two lines of repetition isn't worth a shared module; if a third caller appears, hoist to `alphatexHeader.ts` and re-export.
11. **Audit diagram flow rename/delete attachment integrity** — flow ids are stable so rename is safe by construction, but deletion may leave orphan `attachedTo` entries (no cleanup hook visible in `DiagramView`). Triggered by user request during TAB-007a brainstorm; spec a fix once tabs ship.
12. **Side-car stable section ids for tabs** — TAB-007a's position-based section-rename reconciliation (`useTabSectionSync`) breaks if the user renames *and* reorders sections in the same save. True stability requires persisting a `name → stableId` map per tab (e.g., `tabs/song.alphatex.refs.json`) so renames survive reorder. Targets TAB-008/M2 when the editor lands and renames become first-class.
13. **~~`<DocumentPicker>` Create row silently no-ops in TabView when prerequisites missing~~** — _Closed by `plan/tabs-parked-cleanup-1`_: `onCreate` is now optional on `DocumentPicker` and the row is gated on its presence. Both consumers (`TabView`, `DiagramOverlays`) pass `onCreate` only when their prerequisites are wired. New test FS-2.5-09.

---

## Project conventions to honour

These are durable; pull from memory before making any change.

- **Branch per unit of work** (`feedback_branch_per_unit_of_work.md`) — `git checkout -b` BEFORE the first commit on any task. Never commit directly on `main`, even one-liners.
- **Main is protected** (`project_branch_protection.md`) — push to a branch, open a PR via `gh pr create`. Never `git push origin main` directly.
- **No git worktrees** (`feedback_no_worktrees.md`) — work directly on feature branches; skip the `using-git-worktrees` skill entirely.
- **`useRepositories()` only works below `RepositoryProvider`** (`project_repository_context_deferred.md`) — `KnowledgeBaseInner` itself is *above* the provider in the React tree (it returns the provider in its JSX). Hooks called at that level must accept the repository as a prop and the caller instantiates it inline via `createTabRepository(rootHandle)`. **TAB-006 hit this twice** — `useGpImport` was rewritten to take `tab` as a prop in commits `0a82dd3` + `7e0dbd5`.
- **SoundFont served from `public/`** (`project_soundfont_host.md`) — bundled at `public/soundfonts/sonivox.sf2`; precached by service worker via `kb-static-v3` cache.
- **Worktree baseline** (`feedback_worktree_nvm_baseline.md`) — if `npm install` produces a lockfile diff CI rejects, re-run after `nvm use` to match `.nvmrc`.
- **Verification ceiling** (`feedback_preview_verification_limits.md`) — preview MCP can't drive the FSA folder picker; clean build + clean console is the verification ceiling for in-app changes.

---

## Reference architecture

```
src/app/knowledge_base/
  domain/
    tabEngine.ts                   ← TabEngine, TabSession, TabSource, TabEditOp, TabMetadata, …; + slugifySectionName + getSectionIds (TAB-007a — pure helpers, kebab-case slug with NFKD diacritic strip; collision-suffixed by appearance order)
    repositories.ts                ← TabRepository interface
    errors.ts                      ← FileSystemError + classifyError
  infrastructure/
    alphaTabEngine.ts              ← AlphaTabEngine impl; lazy alphatab import; play/pause/stop/seek/etc.
    alphaTabAssets.ts              ← SOUNDFONT_URL constant
    tabRepo.ts                     ← FSA-backed TabRepository factory
    gpToAlphatex.ts                ← Pure conversion utility (TAB-006)
    alphatexHeader.ts              ← TAB-011 pure regex parser for header directives + // references: lines (no DOM, no alphaTab)
    searchStream.ts                ← Extension router for vault search; .md / .json / .alphatex branches; tabFields() helper for indexable mapping
  features/tab/
    TabView.tsx                    ← Pane shell — flex-row: TabToolbar + TabCanvas (canvas column) + TabProperties (panel column with collapse persistence)
    components/
      TabCanvas.tsx                ← forwardRef host div for AlphaTab to mount into
      TabToolbar.tsx               ← play/pause/stop/tempo/loop transport
    properties/
      TabProperties.tsx            ← TAB-007 metadata panel + TAB-007a cross-references (file-level + per-section References lists with merged attachments + backlinks; Attach affordances; deterministic section-id keys)
      TabReferencesList.tsx        ← TAB-007a presentational component — merges DocumentMeta attachments and BacklinkEntry rows, de-dupe by sourcePath with attachment-wins precedence; readOnly hides detach
      useTabSectionSync.ts         ← TAB-007a hook — diffs section ids across metadata snapshots and emits position-aligned migrations to migrateAttachments; trailing deletions orphan-by-design; resets cache on filePath change
    hooks/
      useTabEngine.ts              ← Engine + session lifecycle; surfaces playerStatus, currentTick, isAudioReady, session, metadata
      useTabContent.ts             ← Reads .alphatex via useRepositories().tab
      useTabPlayback.ts            ← Wraps TabSession callables with null-safe no-ops + audioBlocked tracking
      useGpImport.ts               ← TAB-006 import flow (above-provider — accepts tab as prop)
  shell/
    RepositoryContext.tsx          ← Provider + useRepositories + StubRepositoryProvider
    ToolbarContext.tsx             ← PaneType union (incl. "tab")
    PaneManager.tsx                ← PaneEntry shape + pane state
  features/document/hooks/
    useLinkIndex.ts                ← Wiki-link graph; buildTabEntry() + .alphatex branch in fullRebuild (TAB-011); getLinkType maps .alphatex → "tab"
    useDocuments.ts                ← TAB-007a: migrateAttachments(filePath, migrations[]) bulk rewrites tab-section attachment ids on rename; idempotent; preserves identity for untouched docs
  features/document/types.ts       ← OutboundLink.type union now includes "tab"; DocumentMeta.attachedTo.type union widened with "tab" | "tab-section" (TAB-007a)
  features/search/VaultIndex.ts    ← DocKind union now includes "tab"
  shared/utils/graphifyBridge.ts   ← CrossReference.{source,target}Type widened for "tab" (additive, TAB-011)
  knowledgeBase.tsx                ← KnowledgeBaseInner — top-level shell; registers palette commands; handleSearchPick routes kind="tab" to tab pane (TAB-011); handleTabImported wraps useGpImport with fire-and-forget search + link re-index (TAB-011); renderTabPaneEntry receives full TabPaneContext (documents/backlinks/attach/detach/migrate) for TAB-007a wireup
  knowledgeBase.tabRouting.helper.tsx ← TAB-007a: TabPaneContext interface + renderTabPaneEntry(entry, context?) spreads context onto TabView; backwards-compatible with zero-arg test calls
public/
  soundfonts/sonivox.sf2           ← 1.35 MB Sonivox GM SoundFont
  sw.js                            ← Service worker; cache-first lane for /soundfonts/*; kb-static-v3
test-cases/
  11-tabs.md                       ← TAB-11.x case catalog (86 cases; mirrors Features.md §11)
Features.md                        ← §11 Guitar Tabs (subsections §11.1 Foundation, §11.2 Playback, §11.3 .gp import, §11.4 Properties panel, §11.5 Vault search & wiki-links, §11.6 Cross-references, §11.7 Pending)
docs/superpowers/
  specs/2026-05-02-guitar-tabs-design.md         ← Source of truth design spec
  plans/2026-05-02-guitar-tabs-foundation.md     ← TAB-001..TAB-003
  plans/2026-05-02-guitar-tabs-viewer.md         ← TAB-004
  plans/2026-05-03-guitar-tabs-playback.md       ← TAB-005
  plans/2026-05-03-guitar-tabs-gp-import.md      ← TAB-006
  plans/2026-05-03-guitar-tabs-properties-panel.md ← TAB-007
  plans/2026-05-03-guitar-tabs-search-links.md   ← TAB-011
  plans/2026-05-03-tab-cross-references.md       ← TAB-007a
  specs/2026-05-03-tab-cross-references-design.md ← TAB-007a
  plans/2026-05-03-guitar-tabs-mobile.md         ← TAB-012
  handoffs/2026-05-03-guitar-tabs.md             ← THIS doc — session resume + ticket status
```

---

## Process recipe (every ticket follows this)

1. **Confirm scope.** Read the spec section for the target ticket. Note dependencies on already-shipped tickets.
2. **Create branch.** `git checkout main && git pull --ff-only && git checkout -b plan/guitar-tabs-<ticket-slug>`.
3. **Investigate patterns.** Use Explore agent or targeted grep to map the existing files the new ticket will touch / mirror. Common patterns to look up:
   - `useRepositories()` consumers vs above-the-provider sites.
   - `useRegisterCommands(...)` for palette commands.
   - `StubRepositoryProvider` + `StubShellErrorProvider` test wrapper shape.
   - Existing `features/...` panel/component conventions (DocumentView, DiagramView).
4. **Brainstorm + plan.** Use `superpowers:brainstorming` if the spec is ambiguous; otherwise jump to `superpowers:writing-plans` and save to `docs/superpowers/plans/YYYY-MM-DD-guitar-tabs-<slug>.md`.
5. **Self-review the plan.** Spec coverage / placeholder scan / type consistency / runtime traps (provider scope, dep churn, identity stability).
6. **Execute via subagents.** `superpowers:subagent-driven-development`. Two-stage review per task. Sonnet for implementation; Haiku for cheap verification reviews.
7. **Final reviewer pass.** `superpowers:code-reviewer` over the whole branch diff. Address critical/important issues before PR.
8. **Ship.** `superpowers:finishing-a-development-branch` → push + `gh pr create` with a complete test plan.
9. **After merge:** `git checkout main && git pull --ff-only && git branch -D <branch>` (squash-merge means `-D` not `-d`).
10. **Update `Features.md` + `test-cases/11-tabs.md`** in the same change set as the implementation. The maintenance contract in `CLAUDE.md` is enforced.
11. **Update this handoff doc** per the **Doc-update protocol** above. The user relies on it as the single resume point — leaving it stale defeats the whole purpose. Same branch as cleanup OR fold into the next ticket; never skip.

---

## Next Action

**M1 ship-point reached.** TAB-012 merged via PR #109; the parked-cleanup branch (`plan/tabs-parked-cleanup-1`) is in flight to close items #1, #2, #13 plus the handoff refresh. After it merges, M2 begins.

**M2 entry — TAB-008: Editor v1** (~2 weeks; the largest single ticket on the roadmap). Spec source: `docs/superpowers/specs/2026-05-02-guitar-tabs-design.md` → "Editor v1" / "M2 ship-point" sections. No plan written yet — start with `superpowers:brainstorming`, then `superpowers:writing-plans` to a new `docs/superpowers/plans/2026-05-XX-guitar-tabs-editor.md`.

**Scope reminders for the brainstorm:**
- Click-to-place fret on the rendered staff (alphaTab API: hit-testing notes / inserting via `applyEdit`).
- Keyboard shortcuts for techniques (h/p/b/~ etc.).
- Techniques toolbar (UI surface to choose technique + apply to selection).
- Undo/redo plumbed through `TabEngine.applyEdit` (the engine method already exists; the editor sits on top).
- Marker comment in `TabView.tsx` (TAB-012 T3) signposted that the editor must be lazy-loaded via `next/dynamic({ ssr: false })`. **Do not** put the editor inline in the lazily-loaded `TabView` chunk; it should be a sibling chunk loaded only when `!readOnly`.

**Open follow-up #12** ("side-car stable section ids for tabs") explicitly targets TAB-008 — surface it in the brainstorm so renames + reorders survive the editor's first save.

**Other parked items still relevant (read before starting):** #4, #5 (e2e fixture patterns), #6 (`properties-collapsed` localStorage key — likely time to consolidate as the editor adds another panel), #11 (diagram attachment integrity audit — the user-explicit one still open).

---

## How to read this doc

If you arrived here from a fresh context:

1. Read sections **Bootstrap** + **Where we are** + **Project conventions** first.
2. Skim **Reference architecture** to know where things live.
3. Jump to **Next Action** and start there.
4. The **Open follow-up items** list is parked; don't pick those up unless the user explicitly asks.
5. Keep this doc current as you ship — update the "Where we are" table at the bottom of each ticket's PR description.
